import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createSeegaAiAdapter, Difficulty } from "../src/ai.mjs";
import { SeegaPlugin } from "../src/plugin.mjs";
import { SEAT_0, SEAT_1, CENTER, PIECES_PER_SIDE, Phase, pieceFor } from "../src/seega.mjs";

function fresh() {
  return SeegaPlugin.createChallenge(null, {}).state;
}

describe("chooseAction during placement -- always legal", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the placement it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createSeegaAiAdapter();
      const state = fresh();
      const intent = ai.chooseAction(state, SEAT_0, difficulty, 500, "seed-open-1");
      const res = SeegaPlugin.applyIntent(state, intent, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${JSON.stringify(intent)} must be legal: ${res.reason}`);
    });
  }
});

describe("EXPERT placement prefers squares adjacent to the center", () => {
  test("the very first EXPERT placement touches the center", () => {
    const ai = createSeegaAiAdapter();
    const state = fresh();
    const intent = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 500, "seed-center");
    const centerNeighbors = [7, 11, 13, 17];
    assert.ok(centerNeighbors.includes(intent.place), `expected a center-adjacent square, got ${intent.place}`);
  });
});

describe("chooseAction during movement -- always legal, prefers a capture", () => {
  function movementStateWithCapture() {
    const board = new Int8Array(25);
    board[0] = pieceFor(SEAT_0);
    board[1] = pieceFor(SEAT_1);
    board[7] = pieceFor(SEAT_0); // can slide to 2, flanking idx1
    board[20] = pieceFor(SEAT_0); // an alternative, non-capturing move
    return { phase: Phase.MOVEMENT, board, turn: SEAT_0, placedCount: [12, 12], plySinceCapture: 0, history: [], moves: [] };
  }

  test("EXPERT takes the available capture over a quiet move", () => {
    const ai = createSeegaAiAdapter();
    const state = movementStateWithCapture();
    const intent = ai.chooseAction(state, SEAT_0, Difficulty.EXPERT, 500, "seed-capture");
    assert.deepEqual(intent, { from: 7, to: 2 });
  });

  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the movement it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createSeegaAiAdapter();
      const state = movementStateWithCapture();
      const intent = ai.chooseAction(state, SEAT_0, difficulty, 500, "seed-move-1");
      const res = SeegaPlugin.applyIntent(state, intent, { seat: SEAT_0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${JSON.stringify(intent)} must be legal: ${res.reason}`);
    });
  }
});

describe("EXPERT is deterministic given the same seed", () => {
  test("two EXPERT adapters given identical state and seed choose the identical action", () => {
    const ai = createSeegaAiAdapter();
    const s1 = fresh(), s2 = fresh();
    const a1 = ai.chooseAction(s1, SEAT_0, Difficulty.EXPERT, 500, "seed-det");
    const a2 = ai.chooseAction(s2, SEAT_0, Difficulty.EXPERT, 500, "seed-det");
    assert.deepEqual(a1, a2);
  });
});

describe("a full self-play game between two EXPERT adapters always terminates cleanly", () => {
  test("plays through placement and movement to a real outcome, never an illegal action", () => {
    const ai = createSeegaAiAdapter();
    let state = fresh();
    let seat = SEAT_0;
    for (let i = 0; i < PIECES_PER_SIDE * 2; i++) {
      const intent = ai.chooseAction(state, seat, Difficulty.EXPERT, 500, "seed-selfplay-place");
      const res = SeegaPlugin.applyIntent(state, intent, { seat, serverTimeMs: 0 });
      assert.equal(res.ok, true, `placement ${i}: ${JSON.stringify(intent)} must be legal: ${res.reason}`);
      state = res.state;
      seat = state.turn;
    }
    assert.equal(state.phase, Phase.MOVEMENT);

    for (let i = 0; i < 500; i++) {
      const outcome = SeegaPlugin.evaluate(state);
      if (outcome) {
        assert.ok(["ALL_CAPTURED", "NO_LEGAL_MOVES", "FORTY_MOVE_RULE", "THREEFOLD_REPETITION"].includes(outcome.reason));
        return;
      }
      const intent = ai.chooseAction(state, state.turn, Difficulty.EXPERT, 500, "seed-selfplay-move");
      const res = SeegaPlugin.applyIntent(state, intent, { seat: state.turn, serverTimeMs: i * 100 });
      assert.equal(res.ok, true, `move ${i}: ${JSON.stringify(intent)} must be legal: ${res.reason}`);
      state = res.state;
    }
    // 500 plies without a natural conclusion is itself acceptable -- the
    // 80-ply no-capture rule guarantees a draw well before this, so
    // reaching here would itself indicate a problem.
    assert.fail("game did not terminate within 500 movement-phase plies");
  });
});
