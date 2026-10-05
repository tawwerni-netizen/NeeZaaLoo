# Environment & Repository Assessment

**Date:** 2026-09-06
**Assessed by:** Founding architecture pass (Phase 0, step 1–4)

---

## 1. Finding: this is a greenfield build

`H:\Claide Apps` contains exactly one project, and it is **unrelated** to this
platform:

| Path | What it is | Relevance |
|---|---|---|
| `H:\Claide Apps\wassalni` | "وصلني / Wassalni" — an Android app that reunites people with lost belongings. Kotlin + Jetpack Compose + Supabase (Postgres), 11 SQL migrations, M1 auth layer in progress. | **None.** Different product, different domain. Do not extend it. |

**Conclusion:** there is no existing architecture to preserve, extend, or avoid
rewriting. Rule §43 ("do not rewrite working code unnecessarily") is satisfied
trivially — we are not touching `wassalni`. This platform gets its own root at
`H:\Claide Apps\skill-duel-platform` (to be renamed once the brand is locked).

### 1.1 What is worth *borrowing* from wassalni

Not code, but two proven working habits already established by the owner:

- **Docs-first discipline.** `PROJECT.md` / `ARCHITECTURE.md` / `TASKS.md` were
  written before code, and the git history shows security hardening commits
  ("Close the verification oracle, enumeration surface, and image leak") landing
  *as their own commits*. That is the correct cadence for this project too.
- **Database-as-contract.** Numbered, ordered, forward-only SQL migrations with
  security fixes expressed as migrations. We will use the same model.

---

## 2. Toolchain present on this machine

| Tool | Status | Version | Implication |
|---|---|---|---|
| Node.js | ✅ | v24.18.0 | Modern LTS-class runtime. Backend + web are viable today. |
| npm | ✅ | 11.16.0 | Workspaces available; no separate package manager needed. |
| Git | ✅ | 2.55.0 | Fine. |
| JDK | ✅ | Temurin 17.0.20.1 | Correct JDK for Android/Gradle. |
| Docker | ❌ | absent | **Gap.** No local Postgres/Redis, no parity with production containers. |
| PostgreSQL client (`psql`) | ❌ | absent | **Gap.** Cannot drive migrations locally. |
| Python | ❌ | absent | Not required by the recommended stack. |
| pnpm | ❌ | absent | Not required; npm workspaces suffice. |
| Android SDK | ❌ | `ANDROID_HOME` / `ANDROID_SDK_ROOT` unset | **Gap** for Phase 7 only. Not blocking Phases 0–6. |
| Network egress | ✅ | verified | RDAP + HTTPS reachable from the shell. |

### 2.1 Missing infrastructure — ranked by when it blocks us

| Gap | Blocks | Phase it must be closed by | Resolution |
|---|---|---|---|
| Docker Desktop | Redis, **concurrency testing**, prod parity | **Phase 2** (was Phase 1 — see 2.2) | `winget install Docker.DockerDesktop` (needs WSL2) |
| PostgreSQL 16 client | Convenience only — migrations are verified by the PGlite harness | Phase 2 | Ships with the Docker image; also installable standalone |
| Redis | Matchmaking queues, presence, rate limits, idempotency locks | **Phase 2** | Docker container locally; managed Redis in prod |
| Android SDK + Studio | APK build | **Phase 7** | `winget install Google.AndroidStudio` |
| Secrets manager | Payment keys, custody credentials | **Phase 5** | Cloud KMS/Secrets Manager — never `.env` in prod |
| Managed Postgres (prod) | Everything financial | **Phase 5** | Provider with PITR + automated backups |
| Object storage | Replays, KYC artefacts, evidence bundles | **Phase 4** | S3-compatible, encrypted at rest, private ACL |
| Observability stack | 24/7 automation (§31) | **Phase 8** | Centralised logs + metrics + alerting |

**No blocking gap exists for Phase 0 or Phase 1.** See 2.2 — the Docker
dependency turned out to be avoidable for schema work.

### 2.2 How the Docker blocker was removed (and what it still blocks)

The original assessment said Docker was required "the moment we write the first
migration". That was wrong, and the correction is worth recording.

**PGlite** (`@electric-sql/pglite`) is PostgreSQL 17 compiled to WebAssembly,
running in-process under Node. It is not a Postgres emulator or a subset: it is
the real engine, so `CREATE CONSTRAINT TRIGGER ... DEFERRABLE`, composite
foreign keys, `plpgsql`, and `ON CONFLICT` all behave exactly as they will in
production. That makes the entire Phase 1 ledger — schema, invariants, and the
tests that prove them — buildable and verifiable on this machine today, with no
container runtime and no service to run.

**What PGlite does NOT cover, and why Docker is still required:**

| Capability | PGlite | Needs real Postgres |
|---|---|---|
| Constraints, triggers, deferred checks | Yes | — |
| plpgsql functions, transactions, rollback | Yes | — |
| **Multiple concurrent connections** | **No — single connection** | **Yes** |
| `SELECT ... FOR UPDATE` contention, deadlock ordering | No | Yes |
| Serialisation failures and retry behaviour | No | Yes |
| Connection pooling, `pg_stat`, EXPLAIN on real plans | No | Yes |

So the invariants that a *single* writer can violate are now proven. The
invariants that only *concurrent* writers can violate are not, and cannot be
until a real Postgres is running. That is why Docker moved from Phase 1 to
Phase 2 rather than off the list: Gate 2 requires the concurrency suite.

---

## 3. Stack recommendation

Rule §40 says to evaluate the repository before choosing technologies and not to
blindly enforce a stack. The repository is empty of relevant precedent, so the
decision is made on merit and on what this machine already runs well.

| Layer | Choice | Why (given this environment) |
|---|---|---|
| Language (server + web) | **TypeScript** (strict) | One language across web + backend; Node 24 already installed. |
| Backend | **NestJS** on Node 24 | DI and module boundaries matter when ledger, risk, anti-cheat and game plugins must stay separable. Fastify adapter for throughput. |
| Realtime | **Dedicated WebSocket gateway** (separate deployable from REST) | Game sockets must scale and fail independently of the money path. |
| Web | **Next.js + React + TypeScript** | Premium marketing surface + app shell in one codebase. |
| Database | **PostgreSQL 16** | Non-negotiable for a double-entry ledger: real transactions, `SERIALIZABLE`/`REPEATABLE READ`, constraints, exclusion constraints. |
| Cache / queues | **Redis** + **BullMQ** | Matchmaking, presence, idempotency, scheduled settlement. |
| Android | **Kotlin + Jetpack Compose** | Per §24. JDK 17 already present. |
| Infra | Docker → managed Postgres/Redis, object storage, Cloudflare | Per §40. |

### 3.1 One deliberate deviation from the suggested stack

**The ledger is not an ORM concern.** Prisma/TypeORM are fine for profiles and
content, but ledger writes will be **hand-written parameterised SQL inside
explicit transactions**, with balances derived from entries. An ORM's implicit
lazy-loading and connection handling are the wrong tool where atomicity and
idempotency are the product. This is recorded here so it is not "fixed" later.

---

## 4. Repository layout (proposed)

```
skill-duel-platform/
├── apps/
│   ├── api/              # NestJS: REST, auth, wallet, admin
│   ├── realtime/         # WebSocket gateway: duels, presence, clocks
│   ├── worker/           # BullMQ: settlement, reconciliation, scheduling
│   ├── web/              # Next.js
│   └── android/          # Kotlin + Compose (Phase 7)
├── packages/
│   ├── duel-engine/      # SkillDuelEngine core + plugin contract
│   ├── game-chess/       # ChessPlugin
│   ├── game-*/           # Speed Math, Memory, Pattern, Reaction, Precision
│   ├── ledger/           # Double-entry primitives
│   ├── risk/             # Risk scoring
│   ├── fairplay/         # Anti-cheat core
│   ├── economy/          # Rake / fee rules engine
│   └── contracts/        # Shared types, zod schemas, API contract
├── db/migrations/        # Forward-only, numbered SQL
├── docs/                 # This tree
└── ops/                  # Docker, IaC, runbooks
```

---

## 5. Environment risks to flag now

1. **Single-developer machine is not a production environment.** No secret
   material for payments should ever exist on this host, including in `.env`
   files, once real funds are involved (§18).
2. **No Docker means no local prod parity today.** Every day we defer this, the
   "works on my machine" gap widens against a system whose correctness depends
   on transactional semantics.
3. **`wassalni/local.properties` exists in that project** — a reminder that
   local credential files are already a habit here. For this project,
   `local.properties`-style files must be `.gitignore`d from commit #1, and
   production keys must live only in a managed secrets store.
