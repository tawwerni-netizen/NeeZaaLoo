# NIZALO V2 — DESIGN SYSTEM & VISUAL SPECIFICATION

**Design Philosophy:** Competitive • Modern • Fast • Technical • Trustworthy • Energetic  
**Aesthetic Boundaries:** No cheap casino styling, no childish gaming tropes, no oversaturated glow, no decorative clutter. Clean esports precision with micro-interactions.

---

## 1. Color Palette & Token System

### Core Neutral Surfaces
- `--nz-bg-base`: `#070A11` (Deep space obsidian, platform background)
- `--nz-bg-surface`: `#0D1322` (Card and container background)
- `--nz-bg-elevated`: `#141C30` (Modals, popovers, floating headers)
- `--nz-border-subtle`: `rgba(255, 255, 255, 0.08)`
- `--nz-border-medium`: `rgba(255, 255, 255, 0.16)`
- `--nz-border-focus`: `#3B82F6` (Electric Blue focus ring)

### Brand & Accent Hierarchy
- **Primary Brand / Action:** `#3B82F6` (Electric Royal Blue) — Main CTAs, active nav items, progress fills.
- **Victory / Triumph Gold:** `#F59E0B` to `#FFD700` — Win states, ELO gain, trophies, premium tournaments.
- **Success / Liquid Green:** `#10B981` — Confirmed deposits, balance available, positive PnL.
- **Alert / Defeat Red:** `#EF4444` — Losses, resignations, errors, balance warnings.
- **Tactical Purple:** `#8B5CF6` — Grandmaster tiers, elite stakes, special events.

### Typography
- **Latin Font Family:** Inter, system-ui, -apple-system, sans-serif
- **Arabic Font Family:** Cairo, system-ui, -apple-system, sans-serif
- **Monospace (Numbers & Timers):** JetBrains Mono, SF Mono, Menlo, monospace

---

## 2. Spacing & Elevation Grid

- **Base Spacing Unit:** 4px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64px)
- **Container Max Width:** `1280px` (`.nz-container`)
- **Border Radius Standards:**
  - Micro (Chips, Badges): `6px` / `8px`
  - Standard (Buttons, Inputs, Cards): `12px` / `14px`
  - Large (Modals, Hero Containers): `20px` / `24px`
  - Circular: `9999px`

---

## 3. Responsive & Touch Standards

| Breakpoint | Target Devices | Layout Adjustments |
| :--- | :--- | :--- |
| **< 480px** | Small Mobile (360px–414px) | Single column, sticky bottom nav, 44px min touch target, full-width modals. |
| **481px – 768px** | Large Mobile & Phablets | 2-column game discovery grid, compact duel HUD. |
| **769px – 1024px** | Tablets / Small Laptops | 3-column discovery grid, side-by-side player HUDs in live matches. |
| **> 1024px** | Desktop Displays (1280px+) | Full layout with active tournament banners and live duel lobby previews. |

---

## 4. Internationalization & Bi-Directionality (RTL / LTR)

- Arabic (`ar`) uses native `dir="rtl"` with Cairo typography.
- Horizontal flows (timers, chevrons, stepper trails) reverse automatically using CSS logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline`).
- Numerals and monetary values (`$10.00 USDT`, `3:00` clock) always preserve logical left-to-right reading order with `dir="ltr"` on `.nz-num`.
