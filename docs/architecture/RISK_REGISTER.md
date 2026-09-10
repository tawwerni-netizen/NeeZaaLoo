# CTO Risk Register & Execution Order

**Date:** 2026-09-06
**Assessed against:** the actual repository, not the plan.

---

## 0. Two corrections to the brief before anything else

The brief instructs "begin Phase 0" and "generate at least 30 name candidates,
verify domains live, recommend top 3." **Both are already done, and re-running
them would destroy work rather than create it.**

- Phase 0 completed 2026-09-06. 40 candidates were generated, domains verified
  by registry RDAP (not search engines), 13 cleared, a shortlist of 10 was
  scored, and **Nizalo** was chosen and approved.
- **`nizalo.com` is registered** (Hostinger). Re-running name research now would
  produce a second recommendation for a brand that is already bought, already
  designed, already documented, and already in the code.

Recorded here rather than silently ignored, because "challenge weak ideas"
includes instructions that were correct when written and are stale now.

The remaining brand items are real and still open: `.app`/`.games`, defensive
variants, `.gg` (no reliable RDAP), social handles, and trademark clearance in
classes 9/41/36.

---

## 1. Current state — what actually exists

**629 tests, all passing**, run with `npm test` (15 workspaces). 618 of these
predate the 2026-09-06 audit below; 11 were added by it (8 realtime, 3 API),
all closing gaps the audit itself found — none were added to pad a number.

| Subsystem | State | Evidence |
|---|---|---|
| **Ledger** | Built. Double-entry, append-only, multi-asset. Invariants enforced by Postgres, not app code. | 22 tests |
| **Chess rules** | Built and verified. | perft on 6 positions, 23 exact node counts |
| **Duel engine + plugin contract** | Built. Chess runs as the first plugin. Speed Math proves the same engine against a structurally opposite turn model. | 62 tests (game-chess) |
| **Replay + audit hash** | Built. Deterministic across wall-clock origins; tampering detected. | in the 62 |
| **Glicko-2 ratings** | Built. | reproduces Glickman's published example to 2dp |
| **Matchmaking** | Built. One-active-ticket, idempotent pairing, bands, sweeper, **plus a game-generic service layer (`packages/matchmaking/src/matchmaking.mjs`) wired to the REST API.** | 39 tests |
| **Realtime gateway** | Built. Auth, rooms, projection, reconnect, timeouts, rate limits, cseq echo on the originating connection. | 40 tests |
| **Duel persistence + crash recovery** | Built. Persist-before-broadcast; restart replays the log. **Fixed 2026-09-06: SIMULTANEOUS-turnModel duels (Speed Math) were being recovered with the wrong clock model — see §2 below.** | in the 40 |
| **Brand & design system** | Complete. Logo, guidelines, tokens, both themes, RTL. | published guide |
| **Settlement + Economy Rules Engine** | Built. Duel → ledger, rake, ratings, void, worker. Proven over a real WebSocket game, not just direct service calls. | 32 tests |
| **Authentication** | Built. Argon2id, session families, TOTP (RFC-verified), devices, step-up, cooling-off. | 66 tests |
| **Gateway ↔ auth integration** | Built. Real tokens; mid-game revocation cuts the socket. | 6 tests (in realtime's 40) |
| **Authorisation + admin RBAC** | Built. Deny-by-default, 9 roles, four-eyes, emergency controls, **tournament settlement gated by its own step-up + four-eyes action**. | 55 tests |
| **REST API** | Built. Fixed pipeline, security headers, ownership, admin audit, **now including player-facing Tournament and Global Skill routes, and an admin four-eyes settlement flow.** | 61 tests |
| **Payments** | Built. Deposits with independent chain verification, withdrawal state machine, provider abstraction. | 40 tests |
| **Compliance** | Built. Market matrix, KYC tiers, sanctions, self-exclusion, limits, skill evidence. | 35 tests |
| **Fair Play + risk engine** | Built. Signals, explainable scoring, cases, evidence, decisions, appeals, collusion graph. | 37 tests |
| **Speed Math (2nd game)** | Built. Simultaneous, seeded generation, hidden content, automation signals. **Now proven playable end-to-end over the real gateway — see §2, the protocol bug that had made this false.** | 39 tests |
| **Tournament engine** | Built. Single-elimination + Swiss, prize settlement, four-eyes. **Now wired to the REST API** (list/details/standings/pairings/prizes/register/withdraw, admin create/open/start/advance/settle). Client cannot influence pairings, standings, results, or prizes — server computes and stores all of it. | 48 tests |
| **Global Skill Score** | Built. Water-filling 35% cap, percentile tiers. **Now wired to the REST API** (own profile, another player's public profile, global and per-game leaderboards). Internal risk/anti-cheat fields are not exposed. | 33 tests |
| **End-to-end backend proof** | **New 2026-09-06.** Register → login → matchmaking → real WebSocket play → settlement → rating write-back → history, for both Chess and Speed Math, plus a tournament-eligibility flow gated on rating establishment. Proves the layers actually connect, not just that each one passes its own tests in isolation. | 3 tests (in the API's 61) |

### 1.1 The honest headline

> ~~A completed duel does not move any money.~~ **CLOSED 2026-09-06.**

The settlement service connects the duel engine to the ledger, and real
authentication now sits under the gateway. **The single largest remaining risk
is A2: concurrency is still unproven**, because PGlite runs one connection.
Everything else outstanding is unbuilt rather than unsafe.

---

## 2. Architecture risks

| # | Risk | Severity | Status |
|---|---|---|---|
| ~~A1~~ | ~~No settlement path duel → ledger~~ | — | **CLOSED** — 32 tests |
| ~~A2~~ | ~~Concurrency was unproven — PGlite is single-connection and cannot produce a genuine race.~~ | — | **CLOSED 2026-09-06** — see below, real evidence |
| ~~A3~~ | ~~Auth is a stub~~ | — | **CLOSED** — Argon2id, rotating refresh tokens with reuse detection, TOTP, devices, step-up. 72 tests |
| ~~A4~~ | ~~Duels live in a process-local `Map`, with no horizontal scaling story.~~ | — | **CLOSED 2026-09-06** — see below |
| ~~A5~~ | ~~No REST API~~ | — | **CLOSED** — every route declares its policy action; the server refuses to start otherwise. 40 tests |
| ~~A6~~ | ~~Ratings never written back~~ | — | **CLOSED** — Glicko-2 write-back + append-only rating_change |
| A7 | No observability. No structured logs, metrics, traces or alerting. | High | Not started |
| ~~A8~~ | ~~`realtime/store.mjs` `hydrate()`/`clockSnapshot()` always rebuilt an ALTERNATING-shaped clock, regardless of the plugin's `turnModel`.~~ | — | **CLOSED 2026-09-06** — see below |
| ~~A9~~ | ~~The wire protocol hardcoded `intent` as a string.~~ | — | **CLOSED 2026-09-06** — see below |

**A2 — closed 2026-09-06, with real evidence, not simulated.** Docker Desktop
is installed on this machine but its engine was not running and could not be
brought up non-interactively; WSL2 has no installed distro. Neither was
needed: a real, independently-installed **PostgreSQL 17.11** server was found
already running locally (`localhost:5432`). A dedicated database
(`skill_platform_test`, never production) was created, all 12 migrations
applied cleanly against it (itself evidence the schema is not a PGlite-only
artifact), and `packages/ledger/src/pg-adapter.mjs` was built to give a real
`pg.Client`/`Pool` the same `{query, exec, transaction}` shape every service
already expects — no service file needed to change at all to run against real
Postgres instead of PGlite.

`packages/ledger/test/real-pg-concurrency.test.mjs` (11 tests, gated to skip
cleanly if Postgres is unreachable, so a run on a machine without it says so
plainly rather than reporting false confidence) opens **up to eight
genuinely independent `pg.Client` connections per scenario** — real sockets,
real separate Postgres backends — and races them against each other with
`Promise.all`/`allSettled`, never a sequential simulation:

1. Simultaneous withdrawals for a player's full balance — exactly one wins.
2. Two duels racing to reserve the same player's only funds — exactly one wins.
3. A withdrawal racing a duel reservation for the same funds — exactly one wins.
4. The identical webhook processed concurrently from two connections — credits exactly once.
5. Two concurrent `settle()` calls on one duel — pays out exactly once.
6. The same on-chain output raced directly at `verifyAndCredit()` — credits exactly once.
7. Two concurrent `complete()` calls on one withdrawal — pays out exactly once.
8. Four connections racing to acquire the SAME A4 lease — exactly one wins, real backends this time, not one PGlite connection serialising everything by construction.
9. Five connections spending against a balance that can only fund three — the non-negativity trigger holds; the final balance matches exactly what really won.
10. After 1-9: the ledger sums to exactly zero platform-wide and no account is negative.

**A real bug this surfaced, fixed, documented:** two concurrent
`ledger_post()` calls that both touch one shared account (scenario 2) can
raise a genuine Postgres deadlock (40P01) — impossible to observe on a single
PGlite connection. This is not an application design flaw to "fix" by
reordering anything; Postgres's own documentation is explicit that a
correctly built transactional client must retry on
`deadlock_detected`/`serialization_failure`, since the deadlock detector
resolves a cycle by aborting one side, by design. The retry (bounded, with
jitter) now lives once, in `pg-adapter.mjs`'s `transaction()` — the single
place every financial write already passes through — rather than scattered
across `settlement.mjs`, `payments.mjs` and `tournament.mjs`, none of which
were touched.

**A4 — closed 2026-09-06.** Migration 0012 adds a fencing-token lease
(`lease_owner`, `lease_token`, `lease_expires_at`) directly on the `duel` row.
`packages/realtime/src/lease.mjs` (`createLeaseManager`) exposes `acquire`
(compare-and-swap: only succeeds when unowned or expired, and mints a
strictly higher token), `renew` (extends without bumping the token, fails the
instant someone else has taken over), and `release`. `gateway.mjs` gained
`claimDuel()`/`releaseDuel()` — the only way a duel should now enter a
gateway's local `duels` map when more than one instance is running — and
`store.persist()` gained an optional `leaseToken` check, verified inside the
SAME transaction as the actual write (migration untouched; this is a new
optional parameter, so every pre-A4 caller is unaffected). A write that
carries a stale token is refused there, at the moment of the write, never on
the strength of the caller's own belief that it is still the owner. 17 new
tests: 12 unit tests of the lease manager in isolation, and 5 with two REAL,
independent `createGateway()` instances sharing only the database —
including the exact scenario asked for: A owns, A "fails" (its lease simply
expires), B takes over and plays the real move, stale A's identical intent
through its own still-open socket is rejected with the new `STALE_OWNER`
error code, and the event log shows the one real move, never a fork. Known
follow-up, not a defect: a client whose gateway goes stale gets no automatic
redirect to the new owner (`NO_SUCH_DUEL` on its next message) — that is a
routing/load-balancer concern, out of scope for the lease primitive itself.

**A8 and A9 were found by this audit, not by inspection — by actually playing
Speed Math over a real WebSocket connection loaded from the database, which no
existing test did before 2026-09-06.**

- **A8 (duel-engine/realtime):** `store.mjs`'s `hydrate()` always reconstructed
  the alternating (per-seat, `toMove`) clock shape on load/recovery, never the
  shared-deadline shape a `SIMULTANEOUS`-turnModel plugin (Speed Math) actually
  uses. `duel-engine`'s `isShared(duel)` check (`duel.clock.model === "SHARED"`)
  then silently misclassified every recovered Speed Math duel as turn-based, so
  `runIntent`'s `NOT_YOUR_TURN` guard rejected any move from whichever seat
  wasn't `clock.toMove` — which is to say, the game was unplayable the moment
  it went through the one code path every real game goes through (matchmaking
  always pairs through storage; there is no in-memory-only creation path in
  production). Fixed by branching `hydrate()`/`clockSnapshot()` on
  `plugin.turnModel`, preserving the existing "downtime is not charged to the
  player" recovery semantics for both clock shapes. Regression test:
  `packages/realtime/test/persistence.test.mjs` — *"a SIMULTANEOUS (Speed Math)
  duel keeps its shared clock across load and a restart."*
- **A9 (protocol):** `parseClientFrame()` required `typeof msg.intent ===
  "string"` unconditionally. Chess intents are strings ("e2e4"); Speed Math
  intents are objects (`{answer: 19}`) by the plugin's own contract
  (`applyIntent` in `game-speed-math/src/plugin.mjs`). Every real Speed Math
  move a client could ever send was refused at the parser, before reaching the
  gateway, the duel engine, or the plugin — meaning the "plugin contract
  proven against two structurally different games" claim (Phase 3 gate) was
  false at the transport layer even though every plugin-level test passed.
  Fixed by accepting a plain object (never an array, never null) in addition
  to a string, leaving every other field's string-only rule untouched.
  Regression test: `packages/realtime/test/protocol.test.mjs` (new file, 6
  tests).

**The shared root cause of A8 and A9:** every existing test exercised the
gateway/protocol/store stack against chess only, or exercised Speed Math
against the plugin directly (never over a real socket, never through
`store.load()`). The abstraction was "proven" against a single game at each
layer, never against both games through the *same* layer at once. Section 6
of this audit (a real WebSocket end-to-end flow, run for both games) is what
surfaced both bugs; unit tests for `store.mjs` and `protocol.mjs` alone would
not have, because each was independently self-consistent within a
chess-shaped assumption.

---

## 3. Security risks

| # | Risk | Severity | Status |
|---|---|---|---|
| ~~S1~~ | ~~No real authentication~~ | — | **CLOSED** — gateway takes identity from a signed token; a revoked session cannot reconnect |
| ~~S2~~ | ~~No authorisation framework~~ | — | **CLOSED** — deny-by-default policy, full capability grid asserted, `undeclaredActions()` as a CI guard |
| ~~S3~~ | ~~No admin plane / RBAC / four-eyes~~ | — | **CLOSED** — 9 roles, self-approval refused by CHECK, MFA mandatory, append-only admin audit |
| S4 | No secrets management. Nothing sensitive exists yet — which is exactly why the discipline must be established *before* it does. | High | Before Phase 5 |
| S5 | TLS/origin locking, WAF, and header stripping are designed but not deployed. | Medium | Infra phase |
| ~~S6~~ | ~~No rate limiting outside the socket~~ | — | **CLOSED** — per-address token bucket, 429 with retry-after |

**What is genuinely closed already:** the client cannot assert a result, a
clock, a score, or a seat. Unknown protocol fields are *refused*, not ignored,
and there is no message type that reports an outcome. That property is tested
four ways and is the foundation the rest of the security model sits on.

---

## 4. Financial risks

The brief lists ten financial attacks. Here is the honest coverage map.

| Attack | Covered? | How |
|---|---|---|
| Double deposit | **Yes** | Idempotency key, unique index; 3 calls → 1 posting |
| Duplicate webhook | **Yes** | Signature verified on raw bytes; replay is a no-op by unique constraint; forged webhook credits nothing |
| Negative balance | **Yes** | Trigger under row lock; refuses at exactly −1 minor unit |
| Duplicate prize / double settlement | **Yes** | Proven end-to-end: three settle calls, one payout |
| Replayed request | **Yes** | Unique idempotency key returns the original result |
| Stale balance | **Yes** | Snapshot written in the same transaction as the entries; L1 verifier proves zero drift |
| Unbalanced transaction | **Yes** | Deferred constraint trigger, refuses at COMMIT |
| Edited history | **Yes** | UPDATE/DELETE/TRUNCATE all refused, plus privileges revoked |
| **Double withdrawal** | **Yes** | Completing twice pays once; one `tx_hash` per network by unique constraint |
| **Simultaneous withdrawal** | **Partly** | The second request cannot lock funds the first holds (ledger refuses); the true *race* still needs real Postgres |
| **Simultaneous match reservation** | **Partly** | The partial unique index is the correct guard and is tested single-writer; the *race* is untested |

| # | Risk | Severity |
|---|---|---|
| ~~F1~~ | ~~No settlement → rake earns nothing~~ — **CLOSED** | — |
| ~~F2~~ | ~~No payment provider adapter~~ — **CLOSED**: `PaymentProvider` abstraction + NOWPayments adapter + a structurally different sandbox provider driven by the same code | — |
| ~~F3~~ | ~~No withdrawal state machine~~ — **CLOSED**: 12 states, legal transitions enforced by trigger, amount/destination immutable after request | — |
| F4 | Reconciliation exists as two SQL **views** (`ledger_balance_verification`, `ledger_solvency`). Nothing runs them, nothing alerts. | High |
| ~~F5~~ | ~~Economy Rules Engine not built~~ — **CLOSED**: versioned, time-bounded, two-admin enforced by CHECK, either exactly 0% or the 10%-25% competitive band (1000-2500 bps, `db/migrations/0035_rake_ladder.sql`), append-only. Fee is now snapshotted at match/tournament creation and frozen (`0036_fee_snapshot.sql`) so an admin rate change never reprices a match already under way. | — |
| F6 | Custody model undecided. Blocks Phase 5. | **Critical (business)** |

**One thing is right by default:** `game.cash_enabled = FALSE` for chess in
migration 0003. Cash play cannot be switched on by accident.

---

## 5. Compliance risks

| # | Risk | Severity |
|---|---|---|
| C1 | **No legal entity, no licensing position, no counsel engaged.** Every real-money feature is blocked behind this, and no amount of engineering substitutes for it. | **Existential** |
| ~~C2~~ | ~~Market matrix not implemented~~ — **CLOSED**: enable or disable a market by configuration, no deployment; table ships EMPTY and fails closed | — |
| ~~C3~~ | ~~Sub-national granularity missing~~ — **CLOSED**: `(country_code, region_code)` from day one; a region row overrides its country |
| C4 | No KYC, AML, sanctions screening, chain analysis, geo or age verification. | Critical (pre-launch) |
| ~~C5~~ | ~~Skill-vs-chance evidence not collected~~ — **CLOSED**: recorded per duel against PRE-duel ratings, with a correlation view. Collection starts on the first free-play duel |
| ~~C6~~ | ~~No responsible-competition controls~~ — **CLOSED**: limits tighten instantly and loosen only after cooling-off; self-exclusion follows the device graph and is append-only |

**C5 is the one most likely to be missed.** It costs almost nothing to record
now and cannot be reconstructed retroactively.

---

## 6. Product risks

| # | Risk | Severity |
|---|---|---|
| ~~P1~~ | ~~Only one game exists~~ — **CLOSED**: Speed Math ships as a structurally different second plugin (simultaneous, shared clock, generated content, hidden state, points scoring). The boundary held for rules/state/scoring/projection; the CLOCK needed generalising, which is recorded below. | — |
| P2 | Reaction/Precision **latency oracle** unresolved. Scoring subtracts estimated network latency, so a player who can inflate reported RTT buys reaction time. | High |
| P3 | **Tournaments and Global Skill Score are built AND now exposed over the REST API** (48 + 33 tests, plus 3 API tests proving the wiring). Achievements and profiles still do not exist. | Low |
| P4 | **No client at all.** No web, no Android. Nothing a human can play. | High |
| P5 | Chess cheat detection still has no labelled dataset, so no auto-action threshold can be honestly set. **The engine now enforces this structurally**: statistical categories cannot be auto-actioned at all. | Medium |
| P6 | Non-chess games are entirely unbuilt, so the "20s–2min replayable" thesis is untested with real users. | Medium |

**P1 and P4 together are the strategic risk.** The repository currently proves
that *the hard invariants hold*. It does not yet prove that *anyone wants to
play*. Those are different kinds of risk and the second one is not reduced by
more tests.

---

## 7. Brand risks

| # | Risk | Severity |
|---|---|---|
| B1 | **Trademark not cleared.** `nizalo.com` is bought; the mark is not searched in classes 9/41/36. Buying a domain is not clearance. | High |
| B2 | Arabic native-speaker review not done. The internal check already caught one disqualifying collision (*Batally* ≈ بطالة, "unemployment"), which is evidence the check finds real things. | High |
| B3 | `.app`, `.games` and defensive variants still unregistered; availability decays. | Medium |
| B4 | `.gg` status genuinely unknown — that registry exposes no usable RDAP, and a known-registered control returned "available". Must be checked at a registrar. | Low |
| B5 | Arabic wordmark is live text, not outlines. Ships wrong if used as-is. | Medium |
| B6 | Fonts (Archivo, IBM Plex) not licensed for app embedding. | Low |

---

## 8. Missing systems, ranked

1. ~~Settlement service~~ — **built**
2. ~~Authentication & session management~~ — **built**
3. ~~Authorisation / policy layer~~ — **built**
4. ~~REST API~~ — **built**
5. ~~Payment provider adapter~~ — **built** (sandbox only; no production keys)
6. ~~Withdrawal state machine~~ — **built**
7. ~~Risk engine~~ — **built** (explainable, per-dimension)
8. ~~Fair Play engine core~~ — **built**
9. ~~Collusion graph~~ — **built** (pairing anomaly, value flow, device edges, ring search)
10. ~~Admin plane + RBAC + emergency controls~~ — **policy + schema built**; the admin UI remains (the tournament-settlement API is built, see #11)
11. ~~Tournament engine + Global Skill Score~~ — **built and wired to the REST API** (player-facing read/register/withdraw routes, admin create/open/start/advance/settle with four-eyes)
12. ~~Compliance policy layer + market matrix~~ — **built** (KYC/AML provider integration still outstanding)
13. **KYC/AML integration**
14. **Web client**, then **Android**
15. ~~Observability~~ — **foundation built 2026-09-06**: `packages/observability` (structured JSON events from a fixed catalog, deny-by-key-name redaction that fails closed on anything unrecognized, a dependency-free Prometheus-text metrics registry, and a generic `instrument()` wrapper proven against a real service — `matchmaking` — with zero source changes to it). Wired directly (optional, default no-op, zero regressions) into the three newest/most-named systems: the A4 lease (acquired/held-by-other/renewed/lost/released/stale-write-rejected), the dispatch worker (tick started/completed/failed, paired, job retried), and `store.persist()`'s stale-lease path. 30 tests. **Update 2026-09-06 (same day):** the production bootstrap this depended on now exists (#19) — `apps/worker`, `apps/api`, and `apps/gateway` all construct a real logger/metrics registry and serve `/metrics` (Prometheus text) and structured JSON logs to stdout, verified live. **Still open:** the other ~14 service packages (auth, payments, settlement, tournament, ...) are wrappable via `instrument()` as-is but not yet wrapped anywhere in these entrypoints — only the newest systems (lease, dispatch worker, reconciliation) emit their own named events today. No log shipper or metrics scraper is actually pointed at these processes yet, since no hosting environment has been chosen (see WORKER_RUNTIME.md).
16. ~~Non-chess game plugins~~ — **Speed Math built** (and, as of this audit, proven playable end-to-end over the real gateway — see A9); Memory, Pattern, Reaction, Precision remain
17. **Reconciliation jobs** (the views exist; nothing runs them)
18. ~~Matchmaking dispatch worker~~ — **built 2026-09-06**: `packages/matchmaking/src/dispatch.mjs` (`createDispatchWorker`), 11 integration tests covering double-matching, double-reservation, worker-retry duplication, crash recovery (a duel left `RESERVED` by an earlier run is finished by a later `tick()`, not just ones paired in the same tick), stale-ticket sweeping, CASH reservation success/failure (an underfunded pairing is `VOIDED`, not left stuck), and genericity (a caller-supplied game unlocks a third plugin with zero worker code changes).
19. ~~No production bootstrap anywhere in the repo~~ — **closed 2026-09-06**: three real, independently deployable processes now exist and were smoke-tested live against local PostgreSQL 17 — `apps/worker` (matchmaking dispatch + reconciliation), `apps/api` (the REST API), `apps/gateway` (the realtime gateway). All three share `packages/bootstrap`: environment validation that fails fast and never logs a secret's value (`env.mjs`), health/readiness/metrics HTTP (`createObservabilityServer` for request-driven processes, `createWorkerRuntime` for tick-driven ones), and graceful SIGTERM/SIGINT shutdown with a hard-exit fallback (`graceful-shutdown.mjs`, shared by both). Documented per-environment in `docs/architecture/WORKER_RUNTIME.md`. Two real, previously-latent gaps this closed: (a) `createGateway()`'s WebSocket port was hardcoded to a random one (`port: 0`), unusable for a real deployment needing a fixed, discoverable port — now configurable, with every existing test's behavior (an ephemeral port) preserved as the default; (b) A4's lease made ownership exclusive and safe, but nothing ever decided WHEN a gateway instance should go claim a duel it does not have loaded — `packages/realtime/src/claim-sweep.mjs` (`sweepUnclaimableDuels`, 6 tests) is now the scheduled piece that actually connects "a duel became LIVE somewhere" to "some gateway instance owns and can serve it," covering startup recovery, a newly-live duel paired by a separate process, and a dead peer's expired lease.

---

## 9. Execution order

Ordered by *what unblocks the most* and *what is cheapest to get wrong later*.

**Now — close the loop**
1. **Settlement service.** Duel COMPLETED → lock/release stakes → rake via the
   Economy Rules Engine → rating update → duel SETTLED. Idempotent, replay-safe,
   and refusing to settle a duel under fair-play hold.
2. **Economy Rules Engine.** Versioned, time-bounded, two-admin, audited.
3. **Rating write-back** on settlement.

**Then — make it real**
4. Authentication (Argon2id, TOTP, sessions, devices) + authorisation layer.
5. REST API over the existing domain services.
6. Docker + real Postgres → **the concurrency suite** that closes A2, and with it
   the honest half of Gates 1 and 2.

**Then — make it playable**
7. A second game plugin (Speed Math) — proves the multi-game thesis and is the
   real test of the plugin boundary.
8. Web client. Free play only.
9. Tournaments + Global Skill Score.

**Then — make it lawful, then make it paid**
10. Compliance policy layer with **sub-national granularity from day one**.
11. Counsel: entity, licensing, market matrix (C1 — start in parallel *now*, it
    has the longest lead time of anything on this list).
12. NOWPayments adapter, sandbox only. Deposit + withdrawal state machines.
13. Reconciliation jobs and alerting.
14. KYC/AML, geo, age.
15. Admin plane, emergency controls, then Android, then hardening.

### 9.1 The one thing to start in parallel today

**C1 — engage counsel.** It is the longest-lead item, it gates every revenue
feature, and it is the only item on this list that no amount of engineering
progress can shorten.

---

## 10. Unit economics — the model, not a promise

No profitability is projected or promised. What follows is the structure the
model must have, so the numbers can be filled in with real data rather than hope.

**Revenue per duel** = `stake × 2 × rake_bps / 10000`
At 10% on a $10-per-side duel, gross margin per duel is **$2.00**.

**Costs to subtract, per the brief:**

| Cost | Nature | Note |
|---|---|---|
| Payment/network fees | Per transaction | Deposits and withdrawals, not per duel — so **deposit frequency drives this, not play frequency** |
| Fraud & chargeback loss | % of volume | Crypto has no chargebacks, which is a real structural advantage; the exposure moves to collusion and cheating instead |
| Anti-cheat review labour | Per case | Scales with players, not revenue — the dangerous one |
| Support | Per ticket | Concentrated on withdrawals |
| Compliance | Mostly fixed + per-KYC | Licensing is a large fixed cost that makes small markets uneconomic |
| Infrastructure | Per concurrent duel | Sockets are cheap; the ledger is not the bottleneck |

**The two ratios that decide viability:**
1. **Duels per deposit.** Payment fees are charged per deposit; rake is earned
   per duel. A player who deposits once and plays 200 duels is profitable; one
   who deposits and plays twice is not. This ratio matters more than rake %.
2. **Review cost per 1,000 duels.** Anti-cheat labour scales with *players*
   while revenue scales with *stakes*. If manual review cost per duel exceeds
   rake per duel at low stakes, low-stake cash tiers are structurally
   loss-making and should not exist.

**Recommendation:** instrument both ratios during free play, before cash is ever
enabled. They are measurable without taking a single deposit, and they determine
whether the minimum viable stake is $1 or $10.

---

## 11. Quality gate status per subsystem

The brief requires Purpose / Architecture / Threat Model / Failure Modes /
Interfaces / Data Model / Tests / Monitoring / Recovery / Documentation.

| Subsystem | Purpose | Arch | Threat | Failure | Iface | Data | Tests | Monitor | Recovery | Docs |
|---|---|---|---|---|---|---|---|---|---|---|
| Ledger | Y | Y | Y | Y | Y | Y | Y | **N** | Partial | Y |
| Duel engine | Y | Y | Y | Y | Y | Y | Y | **N** | Y | Y |
| Chess plugin | Y | Y | Y | Y | Y | Y | Y | **N** | Y | Y |
| Matchmaking | Y | Y | Y | Y | Y | Y | Y | **N** | Partial | Y |
| Rating | Y | Y | Partial | Y | Y | Y | Y | **N** | n/a | Y |
| Realtime | Y | Y | Y | Y | Y | Y | Y | **N** | Y | Y |
| Settlement | Y | Y | Y | — | — | — | **N** | **N** | — | Y |
| Payments | Y | Y | Y | Y | Partial | Partial | **N** | **N** | Partial | Y |
| Risk / Fair Play | Y | Y | Y | Partial | Partial | **N** | **N** | **N** | **N** | Y |
| Compliance | Y | Y | Partial | Partial | Partial | Partial | **N** | **N** | **N** | Y |
| Admin | Y | Partial | Partial | **N** | **N** | **N** | **N** | **N** | **N** | Partial |

**Monitoring is `N` across the board.** That is the most systematic gap in the
table and it should be fixed once, centrally, rather than per subsystem.
