# NIZALO V2 — IMPLEMENTATION PLAN & ROADMAP

**Priority Structure:** P0 (Critical Blockers) → P1 (High Impact Conversion) → P2 (Medium Enhancement) → P3 (Polish)

---

## Priority Work Breakdown

### P0 — Critical (Immediate Conversion Blockers)
- [x] **Audit & Root-Cause Documentation:** Complete full product, conversion, game, UX, and design system audits.
- [ ] **Phase A — Fix Broken Flows & Connection Pool:** Fix database pool size ceiling in `server.js` (prevent `EMAXCONNSESSION` on Supabase session pooler).
- [ ] **Phase B — Hero & Product Clarity:** Overhaul Homepage Hero (`Hero.tsx`):
  - Eliminate page-load confetti and floating stake chips.
  - Deliver clear value proposition: 11 mind sports, 100% skill, zero house edge.
  - Direct 1-click CTA: "Play Free Now" + "Explore Games".
- [ ] **Phase B — Remove Fake Social Proof Ticker:** Deprecate `LiveWinnersTicker.tsx` containing hardcoded fake payouts (`tariq_chess`, `$88.00`, etc.) to restore authentic user trust.
- [ ] **Phase B — Reorder Homepage Hierarchy:** Move "How It Works" up to follow the Hero, establishing clarity before feature discovery.

### P1 — High (Core Loop & Conversion Acceleration)
- [ ] **Phase C — Game Discovery Experience:** Redesign game discovery on `/games` and `/play` with 3-second comprehension cards (Skill Type, Average Duration, Match Mode).
- [ ] **Phase D — First-Play Friction Elimination:** Streamline pre-match flow in `play/[gameId]/page.tsx` with a 1-click "Practice vs Computer" launch and automatic guest session.
- [ ] **Phase E — Matchmaking Transparency:** Polish matchmaking radar states (`Searching`, `Match Found`, `Starting in 3.. 2.. 1..`) with no confusing silent loading spinners.
- [ ] **Phase G — Post-Match Retention Loop:** Upgrade `ResultCeremony.tsx` with an immediate "Instant Rematch ⚔️" and "New Opponent in 1-Click" action bar.
- [ ] **Phase H — Wallet & Fee Transparency:** Add the Settlement Preview Card to stake selectors ($5 match = $8.80 prize, 0% fee on draws).
- [ ] **Phase I — Trust & Fair-Play Grounding:** Present server-authoritative validation and cryptographic integrity clearly without technical jargon.

### P2 — Medium (Mobile & Experience Hardening)
- [ ] **Phase J — Mobile Gameplay Optimization:** Add viewport containment and touch action protections (`touch-action: none` / `manipulation`) to all interactive boards to prevent unintended page scroll during play.
- [ ] **Phase K — Design System Unification:** Standardize typography, card radii, and responsive breakpoints across Arabic (`/ar`) and English (`/en`).

### P3 — Polish (Refinements & Performance)
- [ ] **Phase L & M — Microinteractions & Performance:** Optimize image fallbacks, verify Lighthouse metrics, ensure silky 60fps animations.
- [ ] **Phase N — Final Adversarial QA:** Full regression testing across auth, games, wallet, and multi-lingual routes.
