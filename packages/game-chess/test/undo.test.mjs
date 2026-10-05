import test from "node:test";
import assert from "node:assert/strict";
import { ChessPlugin } from "../src/plugin.mjs";
import { START_FEN } from "../src/chess.mjs";

test("undo: pops the last 2 moves and restores the position", () => {
  const { state } = ChessPlugin.createChallenge(1);
  assert.equal(state.moves.length, 0);

  // White moves e2e4
  const r1 = ChessPlugin.applyIntent(state, "e2e4", { seat: 0 });
  assert.equal(r1.ok, true);

  // Black moves e7e5
  const r2 = ChessPlugin.applyIntent(r1.state, "e7e5", { seat: 1 });
  assert.equal(r2.ok, true);
  assert.equal(r2.state.moves.length, 2);

  // White requests undo
  const rUndo = ChessPlugin.applyIntent(r2.state, "undo", { seat: 0 });
  assert.equal(rUndo.ok, true);
  assert.equal(rUndo.state.moves.length, 0);
  assert.equal(ChessPlugin.project(rUndo.state, "player").fen, START_FEN);
});

test("undo: refuses when nothing to undo", () => {
  const { state } = ChessPlugin.createChallenge(1);
  const rUndo = ChessPlugin.applyIntent(state, "undo", { seat: 0 });
  assert.equal(rUndo.ok, false);
  assert.equal(rUndo.reason, "NOTHING_TO_UNDO");
});
