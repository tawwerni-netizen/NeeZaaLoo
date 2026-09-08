# Technical Architecture

**Status:** Phase 0 design. No implementation started.
**Governing principle:** the client renders; the server decides.

---

## 1. System shape

```
                    ┌─────────────────────────────────────┐
   Web (Next.js) ───┤                                     │
   Android (Compose)┤   Edge: Cloudflare (WAF, DDoS,      │
                    │   bot mgmt, geo signal, TLS)        │
                    └──────────────┬──────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
   ┌────▼─────┐            ┌───────▼────────┐        ┌────────▼────────┐
   │  API     │            │  REALTIME      │        │  ADMIN API      │
   │ (NestJS) │            │  GATEWAY (WS)  │        │  (separate      │
   │  REST    │            │  duels, clocks │        │   deployable,   │
   │          │            │  presence      │        │   own auth)     │
   └────┬─────┘            └───────┬────────┘        └────────┬────────┘
        │                          │                          │
        └──────────────┬───────────┴──────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────────────┐
        │  DOMAIN SERVICES (in-process modules, hard borders)  │
        │  identity · matchmaking · duel-engine · rating ·     │
        │  ledger · economy · payments · risk · fairplay ·     │
        │  tournament · compliance · notification              │
        └──────────────┬──────────────────────────────────────┘
                       │
   ┌───────────────────┼────────────────────┬─────────────────┐
   │                   │                    │                 │
┌──▼──────┐     ┌──────▼──────┐      ┌──────▼─────┐   ┌───────▼──────┐
│Postgres │     │   Redis     │      │  BullMQ    │   │Object storage│
│(system  │     │ (queues,    │      │  workers   │   │ (replays,    │
│of record│     │ presence,   │      │(settlement,│   │  KYC, evid.) │
│ ledger) │     │ locks, RL)  │      │ recon)     │   │              │
└─────────┘     └─────────────┘      └────────────┘   └──────────────┘
```

### 1.1 Why realtime is a separate deployable

Game sockets are bursty, long-lived, and stateful. The money path is
low-throughput and must never be starved by a chess rush hour, and a socket
gateway crash must never take REST or settlement with it. They also scale on
different axes (connections vs. CPU). Splitting them at day one costs almost
nothing; splitting them at year two costs a rewrite.

### 1.2 Why admin is a separate deployable

Admin holds the most dangerous capabilities in the system (section 29, 30). It
gets its own deployable, its own auth realm, its own network exposure (ideally
IP-restricted / VPN-only), and its own audit stream. An RCE in the public API
must not be an RCE in the admin plane.

---

## 2. Server authority — the non-negotiable list

Per section 8, the client is **never** authoritative for:

| Concern | Authority | How it is enforced |
|---|---|---|
| Money, balance | Postgres ledger | Balances are **derived from entries**, never stored as the truth |
| Game result | Duel engine, server-side | Client sends *intents*; server produces *events* |
| Score | Game plugin, server-side | Plugin scores from server-held state only |
| Game state | Server | Client holds a projection it may not author |
| Clock | Server | Server timestamps every event; client clock is display only |
| Rating | Rating service | Computed post-settlement from the server's own result |
| Tournament standings | Tournament service | Derived from settled duels |
| Payment confirmation | Payment service + ledger | Only from verified provider/chain state |
| Withdrawal status | Withdrawal state machine | Never advanced by a client call |

**Implementation rule:** every client -> server game message is an **intent**
(`SubmitMove`, `SubmitAnswer`, `Resign`). Every server -> client game message is
an **event** (`MoveAccepted`, `MoveRejected`, `DuelSettled`). There is no message
shape in which a client asserts a result. This is enforced at the protocol schema
level, not by convention.

---

## 3. The Skill Duel Engine

### 3.1 Core / plugin split

```
SkillDuelEngine  (owns: lifecycle, clock, persistence, events, settlement hooks)
├── ChessPlugin
├── SpeedMathPlugin
├── MemoryPlugin
├── PatternPlugin
├── ReactionPlugin
├── PrecisionPlugin
└── <future plugins>
```

The engine owns everything that touches money, identity, or trust. A plugin owns
only the rules of its game. **Adding a game must never require touching ledger,
payments, risk, or compliance code** (section 6). That is the architectural test
for whether the split is correct.

### 3.2 The plugin contract

```ts
interface GamePlugin<Config, State, Intent, PublicView> {
  readonly id: GameId;
  readonly version: number;          // bumped on any rule change; persisted per duel

  /** Server-side, seeded, deterministic. The client cannot predict future content. */
  createChallenge(seed: Seed, config: Config): Challenge;

  /** Pure. (state, intent, serverTimeMs) -> next state + emitted events. */
  applyIntent(
    state: State,
    intent: Intent,
    ctx: { playerId: PlayerId; serverTimeMs: number }
  ): Result<{ state: State; events: GameEvent[] }, RejectReason>;

  /** Pure. Has this duel ended, and how? */
  evaluate(state: State): Outcome | null;

  /** Deterministic scoring from server-held state only. */
  score(state: State): PlayerScores;

  /** What each player is allowed to see. Enforces information asymmetry. */
  project(state: State, viewer: PlayerId | 'spectator'): PublicView;

  /** Game-specific signals for the Fair Play Engine. Never a verdict. */
  fairPlaySignals(state: State, history: DuelHistory): Signal[];

  /** Compact, replayable, verifiable. */
  serializeReplay(state: State): ReplayBlob;
}
```

**Four properties this contract buys us:**

1. **Purity.** `applyIntent` and `evaluate` are pure functions of state. That makes
   the entire game layer unit-testable without a database, and makes replay
   verification exact — we can re-run a duel from its event log and assert the
   same result.
2. **Server-generated challenges.** `createChallenge(seed, config)` runs on the
   server. The seed is never sent to the client before the content is due.
   This is what makes Speed Math, Memory, Pattern, and Reaction cheat-resistant
   (section 10).
3. **Projection.** `project()` is how we guarantee a client never receives data
   it should not have. If a value is not in the projection, it is not on the wire.
   No "hide it in the UI" bugs.
4. **Signals, not verdicts.** A plugin can say "this player answered 40 questions
   with 3ms variance". It can never say "ban this player". Section 20's rule —
   *never one signal = ban* — is enforced by the type system.

### 3.3 Duel lifecycle

```
CREATED -> RESERVED -> READY -> LIVE -> COMPLETED -> SETTLED
                 │        │       │          │
                 └────────┴───────┴──────> ABORTED / VOIDED
```

- **RESERVED** — entry fees are moved to a *locked* ledger position **before** the
  duel starts. No duel with money attached ever begins with unlocked funds.
- **LIVE** — every accepted intent appends to an immutable event log with a server
  timestamp. The log is the replay.
- **COMPLETED** — the plugin's `evaluate()` returned an outcome. Money has not moved.
- **SETTLED** — a separate, idempotent settlement step moved money, applied rake,
  and updated ratings. **Completion and settlement are deliberately distinct**, so
  a settlement failure can be retried without re-running the game, and so a duel
  under fair-play hold can sit in COMPLETED indefinitely.
- **VOIDED** — entry fees returned in full. Used for confirmed platform faults and
  for duels invalidated by fair-play review.

### 3.4 Clock authority

The server holds the authoritative clock. Every accepted event carries
`serverTimeMs`. The client receives periodic clock syncs and renders an
interpolation; it never reports elapsed time as fact.

For chess this means increments, delays, and flag-falls are computed server-side.
For reaction-type games the measured quantity is
`serverReceiveTime - serverStimulusTime`, minus a **conservatively estimated**
one-way network latency derived from a rolling RTT sample. Latency estimation is
capped, and the cap is a documented, audited economy parameter — otherwise it
becomes an attack surface (see [THREAT_MODEL.md](../security/THREAT_MODEL.md)).

---

## 4. Game selection scorecard (section 5)

No game ships without scoring this. Weights reflect that **cheating risk and
server authority are existential**, while spectator value is merely nice.

| Criterion | Weight |
|---|---|
| Cheating risk (inverted: 5 = low risk) | ×3 |
| Server authority achievable | ×3 |
| Automation/bot risk (inverted) | ×2 |
| Mobile UX | ×2 |
| Match duration fit | ×2 |
| Latency insensitivity | ×2 |
| Replayability | ×2 |
| Audience size | ×1 |
| Tournament potential | ×1 |
| Development cost (inverted) | ×1 |
| Spectator value | ×1 |
| Monetization potential | ×1 |

**Threshold:** a game must score >= 70% of maximum **and** score >= 4/5 on both
*cheating risk* and *server authority* to enter development. A high total cannot
compensate for a low cheat-risk score. That veto is the point.

### 4.1 Pre-scored positions

| Game | Cheat risk | Server authority | Verdict |
|---|---|---|---|
| **Chess** | 2/5 — engines are free, strong, and undetectable in principle | 5/5 | **Ship (Phase 2).** The flagship. Requires the heaviest anti-cheat investment in the product; budget accordingly. |
| **Speed Math** | 4/5 — scriptable via OCR, but server-generated content and timing analysis are strong defences | 5/5 | **Ship (Phase 3).** |
| **Memory Grid** | 4/5 | 5/5 | **Ship (Phase 3).** |
| **Pattern** | 4/5 | 5/5 | **Ship (Phase 3).** |
| **Reaction** | 3/5 — trivially automated; defence rests entirely on input biometrics | 4/5 — latency estimation is a real weakness | **Ship with caution (Phase 3).** Consider excluding from cash tiers at launch. |
| **Precision** | 3/5 | 4/5 | **Ship with caution (Phase 3).** |
| **Connect Four / Checkers / Reversi** | 1/5 — **solved or near-solved**; a perfect engine is a weekend project | 5/5 | **Do not ship as cash games.** Connect Four is strongly solved: first player wins with perfect play. Free-play only, or not at all. This is exactly the section 5 warning. |
| **Word games** | 2/5 — dictionary lookup is trivial; also language-fairness problems | 4/5 | **Defer.** Phase 3+ evaluation only. |

---

## 5. Matchmaking (section 11)

### 5.1 Correctness before cleverness

The listed failure modes — double reservation, double joining, stale queue, race
conditions, duplicate matches — are all **concurrency bugs**, and they are all
money bugs the moment entry fees exist. The design is therefore built around a
single rule:

> **A player may hold at most one active reservation, and that invariant is
> enforced by the database, not by application logic.**

Implementation:

- A `matchmaking_reservation` table with a **partial unique index** on
  `(player_id) WHERE status = 'ACTIVE'`. Double reservation becomes a constraint
  violation, not a race.
- Pairing runs in a **transaction** that locks both candidate rows with
  `SELECT ... FOR UPDATE`, in a **deterministic order by player id** to prevent
  deadlock.
- Queue entries carry a **TTL and a heartbeat**. A missed heartbeat expires the
  entry. Stale queue entries are swept by a worker, and the sweep is idempotent.
- Duel creation is **idempotent on a pairing key** derived from
  `(playerA, playerB, queueId, pairingEpoch)`. A retry cannot create a second duel.

Redis is used for the *fast path* (candidate discovery, presence). Postgres is
used for the *truth* (reservation, pairing, duel creation). **Redis is never the
authority for anything with money attached.** If Redis and Postgres disagree,
Postgres wins and Redis is rebuilt.

### 5.2 Queue structure

- Global queue per `(gameId, mode, timeControl, ratingBand, entryTier)`.
- Rating bands widen over time in queue to bound wait times, with a hard ceiling
  so a Bronze player is never fed to a Grandmaster.
- Public challenges, private challenges, and friend challenges bypass banding but
  **not** risk, compliance, or collusion checks — direct challenge is the classic
  collusion vector and is scored accordingly by the risk engine.

---

## 6. Rating and the Global Skill Score (section 27)

### 6.1 Per-game ratings

Glicko-2 per `(player, game)`. Glicko-2 over Elo because it models **rating
deviation** and **volatility**, which matter enormously here:

- New players and returning players get correctly wide uncertainty, so
  matchmaking does not mis-seed them.
- RD is a **direct anti-smurf and anti-sandbagging signal** the risk engine can
  consume.
- Cash-tier eligibility can require RD below a threshold — i.e. "we actually know
  how good you are" — which closes a whole class of rating-manipulation attacks.

### 6.2 The Global Skill Score

Section 27's constraint — *no single game may dominate* — is the entire design
problem. The approach:

1. Convert each game rating to a **normalised percentile** within that game's
   active population. This removes cross-game scale differences (chess ratings and
   reaction ratings are not commensurable).
2. Require a **minimum games played** per game before it contributes at all.
3. Combine with a **capped weighted mean**: no single game may contribute more
   than **35%** of the Global Skill Score, regardless of how many games the player
   has played or how dominant they are.
4. Apply a **breadth multiplier** that rewards competence across categories — this
   is what makes the score mean "well-rounded skill" rather than "chess rating in
   a hat".
5. **Decay** unplayed games' contribution over time rather than deleting it.

Tiers (Bronze -> Grandmaster) are **percentile-based, not absolute**, so tier
names keep their meaning as the population grows. The full methodology, including
the exact cap and breadth function, is published to users — section 27 requires it
to be *understandable*, and an unexplainable ranking destroys trust faster than an
imperfect one.

---

## 7. Data architecture principles

1. **Postgres is the system of record.** Redis is a cache and a queue. Object
   storage holds blobs. Nothing financial is authoritative outside Postgres.
2. **Append-only where it matters.** Ledger entries, duel events, admin actions,
   and risk decisions are **insert-only**. No `UPDATE`, no `DELETE`. Corrections
   are new compensating records that reference the original (section 29: never
   allow silent historical financial modification).
3. **Money is `BIGINT` minor units.** Never floating point. Currency and asset are
   explicit columns, never implied.
4. **Every externally-triggered write is idempotent**, keyed by a caller-supplied
   or provider-supplied idempotency key with a uniqueness constraint.
5. **Migrations are forward-only and numbered**, following the pattern already
   established in the owner's `wassalni` project.
6. **PII is minimised and segregated.** KYC documents live in separate encrypted
   storage with separate access control and their own retention clock, never in
   the main application tables.
