# Nizalo

**نزالو** · from the Arabic **نزال** (*nizal*) — *a duel, a bout, a contest between two*.

> **Your duel. Your proof.** · **نزال واحد يكفي**

A global competitive skill duel platform: one account, one rating ecosystem, one wallet, one matchmaking core, one tournament engine, one trust & safety layer — with many short-form 1v1 games behind it.

**The primary identity is competitive skill. It must never feel like a casino.**

---

## Status

**Ready for B2B Direct Outreach and Market Acquisition.**

Phases 1-5 have been completely implemented and audited:
- **Phase 1-3:** Frontend and backend implementation, security hardening, compliance (geo-blocking, strict role-based access).
- **Phase 4:** Game Engine & Fairplay. Strict separation of concerns (Game Plugins vs Ledger), fully deterministic execution, and automated Fairplay anomaly detection.
- **Phase 5:** Tournaments, Realtime Bus, & Scale. Full brackets, tiebreakers, sweeps, and high-concurrency Pub/Sub.

---

## Tech Stack

- **Monorepo:** pnpm workspaces
- **Frontend:** Next.js 16 (React 19), App Router, TailwindCSS, Headless UI.
- **Backend (API / Worker):** Node.js 22+, native `pg` (no ORM).
- **Realtime:** Custom WebSocket engine bridged via Postgres `LISTEN/NOTIFY`.
- **Database:** PostgreSQL 17 (Neon / Supabase).
- **Ledger:** Pure double-entry, append-only, enforced entirely via database triggers (invariant assertions).

---

## Architecture Guiding Principles

1. **The Game Engine decides the result. The Ledger decides the money.** 
2. **The client renders; the server decides.** Nothing client-asserted is trusted for money, results, scores, state, clocks, or ratings.
3. **A mutable balance is never the source of truth.** Double-entry, append-only, balances derived from entries.
4. **No unexplained discrepancy is ever auto-repaired.** 
5. **Adding a game must never require touching financial infrastructure.** Game plugins follow a strict stateless intent-to-state-mutation contract.
6. **Compliance is configuration, not conditionals.** 

---

## Running it

```bash
pnpm install
pnpm test
```

*Note: Due to the architecture, all ledger and transaction invariant tests run directly against real PostgreSQL via PGlite (Postgres compiled to WASM) natively in Node without requiring Docker.*
