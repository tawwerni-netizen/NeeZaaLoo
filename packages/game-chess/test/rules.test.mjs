/**
 * Gate 2 evidence, part 2: every termination condition, and replay determinism.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseFen, toFen, adjudicate, generateMoves, makeMove, findLegalMove,
  positionKey, TERMINATION, hasInsufficientMaterial, moveToUci, START_FEN,
} from "../src/chess.mjs";
import { ChessPlugin } from "../src/plugin.mjs";
import {
  createDuel, start, runIntent, resign, claimTimeout,
  serializeReplay, verifyReplay, replayHash, registerPlugin, DuelState, Reject,
} from "../../duel-engine/src/duel.mjs";
import { createClock, applyMove, checkFlag, readClock } from "../../duel-engine/src/clock.mjs";

/** Play a list of UCI moves against a fresh position, tracking repetition keys. */
function play(fen, ucis) {
  const p = parseFen(fen);
  const history = [positionKey(p)];
  for (const u of ucis) {
    const m = findLegalMove(p, u);
    assert.ok(m !== null, `illegal move in fixture: ${u} at ${toFen(p)}`);
    makeMove(p, m);
    p.stack.length = 0;
    history.push(positionKey(p));
  }
  return { p, history };
}

describe("termination conditions", () => {
  test("checkmate — Fool's mate", () => {
    const { p, history } = play(START_FEN, ["f2f3", "e7e5", "g2g4", "d8h4"]);
    const v = adjudicate(p, history);
    assert.equal(v.over, true);
    assert.equal(v.reason, TERMINATION.CHECKMATE);
    assert.equal(v.result, "0-1", "white is mated");
  });

  test("checkmate — back rank", () => {
    const p = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    const { p: after, history } = play(toFen(p), ["a1a8"]);
    const v = adjudicate(after, history);
    assert.equal(v.reason, TERMINATION.CHECKMATE);
    assert.equal(v.result, "1-0");
  });

  test("stalemate — king with no legal move, not in check", () => {
    const p = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    const v = adjudicate(p, [positionKey(p)]);
    assert.equal(v.over, true);
    assert.equal(v.reason, TERMINATION.STALEMATE);
    assert.equal(v.result, "1/2-1/2");
    assert.equal(generateMoves(p).length, 0);
  });

  test("insufficient material — K vs K", () => {
    const p = parseFen("8/8/4k3/8/8/3K4/8/8 w - - 0 1");
    assert.equal(hasInsufficientMaterial(p), true);
    assert.equal(adjudicate(p, [positionKey(p)]).reason, TERMINATION.INSUFFICIENT_MATERIAL);
  });

  test("insufficient material — K+B vs K, and K+N vs K", () => {
    assert.equal(hasInsufficientMaterial(parseFen("8/8/4k3/8/8/3K1B2/8/8 w - - 0 1")), true);
    assert.equal(hasInsufficientMaterial(parseFen("8/8/4k3/8/8/3K1N2/8/8 w - - 0 1")), true);
  });

  test("insufficient material — same-colour bishops draw, opposite-colour do not", () => {
    // d6 and a3 are both dark squares: neither bishop can ever attack the
    // other colour complex, so no mate is possible.
    const same = parseFen("8/8/3bk3/8/8/B2K4/8/8 w - - 0 1");
    // d6 dark, f3 light: a mate exists in principle, so play continues.
    const opposite = parseFen("8/8/3bk3/8/8/3K1B2/8/8 w - - 0 1");
    assert.equal(hasInsufficientMaterial(same), true);
    assert.equal(hasInsufficientMaterial(opposite), false);
  });

  test("a pawn on the board is always sufficient material", () => {
    assert.equal(hasInsufficientMaterial(parseFen("8/8/4k3/8/8/3K4/4P3/8 w - - 0 1")), false);
  });

  test("fifty-move rule — draws at 100 half-moves", () => {
    const at99 = parseFen("8/8/4k3/8/8/3K4/4R3/8 w - - 99 60");
    assert.equal(adjudicate(at99, [positionKey(at99)]).over, false, "99 is not yet a draw");
    const at100 = parseFen("8/8/4k3/8/8/3K4/4R3/8 w - - 100 60");
    assert.equal(adjudicate(at100, [positionKey(at100)]).reason, TERMINATION.FIFTY_MOVE);
  });

  test("checkmate beats the fifty-move counter", () => {
    // A mating move delivered on the 100th half-move is mate, not a draw.
    const p = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 60");
    const { p: after, history } = play(toFen(p), ["a1a8"]);
    assert.equal(after.halfmove, 100);
    assert.equal(adjudicate(after, history).reason, TERMINATION.CHECKMATE);
  });

  test("threefold repetition — knights shuffling back and forth", () => {
    const { p, history } = play(START_FEN, [
      "g1f3", "g8f6", "f3g1", "f6g8",   // position repeats (2nd time)
      "g1f3", "g8f6", "f3g1", "f6g8",   // 3rd time
    ]);
    const v = adjudicate(p, history);
    assert.equal(v.over, true);
    assert.equal(v.reason, TERMINATION.THREEFOLD);
    assert.equal(v.result, "1/2-1/2");
  });

  test("repetition counts positions, not moves — castling rights make them distinct", () => {
    // The rook returning home restores the layout but NOT the castling right,
    // so these are different positions and must not count as a repetition.
    const shuffle = ["h1g1", "h8g8", "g1h1", "g8h8"];
    const eight = play("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", [...shuffle, ...shuffle]);

    // The starting LAYOUT has now been seen three times, but the first sighting
    // had castling rights the others do not. Only two are the same POSITION,
    // so this is not yet a threefold.
    assert.notEqual(eight.history[4], eight.history[0], "castling rights differ");
    assert.equal(eight.history[4], eight.history[8], "these two do match");
    assert.equal(adjudicate(eight.p, eight.history).over, false, "two occurrences is not three");

    // One more cycle reaches the genuine third occurrence.
    const twelve = play("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      [...shuffle, ...shuffle, ...shuffle]);
    const v = adjudicate(twelve.p, twelve.history);
    assert.equal(v.over, true);
    assert.equal(v.reason, TERMINATION.THREEFOLD);
  });
});

describe("the plugin contract", () => {
  test("chess registers as a conforming plugin", () => {
    const registry = new Map();
    registerPlugin(registry, ChessPlugin);
    assert.equal(registry.get("chess"), ChessPlugin);
  });

  test("a plugin missing a contract method is refused at registration", () => {
    const broken = { ...ChessPlugin, id: "broken" };
    delete broken.fairPlaySignals;
    assert.throws(() => registerPlugin(new Map(), broken), /missing fairPlaySignals/);
  });

  test("applyIntent is pure — the input state is not mutated", () => {
    const { state } = ChessPlugin.createChallenge(null, {});
    const before = toFen(state.position);
    const res = ChessPlugin.applyIntent(state, "e2e4", { seat: 0, serverTimeMs: 0 });
    assert.equal(res.ok, true);
    assert.equal(toFen(state.position), before, "original state must be untouched");
    assert.notEqual(toFen(res.state.position), before);
  });

  test("an illegal move is rejected as data, not thrown", () => {
    const { state } = ChessPlugin.createChallenge(null, {});
    assert.deepEqual(
      ChessPlugin.applyIntent(state, "e2e5", { seat: 0, serverTimeMs: 0 }),
      { ok: false, reason: "ILLEGAL" }
    );
  });

  test("a malformed intent is rejected without touching the rules", () => {
    const { state } = ChessPlugin.createChallenge(null, {});
    for (const bad of ["", "xx", "e2e4e5", "resign", "e9e4", "{}"]) {
      assert.equal(
        ChessPlugin.applyIntent(state, bad, { seat: 0, serverTimeMs: 0 }).reason,
        "MALFORMED",
        `should reject ${JSON.stringify(bad)}`
      );
    }
  });

  test("moving out of turn is refused by the position, not by trust", () => {
    const { state } = ChessPlugin.createChallenge(null, {});
    assert.equal(
      ChessPlugin.applyIntent(state, "e7e5", { seat: 1, serverTimeMs: 0 }).reason,
      "NOT_YOUR_TURN"
    );
  });

  test("promotion must name a piece — an ambiguous intent is illegal", () => {
    const { state } = ChessPlugin.rehydrate({ fen: "8/P6k/8/8/8/8/7K/8 w - - 0 1" });
    assert.equal(ChessPlugin.applyIntent(state, "a7a8", { seat: 0, serverTimeMs: 0 }).reason, "ILLEGAL");
    assert.equal(ChessPlugin.applyIntent(state, "a7a8q", { seat: 0, serverTimeMs: 0 }).ok, true);
    assert.equal(ChessPlugin.applyIntent(state, "a7a8n", { seat: 0, serverTimeMs: 0 }).ok, true);
  });

  test("fairPlaySignals returns evidence, and cannot express a verdict", () => {
    const { state } = ChessPlugin.createChallenge(null, {});
    const robotic = ChessPlugin.fairPlaySignals(state, { moveTimesMs: Array(30).fill(1500) });
    assert.equal(robotic.length, 1);
    assert.equal(robotic[0].kind, "TIMING");
    assert.ok(robotic[0].explanation.length > 0, "a reviewer must be able to read it");
    for (const key of Object.keys(robotic[0])) {
      assert.ok(!/ban|verdict|action|guilty/i.test(key), `signal leaked a verdict field: ${key}`);
    }
    const human = ChessPlugin.fairPlaySignals(state, {
      moveTimesMs: [800, 4200, 1100, 15000, 600, 2300, 9000, 1200, 30000, 700],
    });
    assert.equal(human.length, 0, "varied human timing raises nothing");
  });

  test("project() withholds the legal-move list from spectators", () => {
    const { state } = ChessPlugin.createChallenge(null, {});
    assert.ok(ChessPlugin.project(state, "p1").legalMoves.length === 20);
    assert.equal(ChessPlugin.project(state, "spectator").legalMoves, undefined);
  });
});

describe("the authoritative clock", () => {
  test("time is charged from server timestamps only", () => {
    const c = createClock({ initialMs: 60_000, incrementMs: 0 }, 1000);
    applyMove(c, 4000);                       // white thought for 3s
    assert.deepEqual(c.remaining, [57_000, 60_000]);
    assert.equal(c.toMove, 1);
  });

  test("increment is added after the move, not before", () => {
    const c = createClock({ initialMs: 60_000, incrementMs: 2000 }, 0);
    applyMove(c, 5000);
    assert.equal(c.remaining[0], 57_000, "60 - 5 + 2");
  });

  test("a disconnected player's clock keeps running", () => {
    // The whole point: going offline must never be a way to buy time.
    const c = createClock({ initialMs: 10_000 }, 0);
    assert.equal(checkFlag(c, 9_999).flagged, false);
    assert.equal(checkFlag(c, 10_000).flagged, true, "silence is not a defence");
  });

  test("a legal move sent after the flag does not save the player", () => {
    const c = createClock({ initialMs: 10_000 }, 0);
    const res = applyMove(c, 12_000);
    assert.equal(res.flagged, true);
    assert.equal(res.byIndex, 0);
    assert.equal(c.remaining[0], 0);
    assert.equal(c.toMove, 0, "turn does not pass on a flagged move");
  });

  test("server time moving backwards is refused, not absorbed", () => {
    const c = createClock({ initialMs: 60_000 }, 5000);
    assert.throws(() => applyMove(c, 4000), /backwards/);
  });

  test("readClock is display-only and never mutates", () => {
    const c = createClock({ initialMs: 60_000 }, 0);
    const view = readClock(c, 7500);
    assert.deepEqual(view.remaining, [52_500, 60_000]);
    assert.deepEqual(c.remaining, [60_000, 60_000], "reading must not charge time");
  });
});

describe("replay determinism — the Gate 2 requirement", () => {
  // Morphy's Opera Game, 1858. Ends in mate on move 17.
  const OPERA = [
    "e2e4", "e7e5", "g1f3", "d7d6", "d2d4", "c8g4", "d4e5", "g4f3",
    "d1f3", "d6e5", "f1c4", "g8f6", "f3b3", "d8e7", "b1c3", "c7c6",
    "c1g5", "b7b5", "c3b5", "c6b5", "c4b5", "b8d7", "e1c1", "a8d8",
    "d1d7", "d8d7", "h1d1", "e7e6", "b5d7", "f6d7", "b3b8", "d7b8", "d1d8",
  ];

  function playDuel(moves, { startAt = 0, msPerMove = 3000 } = {}) {
    const duel = createDuel({
      duelId: "duel-opera-1",
      plugin: ChessPlugin,
      players: ["morphy", "allies"],
      seed: null,
      config: {},
      timeControl: { initialMs: 600_000, incrementMs: 0 },
      now: startAt,
    });
    start(duel, startAt);
    let t = startAt;
    for (let i = 0; i < moves.length; i++) {
      t += msPerMove;
      const res = runIntent(duel, ChessPlugin,
        { playerId: duel.players[i % 2], intent: moves[i] }, t);
      assert.equal(res.ok, true, `move ${i + 1} (${moves[i]}) was rejected: ${res.reason}`);
    }
    return duel;
  }

  test("a full game plays through and ends in checkmate", () => {
    const duel = playDuel(OPERA);
    assert.equal(duel.status, DuelState.COMPLETED);
    assert.equal(duel.outcome.reason, TERMINATION.CHECKMATE);
    assert.equal(duel.outcome.result, "1-0", "Morphy mates");
    assert.equal(duel.status, DuelState.COMPLETED, "completed, NOT settled");
    assert.notEqual(duel.status, DuelState.SETTLED);
  });

  test("re-running the event log reproduces the identical result and hash", () => {
    const a = playDuel(OPERA);
    const replayA = serializeReplay(a, ChessPlugin);
    const hashA = replayHash(replayA);

    const verdict = verifyReplay(replayA, ChessPlugin);
    assert.equal(verdict.valid, true, verdict.error);
    assert.equal(verdict.derived.result, "1-0");
    assert.equal(verdict.derived.reason, TERMINATION.CHECKMATE);
    assert.equal(verdict.hash, hashA);

    // Played again at a completely different wall-clock origin: the record is
    // relative to the duel start, so the hash must be identical.
    const b = playDuel(OPERA, { startAt: 1_764_000_000_000 });
    assert.equal(replayHash(serializeReplay(b, ChessPlugin)), hashA,
      "the hash must not depend on when the game was played");
  });

  test("the hash is stable across key ordering", () => {
    const duel = playDuel(OPERA);
    const r1 = serializeReplay(duel, ChessPlugin);
    const shuffled = Object.fromEntries(Object.entries(r1).reverse());
    assert.equal(replayHash(shuffled), replayHash(r1));
  });

  test("a tampered replay is detected", () => {
    const duel = playDuel(OPERA);
    const replay = serializeReplay(duel, ChessPlugin);

    // Flip the recorded winner while leaving the moves untouched.
    const forged = structuredClone(replay);
    forged.outcome.result = "0-1";
    const verdict = verifyReplay(forged, ChessPlugin);
    assert.equal(verdict.valid, false);
    assert.match(verdict.error, /outcome mismatch/);
  });

  test("a replay with an illegal move inserted is rejected", () => {
    const duel = playDuel(OPERA);
    const forged = structuredClone(serializeReplay(duel, ChessPlugin));
    forged.moves[6].intent = "a1a8";   // white to move at ply 7
    const verdict = verifyReplay(forged, ChessPlugin);
    assert.equal(verdict.valid, false);
    assert.match(verdict.error, /ply 7/);
  });

  test("different games produce different hashes", () => {
    const a = playDuel(OPERA);
    const b = playDuel(["f2f3", "e7e5", "g2g4", "d8h4"]);
    assert.notEqual(
      replayHash(serializeReplay(a, ChessPlugin)),
      replayHash(serializeReplay(b, ChessPlugin))
    );
  });
});

describe("duel lifecycle", () => {
  function freshDuel(now = 0, tc = { initialMs: 60_000, incrementMs: 0 }) {
    const d = createDuel({
      duelId: "d1", plugin: ChessPlugin, players: ["p1", "p2"],
      seed: null, config: {}, timeControl: tc, now,
    });
    return start(d, now);
  }

  test("an intent from a non-participant is refused", () => {
    const d = freshDuel();
    assert.equal(runIntent(d, ChessPlugin, { playerId: "stranger", intent: "e2e4" }, 100).reason,
      Reject.MALFORMED);
  });

  test("moving out of turn is refused at the engine, before the plugin", () => {
    const d = freshDuel();
    assert.equal(runIntent(d, ChessPlugin, { playerId: "p2", intent: "e7e5" }, 100).reason,
      Reject.NOT_YOUR_TURN);
  });

  test("resignation ends the duel and names the winner", () => {
    const d = freshDuel();
    runIntent(d, ChessPlugin, { playerId: "p1", intent: "e2e4" }, 1000);
    const res = resign(d, "p2", 2000);
    assert.equal(res.ok, true);
    assert.equal(d.outcome.result, "1-0");
    assert.equal(d.outcome.reason, "RESIGNATION");
    assert.equal(d.status, DuelState.COMPLETED);
  });

  test("a timeout is claimable by the server with no client message", () => {
    const d = freshDuel(0, { initialMs: 5_000 });
    const res = claimTimeout(d, ChessPlugin, 5_001);
    assert.equal(res.ok, true);
    assert.equal(d.outcome.reason, "TIMEOUT");
    assert.equal(d.outcome.result, "0-1", "white ran out");
  });

  test("a move arriving after the flag loses on time", () => {
    const d = freshDuel(0, { initialMs: 5_000 });
    const res = runIntent(d, ChessPlugin, { playerId: "p1", intent: "e2e4" }, 6_000);
    assert.equal(res.completed, true);
    assert.equal(d.outcome.reason, "TIMEOUT");
  });

  test("a completed duel accepts no further intents", () => {
    const d = freshDuel();
    resign(d, "p1", 1000);
    assert.equal(runIntent(d, ChessPlugin, { playerId: "p2", intent: "e7e5" }, 2000).reason,
      Reject.NOT_LIVE);
  });

  test("the plugin version is recorded on the duel", () => {
    // A rules change must never silently reinterpret an old game.
    assert.equal(freshDuel().pluginVersion, ChessPlugin.version);
  });
});
