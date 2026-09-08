# Process runtime

How every long-running process in this platform actually runs, in every
environment — not a proposal. Three real, independently deployable
entrypoints exist and are described here, all built on `packages/bootstrap`:

| Process | Entrypoint | What it is |
|---|---|---|
| Background worker | `apps/worker/src/index.mjs` | matchmaking dispatch + reconciliation, tick-driven |
| REST API | `apps/api/src/index.mjs` | the request-driven HTTP API (`packages/api`) |
| Realtime gateway | `apps/gateway/src/index.mjs` | the WebSocket game server (`packages/realtime`), plus its own claim-sweep/lease-renewal/timeout/dead-connection sweeps |

The API and gateway are deliberately separate deployables from each other and
from the worker (see `gateway.mjs`'s own header): a chess rush hour on the
gateway must never starve the low-latency API, and a crash in one must not
take the others with it.

## What a tick-driven worker needs to be

## What a worker needs to be

Any object shaped like `{ tick() }` — one bounded, awaitable pass of its own
work. That is the entire contract. `packages/matchmaking/src/dispatch.mjs`
happens to also have its own `start()`/`stop()` for standalone use (its own
tests use it directly, with no runtime involved) — the runtime never calls
those. `packages/bootstrap/src/tick-loop.mjs`'s `createTickLoop(fn)` gives
that same `{ tick, start, stop }` shape to a plain async function, for
services (like reconciliation) that do not manage their own scheduling.

## What the runtime provides

`createWorkerRuntime({ workers, logger, metrics, port })`
(`packages/bootstrap/src/runtime.mjs`) is the ONLY thing that ever calls
`worker.tick()` in production. It:

- wraps each worker's `tick` in place to track `tickCount`, `lastTickAt`,
  `lastError`, `consecutiveFailures` — observable at `/readyz` and as
  Prometheus metrics (`worker_ticks_total`, `worker_tick_failures_total`,
  `worker_ready`);
- owns the scheduling itself, one `setInterval` per worker (a worker may
  declare its own `intervalMs`, overriding the shared default — reconciliation
  runs every 60s by default, matchmaking dispatch every 1s);
- serves `/healthz` (liveness — the process is up, full stop), `/readyz`
  (readiness — every worker has completed at least one tick and is not
  crash-looping past `maxConsecutiveFailures`), and `/metrics` (Prometheus
  text exposition);
- exposes `installSignalHandlers()`, wiring `SIGTERM`/`SIGINT` to a graceful
  `stop()` (clears every timer, closes the HTTP server) with a hard `exit(1)`
  fallback if shutdown does not complete within `gracefulShutdownMs` (default
  10s) + 2s.

`workerIdentity()` gives the process a stable id (`WORKER_ID` env var, or
`hostname-pid`), used as the A4 lease owner id and stamped on every log line.

## What a request-driven process (API, gateway) gets instead

The API and gateway are not tick-driven, so `createWorkerRuntime`'s
readiness model ("has completed a tick") does not fit them.
`createObservabilityServer({ metrics, checks, port })`
(`packages/bootstrap/src/observability-server.mjs`) is the equivalent for
them: `/healthz` is the same unconditional liveness check, `/readyz` runs
whatever named async `checks` the caller supplies (both processes check
real database connectivity with `SELECT 1`), and `/metrics` serves the same
Prometheus text. It runs on its OWN port (`OBSERVABILITY_PORT`), separate
from the API's own port and the gateway's WebSocket port — `createApi()`'s
router requires every route to declare a policy action and pass through
the full `authorize()` pipeline, and a Prometheus scraper does not carry a
bearer token, so bolting `/metrics` onto that router was never the right
shape. `installGracefulShutdown()` (`packages/bootstrap/src/
graceful-shutdown.mjs`) is the same SIGTERM/SIGINT-to-graceful-stop wiring
`createWorkerRuntime` itself now delegates to internally — used directly by
`apps/api` and `apps/gateway` since they close their own resources (the API
server, the gateway's WebSocket server, the database pool) rather than a
worker runtime's timers.

`packages/bootstrap/src/env.mjs` provides `requireEnv()` (fails fast,
listing every missing variable at once) and `loadOrGenerateKey()` (decodes a
base64 secret from the environment; falls back to an ephemeral random key
with a loud warning ONLY when `NODE_ENV` is not `production`/`staging` —
refuses to start rather than silently generate a fake key in either of
those). Both the API and gateway load their JWT signing/encryption keys this
way, so a forgotten secret in a real environment is a startup failure, never
a session that silently used the wrong key.

## Running it

### LOCAL

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/nizalo_dev \
LOG_FORMAT=pretty \
node apps/worker/src/index.mjs
# in separate terminals:
node apps/api/src/index.mjs
node apps/gateway/src/index.mjs
```

`LOG_FORMAT=pretty` uses `createConsoleSink()` — human-readable, colored,
one line per event. Omit it (or set anything else) for the same structured
JSON every other environment gets, if you want to test log shipping locally.
`AUTH_SIGNING_KEY_B64`/`AUTH_ENCRYPTION_KEY_B64` may be omitted locally (an
ephemeral key is generated with a warning); set `NODE_ENV=production` or
`staging` to prove the fail-fast path instead.

### STAGING / PRODUCTION

The same binary, unchanged. What differs is who runs it and how:

- **Process manager**: any supervisor that restarts on crash and sends
  `SIGTERM` on redeploy/scale-down — a container orchestrator's own
  restart policy, a systemd unit with `Restart=on-failure`, or a platform-
  as-a-service's process model. This file does not assume a specific one;
  it only assumes it will receive `SIGTERM` and be given a reasonable grace
  period before `SIGKILL` (`gracefulShutdownMs` + 2s is the process's own
  budget — the orchestrator's kill timeout should be at least that long).
- **Health checks**: point liveness at `/healthz`, readiness at `/readyz`.
  A `/readyz` failure should NOT trigger a restart — a stuck database is not
  fixed by restarting the worker, and `/readyz` failing is often exactly the
  signal that lets an operator notice the database is stuck rather than the
  worker looping through crash-restarts silently. Restart policy belongs on
  `/healthz` only.
- **Metrics**: point a Prometheus-compatible scraper at `/metrics`. No
  specific backend is assumed or required (see `packages/observability`'s
  sink design) — the text format is standard, so any scraper that speaks it
  works.
- **Logs**: `LOG_FORMAT` unset (the default `createStructuredLogSink()`)
  writes one JSON object per line to stdout — what every real log shipper
  (a sidecar, `journald`, a platform's own log capture) already expects to
  read from a container's stdout. No shipper is configured by this codebase;
  wiring one is an infrastructure decision for whichever environment this
  actually deploys to, not a code change here.
- **Multiple replicas**: safe today for the workers currently registered.
  The matchmaking dispatch worker's `tick()` is idempotent and safe under
  concurrent execution (proven in `packages/matchmaking/test/dispatch.test.mjs`
  and, for the underlying ledger writes, `packages/ledger/test/
  real-pg-concurrency.test.mjs`). Reconciliation's own concurrency guard
  (`reconciliation_run_one_running_per_kind`, a partial unique index — see
  `packages/reconciliation/src/reconcile.mjs`) is specifically what makes it
  safe to run more than one replica of this worker process at once without
  two replicas duplicating the same reconciliation pass.
- **Sandbox only**: `apps/worker/src/index.mjs` hardcodes the sandbox payment
  provider regardless of environment variables. Wiring a real provider is a
  deliberate, reviewed change to that file — never a side effect of setting
  an API key in staging or production config. See RISK_REGISTER.md for the
  legal/licensing/compliance gates that must clear first.

## Environment variables

### All three processes

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | Postgres connection string |
| `DB_POOL_SIZE` | 10 (worker/gateway), 20 (api) | max connections in the pool |
| `WORKER_ID` | `hostname-pid` | this instance's identity |
| `LOG_FORMAT` | (unset = structured JSON) | `pretty` for local human-readable console output |
| `OBSERVABILITY_PORT` | 3001 (worker/api), 3011 (gateway), 0 for the worker's own health server | health/ready/metrics HTTP port |
| `GRACEFUL_SHUTDOWN_MS` | 10000 | budget before the hard-exit fallback (api, gateway) |

### `apps/worker`

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3001 | (worker's health/ready/metrics port; see `OBSERVABILITY_PORT` above for api/gateway) |
| `TICK_INTERVAL_MS` | 1000 | shared default tick cadence |
| `RECONCILIATION_INTERVAL_MS` | 60000 | reconciliation's own cadence (overrides the shared default) |

### `apps/api`

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | API listen host |
| `PORT` | 3000 | API listen port |
| `AUTH_SIGNING_KEY_B64` / `AUTH_ENCRYPTION_KEY_B64` | ephemeral outside production/staging | base64-encoded JWT signing key (≥32 bytes) / AES-256 encryption key (exactly 32 bytes) |
| `RATE_LIMIT_CAPACITY` / `RATE_LIMIT_REFILL` | 100 / 20 | per-client token-bucket rate limiting |

### `apps/gateway`

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `0.0.0.0` | WebSocket listen host |
| `WS_PORT` | 3010 | WebSocket listen port |
| `AUTH_SIGNING_KEY_B64` / `AUTH_ENCRYPTION_KEY_B64` | ephemeral outside production/staging | same keys as the API — must match, since a token the API issues is verified by the gateway |
| `LEASE_MS` | 15000 | A4 lease duration |
| `CLAIM_SWEEP_INTERVAL_MS` | 3000 | how often this instance looks for unclaimed LIVE duels |
| `LEASE_RENEWAL_INTERVAL_MS` | 5000 | how often this instance renews leases it holds |
| `TIMEOUT_SWEEP_INTERVAL_MS` | 1000 | how often flagged/expired clocks are swept |
| `DEAD_CONNECTION_SWEEP_INTERVAL_MS` | 30000 | how often unresponsive WebSocket connections are dropped |
| `RATE_LIMIT_CAPACITY` / `RATE_LIMIT_REFILL` | 60 / 10 | per-connection token-bucket rate limiting |

## What is NOT here yet

- No worker currently needs a distributed lock beyond what reconciliation's
  own unique index and the A4 lease already provide, so no generic
  leader-election primitive exists. Add one only when a worker actually
  needs "exactly one replica does X," not before.
- No log shipper, metrics backend, or alerting integration is configured —
  by design (see `packages/observability`'s sink header comment). This
  file's job is to make the process itself correct and observable; wiring
  observability infrastructure to a specific vendor is a deployment-time
  decision for whichever environment this runs in.
