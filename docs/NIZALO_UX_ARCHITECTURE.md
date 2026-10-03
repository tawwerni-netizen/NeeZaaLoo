# NIZALO V2 — UX ARCHITECTURE & USER JOURNEYS

---

## 1. Information Architecture (IA)

```
                    NIZALO PLATFORM
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
  CORE EXPERIENCE      COMPETITIVE          UTILITIES
  (Primary Nav)       (Progression)         & FINTECH
       │                   │                   │
  ├── /play (Arena)   ├── /tournaments     ├── /wallet (Deposit/Withdraw)
  ├── /games (Hub)    ├── /rank (Leaderboard)├── /profile (Stats/History)
  └── /game/[duelId]  └── /clans & /pass   └── /help & /fair-play
```

---

## 2. Navigation Architecture

### Desktop Navigation Hierarchy
- **Brand / Home:** Nizalo Logo (Links to `/`)
- **Primary Navigation (Core Loop):**
  1. `Play` (`/play`): Instant Matchmaking, Game Arena, Fast Practice.
  2. `Games` (`/games`): Complete 11-Game Encyclopedia, Rules & Tactics.
  3. `Tournaments` (`/tournaments`): Bracket Cups, Free & Cash Prize Pools.
  4. `Rank` (`/rank`): Global ELO Leaderboards, Tier Badges.
- **Secondary Dropdown ("More" / "المزيد"):**
  - `Clans` (`/clans`)
  - `Store` (`/store`)
  - `Battle Pass` (`/battle-pass`)
  - `Live Stream` (`/watch`)
  - `Rewards` (`/referrals`)
- **Utility / Profile Area:**
  - Balance Pill ($XX.XX USDT) with direct "Deposit" button
  - Notification Bell with unread counter
  - Language Switcher (EN / AR)
  - User Avatar dropdown / Sign In button

### Mobile Navigation Hierarchy
- **Sticky Top Bar:** Logo, Balance Pill, User Avatar / Login.
- **Bottom Navigation Bar (Thumb Zone):**
  1. ⚔️ `Play` (`/play`) — Primary active tab
  2. 🎲 `Games` (`/games`)
  3. 🏆 `Tournaments` (`/tournaments`)
  4. 👑 `Rank` (`/rank`)
  5. 💼 `Wallet` (`/wallet`)

---

## 3. End-to-End User Flows

### Flow A: The First-Time Visitor Journey (Zero Friction)
```
1. Visitor Arrives on https://nizalo.com/ar or /en
   ↓
2. Sees Clear Hero:
   "The Competitive Arena for Mind Sports & Tabletop Games"
   (Sub: 11 Games • 100% Skill • Free Training or Real Cash Duels)
   ↓
3. Clicks "Play Free Practice" or selects a Game Card (e.g. Chess or Speed Math)
   ↓
4. Lands on /play/[gameId]
   ↓
5. Background Guest Token created automatically (/v1/auth/guest)
   ↓
6. Instant Match Starts (Solo AI or Casual 1v1) in < 3 seconds
   ↓
7. Match Finishes → Result Ceremony Shows:
   - Victory Badge / XP Gained / Rating Movement
   - "Save your account with 1 tap to keep your rating and rewards!"
   ↓
8. Visitor Enters Email or Google Login → Converted to Registered Player.
```

### Flow B: The Cash Duel & Wallet Journey (High Trust & Predictability)
```
1. Registered Player decides to play a Cash Duel ($5 Stake)
   ↓
2. Opens Stake Selection:
   - Clearly sees: Stake $5.00 | Total Pot $10.00 | Fee 12% ($1.20) | Winner $8.80 | Draw: 100% Refund ($0 fee)
   ↓
3. If Balance insufficient:
   - Wallet Drawer / Modal opens immediately.
   - For Egyptian players: Vodafone Cash / InstaPay (52 EGP/USD) with clear instructions.
   - For Global players: USDT TRC20 / BEP20 QR Code & Address.
   ↓
4. Deposit Confirms → Balance updates in real-time.
   ↓
5. Player enters Matchmaking → Opponent Found in < 15s → Live Duel starts.
   ↓
6. Match Concludes → Server settles ledger atomically:
   - Winner account credited instantly.
   - Loser stake deducted.
   - If Draw: Both stakes unlocked back to available balance with zero fee.
```

### Flow C: The Post-Match Retention Loop (The Second Match)
```
Match Completes in ResultCeremony
   ├── Action 1: "Rematch ⚔️" (Sends live challenge to opponent in room)
   ├── Action 2: "New Opponent (Same Stake)" (1-click queue re-entry)
   ├── Action 3: "Try Daily Quest / Different Game"
   └── Action 4: "View Leaderboard / ELO Progress"
```
