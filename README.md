# Nizalo

**نزالو** · from the Arabic **نزال** (*nizal*) — *a duel, a bout, a contest between two*.

> **Your duel. Your proof.** · **نزال واحد يكفي**

A global skill duel platform: one account, one rating ecosystem, one wallet, one
matchmaking core, one tournament engine, one trust & safety layer — with many
short-form 1v1 games behind it.

**Chess is the flagship game. Chess is not the category.**

**Status:** Phase 0 (foundation). No application code written yet — by design.

---

## Running it

```bash
npm install && npm test
```

22 ledger invariant tests run against **real PostgreSQL 17** via PGlite (Postgres
compiled to WASM) — no Docker, no service to start. The constraints and triggers
under test are the same ones that will run in production.

```
db/migrations/         forward-only, numbered, recorded
packages/ledger/       migration runner + invariant suite
packages/tokens/       design tokens, both themes, full RTL
brand/logo/            12 SVG identity assets
```

## Documents

### Product
- [PROJECT_VISION.md](docs/product/PROJECT_VISION.md) — what this is, what it is not, the four things that would end the company
- [ROADMAP.md](docs/product/ROADMAP.md) — Phases 0–9 with hard gates

### Architecture
- [ENVIRONMENT_ASSESSMENT.md](docs/architecture/ENVIRONMENT_ASSESSMENT.md) — repo & toolchain inspection, missing infrastructure, stack decision
- [TECHNICAL_ARCHITECTURE.md](docs/architecture/TECHNICAL_ARCHITECTURE.md) — system shape, Skill Duel Engine, plugin contract, matchmaking, ratings

### Security
- [THREAT_MODEL.md](docs/security/THREAT_MODEL.md) — STRIDE by trust boundary + the attacks that actually kill this business

### Money
- [LEDGER_SPECIFICATION.md](docs/ledger/LEDGER_SPECIFICATION.md) — double-entry, append-only, multi-asset
- [PAYMENT_ARCHITECTURE.md](docs/payments/PAYMENT_ARCHITECTURE.md) — provider abstraction, USDT/TRON, deposit & withdrawal flows, custody

### Trust & Safety
- [ANTI_CHEAT_ARCHITECTURE.md](docs/anti-cheat/ANTI_CHEAT_ARCHITECTURE.md) — Fair Play Engine, chess detection, collusion graph, case management
- [COMPLIANCE_ARCHITECTURE.md](docs/compliance/COMPLIANCE_ARCHITECTURE.md) — policy layer, market matrix, KYC tiers, AML

### Brand
- [BRAND_GUIDELINES.md](docs/brand/BRAND_GUIDELINES.md) — **the identity**: logo, colour, type, motion, voice
- [`brand/logo/`](brand/logo/) — 12 SVG assets: marks, lockups, app icon, favicon, Arabic lockup
- [`packages/tokens/tokens.css`](packages/tokens/tokens.css) — design tokens, both themes, full RTL
- [`brand/brand-guidelines.html`](brand/brand-guidelines.html) — the visual brand guide
- [NAMING_CANDIDATES.md](docs/brand/NAMING_CANDIDATES.md) — 40 candidates, live RDAP verification, shortlist of 10
- [BRAND_STRATEGY.md](docs/brand/BRAND_STRATEGY.md) — how Nizalo was chosen; the record of the decision

### Money
- [LEDGER_SPECIFICATION.md](docs/ledger/LEDGER_SPECIFICATION.md) implemented in [`db/migrations/0001_ledger_core.sql`](db/migrations/0001_ledger_core.sql)

### Not yet written
`PRODUCT_REQUIREMENTS.md` · `DATABASE_SCHEMA.md` · `API_BLUEPRINT.md` ·
`RISK_ENGINE.md` · `ADMIN_RBAC_MODEL.md` · `ANDROID_ARCHITECTURE.md` ·
`OPERATIONS_RUNBOOK.md` · `DISASTER_RECOVERY.md`

---

## The rules that govern every decision here

1. **The client renders; the server decides.** Nothing client-asserted is trusted
   for money, results, scores, state, clocks, or ratings.
2. **A mutable balance is never the source of truth.** Double-entry, append-only,
   balances derived from entries.
3. **A webhook is a notification to go look, never a reason to credit.**
4. **Never one signal = ban.** Signals -> score -> evidence -> case -> review ->
   decision -> appeal.
5. **No unexplained discrepancy is ever auto-repaired.**
6. **Adding a game must never require touching financial infrastructure.**
7. **No secret in any client. No private key in any repository or APK.**
8. **Compliance is configuration, not conditionals.** Every market defaults to
   free-play-only until counsel says otherwise.
9. **The money surfaces feel like a bank. The game surfaces feel like a sport.**
   Nothing ever feels like a casino floor.

---

## Blocking decisions

| # | Decision | Blocks |
|---|---|---|
| D2 | Legal entity, jurisdiction, licensing counsel | All real-money features |
| D3 | Launch markets | Phase 6 |
| D4 | Custody model | Phase 5 |
| D5 | Whether Reaction/Precision may ever be cash games | Phase 3 |

## Environment gaps

Docker, `psql`, and the Android SDK are absent on this machine. Docker is the
first hard blocker — it is required the moment the first migration is written
(Gate 0 -> Phase 1).
