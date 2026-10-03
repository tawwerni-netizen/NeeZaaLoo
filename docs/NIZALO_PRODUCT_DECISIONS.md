# NIZALO V2 — PRODUCT & BUSINESS DECISIONS

This document records the exact operational rules extracted from the codebase and ledger, alongside the strategic decisions requiring founder confirmation.

---

## 1. Verified Rules Derived from the Codebase (Ground Truth)

### Fee & Rake Policy (`packages/settlement/src/rake.mjs` & `financial-config.mjs`)
1. **Platform Fee Rate:** 12% flat rake (`DEFAULT_RAKE_BPS = 1200n`) charged on the total match pot of Cash duels.
2. **Winner Payout Share:** 88% of the total pot (`WINNER_SHARE_BPS = 8800n`).
3. **Draw / Tie Rule:** **100% Refund, 0% Platform Fee.**
   - In any drawn match (e.g. Chess stalemate, XO draw, Dominoes equal pip tie), both players' stakes are released back to their available balance with zero platform deductions.
4. **Rounding Policy:** Floor rounding in favor of players (sub-minor fractions stay with users, not the platform).

### Stake Ladder & Game Economics (`financial-config.mjs`)
- Standard Presets (USD/USDT): `$2, $5, $10, $20, $25, $50, $100, $200, $500, $1000, $2000`.
- Minimum Cash Stake: `$2.00 USDT` (or `$1.00` in select game configurations).
- Maximum Cash Stake: `$2,000.00 USDT`.
- Currency Minor Precision: `USDT_MINOR = 1_000_000n` (6 decimal places).

### Solved Games Policy (`canonical-games.ts`)
- Games that have been mathematically solved or have high forced-draw rates (e.g., `xo`, `connect-four`, `gomoku`, `seega`) are strictly **Free-to-Play Only**.
- Real-money stakes are enabled only on complex, non-trivial skill games (`chess`, `dominoes`, `ludo`, `backgammon`, `speed-math`, `checkers`, `reversi`).

### Local Currency Rails (Egypt)
- Vodafone Cash & InstaPay rails: `1 USD = 52 EGP` (governed by `valuation_snapshot` table in database).
- Local deposits and withdrawals are processed via manual admin verification with reference tracking.

---

## 2. Business Decisions Requiring User / Stakeholder Input

The following business policies cannot be inferred from source code alone and must be confirmed by platform management:

1. **Geographic Restrictions & Licensing:**
   - Are players from specific jurisdictions (e.g. USA, UK, FATF high-risk list) restricted from real-money USDT duels?
   - Is Nizalo positioning strictly as a "Skill-Based Esports Tournament Platform" across all operating territories?

2. **Withdrawal KYC & AML Thresholds:**
   - Currently, AML playthrough checks require 100% turnover of deposited funds before withdrawal (`unplayedDepositMinor == 0`).
   - What cumulative withdrawal threshold (e.g., $1,000, $5,000) should trigger mandatory ID/Passport KYC submission?

3. **Inactivity & Abandoned Account Policy:**
   - How long can unused balances remain idle before requiring re-verification?
