# NIZALO PLATFORM FORENSIC TECHNICAL AUDIT & ARCHITECTURE BASELINE

**Audit Date:** September 29, 2026  
**Auditor:** Lead System Architect / DeepMind Engineering AI Pair  
**Platform Status:** Operational In-Process Monolith (Next.js 16 + Node.js HTTP REST + WebSocket Gateway + Worker)  
**Database Backend:** PostgreSQL (Active Supabase AWS Pooler / Neon / PGlite in-memory test runner)  
**Catalog Size:** 11 Games (Live & Registered in DB)

---

## 1. EXECUTIVE SUMMARY & PLATFORM ARCHITECTURE BASELINE

Nizalo (`nizalo.com`) is a full-stack real-money and free-to-play competitive skill gaming platform architected as a high-performance in-process monolith (`server.js`). The platform unifies a Next.js App Router frontend, a custom native Node.js REST API (`packages/api`), a stateful WebSocket Realtime Gateway (`packages/realtime`), and an autonomous background worker runtime (`apps/worker`) running together in a single Node.js process.

### Architecture Subsystems Breakdown

| Subsystem | Implementation Package / Path | Architecture & Operational Details |
| :--- | :--- | :--- |
| **Frontend Framework** | `apps/web` (Next.js 16.3.6, React 19.0.0, Turbopack / Webpack) | Next.js App Router with dynamic localized routing `/[locale]/*` supporting 6 languages (`ar`, `en`, `es`, `fr`, `hi`, `zh`). Styled via Tailwind CSS, CSS Modules, Framer Motion, and Lucide icons. |
| **Backend Framework** | `server.js` + `packages/api` (`apps/api`) | Native Node.js `node:http` server without Express or Fastify. Zero-overhead custom regex/radix route dispatcher with unified actor authorization and JSON payload streaming. |
| **Database & ORM** | PostgreSQL 16 (`pg` v8.23.0) + `packages/ledger/src/pg-adapter.mjs` | Raw SQL transactions with advisory locking and row-level locks (`SELECT ... FOR UPDATE`). Migrations tracked sequentially in `db/migrations/*.sql` (0001 through 0082, 103 total tables). |
| **Authentication** | `packages/auth` | Dual token architecture: HMAC-SHA256 signed access tokens (short-lived, 15m) and AES-256-GCM encrypted refresh tokens (30d). Supports password login (Argon2id), passwordless OTP, and Google OAuth (`oauth_identity`). |
| **Authorization (RBAC)** | `packages/authz` | Granular capability-based permissions (`duel.play.free`, `duel.play.cash`, `admin.rbac.manage`, etc.) evaluated through `authorize({ actor, action, controls })` with explicit `Decision.ALLOW` / `DENY`. |
| **Realtime Gateway** | `packages/realtime` (`apps/gateway`) | Stateful WebSocket server (`ws` v8.21.3) mounted on `/gateway` and `/ws`. Handles connection leases, presence heartbeats, intent sequences (`ROLL`, `MOVE`, `CLAIM_TIMEOUT`, `RESIGN`), and real-time state broadcasts. |
| **Game State Engine** | `packages/duel-engine` + `packages/game-*` | Server-authoritative deterministic state machine. Clock models: `ALTERNATING` (per-player clock with increment) vs `SIMULTANEOUS` (shared countdown clock). Pluggable game plugins implement `rehydrate()`, `applyMove()`, `legalMoves()`, and `status()`. |
| **Matchmaking** | `packages/matchmaking` | Atomic SQL-based FIFO queue pairing via PostgreSQL function `mm_pair()`. Supports three player routes: Queued Matchmaking (Free/Cash), Direct Friend Challenges (`packages/matchmaking/src/challenge.mjs`), and Bot Simulation (`vs-computer.mjs`). |
| **Tournament Engine** | `packages/tournament` | Automated 16-player Single Elimination knockout brackets across 8 stake tiers ($10 to $2000 USDT) with automated registration, scheduled starts, bot fillers, and 12% rake settlement. |
| **Ledger & Settlement** | `packages/ledger` + `packages/settlement` | Immutable double-entry bookkeeping (`ledger_account`, `ledger_entry`, `ledger_transaction`). Multi-asset support (`USDT`, `USDC`, `COIN`, `EGP`). Rake is calculated using integer arithmetic with floor rounding. |
| **Anti-Cheat & Fair Play** | `packages/fairplay` | Statistical move latency profiling, timing anomaly detection, client fingerprinting, replay verification, automated sanctioning, and administrative case workflows. |
| **Replay System** | `packages/realtime/src/store.mjs` | Every sequential intent is appended to `duel_event (duel_id, seq, type, payload, server_time_ms)`. Replays can be played back deterministically step-by-step. |
| **Admin Operations** | `apps/web/src/app/[locale]/admin/*` | Complete operations dashboard for arena monitoring, bot fleets, chat moderation, deposits, fair play disputes, game kill-switches, risk scoring, and local payment devices. |
| **Feature Flags & Controls**| `platform_control` table | Runtime dynamic toggles: `cashDuels`, `withdrawals`, `registrations`, `chatEnabled`, `botPlayEnabled`. |
| **Localization** | `packages/i18n` | Full bidirectional translation across 6 languages. `ar` is default with strict RTL (`dir="rtl"`). Supported locales: `ar`, `en`, `es`, `fr`, `hi`, `zh`. |
| **Mobile Architecture** | Viewport `100dvh`, Touch Action Manipulation | Dedicated mobile bottom navigation bar, touch-optimized board scaling (`max-width: min(94vw, 500px, calc(100dvh - 175px))`), and standalone Android receiver integration. |

---

## 2. COMPLETE ROUTE MATRIX (58 VERIFIED ROUTES)

| Route Pattern | Access Level | Description | Status & Rendering Model |
| :--- | :--- | :--- | :--- |
| `/[locale]` | Public | Main landing page (Hero, live lobby ticker, features, trust section) | Static (SSG) / Revalidated |
| `/[locale]/home` | Authenticated | Player dashboard (daily quests, quick play, recent duels, rating summary) | Static (SSG) / Client Hydrated |
| `/[locale]/games` | Public | Full crawlable catalog of all games with turn-model filters | Dynamic (SSR / Client) |
| `/[locale]/games/[gameId]` | Public | Game details, rules, historical facts, ELO ranking teaser | Dynamic (SSR / Client) |
| `/[locale]/play` | Authenticated | Live Arena lobby: radar feed, mode cards, active open challenges | Static (SSG) / Client Interactive |
| `/[locale]/play/[gameId]` | Authenticated | Mode selection (Casual Free vs Competitive Cash), Stake ladder, Format | Dynamic (SSR / Client) |
| `/[locale]/game/[duelId]` | Authenticated | Realtime Duel Arena (`DuelShell`), board rendering, WebSocket session | Dynamic (SSR / WS Client) |
| `/[locale]/tournaments` | Public / Auth | Tournaments list, tier tabs ($10 to $2000), registration modals | Dynamic (SSR / Client) |
| `/[locale]/tournaments/[id]`| Public / Auth | Tournament bracket viewer, round matches, live match links | Dynamic (SSR / Client) |
| `/[locale]/organizer` | Authenticated | User-hosted custom tournament creation and bracket manager | Static (SSG) / Client Interactive |
| `/[locale]/rank` | Public | Platform leaderboards: Global Skill Rating & per-game ELO ladders | Static (SSG) / Client Interactive |
| `/[locale]/wallet` | Authenticated | Balance overview (USDT/EGP), OxaPay crypto deposit, Vodafone Cash, withdrawal | Static (SSG) / Client Interactive |
| `/[locale]/store` | Authenticated | Cosmetic shop: avatar frames, VIP badges, custom board themes via COINs | Static (SSG) / Client Interactive |
| `/[locale]/battle-pass` | Authenticated | Seasonal Battle Pass track: 50 tiers, Free vs Premium track, XP claims | Static (SSG) / Client Interactive |
| `/[locale]/clans` | Authenticated | Clans / Guilds: create guild, leaderboard, member list, clan chat | Static (SSG) / Client Interactive |
| `/[locale]/chat` | Authenticated | Direct 1-on-1 private messaging and friends social hub | Static (SSG) / Client Interactive |
| `/[locale]/watch` | Public | Live TV / Spectator mode: browse active high-stake duels | Static (SSG) / Client Interactive |
| `/[locale]/learn` | Public | Academy & Strategy Hub: articles map, beginner guides, tactical masters | Dynamic (SSR / Client) |
| `/[locale]/learn/[slug]` | Public | Deep-dive strategy handbook and opening theory articles | Dynamic (SSR / Client) |
| `/[locale]/fair-play` | Public | Platform fairness manifesto, anti-cheat disclosures, replay proof | Static (SSG) / Client Interactive |
| `/[locale]/help` | Public | Comprehensive FAQ, rules handbook, payment guides | Static (SSG) / Client Interactive |
| `/[locale]/support` | Authenticated | Customer support center: view open tickets and live support status | Static (SSG) / Client Interactive |
| `/[locale]/support/new` | Authenticated | File new support ticket with category, priority, and attachments | Static (SSG) / Client Interactive |
| `/[locale]/support/[ticketId]`| Authenticated | Realtime ticket chat with support agent, evidence upload | Dynamic (SSR / Client) |
| `/[locale]/referrals` | Authenticated | Affiliate referral link generator, earnings breakdown, claim rewards | Static (SSG) / Client Interactive |
| `/[locale]/profile` | Authenticated | Player account profile: match history, achievements, badges, frames | Static (SSG) / Client Interactive |
| `/[locale]/players/[nickname]`| Public | Public player profile: trophies, statistics, head-to-head match history | Dynamic (SSR / Client) |
| `/[locale]/settings/security` | Authenticated | Security settings: password change, 2FA/TOTP setup, session manager | Static (SSG) / Client Interactive |
| `/[locale]/login` | Public | Login form (Email/Password, Google OAuth, OTP code) | Static (SSG) / Client Interactive |
| `/[locale]/login/code` | Public | Passwordless magic login code verification | Static (SSG) / Client Interactive |
| `/[locale]/login/forgot-password`| Public | Account recovery / password reset initiation | Static (SSG) / Client Interactive |
| `/[locale]/register` | Public | Account registration form with referral code support | Static (SSG) / Client Interactive |
| `/[locale]/auth/google/complete`| Public | Google OAuth popup redirect and session finalization | Static (SSG) / Client Interactive |
| `/[locale]/r/[code]` | Public | Dynamic short invite / referral link resolver | Dynamic (SSR / Client) |
| `/[locale]/admin` | Admin | Operations dashboard: platform KPIs, 24h revenue, active players | Dynamic (SSR / Client) |
| `/[locale]/admin/arena` | Admin | Realtime active duels inspector and emergency duel terminator | Dynamic (SSR / Client) |
| `/[locale]/admin/bots` | Admin | Bot fleet controller: difficulty distribution, liquidity quotas | Dynamic (SSR / Client) |
| `/[locale]/admin/chat` | Admin | Live global chat moderation, mute sanctions, profanity filters | Dynamic (SSR / Client) |
| `/[locale]/admin/content` | Admin | User-generated content reviews and report resolution | Dynamic (SSR / Client) |
| `/[locale]/admin/deposits` | Admin | Crypto and local deposit transaction auditor | Dynamic (SSR / Client) |
| `/[locale]/admin/fair-play` | Admin | Fair play violation cases, move anomaly detector, ELO adjustments | Dynamic (SSR / Client) |
| `/[locale]/admin/games` | Admin | Per-game kill-switches: toggle live, cash eligibility, tournaments | Dynamic (SSR / Client) |
| `/[locale]/admin/health` | Admin | System health monitor: database pool, memory, event loop latency | Dynamic (SSR / Client) |
| `/[locale]/admin/local-payments`| Admin | Vodafone Cash / InstaPay device manager and unmatched transfer matcher | Dynamic (SSR / Client) |
| `/[locale]/admin/matches` | Admin | Historical match database search, replay debugger | Dynamic (SSR / Client) |
| `/[locale]/admin/payments` | Admin | Platform ledger reconciliation, crypto gateway status | Dynamic (SSR / Client) |
| `/[locale]/admin/players` | Admin | User account administration: lock account, adjust limits, inspect wallet | Dynamic (SSR / Client) |
| `/[locale]/admin/rbac` | Admin | Admin roles, capability permission matrix, staff account grants | Dynamic (SSR / Client) |
| `/[locale]/admin/referrals` | Admin | Affiliate payout approvals and referral commission audit | Dynamic (SSR / Client) |
| `/[locale]/admin/risk` | Admin | Anti-fraud risk scoring, velocity alerts, multi-account detection | Dynamic (SSR / Client) |
| `/[locale]/admin/settings` | Admin | Global platform controls: kill switches, maintenance mode | Dynamic (SSR / Client) |
| `/[locale]/admin/store` | Admin | Store inventory manager, coin issuance ledger auditor | Dynamic (SSR / Client) |
| `/[locale]/admin/support` | Admin | Staff ticket queue: respond, assign, escalate, and resolve tickets | Dynamic (SSR / Client) |
| `/[locale]/admin/tournaments` | Admin | Tournament schedule manager, prize pool adjuster, manual cancel | Dynamic (SSR / Client) |
| `/[locale]/admin/withdrawals` | Admin | Withdrawal approval queue: AML checks, one-click payout release | Dynamic (SSR / Client) |
| `/api/auth/google/callback` | Public (API) | Google OAuth Authorization Code exchange endpoint | Dynamic Edge Route |
| `/api/auth/google/one-tap` | Public (API) | Google One-Tap credential verification and session issuance | Dynamic Edge Route |
| `/manifest.webmanifest` | Public | PWA web app manifest | Static |

---

## 3. GAME IMPLEMENTATION INVENTORY (11 RECONCILED GAMES)

Every game has been verified directly in the database (`SELECT id, is_live, cash_enabled, auto_tournaments_enabled FROM game`), plugin registry (`packages/game-*` and `apps/web/src/lib/games`), and time control catalog (`packages/duel-engine/src/time-profiles.mjs`):

| Game ID | Slug | Display Names (AR / EN) | DB Status (Live/Cash/Tourn) | Engine Package | State & Board Model | Move Validation & RNG | Timer Model | Max Players |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `chess` | `chess` | الشطرنج / Chess | TRUE / TRUE / TRUE | `packages/game-chess` | Standard 8x8 FIDE board, FEN string, piece-square tables | Full FIDE rules (castling, en passant, promotion, 3-fold repetition). 0% RNG (Deterministic). | `ALTERNATING` (5+3 Standard, 3+2 Blitz, strict 60s per-move anti-cheat cap) | 2 |
| `dominoes`| `dominoes` | الضمنة / Dominoes | TRUE / TRUE / TRUE | `packages/game-dominoes` | Classic Double-Six (28 tiles), boneyard, open board line | Legal end matching, automatic blocking calculation, Pip scoring. RNG: CSPRNG seeded tile deal (`randomUUID()`). | `ALTERNATING` (3+5 Standard, 2+3 Blitz) | 2 |
| `ludo` | `ludo` | لودو الأساطير / Ludo Royale | TRUE / TRUE / TRUE | `packages/game-ludo` | 15x15 Cross board, 4 bases, home paths, center goal | Standard Ludo rules, 6 rolls bonus, safe star squares, token capture to base. RNG: CSPRNG seeded die roll (`randomUUID()`). | `ALTERNATING` (5+10 Standard, 3+5 Blitz) | 2 or 4 |
| `backgammon`| `backgammon`| طاولة الزهر / Backgammon | TRUE / TRUE / TRUE | `packages/game-backgammon` | 24 points, bar, off-board tray, 15 checkers per player | Bearing off, hit to bar, doubles bonus (4 moves), Crawford rule. RNG: CSPRNG seeded dice rolls (`randomUUID()`). | `ALTERNATING` (5+8 Standard, 3+5 Blitz) | 2 |
| `speed-math`| `speed-math`| الحساب السريع / Speed Math | TRUE / TRUE / TRUE | `packages/game-speed-math` | Sequential mental arithmetic equation queue | Real-time answer validation, streak bonus, speed scoring. RNG: CSPRNG seed generates identical equation sequence for both players. | `SIMULTANEOUS` (60s Standard, 30s Blitz, 120s Extended) | 2 |
| `xo` | `xo` | إكس أو / XO Blitz | TRUE / TRUE / TRUE | `packages/game-xo` | 3x3 Grid, binary state mask | Exact row/column/diagonal 3-in-a-row detection. 0% RNG (Deterministic). | `ALTERNATING` (60s+3 Standard, 30s+2 Blitz) | 2 |
| `connect-four`| `connect-four`| 4 في صف / Connect Four | TRUE / TRUE / TRUE | `packages/game-connect-four` | 7 columns x 6 rows vertical gravity grid | Gravity drop validation, 4-in-a-row raycast. 0% RNG (Deterministic). | `ALTERNATING` (3+3 Standard, 2+2 Blitz) | 2 |
| `checkers`| `checkers` | الداما / Checkers | TRUE / TRUE / TRUE | `packages/game-checkers` | 8x8 Board (32 dark squares), men and kings | Mandatory capture rule, multi-jump sequences, king promotion. 0% RNG (Deterministic). | `ALTERNATING` (4+3 Standard, 3+2 Blitz) | 2 |
| `reversi` | `reversi` | ريفيرسي / Reversi (Othello)| TRUE / TRUE / TRUE | `packages/game-reversi` | 8x8 Board, disc flipping vectors | 8-directional flanking sandwich capture, pass turn on no legal moves. 0% RNG (Deterministic). | `ALTERNATING` (5+3 Standard, 3+2 Blitz) | 2 |
| `gomoku` | `gomoku` | غوموكو / Gomoku | TRUE / TRUE / TRUE | `packages/game-gomoku` | 15x15 Go intersection board | Exactly 5-in-a-row stone alignment, open grid placement. 0% RNG (Deterministic). | `ALTERNATING` (5+5 Standard, 3+3 Blitz) | 2 |
| `seega` | `seega` | السيجة / Seega | TRUE / TRUE / TRUE | `packages/game-seega` | 5x5 Ancient Egyptian board, central safe sanctuary | Two-phase play: placement phase followed by movement phase with custodial capture. 0% RNG (Deterministic). | `ALTERNATING` (5+5 Standard, 3+3 Blitz) | 2 |

---

## 4. DUPLICATED & MISLEADING GENERIC LOGIC

1. **Hardcoded 2-Seat Assumption in Financial Settlement:**  
   - In `packages/settlement/src/rake.mjs` and `packages/settlement/src/settle.mjs`, all functions (`settlementLegs`, `reservationLegs`, `refundLegs`, `lockDuel`) assume exactly 2 players:
     ```js
     const legs = reservationLegs({ seat0: duel.seat_0, seat1: duel.seat_1, stakeMinor: duel.stake_minor });
     const winner = result === "1-0" ? seat0 : seat1;
     const pot = s * 2n;
     ```
   - **Risk:** If a 4-player Ludo match were created with cash stakes, settlement would crash or corrupt ledger postings because `seat_2` and `seat_3` stakes are not reserved or transferred.
2. **Hardcoded Opponent Assumption in DuelShell:**  
   - In `apps/web/src/components/game/DuelShell.tsx`:
     ```ts
     const opponentSeat = mySeat === null ? null : mySeat === 0 ? 1 : 0;
     ```
   - In a 4-player game, assuming opponent is `mySeat === 0 ? 1 : 0` ignores seats 2 and 3.
3. **Hardcoded Clock Shape in Realtime Sync:**  
   - In `packages/realtime/src/gateway.mjs`, `broadcastPresence()` and clock states historically serialized `[remaining[0], remaining[1]]`. 4-player Ludo requires a 4-element remaining time array.
4. **Draw Offer Assumes 2 Players:**  
   - `packages/realtime/src/gateway.mjs` and `DuelShell.tsx` allow mutual draw acceptance between 2 seats. A 4-player game cannot support binary 1-to-1 draw offers without all participants consenting.

---

## 5. BROKEN INCONSISTENCIES INVENTORY

1. **"10 Games" vs 11 Games Inconsistency:**
   - Migration `0070_remove_billiards.sql` removed Billiards to establish exactly 10 games. Later, migrations `0076_ludo_4_player.sql` through `0078_enable_ludo_cash_and_tournaments.sql` added Ludo as the 11th game.
   - Numerous player-facing files were not updated and still claim "10 games":
     - `packages/i18n/locales/en.json` (line 1115): `"subhead": "Ten server-authoritative games..."`
     - `packages/i18n/locales/ar.json` (line 1115): `"subhead": "عشر ألعاب يحكمها الخادم بالكامل..."`
     - `packages/i18n/locales/en.json` (line 214): `"body": "...for every one of the ten games."`
     - `apps/web/src/lib/faq/faq-data.ts` (lines 64, 356, 380): *"Which 10 games are available on Nizalo?"* and answers listing 10 games without Ludo.
     - `apps/web/src/app/[locale]/admin/bots/page.tsx` (line 341): *"Global difficulty engine across all 10 games..."*
     - `apps/web/src/components/home/Hero.tsx` (line 974): *"10-Dot Progress Indicator Strip"*.
2. **"Zero RNG / Zero Luck" False Claims:**
   - In `apps/web/src/components/home/Hero.tsx` and `packages/i18n/locales/*.json`:
     - Card 4 headline: `"Zero Luck, Zero RNG, Anti-Cheat"` (EN), `"مهارة بدون أي صدفة أو حظ"` (AR), `"Cero Azar, Cero Suerte"` (ES).
     - **Fact:** Ludo uses dice, Backgammon uses dice, and Dominoes deals shuffled tiles. Claiming "Zero RNG" on the platform's primary marketing hero is technically false and misleading to players. The accurate claim is **"Server-authoritative CSPRNG & Anti-Cheat"** for dice/tile games, and **"100% Deterministic Skill"** for Chess/Checkers/Connect Four/XO/Reversi/Gomoku/Seega.
3. **Platform Fee / Rake Discrepancies:**
   - Migration `0058_platform_fee_12_percent.sql` raised standard platform fee to 12% (1200 bps).
   - `apps/web/src/app/[locale]/admin/arena/page.tsx` (line 64) displays: `trend: "10% Platform Fee (default)"`.
4. **Cold Storage / Custodial Claims:**
   - `TrustFairPlaySection.tsx` (line 37) and `faq-data.ts` claim: `"100% Cold Storage Escrow"`.
   - **Fact:** Real money deposits flow into hot merchant accounts (OxaPay) or local telecom numbers (Vodafone Cash / InstaPay) monitored by `apps/payment-receiver-android`. While the internal ledger is an immutable double-entry database, claiming "100% multi-sig cold storage escrow" does not reflect the live merchant rail.

---

## 6. RESPONSIVE, MOBILE & RTL AUDIT

1. **Viewport Height Oscillations (Fixed in LudoBoard):**  
   - Elements with unconstrained height or unmounted action buttons caused document layout shifts whenever turns switched. Standardizing action docks to 44px fixed height and using CSS `100dvh` resolved this.
2. **Pawn Animation Layout Thrashing:**  
   - Loop animations utilizing `transform: translateY(-3px)` combined with SVG drop-shadow filters caused subpixel jitter on mobile WebKit. Replacing with `scale(1)` to `scale(1.08)` pulse with zero Y-displacement eliminates the shaking.
3. **RTL Directional Isolation:**  
   - Game boards (Chess, Ludo, Dominoes, Checkers) must strictly enforce `direction: ltr !important` to ensure visual quadrants, grid column indexes, and SVG path coordinates are immune to Arabic document RTL mirroring.
4. **Mobile Navigation Spacing:**  
   - On narrow mobile viewports (<360px), header icons and wallet balance pill wrapped onto two lines. Sticky headers now utilize overflow containers and responsive padding.

---

## 7. SECURITY & INTEGRITY AUDIT

1. **Local Payment Receiver Android Rail:**  
   - `apps/payment-receiver-android` submits observed SMS transfers to `/v1/payment-receiver/*`. These endpoints must enforce device token authentication and HMAC request signatures to prevent unauthorized credit manipulation.
2. **Session Revocation & Refresh Token Encryption:**  
   - Session tokens are securely managed via AES-256-GCM encryption in `packages/auth/src/tokens.mjs`. Invalidated sessions are stored in `auth_session` and revoked synchronously.
3. **Rate Limiting & Anti-Brute-Force:**  
   - Authentication endpoints (`/v1/auth/password/login`, `/v1/auth/passwordless/verify`) track failed attempts in `login_attempt` and lock out attackers after 5 consecutive failures.
4. **Anti-Cheat Validation Cap:**  
   - Chess enforces an explicit 60-second move cap and move latency analysis in `packages/fairplay` to prevent engine injection.

---

## 8. PRIORITIZED ISSUES & REMEDIATION MATRIX

### P0 — Critical (Immediate Fix)
1. **Multi-Player Cash Duel Guard:** Ensure 4-player Ludo matches cannot be queued for cash until `packages/settlement` has multi-seat reservation and settlement legs implemented (preventing ledger imbalance).
2. **Local Payment Receiver Security:** Verify device secret token enforcement on `/v1/payment-receiver/*` endpoints to eliminate unauthorized deposit creation.

### P1 — High (Core Product Integrity)
1. **Harmonize 10 vs 11 Games Catalog:** Update all locale files (`en.json`, `ar.json`, etc.), FAQ data, and admin panels from "10 games" to "11 games" to formally include Ludo Royale across all descriptions.
2. **Correct False "Zero RNG" Claims:** Replace "Zero RNG / Zero Luck" copy in `Hero.tsx` and i18n locales with accurate phrasing: *"Cryptographically Verified Fair RNG & Deterministic Anti-Cheat"*.
3. **Multi-Friend Party Challenges for Ludo:** Deploy the 3-friend invite slot UI in `FriendChallenge.tsx` and batch challenge endpoint so groups can seamlessly create 4-player Ludo games together.

### P2 — Medium (UX & Polish)
1. **Standardize Admin Platform Fee Copy:** Update `admin/arena/page.tsx` trend copy from "10% Platform Fee" to "12% Platform Fee".
2. **Clarify Custodial Messaging:** Revise "100% Cold Storage Escrow" to "Automated Ledger Escrow & Fast USDT Payouts".
3. **Mobile Board Height Locks:** Ensure all 11 games have strict `100dvh` bounding containers like LudoBoard to prevent mobile address bar jumping.

### P3 — Low (Code Cleanliness & Maintenance)
1. **Remove Billiards Residue:** Clean any lingering references to billiards in documentation and legacy migration scripts.
2. **Root TypeScript Configuration:** Add a root `tsconfig.json` referencing `tsconfig.base.json` so that `npm run typecheck` succeeds from the root workspace.

---

*This document serves as the permanent baseline for all subsequent development, refactoring, and feature deployment on the Nizalo platform.*
