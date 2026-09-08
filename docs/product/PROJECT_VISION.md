# Project Vision

**Name:** **Nizalo** — locked 2026-09-06. See [BRAND_STRATEGY.md](../brand/BRAND_STRATEGY.md) and [BRAND_GUIDELINES.md](../brand/BRAND_GUIDELINES.md).
**Date:** 2026-09-06
**Owner:** universebrands.org@gmail.com

---

## 1. What this is

A **global skill duel platform**: one account, one rating ecosystem, one wallet,
one matchmaking core, one tournament engine, one trust & safety layer — with many
short-form 1v1 games behind it.

Chess is the flagship game. **Chess is not the category.**

## 2. What this is not

It is not a chess website, and it is not a betting product. Those two sentences
constrain every decision downstream, including the name, the homepage, the
information architecture, the colour palette, and the copy.

The emotional message is **never** "deposit money and gamble." It is:

> *"I want to test my skill."* -> *"I can compete."* -> *"I can improve."* ->
> *"I can climb."* -> and, only where legally permitted, *"I can compete for prizes."*

## 3. The product in one architectural sentence

A **Skill Duel Engine** with pluggable games sits on top of a shared platform
(identity, matchmaking, rating, wallet, ledger, tournaments, risk, fair play,
compliance), so that **adding a new game never requires rebuilding financial
infrastructure** (section 6).

If a future engineer has to touch the ledger to ship a new game, the architecture
has failed.

---

## 4. Game roadmap and the veto rule

| Phase | Games |
|---|---|
| 1 (flagship) | **Chess** |
| 2 | **Speed Math · Memory Grid · Pattern · Number Memory · Reaction · Precision** |
| 3 (evaluated) | Puzzle duels · Word games · Tactical challenges |

**No game ships because it is popular.** Every candidate is scored against the
twelve-criterion scorecard in [TECHNICAL_ARCHITECTURE.md](../architecture/TECHNICAL_ARCHITECTURE.md),
and a low score on *cheating risk* or *server authority* is an absolute veto that
a high total cannot override.

That veto already has teeth: **Connect Four, Checkers, and Reversi are excluded
from cash play.** Connect Four is strongly solved — a perfect engine is a weekend
project — so a cash game on it is a transfer from honest players to whoever
downloads the solver first.

---

## 5. Game design philosophy (section 7)

Prefer games where:

- both players face **equivalent** challenges,
- challenges are **generated server-side**,
- the client **cannot predict** future content,
- the server determines score, time, result, and eligibility.

Target durations for non-chess games: **20s, 30s, 60s, 2m, 5m, 10m.** Short
matches raise replayability, lower the cost of a single bad experience, and shrink
the window in which cheating pays.

---

## 6. Home experience (section 4)

Primary navigation: **PLAY · RANK · TOURNAMENT · LEARN**

The homepage leads with popular games, quick matches, tournaments, global ranking,
achievements, friends, learning, community, and daily challenges.

**Cash Games are an important section, and they must not dominate the homepage.**
This is a product rule with a business rationale, not a moral gesture: a homepage
that leads with money converts a narrow, high-risk, regulator-attracting audience
and repels the large one that sustains a skill platform. The competitive ladder is
the funnel; cash is a destination inside it.

---

## 7. Progression: the Global Skill Score

Per-game ratings (chess, math, memory, reaction, precision) roll into a single
**Global Skill Score** with tiers **Bronze -> Silver -> Gold -> Platinum -> Diamond
-> Master -> Grandmaster**.

Two rules give it integrity:
- **No single game may contribute more than 35%** of the score, no matter how much
  the player plays it. Otherwise "Global Skill Score" is just a chess rating
  wearing a costume.
- **The methodology is published.** An unexplainable ranking destroys trust faster
  than an imperfect one.

---

## 8. Growth and psychology

Growth comes from competition, identity, progress, achievement, and community —
friends, clubs, referrals, seasons, leaderboards, streaks, shareable results,
public profiles, spectating, and the daily challenge. Not from spam.

**Explicitly forbidden** (section 38): dark patterns, fake urgency, hidden fees,
deceptive prize claims, and any psychological pressure to spend. The retention
mechanics optimise for **mastery, progress, status, belonging** — motivations that
survive the user getting better, rather than motivations that require them to keep
losing money.

---

## 9. Business model

Configurable rake: standard **10–15%**, VIP **8–10%**, tournaments custom — all
driven by the Economy Rules Engine, none hardcoded (section 12).

**No profit is promised or projected as guaranteed.** The design goal is scalable
economics, operational efficiency, user trust, fairness, and long-term
sustainability. The economics only work if the platform is *trusted*, which is why
anti-cheat, the ledger, and compliance are core product, not overhead.

---

## 10. Operating model

Highly automated, running continuously, escalating sensitive cases to humans
(section 31).

**Automated:** matchmaking, tournament scheduling and pairing, game settlement,
payment monitoring, reconciliation, notifications, reports, eligible routine
payouts, health checks, backups.

**Always human:** high-risk withdrawals, suspected fraud, suspected cheating,
collusion cases, KYC anomalies, payment mismatches, and any unexplained financial
discrepancy.

---

## 11. The four things that would end this company

Stated plainly so they stay visible:

1. **A broken ledger** — if we cannot say what we owe, nothing else matters.
2. **Loss of custody** — a drained hot wallet.
3. **Loss of competitive integrity** — the day cheating becomes common knowledge.
4. **Operating where we are not permitted** — a legal, not an engineering, failure.

Every phase gate in the [ROADMAP](ROADMAP.md) is checked against these four.

---

## 12. Open founder decisions (blocking)

| # | Decision | Blocks |
|---|---|---|
| ~~D1~~ | ~~Approve the brand name~~ — **resolved: Nizalo** | — |
| D2 | Legal entity + jurisdiction + licensing counsel | All real-money features |
| D3 | Launch markets (the market matrix) | Phase 6 |
| D4 | Custody model | Phase 5 |
| D5 | Whether Reaction/Precision may ever be cash games | Phase 3 |

These are business decisions. Engineering can proceed through Phase 4 without
them, and cannot proceed past it.
