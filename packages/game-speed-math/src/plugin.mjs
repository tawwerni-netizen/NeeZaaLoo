/**
 * SpeedMathPlugin — the second game, and the real test of the plugin contract.
 *
 * It is deliberately structurally different from chess in every way that
 * matters, because an abstraction proven only against one game is not proven:
 *
 *   chess                        speed math
 *   ------------------------     -------------------------------------------
 *   alternating turns            SIMULTANEOUS -- nobody is "to move"
 *   per-player clocks            one shared deadline
 *   perfect information          the client must NOT see upcoming questions
 *   content is fixed             content is GENERATED server-side from a seed
 *   win / lose / draw            points, with a time tiebreak
 *   minutes long                 60 seconds
 *
 * Both players receive the IDENTICAL question set, generated from a seed the
 * client never receives. That is what makes the contest fair and what makes
 * "predict the next question" impossible rather than merely difficult.
 *
 * ============================================================================
 * CHALLENGE RULES: Nizalo Speed Math Challenge Rules v1
 * ============================================================================
 * Four difficulty tiers, each a fixed, versioned operand/operation profile
 * (DIFFICULTY_CONFIG below) rather than anything adaptive to how a player is
 * doing -- adaptive difficulty would make two players' "same" duel not
 * actually comparable, which is disqualifying for a rated, fair contest.
 *
 *   EASY   -- addition and subtraction only, operands up to 10.
 *   MEDIUM -- adds multiplication, operands up to 20 (multiplicands up to 12)
 *             -- this tier is also DEFAULT_CONFIG, unchanged from before
 *             difficulty tiers existed, so every duel created before this
 *             version keeps replaying identically.
 *   HARD   -- adds division, operands up to 30 (multiplicands up to 15).
 *   EXPERT -- operands up to 50 (multiplicands up to 20).
 *
 * Division questions are always constructed backward from a clean integer
 * quotient (divisor x quotient = dividend) -- there is no fractional or
 * rounded answer at any tier, ever. Subtraction stays non-negative at every
 * tier, for the same reason (a negative answer tests typing conventions,
 * not arithmetic).
 */

export const Difficulty = Object.freeze({
  EASY: "EASY", MEDIUM: "MEDIUM", HARD: "HARD", EXPERT: "EXPERT",
});

export const DEFAULT_CONFIG = {
  durationMs: 60_000,
  questionCount: 60,     // more than anyone finishes; running out is not the goal
  operations: ["+", "-", "*"],
  maxOperand: 20,
  multiplyMax: 12,
};

/** One fixed, versioned profile per tier -- see this file's own header. */
export const DIFFICULTY_CONFIG = Object.freeze({
  [Difficulty.EASY]:   { operations: ["+", "-"],           maxOperand: 10, multiplyMax: 8 },
  [Difficulty.MEDIUM]: { operations: ["+", "-", "*"],      maxOperand: 20, multiplyMax: 12 },
  [Difficulty.HARD]:   { operations: ["+", "-", "*", "/"], maxOperand: 30, multiplyMax: 15 },
  [Difficulty.EXPERT]: { operations: ["+", "-", "*", "/"], maxOperand: 50, multiplyMax: 20 },
});

/** Merge a named difficulty's profile into a config -- MEDIUM (or no
 * difficulty at all) reproduces plain DEFAULT_CONFIG exactly, so every
 * duel created before difficulty tiers existed keeps replaying identically. */
export function configForDifficulty(difficulty, overrides = {}) {
  const tier = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG[Difficulty.MEDIUM];
  return { ...DEFAULT_CONFIG, ...tier, ...overrides };
}

/**
 * Deterministic PRNG (mulberry32) over a hashed seed.
 *
 * Determinism is the whole point: the same seed must reproduce the same
 * questions on the server, in a replay, and in an audit years later. Math.random
 * would make a duel unverifiable.
 */
function rngFrom(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return function next() {
    h |= 0; h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateQuestions(seed, config) {
  const rnd = rngFrom(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const multiplyMax = config.multiplyMax ?? 12;

  const questions = [];
  for (let i = 0; i < config.questionCount; i++) {
    const op = pick(config.operations);
    let a = between(2, config.maxOperand);
    let b = between(2, config.maxOperand);
    let answer;
    if (op === "-") {
      // Subtraction stays non-negative: a negative answer tests typing
      // conventions, not arithmetic.
      if (b > a) [a, b] = [b, a];
      answer = a - b;
    } else if (op === "*") {
      a = between(2, multiplyMax);
      b = between(2, multiplyMax);
      answer = a * b;
    } else if (op === "/") {
      // Built backward from a clean integer quotient -- see this file's
      // own "CHALLENGE RULES" header: there is never a fractional or
      // rounded answer, at any tier.
      b = between(2, multiplyMax);
      answer = between(2, multiplyMax);
      a = b * answer;
    } else {
      answer = a + b;
    }
    questions.push({ a, b, op, answer });
  }
  return questions;
}

const emptyProgress = () => ({ index: 0, correct: 0, wrong: 0, totalMs: 0, times: [] });

export const SpeedMathPlugin = {
  id: "speed-math",
  version: 1,
  turnModel: "SIMULTANEOUS",

  /**
   * Server-side, seeded, deterministic, and identical for both players.
   * `publicSeed` is null: the seed never leaves the server, because a client
   * holding it could generate every question in advance.
   */
  createChallenge(seed, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const state = {
      config: cfg,
      seed: String(seed),
      questions: generateQuestions(seed, cfg),
      progress: [emptyProgress(), emptyProgress()],
      answers: [[], []],       // the replay payload
    };
    return { state, publicSeed: null };
  },

  rehydrate(initial) {
    const cfg = { ...DEFAULT_CONFIG, ...(initial.config ?? {}) };
    return {
      state: {
        config: cfg,
        seed: String(initial.seed),
        questions: generateQuestions(initial.seed, cfg),
        progress: [emptyProgress(), emptyProgress()],
        answers: [[], []],
      },
    };
  },

  /**
   * An answer to the player's CURRENT question. Pure; returns a new state.
   *
   * The intent carries an answer and nothing else. There is no field for a
   * score, a time, or which question it belongs to -- the server knows which
   * question this player is on, so a client cannot skip ahead or re-answer.
   */
  applyIntent(state, intent, ctx) {
    if (typeof intent !== "object" || intent === null) {
      return { ok: false, reason: "MALFORMED" };
    }
    const keys = Object.keys(intent);
    if (keys.length !== 1 || keys[0] !== "answer" || !Number.isInteger(intent.answer)) {
      return { ok: false, reason: "MALFORMED" };
    }

    const seat = ctx.seat;
    const next = cloneState(state);
    const p = next.progress[seat];

    if (p.index >= next.questions.length) {
      return { ok: false, reason: "NO_QUESTIONS_LEFT" };
    }

    const q = next.questions[p.index];
    const correct = intent.answer === q.answer;

    // Time is measured from the previous answer, by the SERVER. The client
    // never reports how long it took.
    const prevAt = p.times.length ? p.times[p.times.length - 1].at : null;
    const elapsed = prevAt === null ? null : ctx.serverTimeMs - prevAt;

    p.times.push({ at: ctx.serverTimeMs, ms: elapsed });
    if (elapsed !== null) p.totalMs += elapsed;
    if (correct) p.correct++; else p.wrong++;
    p.index++;

    next.answers[seat].push({ i: p.index - 1, answer: intent.answer, correct });

    return {
      ok: true,
      state: next,
      record: { seat, answer: intent.answer, correct, questionIndex: p.index - 1 },
      events: [{
        type: "ANSWER",
        // Correctness is public; the ANSWER VALUE is not echoed to the room,
        // so an opponent cannot read it off the wire and copy it.
        payload: { seat, correct, index: p.index - 1 },
      }],
    };
  },

  /** Over only when BOTH players have exhausted the set. Otherwise the clock decides. */
  evaluate(state) {
    const done = state.progress.every((p) => p.index >= state.questions.length);
    if (!done) return null;
    return outcomeFrom(state, "ALL_ANSWERED");
  },

  /** The shared deadline passed. Nobody forfeits; the position is scored. */
  outcomeOnExpiry(state) {
    return outcomeFrom(state, "TIME_EXPIRED");
  },

  score(state) {
    return [state.progress[0].correct, state.progress[1].correct];
  },

  /**
   * THE method this game exists to exercise.
   *
   * A player sees their own current question and their own progress. They do
   * NOT see: the answer, any future question, the seed, or their opponent's
   * question position. A spectator sees scores only -- no question content at
   * all, because a spectator could be the opponent on another device.
   */
  project(state, viewer, seat = null) {
    const scores = {
      correct: [state.progress[0].correct, state.progress[1].correct],
      answered: [state.progress[0].index, state.progress[1].index],
      total: state.questions.length,
    };

    if (viewer === "spectator" || seat === null) return { scores };

    const p = state.progress[seat];
    const q = state.questions[p.index];
    return {
      scores,
      you: { correct: p.correct, wrong: p.wrong, answered: p.index },
      // Only the current question, and only its operands -- never `answer`.
      current: q ? { a: q.a, b: q.b, op: q.op, index: p.index } : null,
    };
  },

  /**
   * Automation signals. Speed Math is trivially scriptable given screen access,
   * so the defence is not "can they see it" but "does a human produce this".
   *
   * Four independent signal KINDS, deliberately -- the Fair Play Engine's own
   * noisy-OR scoring (packages/fairplay/src/engine.mjs) rewards independent
   * kinds of evidence and does not stack repetitions of one kind, so a real
   * finding here is one that shows up more than one way:
   *   - IMPOSSIBLE_INPUT: any single answer faster than human reaction time.
   *   - AUTOMATION: metronomic timing across all answers (low variance).
   *   - PERFORMANCE_ANOMALY: a SUSTAINED answer rate across the whole
   *     session that no human keeps up regardless of per-answer variance --
   *     a script that pads each answer with slightly different (but still
   *     inhumanly short) delays would dodge AUTOMATION's variance check and
   *     IMPOSSIBLE_INPUT's per-answer floor both, but not this.
   *   - ACCURACY: near-perfect correctness that does not degrade on harder
   *     operations the way real human accuracy does -- "challenge
   *     consistency" in the literal sense: a genuine human's accuracy is
   *     NOT consistent across question difficulty, so a script's IS.
   *
   * What is deliberately NOT reimplemented here as a signal: server
   * timestamps and session integrity are not statistical evidence to
   * weigh, they are structural guarantees enforced elsewhere and already
   * unconditional -- `ctx.serverTimeMs` is the only clock this plugin
   * ever reads (a client cannot supply or influence a timestamp at all),
   * and duplicate/replayed submissions are refused by NO_QUESTIONS_LEFT
   * before ever reaching this method. Fabricating a "signal" for a
   * condition that cannot occur would be detection theatre, not defence.
   */
  fairPlaySignals(state, history = {}) {
    const signals = [];
    const seat = history.seat ?? 0;
    const rawTimes = state.progress[seat].times;
    const times = rawTimes.map((t) => t.ms).filter((m) => m !== null);
    if (times.length < 8) return signals;

    // A response faster than human perception-plus-motor time is not a fast
    // human. This one is physically certain rather than statistical.
    const impossible = times.filter((m) => m < 220).length;
    if (impossible >= 3) {
      signals.push({
        kind: "IMPOSSIBLE_INPUT",
        strength: Math.min(1, impossible / times.length + 0.5),
        confidence: 1,
        observedValue: { subThresholdAnswers: impossible, thresholdMs: 220, samples: times.length },
        baseline: { humanFloorMs: 220 },
        explanation:
          `${impossible} of ${times.length} answers arrived in under 220ms, which is ` +
          `below the floor for reading a question, computing it, and typing a reply. ` +
          `This is a physical impossibility rather than an unusually fast human.`,
        detectorVersion: 1,
      });
    }

    // Metronomic timing is the shape a script produces; humans vary with
    // question difficulty.
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const cv = Math.sqrt(times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length) / (mean || 1);
    if (cv < 0.12) {
      signals.push({
        kind: "AUTOMATION",
        strength: Math.min(1, (0.12 - cv) / 0.12),
        confidence: Math.min(1, times.length / 30),
        observedValue: { coefficientOfVariation: Number(cv.toFixed(4)), samples: times.length },
        baseline: { expectedCvAbove: 0.12 },
        explanation:
          `Answer times varied by only ${(cv * 100).toFixed(1)}% of their mean across ` +
          `${times.length} answers. Human answer times vary far more, because ` +
          `questions differ in difficulty.`,
        detectorVersion: 1,
      });
    }

    // Sustained throughput across the WHOLE session -- distinct from both
    // checks above: a script that varies each individual delay (dodging
    // AUTOMATION) while keeping every one of them just above 220ms
    // (dodging IMPOSSIBLE_INPUT) still cannot sustain a rate no human
    // keeps up for this many answers in a row.
    const sustainedMeanMs = times.reduce((a, b) => a + b, 0) / times.length;
    if (times.length >= 15 && sustainedMeanMs < 280) {
      signals.push({
        id: "speed_math.sustained_throughput",
        kind: "PERFORMANCE_ANOMALY",
        strength: Math.min(1, (280 - sustainedMeanMs) / 280),
        confidence: Math.min(1, times.length / 40),
        observedValue: { meanMs: Number(sustainedMeanMs.toFixed(1)), samples: times.length },
        baseline: { humanSustainableMeanMs: 280 },
        explanation:
          `Averaged ${sustainedMeanMs.toFixed(0)}ms per answer across ${times.length} ` +
          `answers in a row. Even a fast human cannot sustain read-compute-type ` +
          `at this rate for this long without individual answers ever slowing down.`,
        detectorVersion: 1,
      });
    }

    // Challenge consistency: real human accuracy DEGRADES on harder
    // operations (division and multiplication cost more attention than
    // addition); a script's does not. Compare per-operation accuracy only
    // when at least two operations were actually seen with enough samples
    // each to compare.
    const answers = state.answers[seat];
    const byOp = new Map();
    for (let k = 0; k < answers.length; k++) {
      const q = state.questions[answers[k].i];
      if (!q) continue;
      const bucket = byOp.get(q.op) ?? { correct: 0, total: 0 };
      bucket.total++;
      if (answers[k].correct) bucket.correct++;
      byOp.set(q.op, bucket);
    }
    const simple = byOp.get("+");
    const hard = ["*", "/"].map((op) => byOp.get(op)).filter((b) => b && b.total >= 5);
    if (simple && simple.total >= 5 && hard.length > 0) {
      const simpleAcc = simple.correct / simple.total;
      const hardAcc = hard.reduce((a, b) => a + b.correct / b.total, 0) / hard.length;
      const hardSamples = hard.reduce((a, b) => a + b.total, 0);
      if (simpleAcc >= 0.97 && hardAcc >= 0.97) {
        signals.push({
          id: "speed_math.flat_accuracy_across_difficulty",
          kind: "ACCURACY",
          strength: Math.min(1, (simpleAcc + hardAcc) / 2 - 0.5),
          confidence: Math.min(1, (simple.total + hardSamples) / 30),
          observedValue: {
            simpleAccuracy: Number(simpleAcc.toFixed(3)), simpleSamples: simple.total,
            harderAccuracy: Number(hardAcc.toFixed(3)), harderSamples: hardSamples,
          },
          baseline: { expectedAccuracyDropOnHarderOps: true },
          explanation:
            `${(simpleAcc * 100).toFixed(0)}% accuracy on addition and ` +
            `${(hardAcc * 100).toFixed(0)}% on multiplication/division across ` +
            `${simple.total + hardSamples} answers -- human accuracy normally drops on ` +
            `harder operations; near-identical near-perfect accuracy across both does not.`,
          detectorVersion: 1,
        });
      }
    }

    return signals;
  },

  /**
   * The replay stores the SEED, not the questions. Anyone re-running it
   * regenerates the identical set, which is both compact and a proof that the
   * content was never tampered with.
   */
  serializeReplay(state, { initialOnly = false } = {}) {
    const header = { seed: state.seed, config: state.config };
    return initialOnly ? header : { ...header, answers: state.answers };
  },
};

function outcomeFrom(state, reason) {
  const [a, b] = state.progress;
  if (a.correct !== b.correct) {
    return { result: a.correct > b.correct ? "1-0" : "0-1", reason };
  }
  // Equal scores: whoever spent less time answering. A genuine tie is a draw.
  if (a.totalMs !== b.totalMs && a.index > 0 && b.index > 0) {
    return { result: a.totalMs < b.totalMs ? "1-0" : "0-1", reason: `${reason}_TIEBREAK_TIME` };
  }
  return { result: "1/2-1/2", reason };
}

function cloneState(state) {
  return {
    config: state.config,
    seed: state.seed,
    questions: state.questions,          // immutable once generated
    progress: state.progress.map((p) => ({ ...p, times: [...p.times] })),
    answers: state.answers.map((a) => [...a]),
  };
}
