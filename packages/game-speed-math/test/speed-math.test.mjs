/**
 * Speed Math, and with it the plugin boundary.
 *
 * The claim under test is not "this game works" but "the engine did not have to
 * learn anything about arithmetic to run it". Every test that touches the
 * engine uses the same functions chess uses.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SpeedMathPlugin, DEFAULT_CONFIG } from "../src/plugin.mjs";
import { ChessPlugin } from "../../game-chess/src/plugin.mjs";
import {
  createDuel, start, runIntent, resign, claimTimeout, registerPlugin,
  serializeReplay, verifyReplay, replayHash, DuelState, TurnModel, projectClock,
} from "../../duel-engine/src/duel.mjs";

const CONFIG = { ...DEFAULT_CONFIG, durationMs: 60_000, questionCount: 20 };

function duel({ now = 0, config = CONFIG, seed = "seed-1" } = {}) {
  const d = createDuel({
    duelId: "sm-1", plugin: SpeedMathPlugin, players: ["alice", "bob"],
    seed, config, timeControl: { durationMs: config.durationMs }, now,
  });
  return start(d, now);
}

/** Answer correctly for a seat, using the server's own question set. */
function correctAnswer(d, seat) {
  const p = d.state.progress[seat];
  return d.state.questions[p.index].answer;
}

const play = (d, seat, answer, t) =>
  runIntent(d, SpeedMathPlugin, { playerId: d.players[seat], intent: { answer } }, t);

// ---------------------------------------------------------------------------

describe("the challenge is generated server-side and is unpredictable", () => {
  test("the same seed produces the same questions", async () => {
    const a = SpeedMathPlugin.createChallenge("seed-x", CONFIG);
    const b = SpeedMathPlugin.createChallenge("seed-x", CONFIG);
    assert.deepEqual(a.state.questions, b.state.questions);
  });

  test("different seeds produce different questions", () => {
    const a = SpeedMathPlugin.createChallenge("seed-x", CONFIG);
    const b = SpeedMathPlugin.createChallenge("seed-y", CONFIG);
    assert.notDeepEqual(a.state.questions, b.state.questions);
  });

  test("the seed is never published to the client", () => {
    const c = SpeedMathPlugin.createChallenge("secret-seed", CONFIG);
    assert.equal(c.publicSeed, null,
      "a client holding the seed could generate every question in advance");
  });

  test("both players get the IDENTICAL question set", () => {
    // Section 7: both players receive equivalent challenges. Here they receive
    // the same one, which is the strongest form of that.
    const { state } = SpeedMathPlugin.createChallenge("fair", CONFIG);
    const forAlice = SpeedMathPlugin.project(state, "alice", 0);
    const forBob = SpeedMathPlugin.project(state, "bob", 1);
    assert.deepEqual(forAlice.current, forBob.current);
  });

  test("every generated question is arithmetically correct", () => {
    const { state } = SpeedMathPlugin.createChallenge("check", { ...CONFIG, questionCount: 200 });
    for (const q of state.questions) {
      const expected = q.op === "+" ? q.a + q.b : q.op === "-" ? q.a - q.b : q.a * q.b;
      assert.equal(q.answer, expected, `bad question: ${q.a}${q.op}${q.b}`);
      if (q.op === "-") assert.ok(q.answer >= 0, "subtraction must not go negative");
    }
  });
});

describe("projection withholds what the client has not earned", () => {
  test("a player never sees the answer", () => {
    const { state } = SpeedMathPlugin.createChallenge("s", CONFIG);
    const view = SpeedMathPlugin.project(state, "alice", 0);
    assert.equal(view.current.answer, undefined);
    assert.equal(JSON.stringify(view).includes('"answer"'), false);
  });

  test("a player never sees a future question", () => {
    const { state } = SpeedMathPlugin.createChallenge("s", CONFIG);
    const view = SpeedMathPlugin.project(state, "alice", 0);
    assert.equal(view.current.index, 0);
    assert.equal(view.questions, undefined, "the set itself must never go on the wire");
  });

  test("a player never sees the seed", () => {
    const { state } = SpeedMathPlugin.createChallenge("very-secret", CONFIG);
    const view = SpeedMathPlugin.project(state, "alice", 0);
    assert.equal(JSON.stringify(view).includes("very-secret"), false);
  });

  test("a spectator sees scores and no question content at all", () => {
    // A spectator could be the opponent on a second device.
    const { state } = SpeedMathPlugin.createChallenge("s", CONFIG);
    const view = SpeedMathPlugin.project(state, "spectator");
    assert.ok(view.scores);
    assert.equal(view.current, undefined);
    assert.equal(view.you, undefined);
  });

  test("the projection advances only as the player answers", () => {
    const d = duel();
    assert.equal(SpeedMathPlugin.project(d.state, "alice", 0).current.index, 0);
    play(d, 0, correctAnswer(d, 0), 1000);
    assert.equal(SpeedMathPlugin.project(d.state, "alice", 0).current.index, 1);
    assert.equal(SpeedMathPlugin.project(d.state, "bob", 1).current.index, 0,
      "one player answering does not advance the other");
  });
});

describe("simultaneous play — the engine has no turns here", () => {
  test("either player may answer at any time", () => {
    const d = duel();
    assert.equal(play(d, 1, correctAnswer(d, 1), 500).ok, true, "bob first");
    assert.equal(play(d, 0, correctAnswer(d, 0), 600).ok, true, "then alice");
    assert.equal(play(d, 1, correctAnswer(d, 1), 700).ok, true, "bob again, out of any turn order");
  });

  test("NOT_YOUR_TURN cannot happen in a simultaneous game", () => {
    const d = duel();
    for (let i = 0; i < 6; i++) {
      const seat = i % 3 === 0 ? 0 : 1;
      const res = play(d, seat, correctAnswer(d, seat), 100 * i);
      assert.notEqual(res.reason, "NOT_YOUR_TURN");
    }
  });

  test("the clock is one shared deadline, not two", () => {
    const d = duel();
    const view = projectClock(d, 15_000);
    assert.equal(view.model, "SHARED");
    assert.equal(view.remainingMs, 45_000);
    assert.equal(view.durationMs, 60_000);
  });

  test("a non-participant cannot answer", () => {
    const d = duel();
    const res = runIntent(d, SpeedMathPlugin, { playerId: "eve", intent: { answer: 4 } }, 100);
    assert.equal(res.reason, "MALFORMED");
  });
});

describe("intents carry an answer and nothing else", () => {
  test("a well-formed answer is accepted", () => {
    const d = duel();
    assert.equal(play(d, 0, correctAnswer(d, 0), 800).ok, true);
  });

  test("a wrong answer is counted, not rejected", () => {
    const d = duel();
    const res = play(d, 0, correctAnswer(d, 0) + 1, 800);
    assert.equal(res.ok, true);
    assert.equal(d.state.progress[0].wrong, 1);
    assert.equal(d.state.progress[0].correct, 0);
  });

  test("a forged score field is refused", () => {
    // The same guarantee as the socket protocol, at the plugin layer: there is
    // no field in which a client asserts an outcome.
    const d = duel();
    for (const bad of [
      { answer: 4, correct: true },
      { answer: 4, score: 999 },
      { answer: 4, questionIndex: 19 },
      { answer: 4, elapsedMs: 1 },
    ]) {
      const res = runIntent(d, SpeedMathPlugin, { playerId: "alice", intent: bad }, 100);
      assert.equal(res.reason, "MALFORMED", `accepted ${JSON.stringify(bad)}`);
    }
  });

  test("malformed intents are refused without touching state", () => {
    const d = duel();
    for (const bad of [null, "4", 4, {}, { answer: "4" }, { answer: 1.5 }, []]) {
      const res = runIntent(d, SpeedMathPlugin, { playerId: "alice", intent: bad }, 100);
      assert.equal(res.ok, false);
    }
    assert.equal(d.state.progress[0].index, 0);
  });

  test("a client cannot skip ahead or re-answer — the server owns the index", () => {
    const d = duel();
    play(d, 0, correctAnswer(d, 0), 500);
    assert.equal(d.state.progress[0].index, 1);
    // There is no way to express "answer question 0 again".
    play(d, 0, correctAnswer(d, 0), 600);
    assert.equal(d.state.progress[0].index, 2, "the server advances, always forward");
  });

  test("applyIntent is pure", () => {
    const { state } = SpeedMathPlugin.createChallenge("pure", CONFIG);
    const before = JSON.stringify(state.progress);
    SpeedMathPlugin.applyIntent(state, { answer: state.questions[0].answer }, { seat: 0, serverTimeMs: 1 });
    assert.equal(JSON.stringify(state.progress), before);
  });
});

describe("scoring and expiry", () => {
  test("more correct answers wins", () => {
    const d = duel();
    let t = 0;
    for (let i = 0; i < 5; i++) play(d, 0, correctAnswer(d, 0), (t += 500));
    for (let i = 0; i < 3; i++) play(d, 1, correctAnswer(d, 1), (t += 500));
    const outcome = SpeedMathPlugin.outcomeOnExpiry(d.state);
    assert.equal(outcome.result, "1-0");
    assert.equal(outcome.reason, "TIME_EXPIRED");
  });

  test("equal scores break on total answering time", () => {
    const d = duel();
    // Alice answers three, fast. Bob answers three, slowly.
    play(d, 0, correctAnswer(d, 0), 1000);
    play(d, 0, correctAnswer(d, 0), 1500);
    play(d, 0, correctAnswer(d, 0), 2000);
    play(d, 1, correctAnswer(d, 1), 1000);
    play(d, 1, correctAnswer(d, 1), 6000);
    play(d, 1, correctAnswer(d, 1), 12000);
    const outcome = SpeedMathPlugin.outcomeOnExpiry(d.state);
    assert.equal(outcome.result, "1-0");
    assert.match(outcome.reason, /TIEBREAK_TIME/);
  });

  test("a genuine tie is a draw", () => {
    const d = duel();
    assert.equal(SpeedMathPlugin.outcomeOnExpiry(d.state).result, "1/2-1/2");
  });

  test("the shared deadline scores the game — nobody forfeits", () => {
    const d = duel();
    play(d, 0, correctAnswer(d, 0), 1000);
    const res = claimTimeout(d, SpeedMathPlugin, 60_001);
    assert.equal(res.ok, true);
    assert.equal(d.outcome.reason, "TIME_EXPIRED");
    assert.equal(d.outcome.result, "1-0", "scored on progress, not awarded on a flag");
    assert.equal(d.status, DuelState.COMPLETED);
  });

  test("an answer after the deadline ends the duel instead of counting", () => {
    const d = duel();
    play(d, 0, correctAnswer(d, 0), 1000);
    const late = play(d, 1, correctAnswer(d, 1), 61_000);
    assert.equal(late.completed, true);
    assert.equal(d.state.progress[1].index, 0, "the late answer did not count");
  });

  test("answering every question ends the duel early", () => {
    const d = duel({ config: { ...CONFIG, questionCount: 3 } });
    let t = 0;
    for (let i = 0; i < 3; i++) play(d, 0, correctAnswer(d, 0), (t += 400));
    for (let i = 0; i < 3; i++) {
      const res = play(d, 1, correctAnswer(d, 1), (t += 400));
      if (i === 2) assert.equal(res.completed, true);
    }
    assert.equal(d.outcome.reason, "ALL_ANSWERED");
  });

  test("resignation still works, as it does for every game", () => {
    const d = duel();
    const res = resign(d, "bob", 5000);
    assert.equal(res.ok, true);
    assert.equal(d.outcome.result, "1-0");
    assert.equal(d.outcome.reason, "RESIGNATION");
  });
});

describe("automation signals", () => {
  function timedRun(gaps) {
    const d = duel({ config: { ...CONFIG, questionCount: 40 } });
    let t = 0;
    for (const gap of gaps) play(d, 0, correctAnswer(d, 0), (t += gap));
    return d;
  }

  test("sub-human response times raise an IMPOSSIBLE_INPUT signal", () => {
    const d = timedRun(Array.from({ length: 12 }, () => 80));
    const signals = SpeedMathPlugin.fairPlaySignals(d.state, { seat: 0 });
    const impossible = signals.find((s) => s.kind === "IMPOSSIBLE_INPUT");
    assert.ok(impossible, "80ms per answer is below the human floor");
    assert.equal(impossible.confidence, 1, "physical impossibility, not an inference");
    assert.ok(impossible.explanation.length > 40);
  });

  test("metronomic timing raises an AUTOMATION signal", () => {
    const d = timedRun(Array.from({ length: 20 }, () => 1500));
    const signals = SpeedMathPlugin.fairPlaySignals(d.state, { seat: 0 });
    assert.ok(signals.some((s) => s.kind === "AUTOMATION"));
  });

  test("varied human timing raises nothing", () => {
    const d = timedRun([1200, 3400, 900, 5100, 1800, 2600, 7000, 1100, 4200, 1500, 900, 3300]);
    const signals = SpeedMathPlugin.fairPlaySignals(d.state, { seat: 0 });
    assert.deepEqual(signals, []);
  });

  test("a signal can never express a verdict", () => {
    const d = timedRun(Array.from({ length: 12 }, () => 80));
    for (const s of SpeedMathPlugin.fairPlaySignals(d.state, { seat: 0 })) {
      for (const key of Object.keys(s)) {
        assert.ok(!/ban|verdict|guilty|sanction|action/i.test(key), `leaked: ${key}`);
      }
    }
  });
});

describe("replay stores the seed, not the questions", () => {
  test("a replay regenerates the identical question set", () => {
    const d = duel({ seed: "replay-seed" });
    const header = SpeedMathPlugin.serializeReplay(d.state, { initialOnly: true });
    assert.equal(header.seed, "replay-seed");
    assert.equal(header.questions, undefined, "compact, and tamper-evident");

    const rebuilt = SpeedMathPlugin.rehydrate(header);
    assert.deepEqual(rebuilt.state.questions, d.state.questions);
  });

  test("a full duel re-verifies from its replay", () => {
    const d = duel({ config: { ...CONFIG, questionCount: 4 } });
    let t = 0;
    for (let i = 0; i < 4; i++) play(d, 0, correctAnswer(d, 0), (t += 700));
    for (let i = 0; i < 4; i++) play(d, 1, correctAnswer(d, 1), (t += 700));

    const replay = serializeReplay(d, SpeedMathPlugin);
    const verdict = verifyReplay(replay, SpeedMathPlugin);
    assert.equal(verdict.valid, true, verdict.error);
    assert.equal(verdict.derived.reason, "ALL_ANSWERED");
  });

  test("the hash does not depend on when the duel was played", () => {
    const build = (startAt) => {
      const d = createDuel({
        duelId: "sm-1", plugin: SpeedMathPlugin, players: ["alice", "bob"],
        seed: "h", config: { ...CONFIG, questionCount: 3 },
        timeControl: { durationMs: 60_000 }, now: startAt,
      });
      start(d, startAt);
      let t = startAt;
      for (let i = 0; i < 3; i++) play(d, 0, correctAnswer(d, 0), (t += 500));
      for (let i = 0; i < 3; i++) play(d, 1, correctAnswer(d, 1), (t += 500));
      return replayHash(serializeReplay(d, SpeedMathPlugin));
    };
    assert.equal(build(0), build(1_764_000_000_000));
  });
});

describe("the plugin boundary held", () => {
  test("speed math registers against the same contract as chess", () => {
    const registry = new Map();
    registerPlugin(registry, ChessPlugin);
    registerPlugin(registry, SpeedMathPlugin);
    assert.equal(registry.size, 2);
  });

  test("a simultaneous game must say how expiry is scored", () => {
    // Chess does not need this: whoever flagged, lost. A game with no turns has
    // no losing mover, so the engine refuses one that has not said.
    const broken = { ...SpeedMathPlugin, id: "broken" };
    delete broken.outcomeOnExpiry;
    assert.throws(() => registerPlugin(new Map(), broken), /must implement outcomeOnExpiry/);
  });

  test("an unknown turn model is refused at registration", () => {
    assert.throws(
      () => registerPlugin(new Map(), { ...SpeedMathPlugin, id: "odd", turnModel: "PSYCHIC" }),
      /unknown turnModel/
    );
  });

  test("chess keeps its alternating model", () => {
    assert.equal(ChessPlugin.turnModel ?? TurnModel.ALTERNATING, TurnModel.ALTERNATING);
    assert.equal(SpeedMathPlugin.turnModel, TurnModel.SIMULTANEOUS);
  });

  test("the engine ran a second game without learning any arithmetic", () => {
    // The honest version of this claim: every engine function used below is the
    // same one chess uses, and none of them knows what a question is.
    const d = duel({ config: { ...CONFIG, questionCount: 2 } });
    assert.equal(d.gameId, "speed-math");
    assert.equal(d.turnModel, "SIMULTANEOUS");
    play(d, 0, correctAnswer(d, 0), 500);
    play(d, 0, correctAnswer(d, 0), 900);
    play(d, 1, correctAnswer(d, 1), 1200);
    const last = play(d, 1, correctAnswer(d, 1), 1600);
    assert.equal(last.completed, true);
    assert.equal(d.status, DuelState.COMPLETED);
  });
});
