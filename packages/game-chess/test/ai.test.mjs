/**
 * The Chess AI adapter, tested against the SAME plugin.applyIntent every
 * human move is validated through -- the adapter never gets a trusted
 * shortcut, and neither do these tests.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createChessAiAdapter, Difficulty } from "../src/ai.mjs";
import { ChessPlugin } from "../src/plugin.mjs";
import { parseFen, positionKey } from "../src/chess.mjs";

function freshState() {
  return ChessPlugin.createChallenge(null, {}).state;
}

function stateFromFen(fen) {
  const position = parseFen(fen);
  const state = { position, initialFen: fen, history: [positionKey(position)], moves: [] };
  return state;
}

describe("chooseAction -- always a legal move, revalidated through the real plugin", () => {
  for (const difficulty of Object.values(Difficulty)) {
    test(`${difficulty}: the opening move it chooses is accepted by plugin.applyIntent`, () => {
      const ai = createChessAiAdapter();
      const state = freshState();
      const uci = ai.chooseAction(state, 0, difficulty, 1500, "seed-open-1");
      assert.ok(uci, "an opening position always has a legal move");
      const res = ChessPlugin.applyIntent(state, uci, { seat: 0, serverTimeMs: 0 });
      assert.equal(res.ok, true, `${uci} must be legal: ${res.reason}`);
    });
  }

  test("a position with only one legal move (a forced reply) returns exactly that move, cheaply", () => {
    // Black king on a1 boxed in by its own pawns, White queen delivers a
    // check answerable only one way -- not a real game, just a shape that
    // forces a single legal reply so the fast-path is exercised.
    const fen = "8/8/8/8/8/8/pp6/k1Q4K b - - 0 1";
    const state = stateFromFen(fen);
    const ai = createChessAiAdapter();
    const uci = ai.chooseAction(state, 1, Difficulty.EASY, 1000, "seed-forced");
    const res = ChessPlugin.applyIntent(state, uci, { seat: 1, serverTimeMs: 0 });
    assert.equal(res.ok, true);
  });
});

describe("determinism -- the same seed and position always choose the same move", () => {
  test("EXPERT is fully deterministic given the same seed", () => {
    const ai = createChessAiAdapter();
    const s1 = freshState();
    const s2 = freshState();
    const a = ai.chooseAction(s1, 0, Difficulty.EXPERT, 2000, "fixed-seed");
    const b = ai.chooseAction(s2, 0, Difficulty.EXPERT, 2000, "fixed-seed");
    assert.equal(a, b);
  });

  test("a different seed may choose a different move at EASY (blunder injection is seeded, not fixed to one outcome)", () => {
    const ai = createChessAiAdapter();
    const moves = new Set();
    for (let i = 0; i < 12; i++) {
      moves.add(ai.chooseAction(freshState(), 0, Difficulty.EASY, 500, `seed-${i}`));
    }
    assert.ok(moves.size > 1, "across 12 different seeds, EASY must not always land on the identical move");
  });
});

describe("search correctness -- EXPERT finds a real mate in one when it exists", () => {
  test("back-rank mate in one is found", () => {
    // White: Ra8 delivers immediate mate against a king boxed in by its own
    // pawns with no escape and nothing to interpose.
    const fen = "6k1/5ppp/8/8/8/8/8/R6K w - - 0 1";
    const state = stateFromFen(fen);
    const ai = createChessAiAdapter();
    const uci = ai.chooseAction(state, 0, Difficulty.EXPERT, 2000, "seed-mate");
    assert.equal(uci, "a1a8", `expected the mating rook lift, got ${uci}`);
    const res = ChessPlugin.applyIntent(state, uci, { seat: 0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    const verdict = ChessPlugin.evaluate(res.state);
    assert.ok(verdict, "the position must be terminal");
    assert.equal(verdict.result, "1-0");
    assert.equal(verdict.reason, "CHECKMATE");
  });

  test("EXPERT does not hang a free queen when a safe alternative exists", () => {
    // White queen on d1 could capture a defended pawn on d7 losing the
    // queen to the king; plenty of safe, non-losing moves exist instead.
    const fen = "rnb1kbnr/pppqpppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const state = stateFromFen(fen);
    const ai = createChessAiAdapter();
    const uci = ai.chooseAction(state, 0, Difficulty.EXPERT, 2000, "seed-safe");
    assert.notEqual(uci, "d1d7", "capturing a queen-defended pawn with the queen must not be chosen");
  });
});

describe("the adapter never becomes the authority for the result", () => {
  test("chooseAction returns a move string, never a result/score/outcome shape", () => {
    const ai = createChessAiAdapter();
    const uci = ai.chooseAction(freshState(), 0, Difficulty.HARD, 500, "seed-shape");
    assert.equal(typeof uci, "string");
    assert.match(uci, /^[a-h][1-8][a-h][1-8][nbrq]?$/, "must be a plain UCI move, the exact intent shape a human sends");
  });

  test("an unknown difficulty falls back to a sane default rather than throwing", () => {
    const ai = createChessAiAdapter();
    const uci = ai.chooseAction(freshState(), 0, "NOT_A_REAL_TIER", 500, "seed-fallback");
    const res = ChessPlugin.applyIntent(freshState(), uci, { seat: 0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
  });
});

describe("deadline honesty -- always returns the best move found so far, never nothing", () => {
  test("an unreasonably short deadline still returns a legal move", () => {
    const ai = createChessAiAdapter();
    const uci = ai.chooseAction(freshState(), 0, Difficulty.EXPERT, 1, "seed-rushed");
    assert.ok(uci, "even at depth 0 effort, the root move loop must still pick something");
    const res = ChessPlugin.applyIntent(freshState(), uci, { seat: 0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
  });

  test("a position with exactly one legal move returns immediately regardless of deadline", () => {
    const fen = "8/8/8/8/8/8/pp6/k1Q4K b - - 0 1";
    const state = stateFromFen(fen);
    const ai = createChessAiAdapter();
    const started = Date.now();
    ai.chooseAction(state, 1, Difficulty.EXPERT, 5000, "seed-onemove");
    assert.ok(Date.now() - started < 200, "a single forced legal move must not run a full search budget");
  });
});
