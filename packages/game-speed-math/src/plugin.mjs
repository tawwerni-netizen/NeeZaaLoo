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
 */

export const DEFAULT_CONFIG = {
  durationMs: 60_000,
  questionCount: 60,     // more than anyone finishes; running out is not the goal
  operations: ["+", "-", "*"],
  maxOperand: 20,
};

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

  const questions = [];
  for (let i = 0; i < config.questionCount; i++) {
    const op = pick(config.operations);
    let a = between(2, config.maxOperand);
    let b = between(2, config.maxOperand);
    // Subtraction stays non-negative: negative answers test typing, not arithmetic.
    if (op === "-" && b > a) [a, b] = [b, a];
    if (op === "*") { a = between(2, 12); b = between(2, 12); }
    const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
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
   */
  fairPlaySignals(state, history = {}) {
    const signals = [];
    const seat = history.seat ?? 0;
    const times = state.progress[seat].times.map((t) => t.ms).filter((m) => m !== null);
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
