# Threat Model

**Method:** STRIDE per trust boundary, plus an adversary-first pass on the
attacks that actually kill skill-money platforms.
**Status:** Phase 0. To be re-run at the end of every phase.

---

## 1. What we are actually protecting

Ranked by how badly losing it ends the company:

| # | Asset | Loss scenario | Severity |
|---|---|---|---|
| 1 | **Ledger integrity** | Balances no longer reconcile to reality; we cannot say what we owe | **Terminal** |
| 2 | **Custody / withdrawal control** | Attacker drains the hot wallet | **Terminal** |
| 3 | **Competitive integrity** | Cheating becomes common knowledge; honest players leave | **Terminal** |
| 4 | **Regulatory standing** | Operating real-money contests in a prohibited jurisdiction | **Terminal** |
| 5 | User funds & PII | Breach, ransom, regulatory penalty | Severe |
| 6 | Admin plane | Privileged action by an attacker | Severe |
| 7 | Availability | Duels unplayable; money stuck | High |
| 8 | Brand trust | Perceived unfairness even without actual cheating | High |

Note that **three of the top four are not classic security problems**. A perfectly
hardened server with a working cheat is a dead company. Anti-cheat, anti-fraud,
and compliance are first-class security concerns here, not adjacent ones.

---

## 2. Trust boundaries

```
[T1] Untrusted client (web/Android)  ->  Edge
[T2] Edge (Cloudflare)               ->  API / Realtime
[T3] API / Realtime                  ->  Domain services
[T4] Domain services                 ->  Postgres / Redis / storage
[T5] Payment provider (NOWPayments)  ->  Webhook receiver
[T6] Blockchain (TRON)               ->  Chain watcher
[T7] Admin operator                  ->  Admin plane
[T8] Third-party dependencies        ->  Build & runtime
```

**Everything on the left of T1 is hostile.** The Android APK will be decompiled,
the WebSocket protocol will be reverse-engineered, and the client will be modified.
Design accordingly: there is no client-side secret and no client-side check that
matters.

---

## 3. STRIDE by boundary

### T1 — Client to Edge

| Threat | Vector | Mitigation |
|---|---|---|
| **S**poofing | Credential stuffing, session theft, SIM-swap on SMS 2FA | Argon2id password hashing; TOTP 2FA (**not SMS** for withdrawal-authorising accounts); short-lived access tokens + rotating refresh tokens with reuse detection; device binding; step-up auth for financial actions |
| **T**ampering | Modified APK, patched client, forged game intents | Server authority (nothing client-asserted is trusted); intent-only protocol; Play Integrity API as a *signal to the risk engine*, never as a gate |
| **R**epudiation | "I never made that withdrawal" | Append-only audit log; per-action device + IP + session binding; step-up auth receipts |
| **I**nfo disclosure | Reading the opponent's hidden state, future challenge content | `project()` enforced server-side; challenge content released only when due; **never** send a seed the client could use to precompute |
| **D**oS | Socket floods, matchmaking churn, expensive queries | Cloudflare; per-account and per-IP rate limits; queue admission control; query timeouts |
| **E**levation | Horizontal access to another user's wallet/duel | Object-level authorisation on every read and write; no IDOR-by-default; deny-by-default policy checks |

**Specific high-value attack — the reaction-game latency oracle.**
Reaction and Precision scoring subtracts an estimated network latency. An attacker
who can *inflate reported RTT on demand* gains free reaction time. Mitigations:
server-measured RTT only (never client-reported), a hard cap on the credited
latency allowance, cross-checking RTT stability against the player's own history,
and treating high-variance RTT as a fair-play signal rather than a benefit. If
this cannot be made robust, **Reaction ships as free-play only**.

### T2/T3 — Edge to services

| Threat | Mitigation |
|---|---|
| Origin bypass (hitting the API directly, skipping WAF) | Origin locked to edge via mTLS or an authenticated origin pull; the origin refuses non-edge traffic |
| Header spoofing (forged `X-Forwarded-For`, forged geo) | Strip and re-derive all client-controlled headers at the edge; never trust client-supplied geo |
| SSRF from any outbound fetch | Egress allowlist; no user-supplied URLs fetched server-side |

### T4 — Services to data

| Threat | Mitigation |
|---|---|
| SQL injection | Parameterised queries only; no string-built SQL anywhere, including in the hand-written ledger SQL |
| Race conditions on money | Explicit transactions; `SELECT ... FOR UPDATE` with deterministic lock ordering; unique constraints as the real enforcement |
| Lost updates / double-spend | Ledger invariants enforced by DB constraints; idempotency keys with unique indexes |
| Backup compromise | Encrypted backups, separate credentials, restore drills (see DISASTER_RECOVERY) |

### T5 — Payment provider webhooks

**This is the single highest-value attack surface in the product.** A forged
webhook that credits a balance is a direct mint.

| Threat | Mitigation |
|---|---|
| **Forged webhook** | Verify HMAC signature with a constant-time comparison **before parsing the body**; reject unsigned outright |
| **Replayed webhook** | Idempotency on provider event id, enforced by a unique index; replay is a no-op by construction |
| **Out-of-order webhooks** | State machine only moves forward; a stale status transition is discarded, not applied |
| **Provider compromise / provider lies** | **Independent on-chain verification.** Never credit on webhook alone — confirm the transaction, amount, asset, network, destination address, and confirmation depth against the chain before crediting |
| **Amount/asset/network confusion** | Credit strictly on `(asset, network, amount, destination)` as observed on-chain; a USDT-TRC20 deposit to an address expecting something else is quarantined, not credited |
| Webhook endpoint discovery + DoS | Unguessable path, IP allowlist where the provider supports it, rate limiting, cheap signature rejection before any expensive work |

> **Rule:** the webhook is a *notification to go look*, never a *source of truth*.
> This directly implements section 16 ("never credit from unverified sources").

### T6 — Blockchain

| Threat | Mitigation |
|---|---|
| Chain reorg / insufficient confirmations | Configurable confirmation depth per asset/network before crediting; credited only once final |
| Address reuse / misattribution | Unique deposit address or payment intent per user per deposit; never share addresses across users |
| Dust / spam deposits | Minimum deposit threshold; dust quarantined, not credited |
| Deposit from a sanctioned or high-risk source | Chain-analysis screening **before** crediting; hits route to compliance review, not to the balance |
| Wrong-network sends (e.g. USDT on the wrong chain) | Single supported network at launch (TRC20) + explicit `ASSET — NETWORK` labelling everywhere (section 15); recovery is a manual, documented, case-managed process |

### T7 — Admin plane

Admin is where a single compromised laptop becomes an existential event.

| Threat | Mitigation |
|---|---|
| Compromised admin credential | Hardware-backed MFA (WebAuthn) mandatory; no SMS; separate identity realm from user accounts |
| Insider fraud | **Least privilege by role** (section 29); four-eyes approval on withdrawals over a threshold, on balance adjustments, and on economy changes; **no role may both create and approve** the same payout |
| Silent history edit | Financial tables are append-only; adjustments are compensating entries with a mandatory reason and actor; enforced at the DB layer, not the app layer |
| Emergency-control abuse | Section 30 controls require privileged re-auth per action and emit an immutable audit event |
| Admin plane exposed to internet | Separate deployable, VPN/IP-restricted, no shared session with the public app |

### T8 — Supply chain

| Threat | Mitigation |
|---|---|
| Malicious dependency | Lockfiles committed; automated advisory scanning; review before adding any dependency into the ledger, payment, or auth paths |
| Compromised CI | Least-privilege CI credentials; no production secrets in CI for non-deploy jobs; signed builds |
| Leaked secret in repo/APK | Pre-commit secret scanning; **secrets never in `.env` in production**; managed secrets store only (section 18) |

---

## 4. The attacks that actually kill this business

Ranked by expected damage, not by novelty.

### 4.1 Chess engine assistance
Free engines exceed every human. Detection is statistical and probabilistic, never
certain. **Mitigation is a system, not a check:** engine-correlation analysis,
centipawn-loss distributions, performance-vs-rating anomalies, move-time
distributions (humans have characteristic timing variance; engines do not),
behaviour on critical/only-move positions, and longitudinal history. Output is a
**risk score with evidence**, feeding the case system (section 20). Never
auto-ban on one signal.

### 4.2 Collusion and chip-dumping
Two accounts, one owner, or two colluding owners: deliberately lose to move money.
This is **money laundering by another name** and attracts both fraud loss and
regulatory exposure. Detection is graph-based (section 21): shared devices, shared
funding sources, shared networks, abnormal pairing frequency, one-directional
result flows, unnatural resignation patterns. Direct/private challenges get
elevated scrutiny by default.

### 4.3 Multi-accounting and smurfing
Rating manipulation to farm weaker opponents, plus bonus abuse. Mitigations:
device fingerprinting, funding-instrument reuse detection, behavioural
similarity, KYC at the withdrawal boundary, and Glicko RD gates on cash tiers.

### 4.4 Bot play on non-chess games
Speed Math, Memory, Pattern, Reaction, and Precision are trivially automatable
given screen access. This is why section 7's design rules exist: server-generated
content the client cannot predict, and short matches. Detection leans on **input
biometrics** — inter-keystroke timing, touch pressure/area distributions, pointer
kinematics, and the fact that human timing variance has a distinctive shape that
scripts do not reproduce. Treat any perfectly-consistent timing distribution as a
strong signal.

### 4.5 Withdrawal fraud via account takeover
Compromise account -> withdraw. Mitigations: withdrawal address allowlisting with
a time-lock on new addresses, mandatory step-up auth, notification on every
security-relevant change, a cooling-off period after credential or 2FA changes,
and risk-scored manual review above thresholds.

### 4.6 The bonus/promo drain
Any promotion is an attack surface. Every promotional mechanic must be modelled
adversarially **before** launch, with a defined maximum liability, per-account and
per-device caps, and wagering/eligibility rules enforced in the ledger rather than
in marketing copy.

### 4.7 Jurisdictional exposure
Operating a real-money skill contest where it is not permitted is a company-ending
risk that no amount of engineering fixes. Geo controls, age verification, and the
market matrix (section 23) are **security controls**, and VPN/proxy detection
feeds the risk engine.

---

## 5. Standing security requirements

1. **No secret in any client.** Not in the APK, not in web bundles, not in
   environment variables shipped to the browser.
2. **No private keys in application code or on application servers.** Custody is a
   dedicated, minimal-surface component (see [PAYMENT_ARCHITECTURE.md](../payments/PAYMENT_ARCHITECTURE.md)).
3. **Deny by default.** Every endpoint declares its authorisation; unannotated
   endpoints fail closed in CI.
4. **All financial mutations are idempotent and audited.** No exceptions.
5. **Fail closed on money, fail open on fun.** If the risk engine is down,
   withdrawals stop and free play continues.
6. **Every security fix ships as its own commit**, referencing the threat id.
7. **Threat model is re-run at each phase gate**, and before any new game, payment
   asset, network, or market is added.

---

## 6. Known unresolved risks (carried into Phase 1)

| # | Risk | Status |
|---|---|---|
| R1 | Reaction/Precision latency-oracle exploitability | **Unresolved.** Gate: must be proven bounded, or those games ship free-play only. |
| R2 | Chess engine detection false-positive rate | **Unresolved.** Requires a labelled dataset before any auto-action threshold is set. |
| R3 | Custody model not yet chosen | **Open.** Blocks Phase 5. |
| R4 | Legal entity + licensed jurisdictions undecided | **Open.** Blocks all real-money features. Requires counsel, not engineering. |
| R5 | No Docker locally = no prod-parity integration testing | **Open.** Blocks Phase 1. |
