# Payment Architecture

**MVP asset:** USDT
**MVP network:** TRON (TRC20) — **one network only** (section 15)
**Initial provider:** NOWPayments, behind an abstraction (section 14)

---

## 1. Provider abstraction

The core platform must not know that NOWPayments exists. Provider-specific
concepts (their status strings, their signature scheme, their id formats) stop at
the adapter boundary.

```ts
interface PaymentProvider {
  readonly id: ProviderId;

  createDepositIntent(req: {
    userId: UserId;
    asset: Asset;              // 'USDT'
    network: Network;          // 'TRON'
    idempotencyKey: string;
  }): Promise<DepositIntent>;  // -> address or hosted payment, + expiry

  verifyWebhook(raw: Buffer, headers: Headers): Result<ProviderEvent, SigError>;

  getPayment(providerRef: string): Promise<ProviderPaymentState>;

  createPayout(req: {
    withdrawalId: string;
    asset: Asset;
    network: Network;
    destination: string;
    amountMinor: bigint;
    idempotencyKey: string;
  }): Promise<PayoutHandle>;

  getPayout(handle: PayoutHandle): Promise<ProviderPayoutState>;
}
```

Adapters: `NowPaymentsProvider` at launch; a second provider added later must
require **zero changes** to the ledger, wallet, risk, or compliance modules. That
is the acceptance test for whether the abstraction is real.

### 1.1 Provider-neutral internal state

Provider status strings are mapped into our own enum immediately. We never persist
a provider's vocabulary as our state, because a provider changing a string must
never change our state machine.

---

## 2. Asset / network handling

**Always display `ASSET — NETWORK` together**, everywhere, without exception
(section 15): `USDT — TRON (TRC20)`.

- Exactly **one** network at launch. Every additional network multiplies the
  wrong-network support burden and the reconciliation surface.
- Wrong-network deposits are a **manual, case-managed recovery process** with a
  documented policy and no guarantee of recovery, disclosed to the user *before*
  they deposit.
- Adding USDC, BTC, or another network requires a full re-run of the threat model
  and the market matrix (section 15).

---

## 3. Deposit flow

```
USER
 └─> selects ASSET + NETWORK  (USDT — TRON/TRC20)
     └─> POST /deposits  (idempotency key)
         └─> compliance gate: geo · age · KYC tier · account status
             └─> PaymentProvider.createDepositIntent()
                 └─> unique deposit address / payment intent  (per user, per deposit)
                     └─> user sends on-chain
                         ├─ webhook arrives ─┐
                         └─ chain watcher ───┤
                                             ▼
                              INDEPENDENT VERIFICATION
                              (asset, network, amount, destination,
                               confirmations >= depth)
                                             │
                                   risk + AML screening
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                             ▼
                        CREDIT (ledger)              QUARANTINE + CASE
```

### 3.1 The rule that matters

> **A webhook is a notification to go look. It is never the reason we credit.**

Credit happens only after we independently confirm, against the chain:
the **asset**, the **network**, the **amount**, the **destination address**, and
that **confirmations >= configured depth**.

Never credit from: screenshots, manual user claims, frontend status, or an
unverified transaction id (section 16).

### 3.2 Webhook handling requirements

1. Verify HMAC signature **before parsing the body**, using constant-time
   comparison. Unsigned or mis-signed requests are dropped without further work.
2. Persist the raw event first, keyed by provider event id with a unique index.
3. **Idempotent by construction** — a duplicate delivery hits the unique index and
   returns the original outcome (section 16).
4. Out-of-order events cannot move the state machine backwards.
5. The handler does **no** crediting inline. It enqueues verification work. A slow
   or failing verifier must never cause the provider to retry-storm us.

### 3.3 Deposit states

`INITIATED -> AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> VERIFIED -> SCREENED -> CREDITED`
with `EXPIRED`, `UNDERPAID`, `OVERPAID`, `WRONG_ASSET`, `WRONG_NETWORK`, and
`QUARANTINED` as terminal-or-case states. Underpayment and overpayment are
**expected**, not exceptional, and each has a defined policy.

---

## 4. Withdrawal flow

```
REQUESTED -> VALIDATING -> RISK_CHECK -> PENDING_REVIEW -> APPROVED
          -> PROCESSING -> BROADCASTED -> CONFIRMED -> COMPLETED
                        (or FAILED | REJECTED | CANCELLED)
```

Exactly the state machine in section 17. Properties:

- **Every transition is persisted**, with actor, timestamp, and reason. The
  history is append-only.
- **No transition is ever triggered by a client call.** The client can only
  create a `REQUESTED` record and cancel while still cancellable.
- **Funds are locked at `REQUESTED`**, so the same balance cannot also fund duels.
- **`PENDING_REVIEW` is entered by policy**, not by exception: above an amount
  threshold, on first withdrawal, on a new destination address, on any risk hit,
  on KYC tier mismatch, or on velocity anomalies.
- **Four-eyes approval** above a configured threshold. The requester-approver
  separation is enforced in the admin RBAC model — no single admin can both
  initiate and approve.
- **Broadcast is idempotent** on `withdrawalId`. A retry after an ambiguous
  provider response must never double-send. Where the provider supports client
  idempotency keys we use them; where it does not, we reconcile before retrying,
  never blind-retry.

### 4.1 Withdrawal gates (all must pass)

| Gate | Check |
|---|---|
| Balance | Sufficient `withdrawable`, verified under row lock |
| KYC | Tier satisfies the amount band |
| Geo / eligibility | Jurisdiction permits payout; not sanctioned |
| Age | Verified above minimum for the market |
| Address | Valid TRON address, checksum-verified, allowlisted, past its time-lock |
| Security | No recent credential/2FA change inside the cooling-off window; step-up auth passed |
| Risk | Composite score below the auto-approve threshold |
| Fair play | No open case, no fair-play hold on source funds |
| Solvency | Global custody >= liability invariant currently holding |

Any failure routes to review or rejection with a user-facing reason. **Silent
failure is prohibited** — the user always learns the state of their own money.

---

## 5. Custody

**Unresolved and blocking Phase 5 (R3 in the threat model).** The choice is a
founder + counsel decision, not an engineering one. Options:

| Model | Pros | Cons |
|---|---|---|
| Full provider custody (NOWPayments holds) | Fastest; smallest key-management surface | Counterparty risk; least control; provider limits |
| Qualified third-party custodian | Insured, audited, institutional controls | Cost; onboarding; jurisdictional constraints |
| MPC / HSM self-custody | Maximum control | Maximum responsibility; needs real security staffing |

**Whatever is chosen, these hold absolutely (section 18):**

1. **No private key in source code.** Ever.
2. **No private key in the APK.** Ever.
3. **No payment secret reaches any frontend.**
4. Hot-wallet float is **capped** and topped up from cold storage on a schedule,
   so a total hot-wallet compromise is a bounded, survivable loss.
5. Signing is a **separate, minimal-surface service** with its own authentication,
   its own audit log, and no general-purpose code path into it.
6. Secrets live in a managed secrets manager with rotation, never in `.env` files
   in production.

---

## 6. Economy Rules Engine (section 12)

Rake is **configuration, not code**.

```ts
interface EconomyRule {
  id: string;
  version: number;
  scope: { gameId?: GameId; tier?: Tier; tournamentId?: string };
  rakeBps: number;          // 1000 = 10.00%
  minRakeMinor: bigint;
  maxRakeMinor?: bigint;
  effectiveFrom: Date;
  effectiveTo?: Date;
  createdBy: AdminId;
  approvedBy: AdminId;      // MUST differ from createdBy
}
```

- Standard tier: **10–15%** · VIP: **8–10%** · special tournaments: custom.
  All configured, **none hardcoded**.
- Rules are **versioned and time-bounded**. Historical settlements always resolve
  against the rule version in force at settlement time, so any past duel can be
  re-derived exactly.
- **Every economy change is audited**, requires two distinct admins, and emits an
  immutable audit event (section 12, section 29).
- Rounding is defined once, applied consistently, and always **in the user's
  favour at the sub-minor-unit boundary** — the residue is tracked, not silently
  absorbed.

---

## 7. Reconciliation, restated for payments

| Job | Frequency | On mismatch |
|---|---|---|
| Provider deposits vs. our deposits | Continuous | ALERT -> CASE |
| Provider payouts vs. our withdrawals | Continuous | ALERT -> CASE |
| Chain custody balance vs. `platform:custody` | Scheduled | **ALERT -> CASE -> consider halting withdrawals** |
| Global solvency (custody >= liabilities) | Scheduled + before each payout batch | **Automatic withdrawal halt + page** |
| Stuck-state sweep (anything in a transient state past its SLA) | Continuous | CASE |

**No unexplained discrepancy is ever auto-repaired** (section 19). Unexplained
funds go to `platform:suspense` and stay there until a human explains them.

---

## 8. Testing strategy before real money

Phase 5 ships against **sandbox only**. Required before any production key exists:

1. Full deposit simulation, including underpay, overpay, wrong asset, wrong
   network, dust, and late confirmation.
2. Full withdrawal simulation through every state, including provider timeout,
   ambiguous response, and broadcast failure.
3. **Webhook replay, forgery, and out-of-order attacks** — the forged-webhook test
   is mandatory and must fail closed.
4. Reconciliation drills with deliberately injected discrepancies, verifying that
   each one raises a case and that none self-heals.
5. Chaos test: kill the settlement worker mid-transaction, restart, and assert the
   ledger still balances and no double-post occurred.
6. Solvency-breach drill: confirm withdrawals halt automatically.
