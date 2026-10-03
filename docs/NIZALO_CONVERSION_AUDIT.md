# NIZALO V2 — FULL CONVERSION FUNNEL AUDIT

**Target:** Maximizing conversion from First Visitor to Repeat Active Player  
**Core Methodology:** Conversion Rate Optimization (CRO), Behavioral Psychology, Friction Analysis, Game Loop Architecture

---

## 1. The Current Funnel vs. The Target Loop

```
CURRENT FUNNEL (HIGH FRICTION & DROP-OFFS):
Visitor Lands (Confetti, Fake Tickers, Stake Chips)
  ↳ 55% Drop-off: Confusion & Distrust ("Is this a casino?")
Browse Games
  ↳ 40% Drop-off: Paralysis of choice & complex setup wizard
Choose Match / Mode
  ↳ 35% Drop-off: Forced login modal on cash duels without trying first
Matchmaking
  ↳ 20% Drop-off: Long wait times with opaque status
Play Match
  ↳ 15% Drop-off: Mobile scrolling issues or accidental taps
Result Ceremony
  ↳ 60% Drop-off: No clear path to next match; player exits
```

```
TARGET V2 CORE PRODUCT LOOP (ZERO FRICTION, HIGH RETENTION):
1. SEE & UNDERSTAND (Clear Hero: 11 Mind Sports, 100% Skill, Zero House Edge)
   ↓
2. DISCOVER & TRY (1-Click Free Practice vs AI or 1v1 with Guest Auth)
   ↓
3. FIRST VALUE MOMENT (Finish quick game in 60s - 3min, see win/rating boost)
   ↓
4. AUTHENTIC TRUST & ONBOARDING (Save account with 1 tap to claim rating & rewards)
   ↓
5. UPGRADE TO COMPETITIVE DUELS (Transparent stake: $2-$50, 88% payout, 0% draw rake)
   ↓
6. SEAMLESS LOCAL & CRYPTO FUNDING (Vodafone Cash / InstaPay in Egypt, USDT global)
   ↓
7. POST-MATCH RETENTION LOOP (Instant Rematch, New Opponent, Tournament or Rank climb)
```

---

## 2. Stage-by-Stage Friction & Drop-Off Analysis

| Funnel Stage | Friction Points | Drop-off Probability | Primary Psychological Barrier | Recommended V2 Fix | Key Analytics Event |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **1. Landing & First 5s** | Fake payout ticker, auto confetti, betting stake cards, wall of text. | **50% - 60%** | "This looks like an unregulated online casino or scam." | Clean Esports/Mind Sports Hero. Remove fake ticker and confetti. Clear tagline and single primary CTA: "Play Free / Explore Games". | `landing_view`, `hero_cta_click` |
| **2. Game Discovery** | Duplicate routes (`/games` vs `/play`). Cards lack instant 3-second comprehension. | **30% - 40%** | "What do I actually do in this game? How long will it take?" | Visual cards with 3 badges: Type, Match Duration (e.g. 60s sprint), Skill Mechanic. 1-click "Play Now". | `game_card_click`, `game_preview` |
| **3. Play Intent & Setup** | 4-step wizard: Mode → Time Control → Difficulty → Stake. | **35% - 45%** | Decision fatigue before even touching the game. | Unified single-view setup. "Fast Play vs AI" starts in 1 click without wizard. | `setup_mode_select`, `setup_start` |
| **4. Account Registration** | Forced login dialogs before allowing user to see or test game mechanics. | **40%** | "I don't want to sign up before knowing if the game is fun." | Automatic Guest Session (`/v1/auth/guest`) with 0 friction. Prompt account creation only when claiming wins or depositing. | `guest_session_created`, `reg_modal_open`, `reg_success` |
| **5. Deposit & Wallet** | Fear of locked money, complex crypto addresses, AML confusion. | **45% - 55%** | "Will I be able to withdraw my money? What are the fees?" | Explicit Fee Breakdown on deposit: "$5 match = $8.80 prize, 100% refund on draw". Highlight Instant Vodafone Cash / InstaPay for Arabic users. | `wallet_view`, `deposit_start`, `deposit_confirmed` |
| **6. Matchmaking** | Generic spinner or dead silence during player search. | **20%** | "Is anyone actually playing? Is it broken?" | Animated Matchmaking Radar with searching status, benchmark player indicators, and AI fallback match timer. | `matchmaking_start`, `match_found`, `matchmaking_cancel` |
| **7. Live Gameplay** | Mobile board clipping, screen scrolling on touch, tiny buttons. | **15% - 25%** | "I accidentally dragged the whole page and lost on time!" | Strict mobile viewport containment (`touch-action: none`). Minimum 44px tap targets. High-contrast timers. | `game_start`, `move_sent`, `game_error` |
| **8. Result & Next Action** | Static result card; user clicks back to home and leaves. | **50% - 65%** | "Match is over; nothing left to do." | Prominent "Rematch ⚔️" and "New Opponent in 1-Click" buttons. Progress bar towards next Rank / Quest. | `game_complete`, `rematch_click`, `next_opponent_click` |

---

## 3. Trust Architecture Breakdown

### What Builds Trust in Competitive Gaming?
1. **Zero House Edge:** The platform never plays against the user. It is strictly player-vs-player. The platform only takes a known, flat administrative rake (12%) from cash prize pools, and **0% on draws**.
2. **Server-Authoritative Validation:** No client can hack the board state or inject illegal moves.
3. **Provably Fair CSPRNG:** Dice rolls (Ludo, Backgammon) and tile shuffles (Dominoes) use server cryptographic seeds, verifiable after the match.
4. **Predictable Financial Liquidity:**
   - Deposits reflect automatically.
   - Withdrawals to USDT (TRC20/BEP20) and Egyptian local wallets (Vodafone Cash, InstaPay) have clear limits (Min $10) and processing times.
5. **Radical Transparency:** No hidden charges, no manipulated odds, no bots masquerading as real cash opponents. (Bots are strictly marked and free-only).

---

## 4. Key Performance Indicators (KPIs) to Track

- **Visitor-to-First-Play Rate (VFPR):** Percentage of landing visitors who complete at least 1 match (free or cash). Current estimate: ~4%. Target: **18%+**.
- **First-Play-to-Registration Rate:** Percentage of guest players who register an account after their first game. Current estimate: ~8%. Target: **25%+**.
- **Registration-to-Deposit Rate:** Percentage of registered players who fund their wallet. Target: **15%+**.
- **The Second-Match Replay Rate:** Percentage of players who immediately start a second match within 3 minutes of finishing their first. Current estimate: ~22%. Target: **50%+**.
- **Day-1 & Day-7 Retention:** Return rates driven by Rank progression and Tournament schedules.
