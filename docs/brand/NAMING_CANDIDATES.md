# Naming Candidates & Live Domain Verification

**Date of domain checks:** 2026-09-06
**Method:** RDAP (Registration Data Access Protocol) — the authoritative registry
protocol. Not a search engine, not a reseller "availability" widget.

---

## 0. Verification methodology (read this before trusting any row)

| TLD | Endpoint | Trusted? | Control test |
|---|---|---|---|
| `.com` | `rdap.verisign.com/com/v1/domain/{name}` (registry, direct) | YES — authoritative | `google.com` -> 200 (registered); `qzxjw-nonexist-77123.com` -> 404 (free) |
| `.app` | `rdap.org/domain/{name}` -> Google Registry | YES — authoritative | `google.app` -> 200; nonsense -> 404 |
| `.games` | `rdap.org/domain/{name}` | YES — authoritative | `epic.games` -> 200, `riot.games` -> 200; nonsense -> 404 |
| `.gg` | `rdap.org/domain/{name}` | **NO — not trusted** | `faze.gg` -> 404 **despite being registered**. The `.gg` registry exposes no usable RDAP, so the router returns 404 for everything. |
| `.play` | — | **Not a delegated TLD** | `.play` does not exist as an open gTLD. Read section 34's mention of it as `.game` / `.games`. |

**Every `.com` marked available below was checked twice, in two separate passes,
directly against Verisign.**

Status labels, exactly as section 34 requires:

- **VERIFIED AVAILABLE** — registry RDAP returned "not found" on two passes.
- **VERIFIED UNAVAILABLE** — registry RDAP returned a registration record.
- **UNCERTAIN / REQUIRES REGISTRAR CHECK** — no trustworthy registry source exists.

> WARNING: RDAP proves *registration status only*. It does not prove the name is
> legally usable. Trademark clearance is a separate, mandatory step (section 4
> below). Availability can also change at any moment, including via registrar
> front-running after a public lookup. **No domain has been purchased** (section 34).

---

## 1. The 40 candidates, grouped

### Group A — Skill-driven

| # | Name | Meaning / root | `.com` |
|---|---|---|---|
| 1 | Skillo | skill + -o | UNAVAILABLE |
| 2 | Skilla | skill + -a | UNAVAILABLE |
| 3 | Skillara | skill + -ara | UNAVAILABLE |
| 4 | Mahara | Arabic مهارة = *skill* | UNAVAILABLE |
| 5 | **Maharra** | stylised *mahara* | **AVAILABLE** |
| 6 | Adepta | Latin *adeptus* = attained | UNAVAILABLE |
| 7 | Praxa | Greek *praxis* = practice | UNAVAILABLE |
| 8 | Aptiq | aptitude + -iq | UNAVAILABLE |

### Group B — Competitive / duel

| # | Name | Meaning / root | `.com` |
|---|---|---|---|
| 9 | **Nizalo** | Arabic نزال (*nizal*) = *duel, bout, contest* | **AVAILABLE** |
| 10 | Nizzal | phonetic *nizal* | **AVAILABLE** |
| 11 | Nizalar | *nizal* + Turkic plural | **AVAILABLE** |
| 12 | Nizally | *nizal* + -ly | **AVAILABLE** |
| 13 | Duelo | Spanish / Italian = duel | UNAVAILABLE |
| 14 | Duelly | duel + -ly | UNAVAILABLE |
| 15 | **Duelara** | duel + -ara | **AVAILABLE** |
| 16 | Rivalo | rival + -o | UNAVAILABLE |
| 17 | Kontra | counter / against | UNAVAILABLE |
| 18 | **Arenalo** | arena + -lo | **AVAILABLE** |
| 19 | Matchly | match + -ly | UNAVAILABLE |
| 20 | Versa | Latin *versus* | UNAVAILABLE |

### Group C — Energetic / speed

| # | Name | Meaning / root | `.com` |
|---|---|---|---|
| 21 | Barq | Arabic برق = *lightning* | UNAVAILABLE |
| 22 | Barqly / Barqo / Barqan / Barqin | *barq* derivatives | UNAVAILABLE |
| 23 | Blitzo | blitz + -o | UNAVAILABLE |
| 24 | Voltra | volt + -ra | UNAVAILABLE |
| 25 | Rapido | Spanish / Italian = fast | UNAVAILABLE |
| 26 | Kinetiq | kinetic + -iq | UNAVAILABLE |
| 27 | **Klashly** | clash + -ly | **AVAILABLE** |

### Group D — Premium / status

| # | Name | Meaning / root | `.com` |
|---|---|---|---|
| 28 | **Qimmara** | Arabic قمة (*qimma*) = *summit, peak* | **AVAILABLE** |
| 29 | Batal | Arabic بطل = *champion* | UNAVAILABLE |
| 30 | **Batally** | *batal* + -ly | **AVAILABLE** |
| 31 | Apexa | apex + -a | UNAVAILABLE |
| 32 | Aureo | Latin *aureus* = golden | UNAVAILABLE |
| 33 | Zenta / Zentara | zenith-adjacent coinage | UNAVAILABLE |
| 34 | Vantiq / Vertiq | vantage + -iq | UNAVAILABLE |
| 35 | Elyx / Elyxa | coined, luxury phonetics | UNAVAILABLE |

### Group E — Playful / inviting

| # | Name | Meaning / root | `.com` |
|---|---|---|---|
| 36 | **YallaDuel** | Arabic يلا (*yalla*) = *come on / go!* + duel | **AVAILABLE** |
| 37 | **YallaSkill** | *yalla* + skill | **AVAILABLE** |
| 38 | Zigzo, Miko, Kudo, Prova | playful coinages | UNAVAILABLE |

### Group F — International / coined-neutral

| # | Name | `.com` |
|---|---|---|
| 39 | Novara, Orbita, Neura, Quixa, Tactiq, Orbix, Praxio, Mindra, Kaido, Valto, Veltro, Zephyra, Lumira, Altura, Tempora, Vexal | UNAVAILABLE |
| 40 | **Maharix** | **AVAILABLE** |

### Group G — Arabic-rooted, checked and rejected on meaning

| Name | Root | Why rejected |
|---|---|---|
| Rihan / Rehan | رهان = *a bet* | Directly gambling-coded. Violates section 32. |
| Sabqa | سبق = *to get ahead* | Collides with Sabq, a major Saudi news brand. |
| Fawza | فوز = *victory* | Extremely common given name; weak as a distinctive mark. |
| Nasr | نصر = *victory* | Trademark-saturated (clubs, airlines, banks). |

---

## 2. Full verified availability set

Thirteen names cleared `.com` on two passes. The six carried forward were also
cleared on `.app` and `.games`.

| Name | `.com` | `.app` | `.games` | `.gg` |
|---|---|---|---|---|
| **Nizalo** | **REGISTERED — ours** (Hostinger, 2026-09-06) | VERIFIED AVAILABLE | VERIFIED AVAILABLE | UNCERTAIN |
| **Duelara** | VERIFIED AVAILABLE | VERIFIED AVAILABLE | VERIFIED AVAILABLE | UNCERTAIN |
| **Arenalo** | VERIFIED AVAILABLE | VERIFIED AVAILABLE | VERIFIED AVAILABLE | UNCERTAIN |
| **Klashly** | VERIFIED AVAILABLE | VERIFIED AVAILABLE | VERIFIED AVAILABLE | UNCERTAIN |
| **Qimmara** | VERIFIED AVAILABLE | VERIFIED AVAILABLE | VERIFIED AVAILABLE | UNCERTAIN |
| **Batally** | VERIFIED AVAILABLE | VERIFIED AVAILABLE | VERIFIED AVAILABLE | UNCERTAIN |
| Maharra | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |
| Maharix | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |
| Nizzal | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |
| Nizalar | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |
| Nizally | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |
| YallaDuel | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |
| YallaSkill | VERIFIED AVAILABLE | not checked | not checked | UNCERTAIN |

---

## 3. Shortlist of 10, scored

Scores are 1–5. **Multi-game fit is the heaviest criterion**: the entire point of
section 2 is that this must not be a chess name.

| # | Name | Arabic fit | EN ease | Memorable | Multi-game | TM risk (5 = low) | SEO | Domain | **Total /35** |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Nizalo** | 5 | 4 | 5 | 5 | 5 | 5 | 5 | **34** |
| 2 | **Qimmara** | 5 | 3 | 4 | 5 | 5 | 5 | 5 | **32** |
| 3 | **Duelara** | 3 | 5 | 4 | 5 | 4 | 5 | 5 | **31** |
| 4 | **Nizzal** | 5 | 3 | 4 | 5 | 5 | 4 | 5 | **31** |
| 5 | **YallaDuel** | 5 | 4 | 5 | 4 | 4 | 4 | 5 | **31** |
| 6 | **Arenalo** | 4 | 5 | 4 | 5 | 3 | 3 | 5 | **29** |
| 7 | **Maharix** | 4 | 4 | 3 | 5 | 4 | 4 | 5 | **29** |
| 8 | **Nizalar** | 4 | 3 | 3 | 5 | 5 | 4 | 5 | **29** |
| 9 | **Klashly** | 3 | 5 | 4 | 4 | 2 | 4 | 5 | **27** |
| 10 | **Batally** | 2 | 3 | 3 | 5 | 4 | 4 | 5 | **26** |

### 3.1 Three findings that changed the ranking

- **Batally — Arabic meaning collision.** The root بطل (*batal*, "champion") is
  excellent, but **بطالة** (*bitala*) means **"unemployment / idleness"**, and
  *Batally* sits phonetically on top of it. In English it also rhymes with
  *fatally* and *brutally*. A name that reads as "unemployment" in Arabic-speaking
  markets is not a risk worth taking on a skill-competition platform. **Demoted.**
- **Klashly — trademark adjacency.** "Clash" in competitive gaming runs straight
  into Supercell's *Clash of Clans* / *Clash Royale* portfolio. It is also
  combat-framing rather than skill-framing, against section 32. **Demoted.**
- **Arenalo — permanent SEO drag.** "Arena" is among the most contested tokens in
  gaming and esports. Distinctiveness is low and paid search stays expensive
  forever. Kept in the shortlist, not in the top 3.

---

## 4. Mandatory next step before committing to any name

RDAP availability is **not** legal clearance. Before purchase, run for the chosen name:

1. **USPTO TESS** — classes 9 (software), 41 (entertainment / competitions), and
   36 (financial services, because of the wallet).
2. **EUIPO eSearch** — same classes.
3. **WIPO Global Brand Database** — international coverage.
4. **MENA offices** — Saudi (SAIP), UAE (Ministry of Economy), Egypt (ITDA).
5. **Common-law use search** — app stores, GitHub, Product Hunt, Crunchbase.
6. **Social handles** — X, Instagram, TikTok, YouTube, Discord, Telegram.
   *These were NOT verified in this pass. Status: UNCERTAIN / REQUIRES MANUAL CHECK.*
7. **Arabic native-speaker review** across Gulf, Levantine, and Egyptian dialects.
   This is exactly the check that caught *Batally*.
