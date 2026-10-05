# Ledger Specification

**Model:** double-entry, append-only, multi-asset.
**Rule that governs everything below:** a mutable balance column is never the
source of truth (section 13).

---

## 1. Why double-entry, non-negotiably

A single mutable `balance` field cannot answer the questions this business must
answer every day: *why* is the balance what it is, *what did we owe* at any past
instant, and *does the total we hold equal the total we owe*. Double-entry answers
all three by construction, and makes the central invariant checkable:

> **Every transaction sums to zero, per asset. Therefore the system always
> balances, or it refuses the write.**

Balances are **derived** by summing entries (with a maintained snapshot for
performance — see section 6). The derivation is the truth; the snapshot is a cache
that is continuously verified against it.

---

## 2. Account model

Every account has a `type`, an `owner` (a user, or the platform), and an `asset`.
Accounts are typed as **ASSET** or **LIABILITY** from the platform's perspective —
user funds are money we *owe*, so user accounts are liabilities.

### 2.1 User accounts (liability side)

Section 13's wallet states map to **distinct accounts**, not to a status flag.
This is the key design decision: "locked" funds are not available funds wearing a
label, they are in a different account, and a query for available balance cannot
accidentally include them.

| Account | Meaning |
|---|---|
| `user:{id}:available` | Spendable now — can enter duels |
| `user:{id}:locked` | Committed to a live duel or a pending withdrawal |
| `user:{id}:pending` | Deposit seen but not yet final (insufficient confirmations) |
| `user:{id}:withdrawable` | Cleared funds eligible for withdrawal (post-policy) |
| `user:{id}:restricted` | Frozen by risk, compliance, or fair-play hold |

`available` and `withdrawable` are separate because they answer different
questions. Funds may be playable but not yet withdrawable (promotional credit,
unmet KYC, cooling-off period), and that distinction must be structural, not a
business-logic afterthought.

### 2.2 Platform accounts (asset / equity side)

| Account | Meaning |
|---|---|
| `platform:custody:{asset}:{network}` | What we actually hold on-chain |
| `platform:rake` | Platform fee revenue |
| `platform:prize_pool:{tournamentId}` | Guaranteed/contributed prize funds |
| `platform:promotions` | Promotional liability (funded, capped) |
| `platform:fees:network` | Network/withdrawal fees we absorb or recover |
| `platform:suspense` | **Unexplained funds.** Never auto-cleared. |
| `platform:writeoff` | Explicit, approved, audited losses |

**`platform:suspense` is the honesty account.** Anything we cannot explain lands
there and raises a case. It is never silently reconciled away (section 19).

---

## 3. Core tables

```sql
-- Accounts -------------------------------------------------------------
CREATE TABLE ledger_account (
  id            BIGSERIAL PRIMARY KEY,
  key           TEXT NOT NULL,             -- 'user:123:available'
  owner_type    TEXT NOT NULL,             -- 'USER' | 'PLATFORM'
  owner_id      TEXT,
  account_type  TEXT NOT NULL,             -- 'ASSET' | 'LIABILITY' | 'REVENUE'
  asset         TEXT NOT NULL,             -- 'USDT'
  network       TEXT,                      -- 'TRON'  (null for internal)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, asset)
);

-- Transactions (the atomic unit; always balances to zero per asset) -----
CREATE TABLE ledger_transaction (
  id              BIGSERIAL PRIMARY KEY,
  uuid            UUID NOT NULL UNIQUE,
  kind            TEXT NOT NULL,           -- DEPOSIT | DUEL_ENTRY | DUEL_SETTLE |
                                           -- RAKE | WITHDRAWAL | ADJUSTMENT | ...
  idempotency_key TEXT NOT NULL,
  reference_type  TEXT,                    -- 'duel' | 'withdrawal' | 'deposit'
  reference_id    TEXT,
  actor_type      TEXT NOT NULL,           -- 'SYSTEM' | 'USER' | 'ADMIN'
  actor_id        TEXT,
  reason          TEXT,                    -- REQUIRED for ADJUSTMENT
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)                 -- replay protection, enforced by DB
);

-- Entries (append-only; no UPDATE, no DELETE) --------------------------
CREATE TABLE ledger_entry (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES ledger_transaction(id),
  account_id     BIGINT NOT NULL REFERENCES ledger_account(id),
  asset          TEXT   NOT NULL,
  amount         BIGINT NOT NULL,          -- minor units; signed; NEVER float
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount <> 0)
);

CREATE INDEX ON ledger_entry (account_id, id);
```

### 3.1 Enforced invariants

| # | Invariant | Enforcement |
|---|---|---|
| I1 | Every transaction sums to zero **per asset** | Deferred constraint trigger at COMMIT |
| I2 | Entries are immutable | Revoked UPDATE/DELETE privileges + rule/trigger that raises |
| I3 | No user account goes negative | Balance check inside the transaction, under row lock |
| I4 | Idempotency keys are unique | `UNIQUE` index — a retry cannot double-post |
| I5 | `ADJUSTMENT` requires a reason and an admin actor | `CHECK` constraint |
| I6 | Amounts are integers in minor units | `BIGINT` column type |

I1 and I2 are the two that make the system trustworthy, and both are enforced in
the database. **Application code cannot violate them, including buggy application
code and including a compromised admin API.**

---

## 4. Canonical flows

### 4.1 Deposit (only after on-chain verification)

```
DR  platform:custody:USDT:TRON      +100.00
CR  user:123:pending                -100.00     (below confirmation depth)

-- once confirmations >= threshold:
DR  user:123:pending                +100.00
CR  user:123:available              -100.00
```

### 4.2 Duel entry (money locks BEFORE play)

```
DR  user:123:available              +10.00
CR  user:123:locked                 -10.00
DR  user:456:available              +10.00
CR  user:456:locked                 -10.00
```

Both legs happen in **one transaction**. If either player cannot fund, the duel is
never created. This is why the duel lifecycle has a `RESERVED` state before
`READY`: no duel with money attached begins with unlocked funds.

### 4.3 Settlement with rake (10% standard tier)

```
DR  user:123:locked                 +10.00      (loser's stake released)
DR  user:456:locked                 +10.00      (winner's stake released)
CR  user:456:available              -18.00      (winner receives 18)
CR  platform:rake                   - 2.00      (platform fee)
```

Sums to zero. Rake is computed by the **Economy Rules Engine**, never hardcoded
(section 12), and the applied rate and rule version are recorded on the
transaction so any historical settlement can be explained and re-derived.

### 4.4 Withdrawal

```
-- on request:
DR  user:123:withdrawable           +50.00
CR  user:123:locked                 -50.00

-- on confirmed broadcast:
DR  user:123:locked                 +50.00
CR  platform:custody:USDT:TRON      -50.00
CR  platform:fees:network           - fee      (as applicable)
```

Funds are locked at request time, so the same balance cannot fund a duel while a
withdrawal is pending.

### 4.5 Void / refund

```
DR  user:123:locked                 +10.00
CR  user:123:available              -10.00
DR  user:456:locked                 +10.00
CR  user:456:available              -10.00
```

Used for platform faults and fair-play-invalidated duels. Never expressed as an
edit of the original transaction — always a new, compensating one.

---

## 5. Idempotency

Every money-moving operation carries an idempotency key with a deterministic shape:

| Operation | Key |
|---|---|
| Deposit credit | `deposit:{network}:{txHash}:{outputIndex}` |
| Duel entry | `duel:{duelId}:entry` |
| Duel settlement | `duel:{duelId}:settle` |
| Withdrawal debit | `withdrawal:{withdrawalId}:debit` |
| Provider webhook | `webhook:{provider}:{providerEventId}` |

A duplicate insert violates the unique index; the handler catches it and returns
the **original** result. Retries, duplicate webhooks, and double-clicks are all
no-ops by construction rather than by careful coding.

---

## 6. Balance projection

Summing all entries on every read does not scale. The compromise:

- `account_balance_snapshot (account_id, asset, balance, last_entry_id)`, updated
  **inside the same transaction** as the entries. It is therefore never stale and
  never eventually-consistent.
- A continuous verifier recomputes balances from entries for a rolling sample of
  accounts and compares against the snapshot.
- **Any mismatch is an alert and a case, never an auto-repair** (section 19).
  A snapshot that disagrees with its entries means either a bug or an intrusion,
  and both require a human.

---

## 7. Reconciliation (section 19)

Runs continuously, at three levels:

| Level | Compares | Failure meaning |
|---|---|---|
| **L1 Internal** | Snapshot vs. sum of entries | Ledger bug or tampering |
| **L2 Provider** | Our deposit/withdrawal records vs. NOWPayments records | Integration gap or provider issue |
| **L3 Chain** | `platform:custody` balance vs. actual on-chain balance | Real money discrepancy — **highest severity** |

Plus a **global solvency check**:

> `SUM(all platform custody accounts)` >= `SUM(all user liability accounts)`, per asset.

If this ever fails, the platform is insolvent for that asset. It triggers an
immediate automated halt of withdrawals (section 30) and pages a human. It is
checked on a schedule, and it is the single most important number in the company.

Discrepancies produce: **ALERT -> CASE -> REVIEW**. Never a silent repair.

---

## 8. What is explicitly forbidden

1. Storing money as `FLOAT`, `DOUBLE`, or JS `number` beyond `2^53`.
2. `UPDATE` or `DELETE` on `ledger_entry` or `ledger_transaction`. Ever.
3. Crediting a balance from a webhook, a screenshot, a support ticket, or a
   client-supplied transaction id, without independent verification.
4. A code path that writes entries outside the ledger module's transactional API.
5. Cross-asset arithmetic without an explicit, recorded, audited conversion.
6. Any balance mutation lacking an idempotency key.
7. An admin adjustment without a reason, an actor, and an audit record.
