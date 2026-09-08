# Anti-Cheat & Fair Play Architecture

**Governing rule (section 20):** *never one signal = ban.*

```
Signals -> Risk Score -> Evidence -> Case -> Review -> Decision -> Appeal
```

---

## 1. The Fair Play Engine

One universal engine. Games contribute **signals**; only the engine produces
**scores**; only the case system produces **decisions**.

```
┌──────────────────────────────────────────────────────────┐
│                    FAIR PLAY ENGINE                       │
│                                                           │
│  Universal signals            Game-specific signals        │
│  ─────────────────            ────────────────────         │
│  timing distributions         ChessPlugin: engine corr.,   │
│  input biometrics             CPL, critical positions      │
│  automation patterns          MathPlugin: answer latency   │
│  device relationships         MemoryPlugin: recall shape   │
│  account relationships        ReactionPlugin: variance     │
│  historical behaviour                                      │
│  performance anomalies                                     │
│  network signals (where lawful)                            │
│                                                           │
│                        ▼                                  │
│           SCORING (explainable, weighted, versioned)      │
│                        ▼                                  │
│              EVIDENCE BUNDLE (immutable)                  │
└──────────────────────────┬───────────────────────────────┘
                           ▼
                     CASE MANAGEMENT
                           ▼
              REVIEW -> DECISION -> APPEAL
```

**The plugin contract enforces this.** `fairPlaySignals()` returns `Signal[]` and
has no way to express a verdict. A game author *cannot* ban anyone, because the
type system does not let them.

---

## 2. Signals are evidence, never verdicts

Every signal carries:

```ts
interface Signal {
  id: string;
  kind: SignalKind;
  strength: number;          // 0..1 — how anomalous
  confidence: number;        // 0..1 — how much we trust this measurement
  observedValue: unknown;    // the actual measurement
  baseline: unknown;         // what was expected, and from which population
  explanation: string;       // human-readable, shown to reviewers
  detectorVersion: number;
}
```

`explanation` is mandatory. A signal a reviewer cannot understand is a signal that
will produce an unjustifiable ban, and an unjustifiable ban is worse for the
business than the cheat it was meant to stop.

---

## 3. Chess-specific detection

The hardest problem in the product. Free engines exceed every human, so detection
is **statistical and probabilistic — never certain**.

| Signal | What it measures | Why it is not sufficient alone |
|---|---|---|
| **Engine correlation** | Match rate against top engine choices at fixed depth | Strong players naturally match on forced/obvious moves |
| **ACPL** | Average centipawn loss vs. optimal | Varies hugely by position type and time control |
| **Critical-position accuracy** | Performance on only-move and hard positions | The most discriminating signal — humans degrade here, engines do not |
| **Move-time distribution** | Variance and shape of thinking time | Humans show characteristic variance; assistance flattens it. Uniform timing on positions of wildly different difficulty is the single loudest signal |
| **Rating-performance delta** | Performance vs. established rating and RD | Improvement is real; sudden discontinuity is not |
| **Longitudinal consistency** | Behaviour across the account's history | Requires history — weak for new accounts |
| **Selective assistance** | Engine-like play *only* in critical or high-value games | The sophisticated cheater's pattern, and the reason single-game analysis is inadequate |

**Two operating rules:**

1. **Never act on a single game.** Sophisticated cheating is selective; naive
   single-game thresholds catch only the naive and produce false positives on
   strong players having a good day.
2. **Thresholds come from labelled data, not intuition.** Threat model R2 is open
   precisely because we do not yet have that data. Until we do, chess detection
   produces cases for human review and **no automated sanctions**.

---

## 4. Non-chess game detection

For Speed Math, Memory, Pattern, Reaction, and Precision the adversary is a
**script**, not an engine. The defence is different and, in some ways, stronger.

| Layer | Mechanism |
|---|---|
| **Design** | Server-generated, unpredictable challenges (section 7). The client cannot precompute what it has not received |
| **Input biometrics** | Inter-keystroke intervals, touch pressure and contact area, pointer kinematics, micro-corrections. Human input has a distinctive noise signature |
| **Impossibility bounds** | Response faster than human physiology permits, given measured network latency |
| **Consistency analysis** | **Near-zero variance is the tell.** Humans cannot produce metronomic timing; scripts struggle to fake convincing variance |
| **Difficulty response** | Human performance degrades with difficulty; a script's does not, or degrades in the wrong shape |

**Reaction and Precision remain the weakest games** (threat model R1). If the
latency-oracle problem cannot be bounded, they ship free-play only. That decision
is a Gate 3 condition, not an afterthought.

---

## 5. Anti-collusion (section 21)

Collusion is modelled as a **graph problem**, because it is one.

**Nodes:** accounts, devices, IP/ASN, payment instruments, deposit addresses.
**Edges:** shared device, shared network, shared funding, repeated pairing,
value flow, referral relationship, temporal co-presence.

Detected patterns:

| Pattern | Signature |
|---|---|
| **Chip dumping** | Persistently one-directional value flow between a pair or ring |
| **Repeated intentional loss** | Resignations or blunders inconsistent with demonstrated skill |
| **Abnormal pairing** | Two accounts meeting far more often than the matchmaking distribution allows |
| **Ring structures** | Cycles in the value-flow graph — money returning to its origin through intermediaries |
| **Synchronised behaviour** | Correlated login, queue, and play timing |
| **Tournament manipulation** | Coordinated results affecting standings or prize distribution |

Two implementation notes:

1. **Abnormal pairing is computable exactly.** We control matchmaking, so we know
   the probability that any two accounts meet N times. A pairing frequency far
   outside that distribution is arithmetic, not suspicion.
2. **Private and friend challenges bypass rating bands but not this engine.**
   Direct challenge is the primary collusion vector and is scored accordingly.

Collusion detection is simultaneously an **AML control** — deliberate losses are
value transfer.

---

## 6. Case management

```
SIGNALS -> SCORE -> [threshold] -> CASE_OPENED
   -> AUTO_ACTION (only for high-confidence, low-ambiguity classes)
   -> HUMAN_REVIEW  -> DECISION -> NOTIFY -> APPEAL -> FINAL
```

| Property | Requirement |
|---|---|
| Evidence bundle | Immutable snapshot: signals, replays, graph context, detector versions. Reconstructible later |
| Reviewer independence | The reviewer sees evidence, not the score alone — the score must not anchor the judgement |
| Proportionate outcomes | Warning · rating correction · cash-tier restriction · duel void · account restriction · permanent closure |
| **Appeal** | Mandatory, reviewed by someone other than the original decider |
| Reversibility | Every sanction is reversible, and reversal is a first-class, audited flow |
| Fund handling | Funds held during review are **held**, never confiscated without a final decision |

### 6.1 What may be automated

| Class | Auto-action? |
|---|---|
| Physically impossible input (faster than human reaction) | **Yes** — void the duel, open a case |
| Protocol violation / malformed intent | **Yes** — reject and log |
| Confirmed multi-account self-play (same device, same session, both sides) | **Yes** — void and restrict |
| Statistical engine correlation | **No** — case only, always human |
| Collusion graph anomaly | **No** — case only, always human |
| Input-biometric anomaly | **No** — case only, always human |

**Everything statistical requires a human.** This is the line, and it does not
move for throughput.

---

## 7. Deterrence and transparency

- **Publish the Fair Play Policy.** Users must know what is prohibited and what
  happens when it is detected.
- **Do not publish detection thresholds.** Publishing them is publishing the
  evasion guide.
- **Communicate outcomes.** A sanctioned user learns the category of the finding,
  though not the detector internals.
- **Report honestly.** Cheat rate is a tracked metric (section 39). A platform that
  claims zero cheating is either lying or not looking, and users know it.

---

## 8. Open items

| # | Item | Blocks |
|---|---|---|
| A1 | Labelled dataset for chess detection tuning | Any automated chess sanction (Gate 8) |
| A2 | Latency-oracle bound for Reaction/Precision | Cash tiers for those games (Gate 3) |
| A3 | Input-biometric capture design (privacy-reviewed, disclosed) | Phase 3 |
| A4 | Graph store selection for the collusion engine | Phase 4 |
| A5 | Reviewer staffing model and SLA | Phase 9 |
