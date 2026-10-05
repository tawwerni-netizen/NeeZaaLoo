# Compliance Architecture

**Status:** Phase 0 framework. **Not legal advice.** Every jurisdictional
determination below is a placeholder until confirmed by qualified gaming and
fintech counsel (decision D2).

---

## 1. Compliance is an independent policy layer

Compliance is **not** conditionals scattered through feature code. It is a
separate module that every sensitive action must consult, and it must be able to
change a market's status by **configuration, not deployment**.

```
        ACTION (register · deposit · play cash · join tournament · withdraw)
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │   COMPLIANCE POLICY      │
                    │   ENGINE                 │
                    │                          │
                    │  entity · jurisdiction · │
                    │  licence · geo · age ·   │
                    │  KYC tier · sanctions ·  │
                    │  product eligibility     │
                    └───────────┬──────────────┘
                                │
                 ALLOW  ·  DENY  ·  REQUIRE_STEP_UP  ·  REVIEW
```

Every decision returns a **reason code** and is **logged immutably**. "Denied" is
never silent, and a user is always told which requirement they have not met (to
the extent disclosure is itself permitted).

**Fail closed.** If the policy engine cannot reach a dependency, real-money
actions are denied. Free play continues.

---

## 2. The Market Matrix (section 23)

Enforced as versioned configuration, evaluated at runtime, audited on change.

```ts
interface MarketPolicy {
  countryCode: string;          // ISO 3166-1 alpha-2
  legalStatus: 'PERMITTED' | 'RESTRICTED' | 'PROHIBITED' | 'UNDETERMINED';
  allowedProducts: Product[];   // FREE_PLAY | RANKED | CASH_DUEL | CASH_TOURNAMENT
  realMoneyEligible: boolean;
  cryptoEligible: boolean;
  minimumAge: number;
  kycRequirement: 'NONE' | 'TIER_1' | 'TIER_2' | 'TIER_3';
  geoRule: 'ALLOW' | 'BLOCK' | 'ALLOW_FREE_PLAY_ONLY';
  launchStatus: 'LIVE' | 'PILOT' | 'PLANNED' | 'BLOCKED';
  licenceRef?: string;
  reviewedBy: string;           // counsel reference
  reviewedAt: Date;
}
```

### 2.1 Default posture

**Every country starts as `UNDETERMINED` -> `ALLOW_FREE_PLAY_ONLY` -> no real
money.** A market becomes real-money eligible only by an explicit, counsel-backed,
audited change. There is no default-permitted state, and there is no code path
that treats an unlisted country as permitted.

### 2.2 Structurally prohibited (illustrative, pending counsel)

Categories that will almost certainly be `PROHIBITED` for real-money play:

- Comprehensively sanctioned jurisdictions (OFAC/EU/UN sanctions programmes).
- Jurisdictions prohibiting online real-money contests outright.
- Jurisdictions where crypto-denominated consumer payments are prohibited.
- Sub-national restrictions (several US states restrict paid skill contests; India
  varies by state; Canada varies by province) — the matrix must therefore support
  **sub-national granularity**, not country-only.

**Design consequence:** `countryCode` alone is insufficient. The schema needs a
`region` dimension from day one, because retrofitting sub-national policy into a
country-keyed system is a rewrite.

### 2.3 Skill-vs-chance is the central legal question

The entire real-money thesis rests on these being **games of skill**, which is
determined differently in every jurisdiction (predominance test, material element
test, any-chance test). Two engineering obligations follow:

1. **Evidence must exist.** The platform should be able to demonstrate,
   statistically, that outcomes correlate with rating and improve with practice.
   This is a data product, and it is a legal asset.
2. **Randomness must be minimised and documented.** Server-generated challenges
   are *seeded and equivalent for both players* (section 7). Both players facing
   the same challenge is not just fairness — it is the argument that the contest
   is decided by skill.

---

## 3. KYC tiers

| Tier | Trigger | Requires | Unlocks |
|---|---|---|---|
| **0** | Registration | Email + age attestation | Free play, ranked play |
| **1** | First deposit | Identity + DOB + country | Cash duels within limits |
| **2** | Withdrawal, or cumulative volume threshold | Government ID + liveness | Withdrawals within limits |
| **3** | High volume / risk flag / PEP or sanctions hit | Source of funds, enhanced due diligence | Elevated limits |

Rules:
- **KYC is enforced at the withdrawal boundary at minimum.** A platform that
  allows anonymous deposit-play-withdraw is a laundering vehicle.
- KYC documents live in **separate encrypted storage**, with separate access
  control, separate audit, and their own retention clock — never in application
  tables (threat model T4).
- Re-verification on material change: name, country, or a risk trigger.

---

## 4. AML controls

| Control | Implementation |
|---|---|
| Sanctions screening | On KYC completion and on a recurring re-screen; hits block and escalate |
| PEP screening | At Tier 2+; hits route to enhanced due diligence |
| Chain analysis | On every deposit, **before crediting**; tainted funds quarantine, never credit |
| Transaction monitoring | Velocity, structuring, rapid deposit-to-withdrawal with minimal play |
| **Chip-dumping detection** | Collusion graph doubles as an AML control — deliberate losses are value transfer |
| Suspicious activity reporting | Case management with regulator-ready evidence export |
| Record retention | Per jurisdiction; retention is configuration, not hardcoded |

**The lowest-play-highest-turnover pattern** — deposit, play one duel, withdraw —
is the canonical laundering signature on this kind of platform, and is a standing
monitored rule.

---

## 5. Age and geo

- **Age:** attested at registration, **verified** at KYC Tier 1+. Minimum age is
  per-market (18 in most, 21 in some). Under-age accounts are closed and funds
  returned per policy.
- **Geo:** derived server-side from IP plus payment and device signals. Never from
  a client-supplied header (threat model T2).
- **VPN/proxy/Tor detection** feeds the risk engine. Detection alone is not proof
  of evasion, but it blocks real-money actions pending review — the asymmetry is
  deliberate: a false positive costs a support ticket, a false negative costs a
  licence.
- **Travel:** a user's home market governs eligibility, not their current IP.
  Mismatch triggers review, not automatic denial.

---

## 6. Responsible competition (section 23)

Not optional, and not merely ethical — it is a licensing requirement in most
regulated markets.

- Deposit limits (daily/weekly/monthly), user-settable **downward instantly** and
  **upward only after a cooling-off period**.
- Session-time and loss-limit awareness prompts.
- Self-exclusion: temporary and permanent, honoured across every account linked by
  the identity graph — self-exclusion that one device fingerprint can bypass is
  theatre.
- Reality checks on extended sessions.
- **No mechanic that pressures a losing user to deposit.** Explicitly forbidden by
  section 38 and by good sense: chasing losses is the failure mode that produces
  both regulatory action and destroyed customers.

---

## 7. Required policies before launch

Terms of Service · Privacy Policy · Fair Play Policy · Withdrawal Policy · Dispute
Resolution Policy · Account Closure Policy · Responsible Competition Policy ·
Cookie Policy · AML Policy (internal) · Data Retention Schedule.

Each must be versioned, with the accepted version recorded per user at acceptance
time.

---

## 8. Data protection

- **Lawful basis** documented per processing purpose.
- **Data minimisation** — collect only what a named requirement needs.
- **Subject rights** — access, rectification, erasure, portability — with erasure
  bounded by AML retention obligations (these conflict; the conflict is resolved
  in favour of the retention obligation, and that must be disclosed).
- **Regional data residency** where required.
- **Breach notification** procedures with defined timelines.

---

## 9. Open items blocking Phase 6

| # | Item | Owner |
|---|---|---|
| C1 | Legal entity and domicile | Founder + counsel |
| C2 | Licensing strategy per target market | Counsel |
| C3 | Skill-vs-chance opinion for each launch market | Counsel |
| C4 | KYC/AML provider selection | Founder |
| C5 | Chain-analysis provider selection | Founder |
| C6 | Initial launch market list | Founder + counsel |
| C7 | Sub-national granularity confirmed in schema | Engineering |
