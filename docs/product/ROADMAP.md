# Roadmap

**Principle:** each phase ends at a **gate**. A gate is a set of conditions that
must be *demonstrated*, not asserted. Nothing that touches real money ships until
its gate has been passed with evidence.

Durations are relative effort bands for a small senior team, not commitments.

---

## Phase 0 — Foundation *(this phase — largely complete)*

| Item | Status |
|---|---|
| Repository & environment inspection | **Done** — [ENVIRONMENT_ASSESSMENT.md](../architecture/ENVIRONMENT_ASSESSMENT.md) |
| Missing infrastructure identified | **Done** |
| Threat model | **Done** — [THREAT_MODEL.md](../security/THREAT_MODEL.md) |
| Payment architecture | **Done** — [PAYMENT_ARCHITECTURE.md](../payments/PAYMENT_ARCHITECTURE.md) |
| Ledger specification | **Done** — [LEDGER_SPECIFICATION.md](../ledger/LEDGER_SPECIFICATION.md) |
| Product & technical architecture | **Done** — [TECHNICAL_ARCHITECTURE.md](../architecture/TECHNICAL_ARCHITECTURE.md) |
| Naming strategy, 40 candidates, shortlist of 10, top 3 | **Done** — [NAMING_CANDIDATES.md](../brand/NAMING_CANDIDATES.md) |
| Live domain verification (RDAP) | **Done** |
| Brand strategy & recommendation | **Done** — [BRAND_STRATEGY.md](../brand/BRAND_STRATEGY.md) |
| Brand identity: logo, guidelines, design tokens | **Done** — [BRAND_GUIDELINES.md](../brand/BRAND_GUIDELINES.md), `brand/logo/`, `packages/tokens/` |
| Compliance architecture & market matrix | **Done** — [COMPLIANCE_ARCHITECTURE.md](../compliance/COMPLIANCE_ARCHITECTURE.md) |
| Anti-cheat architecture | **Done** — [ANTI_CHEAT_ARCHITECTURE.md](../anti-cheat/ANTI_CHEAT_ARCHITECTURE.md) |
| Risk engine spec | **Outstanding** |
| Remaining section-41 documents | **Outstanding** |

**GATE 0 — PASSED 2026-09-06.**
1. ~~Brand name approved (D1).~~ **Done — Nizalo. `nizalo.com` registered.**
2. ~~Docker + Postgres available locally (R5).~~ **Resolved differently** — PGlite
   (Postgres 17 in WASM) removes the container dependency for schema work. Docker
   moves to Gate 2, where concurrency testing genuinely requires it.
3. ~~Compliance architecture documented (D2).~~ **Documented.** Counsel engagement
   remains open and still gates Phase 6, not Phase 1.

---

## Phase 1 — Design system, data, and core platform

Monorepo scaffold · design system & tokens (light/dark, full RTL from day one) ·
Postgres schema & migration harness · **ledger primitives with invariants
enforced in the database** · authentication (Argon2id, TOTP 2FA, session/device
management) · authorisation framework (deny-by-default) · API contract ·
observability skeleton · CI with secret scanning and dependency audit.

**GATE 1 — partially met. Evidence, not assertion:**

| Requirement | Status |
|---|---|
| Ledger cannot produce a non-zero-sum transaction | **PROVEN** — deferred constraint trigger; 3 tests |
| `UPDATE`/`DELETE`/`TRUNCATE` on ledger tables impossible | **PROVEN** — 4 tests, all rejected at the DB |
| A user balance cannot go negative | **PROVEN** — 2 tests |
| A replayed posting cannot double-post | **PROVEN** — 2 tests |
| Adjustments require a named admin and a reason | **PROVEN** — 3 tests |
| An entry cannot mismatch its account asset | **PROVEN** — composite FK |
| Balance snapshot never drifts from entries (L1) | **PROVEN** |
| Solvency view: custody covers liabilities | **PROVEN** |
| **Same, under _concurrent_ writers** | **PROVEN 2026-09-06** — real PostgreSQL 17, up to 8 independent connections; see A2 in RISK_REGISTER.md |
| Design system, tokens, RTL | **Done** — `packages/tokens/tokens.css` |
| Authentication | **Done** — Argon2id, refresh rotation + reuse detection, TOTP (RFC 4226/6238 vectors), step-up, cooling-off |
| Authorisation layer | **Done** — deny-by-default; an undeclared action is refused to everyone, including SUPER_ADMIN |
| REST API | **Done** — routes carry their policy action; an undeclared one prevents startup |

```bash
npm test
```
22 tests, 22 passing, against PostgreSQL 17.

---

## Phase 2 — Chess, realtime, ratings, matchmaking

Realtime WebSocket gateway · server-authoritative chess (all termination
conditions: checkmate, resignation, timeout, draw, stalemate, threefold
repetition, fifty-move, insufficient material) · authoritative clocks with
increment/delay · reconnection · full game persistence (id, players, initial
position, moves, move timestamps, clock state, result, termination reason, game
hash, anti-cheat metadata, audit events) · Glicko-2 ratings · matchmaking with
DB-enforced reservation invariants · profiles · spectating.

**GATE 2 — partially met.**

| Requirement | Status |
|---|---|
| Chess rules pass a standard perft suite | **PROVEN** — 6 positions, 23 counts, all matching published values incl. perft(5) = 674,624 |
| All termination conditions correct | **PROVEN** — mate, stalemate, fifty-move, threefold, all four insufficient-material cases |
| Replay determinism: same result and hash | **PROVEN** — Opera Game replays identically from a different wall-clock origin |
| Tampered replay detected | **PROVEN** — forged result and forged move both rejected |
| Clock is server-authoritative | **PROVEN** — disconnect cannot buy time; backwards time refused |
| Plugin contract cannot express a verdict | **PROVEN** — enforced at registration |
| Glicko-2 ratings | **PROVEN** — reproduces Glickman's published worked example to 2dp |
| Matchmaking: one active ticket per player | **PROVEN** — partial unique index |
| Matchmaking: no duplicate match on retry | **PROVEN** — unique pairing key |
| Matchmaking: a player cannot face themselves | **PROVEN** — check constraint |
| Matchmaking: stale tickets never matched | **PROVEN** — TTL + heartbeat sweeper |
| Rating bands widen but have a ceiling | **PROVEN** |
| Duel persistence: append-only event log | **PROVEN** |
| Cash duel is RESERVED before play | **PROVEN** — money locks before the duel begins |
| Realtime gateway: client cannot assert a result | **PROVEN** — unknown protocol fields refused, not ignored |
| Realtime gateway: reconnect resyncs and gains no time | **PROVEN** |
| Realtime gateway: spectator projection withheld per subscriber | **PROVEN** |
| Realtime gateway: timeout completes with no client message | **PROVEN** |
| Realtime gateway: floods throttled, bad input never drops the socket | **PROVEN** |
| Spectating | **PROVEN** |
| **Concurrency under real parallel writers** | **PROVEN 2026-09-06** — real PostgreSQL 17, up to 8 independent connections, 11 scenarios (simultaneous withdrawals, duel reservations, prize settlement, duplicate webhooks, on-chain output reuse, A4 lease races, negative-balance stress). See A2 in RISK_REGISTER.md. |
| **Load test at target concurrency** | **NOT STARTED** |
| Gateway wired to Postgres persistence | **DONE** — `createDuelStore`; persist-before-broadcast, crash recovery, replay re-verification |
| Profiles | **NOT STARTED** |

```bash
npm test
```
746 tests, 746 passing (17 workspaces: the original 15, plus `matchmaking`'s
dispatch worker and `realtime`'s A4 lease from the 2026-09-06 audit, plus the
new `observability` package). See
[RISK_REGISTER.md §1](../architecture/RISK_REGISTER.md) for the 2026-09-06
audit that closed two real bugs (A8, A9) that only a real end-to-end
WebSocket flow for a *second* game (Speed Math) surfaced, and for A2's
closure the same day against a real, independently-running local PostgreSQL
17 server with up to 8 genuinely independent connections per scenario —
including the real Postgres deadlock (40P01) that scenario surfaced and the
retry-with-jitter fix now living in `packages/ledger/src/pg-adapter.mjs`.

**What "PROVEN" means here and does not mean.** Each row above is demonstrated by
a test that fails if the guard is removed. Genuine parallelism — `FOR UPDATE`
contention, deadlock ordering, serialisation failures — is now exercised
against real PostgreSQL for the specific scenarios A2 names (real financial
writes: withdrawals, reservations, settlement, deposits, the A4 lease).
Everyday PGlite-based tests still run single-connection, so a NEW financial
write path added later should get its own real-Postgres scenario in
`real-pg-concurrency.test.mjs`, not just a PGlite test — the constraint being
correct "on paper" (a partial unique index does not care how many writers
there are) is not the same claim as having watched it hold under a real race,
and A2's closure rests on the latter, not the former.

---

## Phase 3 — Skill Duel Engine + non-chess games

Extract the engine/plugin boundary using chess as the first plugin (proving the
abstraction against a real, hard case) · Speed Math · Memory Grid · Pattern ·
Number Memory · Precision · Reaction · server-side seeded challenge generation ·
input-biometric capture for bot detection.

**GATE 3:**
- Chess runs unmodified as a plugin — proof the boundary is real.
- Adding a game touches **zero** files in ledger, payments, risk, or compliance.
- Every game's challenge generation is server-side and unpredictable from the
  client, demonstrated by an attempted client-side prediction attack.
- **R1 resolved:** the Reaction/Precision latency oracle is proven bounded, or
  those games are marked free-play-only.

---

## Phase 4 — Tournaments, progression, admin

Tournament engine (daily, hourly, weekly, seasonal, special, multi-game) ·
Global Skill Score with the 35% cap and published methodology · achievements ·
seasons · leaderboards · admin plane as a separate deployable · RBAC (nine roles) ·
moderation tooling · case management · audit log surfacing · analytics
instrumentation.

**GATE 4:**
- ~~Global Skill Score verified: no single game exceeds 35% contribution under adversarial simulated play patterns.~~ **Done** — water-filling cap, tested against an adversarial single-dominant-game distribution.
- ~~Admin RBAC verified: no role can both create and approve the same payout.~~ **Done** — enforced by CHECK, and by the policy engine, with no seniority exemption.
- Every privileged action emits an immutable audit event, verified by test.
- ~~Emergency controls individually togglable and audited.~~ **Done** — 10 independent switches, fresh-reason + named-actor required, append-only change log.
- ~~Tournament engine and Global Skill Score reachable by a real client.~~ **Done 2026-09-06** — both wired to the REST API under the existing authz/authz policy grid; the client cannot determine pairings, standings, results, or prize settlement (all server-computed), proven by dedicated IDOR/authorization tests.
- The admin plane itself is still API-only (no UI) — out of scope for this pass by explicit instruction.

---

## Phase 5 — Money: ledger in production, NOWPayments sandbox

Full ledger wiring · Economy Rules Engine · NOWPayments adapter behind the
provider interface · USDT/TRON deposit simulation · withdrawal state machine ·
four-eyes approval · reconciliation jobs (L1/L2/L3 + solvency) · suspense account
handling · **sandbox only, no production keys**.

**GATE 5 — the most important gate in the roadmap:**
- **Forged-webhook test fails closed.** Mandatory.
- Duplicate, replayed, and out-of-order webhooks are provably no-ops.
- Deposit edge cases handled: underpay, overpay, wrong asset, wrong network,
  dust, late confirmation.
- Chaos test: settlement worker killed mid-transaction -> ledger still balances,
  no double-post.
- Injected discrepancies each raise a case; **none self-heals**.
- Solvency-breach drill halts withdrawals automatically.
- **D4 resolved:** custody model chosen, with keys demonstrably absent from source
  and from any application server.

---

## Phase 6 — Compliance, KYC/AML, geo, production payments

KYC provider integration with tiered verification · AML and sanctions screening ·
chain-analysis screening on deposits · geo-blocking and VPN/proxy signals · age
verification · the market matrix enforced as code · responsible-competition
controls · tax reporting hooks · terms, privacy, fair-play, withdrawal, dispute,
and account-closure policies · production payment keys in a managed secrets store.

**GATE 6:**
- **D2 and D3 resolved:** legal entity, licensing position, and launch markets
  confirmed by counsel in writing.
- Compliance policy layer is independent and testable: a market can be enabled or
  disabled by configuration, with no code change.
- No restricted jurisdiction can transact, verified by test.
- KYC artefacts stored encrypted, segregated, with a retention clock.

---

## Phase 7 — Android

Kotlin + Jetpack Compose · same backend as web · auth + 2FA · game selection ·
chess · skill games · tournaments · rank · profile · wallet · deposit · withdrawal
· notifications · security, sessions, devices · support.

**GATE 7:**
- **Decompiled APK contains no secret** — no private key, no payment credential,
  no admin credential. Verified by actually decompiling it.
- Play Integrity used only as a risk *signal*, never as a security gate.
- Feature parity with web on every money surface.

---

## Phase 8 — Hardening

External penetration test · load and soak testing · fraud red-teaming ·
anti-cheat validation against a labelled dataset · disaster recovery drills
(including a real restore from backup) · runbooks · on-call · full observability
and alerting.

**GATE 8:**
- Pen-test criticals and highs remediated and retested.
- **R2 resolved:** chess cheat-detection false-positive rate measured on labelled
  data, and auto-action thresholds set from that measurement — not from intuition.
- Restore-from-backup drill completed within the stated RTO/RPO.
- Every emergency control exercised in a game day.

---

## Phase 9 — Launch and growth

Staged rollout in approved markets only · free play first, cash tiers enabled per
market as licensing permits · monitoring · growth loops · CRO · continuous
economy tuning.

**GATE 9:**
- 24/7 monitoring and escalation demonstrably working.
- Reconciliation green for a sustained period before cash tiers open.
- Support and case-review capacity in place for the projected volume.

---

## Sequencing rationale

Three deliberate ordering choices:

1. **Chess before the engine abstraction (Phase 2 before 3).** Extracting a plugin
   boundary from one real, hard implementation produces a better boundary than
   designing it against imagined games. Chess is the hardest case; if the
   abstraction survives it, it will survive Speed Math.
2. **The ledger before payments (Phase 5 internals before Phase 6 production).**
   The accounting model must be provably correct before real value flows through
   it. Reversing this order is how platforms end up unable to say what they owe.
3. **Compliance before production money (Phase 6 before Phase 9).** The market
   matrix gates revenue, not the reverse. This is the phase most likely to be
   compressed under commercial pressure, and the one where compression is fatal.

---

## Immediate next actions

| # | Action | Owner | Blocking |
|---|---|---|---|
| ~~1~~ | ~~Approve or reject Nizalo~~ — **locked** | Founder | — |
| 2 | Arabic native-speaker brand review | Founder | Name lock |
| 3 | Trademark clearance (classes 9, 41, 36) | Counsel | Domain purchase |
| 4 | Engage gaming/fintech counsel on entity + licensing | Founder | Phase 6 |
| 5 | Install Docker Desktop + Postgres 16 | Engineering | Phase 1 |
| 6 | Write remaining section-41 documents (risk, RBAC, Android, API, schema, ops, DR) | Engineering | Gate 0 |
