# Nizalo — Brand Guidelines

**Version 1.1** · 2026-09-08 (v1.0 2026-09-06; §4.5 and §6 ceremony tiers added)
**Name status:** locked. Trademark clearance still outstanding (see §10).

---

## 1. The name

**Nizalo** · Arabic: **نزالو** · Root: **نزال** (*nizāl*)

*Nizāl* is the Arabic word for **a duel — a bout, a contest between two**. It is
what an Arabic speaker calls a championship face-off. The Latinate `-o` turns a
real Arabic noun into a global brand.

| | |
|---|---|
| **Arabic pronunciation** | *ni-ZAAL-o* |
| **English pronunciation** | *nih-ZAH-loh* |
| **Stress** | Second syllable, always |
| **Written** | Always **Nizalo** — one word, initial capital only. Never NIZALO in body copy, never Niz-alo, never NizaLo. |

The wordmark is set in all caps. **The brand name in running text is not.**

---

## 2. What the brand means

Nizalo is a **global skill duel platform**. Chess is the flagship game; chess is
not the category.

The emotional ladder, in order:

> *"I want to test my skill."* → *"I can compete."* → *"I can improve."* →
> *"I can climb."* → and, where legally permitted, *"I can compete for prizes."*

The brand is **skill, challenge, status, mastery, competition, community,
achievement**. It is never casino, sportsbook, crypto scheme, or cheap betting.

### 2.1 The governing sentence

> **The money surfaces should feel like a bank. The game surfaces should feel
> like a sport. Nothing should ever feel like a casino floor.**

Every visual, copy, and motion decision in this document descends from that line.

---

## 3. The logo

### 3.1 The idea

The mark is the letter **N**, built from three parts:

- **two vertical bars of identical weight** — the two players, and the platform's
  promise that both receive an equivalent challenge;
- **one diagonal in Duel Orange** — the contest between them.

It is a letterform and a diagram at the same time. It contains nothing
chess-specific, which is the point: it has to still make sense when the game is
Speed Math.

### 3.2 Asset inventory

| File | Use |
|---|---|
| `nizalo-mark.svg` | Mark alone, light grounds |
| `nizalo-mark-dark.svg` | Mark alone, dark grounds |
| `nizalo-mark-mono.svg` | Single-colour, inherits `currentColor` |
| `nizalo-wordmark.svg` | **Primary horizontal lockup**, light grounds |
| `nizalo-wordmark-dark.svg` | Primary horizontal lockup, dark grounds |
| `nizalo-wordmark-mono.svg` | Single-colour lockup (embroidery, engraving, fax-grade reproduction) |
| `nizalo-wordmark-only.svg` / `-dark` | Wordmark without the mark |
| `nizalo-wordmark-stacked-dark.svg` | Stacked lockup for square/vertical space |
| `nizalo-app-icon.svg` | App icon, 512×512, rounded container |
| `nizalo-favicon.svg` | 32×32, simplified geometry |
| `nizalo-lockup-ar.svg` | Arabic lockup — **convert text to outlines before shipping** |

### 3.3 Which lockup, when

- **Primary horizontal lockup** — the default everywhere: site header, app splash,
  documents, decks.
- **Wordmark only** — where an icon already appears nearby, or in tight horizontal
  bands. Here the accent moves onto the wordmark's own N diagonal.
- **Mark only** — avatars, app icons, favicons, social profile images, loading
  states, and anywhere below 120px of available width.
- **Stacked** — square crops, merchandise, tournament backdrops.

### 3.4 Construction rules

- In the **horizontal lockup the mark sits in a rounded container.** This is not
  decoration. Uncontained, the mark reads as a repeated letter and the lockup
  says "N NIZALO". The container makes it unambiguously an icon.
- **Only one accent per lockup.** If the mark carries the orange, the wordmark is
  monotone. If the wordmark carries it, no mark is present.
- The N is drawn as a **clipped two-colour construction**, not three abutting
  shapes — abutting paths produce a hairline seam at most raster sizes.

### 3.5 Clear space and minimum size

**Clear space** on all four sides equals the **width of one wordmark stem**
(1/58th of the wordmark width; in the 512-unit lockup, 14 units). Nothing enters
that zone — no text, no rule, no image edge.

| Asset | Minimum |
|---|---|
| Horizontal lockup | 120px wide (digital) · 30mm (print) |
| Wordmark only | 90px wide |
| Mark | 20px · below that, use the favicon geometry |

### 3.6 Logo misuse — never do these

1. Never recolour the diagonal to anything but Duel Orange, or the stems to
   anything but Ink/Paper.
2. Never apply a gradient, glow, bevel, drop shadow, or outline to the mark.
3. Never rotate, skew, stretch, or condense any part of the logo.
4. Never rebuild the wordmark in a system font. The letterforms are custom paths.
5. Never place the logo on a busy photograph without a solid container.
6. Never put the uncontained mark directly beside the wordmark.
7. Never letter-space the Arabic wordmark. Arabic script is connected; tracking
   it breaks the letterforms.
8. Never add a tagline inside the clear-space zone. Taglines are separate elements.

---

## 4. Colour

### 4.1 The core three

| Token | Value | Role |
|---|---|---|
| **Duel Orange** | `#FF5A2B` | The single accent. Signal only. |
| **Ink** | `#0B0D10` | Primary dark ground |
| **Paper** | `#F7F8FA` | Primary light ground |

Duel Orange was chosen against the two obvious alternatives: **gold** reads
casino, and **purple/cyan** reads crypto. Orange is warm, fast, competitive, and
carries none of that baggage.

### 4.2 The accent discipline

> **Duel Orange means "this is the thing that matters right now."**

Legitimate uses: it is your turn · your clock is running · the primary action ·
your position on a leaderboard · a live match indicator.

Illegitimate uses: decoration · section headers · every button on a page ·
background washes · anything that appears more than roughly **twice per screen**.

An accent used everywhere is not an accent. If a screen has five orange elements,
four of them are wrong.

### 4.3 Semantic colour

`--nz-win` `--nz-loss` `--nz-draw` `--nz-warn` `--nz-info` — full values in
[`packages/tokens/tokens.css`](../../packages/tokens/tokens.css).

**Win/loss colour applies to game outcomes only, never to money.** A balance is
not green when it rises. Money is rendered in neutral text with tabular figures,
because financial UI must read as calm rather than as a scoreboard. This is the
governing sentence (§2.1) expressed as a colour rule.

### 4.4 Contrast

Every foreground/background pair in the token set meets **WCAG AA (4.5:1)** for
body text. Notably, Duel Orange at `#FF5A2B` clears **6.2:1** against Ink but only
**3.1:1** against white — so on light grounds the accent deepens to `#CC3A14`,
and text on orange is always Ink, never white, in the dark theme.

Both themes are **fully declared**, never derived by filter or opacity.

### 4.5 Game materials, and the gold exception

**Added v1.1 · approved 2026-09-08.** §4.1 rejected gold on the grounds that
*"gold reads casino"*. That judgement stands, and this section does not reverse
it — it narrows it.

The ten-game catalogue is built as **one club, ten tables**: app chrome never
changes, the *table* does. Tables are made of **materials**, which are not UI
colours and never appear on a control:

| Token | Value | Material |
|---|---|---|
| `--nz-mat-obsidian` | `#0B0D10` | Board ground (identical to Ink) |
| `--nz-mat-emerald` | `#0E4A3C` | Table felt |
| `--nz-mat-ivory` | `#F2EDE3` | Bone, shell, light pieces |
| `--nz-mat-gold` | `#C6A867` dark / `#96793F` light | **Ceremonial only — see below** |

#### The gold rule

> **Gold marks a thing already earned. It may never appear on anything
> clickable, focusable, or rendering a currency value.**

The casino risk §4.1 identified is real, and it is a risk about *placement*, not
pigment. Casino gold decorates the **wager** — gold spin buttons, gold coin
showers, gold deposit prompts — applied *before* you act, to make you act.
Luxury gold marks the **achievement** — a hallmark, a foil seal, an engraved
trophy plate — applied *after*, because you earned it. Same pigment, opposite
ethics.

**Legitimate:** achievement crest · badge · mastery tier · rank insignia ·
tournament trophy · victory seal.

**Illegitimate, always:** any button · any link · any input · any balance, stake,
prize figure or fee · any pre-action surface · anything on the deposit or
withdrawal path.

This is enforceable rather than aspirational: `packages/tokens/tokens.css`
carries a guard that neutralises `.nz-earned` on interactive elements, and design
review checks the rule in one pass. Gold that only ever appears on things a
player has already won cannot read as a casino floor.

Duel Orange is unaffected. It remains **the single interactive accent** (§4.2),
and gold never substitutes for it.


---

## 5. Typography

| Role | Face | Notes |
|---|---|---|
| Display | **Archivo** | Headlines, tier names. Grotesque with real presence; its geometry matches the wordmark. |
| UI | **IBM Plex Sans** | All interface text |
| Numerals | **IBM Plex Mono** | Clocks, money, ratings — anything tabular |
| Arabic | **IBM Plex Sans Arabic** | Full UI, not a fallback |

The three Plex faces are one superfamily, so Latin, Arabic, and tabular data
speak in a single voice — a coherence that four unrelated families cannot give,
and one that matters most in the Arabic UI, where a mismatched pairing is the
usual tell that a market was an afterthought.

### 5.1 The tabular rule

**Every number that represents money, time, or rating is tabular.** A clock whose
digits change width jitters; a balance that reflows reads as unstable. Both
undermine trust in a product whose core claim is that it counts correctly.

### 5.2 Arabic typography

Arabic is a first-class direction, engineered from day one, not retrofitted.

- Full RTL layout mirroring — including progress, timelines, and board orientation
  where the game permits.
- **A real Arabic face, never an auto-fallback.** Latin type with Arabic bolted on
  is the single most common way a global product signals it does not take a market
  seriously.
- **Never letter-space Arabic.** Tracking breaks connected script.
- Arabic sets slightly larger than Latin at the same optical size — the tokens
  account for this.
- Latin numerals stay LTR inside Arabic text.

---

## 6. Motion

Motion is **confirmation**, never decoration.

| Duration | Use |
|---|---|
| 90ms | State echo — press, toggle |
| 140ms | Default UI transition |
| 200ms | Entrance, reveal |
| 320ms | Rare — full-surface change |
| 480ms | **Ceremony** — achievement, badge, rating/EXP resolve |
| 720ms | **Ceremony** — tournament win, level-up. Hard ceiling |

**On the two ceremony tiers (added v1.1, approved 2026-09-08).** Everything that
*confirms* an action stays at 320ms or below — that ceiling is unchanged and is
the rule for the whole product. The two tiers above exist for a narrower case: a
moment the player actually **earned** needs long enough to be witnessed. They are
fenced accordingly, and the fence is the point:

- permitted **only** on the ceremony plane (result, achievement, badge, level-up);
- **only** after a server-confirmed result — never on an optimistic UI state;
- **never** on a money surface, in either direction.

A deposit gets a receipt, not a flourish. See §6's forbidden list, which is
unchanged and still governs.

Principles:
- **Fast and physical.** If motion delays comprehension, it is wrong.
- **Motion confirms an action landed.** A move snaps; a result resolves; a clock
  ticks. That is the whole vocabulary.
- **`prefers-reduced-motion` is honoured everywhere**, and removing motion never
  removes meaning.

**Forbidden outright:** slot-machine spins · coin showers · confetti on a deposit
· pulsing deposit buttons · countdown pressure on a financial action · anything
that celebrates money moving rather than skill winning.

Celebrate the **result**, never the **transaction**.

---

## 7. Voice

**Direct. Confident. Never hyped.** Short sentences. Second person. No exclamation
marks in product UI.

| Say | Never say |
|---|---|
| "Your move." | "BET NOW!" |
| "Prove your skill." | "Win big today!" |
| "Challenge anyone." | "Easy money" |
| "Two players. One truth." | "Guaranteed returns" |
| "One duel is enough." | "Don't miss out" |
| "You lost this one. Rematch?" | "Chase it back" |

### 7.1 Taglines

| | |
|---|---|
| **Primary (EN)** | **Your duel. Your proof.** |
| **Primary (AR)** | **نزال واحد يكفي** — *One duel is enough.* |
| Alternates (EN) | *Prove it in one duel.* · *Two players. One truth.* · *Challenge anyone.* |
| Alternate (AR) | **أثبت مهارتك** — *Prove your skill.* |

### 7.2 Talking about money

- Always show **asset and network together**: `USDT — TRON (TRC20)`. Never just
  "USDT".
- State fees **before** an action, never after.
- Never imply that winning is likely, typical, or guaranteed.
- Never use loss-chasing language. A player who just lost is shown a rematch, a
  rating change, and nothing else.
- Withdrawal state is always visible and always truthful, including when it is
  under review.

### 7.3 Talking about losing

Losing is the majority experience in any 1v1 product, and how the brand handles it
determines retention more than any win screen. The rule: **a loss is information,
not a wound.** Show what changed (rating, what the opponent did better, the
rematch button). Never console, never taunt, never upsell.

---

## 8. Product surfaces

Primary navigation is fixed: **PLAY · RANK · TOURNAMENT · LEARN**

**Cash Games are a section, not the homepage.** The homepage leads with games,
quick match, tournaments, ranking, achievements, friends, learning, and the daily
challenge. This is a business rule as much as an ethical one: a homepage leading
with money converts a narrow, high-risk, regulator-attracting audience and repels
the large one that sustains a skill platform.

### 8.1 Forbidden patterns

Per section 38 of the founding mandate, and enforced at design review:

- No fake urgency or countdown pressure on financial actions.
- No hidden fees. Ever.
- No deceptive prize claims.
- No dark patterns in deposit, withdrawal, or account-closure flows.
- **Account closure and self-exclusion must be as easy as sign-up.**
- No mechanic that pressures a losing user to deposit.

---

## 9. Applying the brand

**Do:** generous negative space · one accent per screen · tabular numbers
everywhere they belong · real players and real focus in imagery · calm money UI ·
full RTL parity.

**Don't:** neon gradients · gold coins · dice, cards, or chips · stock crypto
imagery · five competing accents · script logos · slab-serif "casino" faces ·
flashing balances · "YOU WON!" modals.

---

## 10. Outstanding before public launch

| # | Item | Owner |
|---|---|---|
| B1 | Trademark clearance — classes 9, 41, 36 (USPTO, EUIPO, WIPO, SAIP, UAE, Egypt) | Counsel |
| B2 | Arabic native-speaker review across Gulf, Levantine, Egyptian dialects | Founder |
| ~~B3~~ | ~~Register `nizalo.com`~~ — **acquired via Hostinger, 2026-09-06.** Still open: `.app`, `.games`, and defensive `nizzal.com` / `nizally.com` / `nizalar.com` | Founder |
| B4 | Manual `.gg` check at a registrar (no reliable RDAP exists) | Founder |
| B5 | Social handle acquisition — X, Instagram, TikTok, YouTube, Discord, Telegram | Founder |
| B6 | Arabic wordmark drawn as outlines by a type designer | Design |
| B7 | Licence the four typefaces for web + app embedding | Founder |

**Flag for counsel:** *Nizoral* (an antifungal brand, Johnson & Johnson) is the
nearest phonetic neighbour found. Different classes, different spelling, different
stress — assessed as low risk, but it should be raised explicitly rather than
discovered later.
