/**
 * Gate 2 evidence, part 1: the move generator is correct.
 *
 * Perft counts leaf nodes of the legal move tree to a given depth. The expected
 * values below are the published reference counts used across the engine
 * community. They are unforgiving: a single mishandled en-passant pin, a
 * castling-through-check bug, or a lost castling right shifts the count.
 *
 * The six positions are chosen to cover different failure modes, not to be
 * six versions of the same test.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFen, toFen, perft, perftDivide, START_FEN } from "../src/chess.mjs";

const POSITIONS = [
  {
    name: "starting position",
    covers: "baseline legality, double pushes, knight development",
    fen: START_FEN,
    counts: [20, 400, 8902, 197281],
  },
  {
    name: "Kiwipete",
    covers: "castling both sides, pins, discovered checks, many captures",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    counts: [48, 2039, 97862],
  },
  {
    name: "position 3 — endgame",
    covers: "en passant, promotion races, stalemate traps",
    fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    counts: [14, 191, 2812, 43238, 674624],
  },
  {
    name: "position 4 — promotion heavy",
    covers: "under-promotion, promotion with capture, check evasion",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    counts: [6, 264, 9467],
  },
  {
    name: "position 5",
    covers: "castling rights lost by rook capture",
    fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    counts: [44, 1486, 62379],
  },
  {
    name: "position 6",
    covers: "quiet middlegame, wide branching",
    fen: "r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10",
    counts: [46, 2079, 89890],
  },
];

describe("perft — move generator correctness", () => {
  for (const pos of POSITIONS) {
    describe(`${pos.name} (${pos.covers})`, () => {
      pos.counts.forEach((expected, i) => {
        const depth = i + 1;
        test(`depth ${depth} = ${expected.toLocaleString("en-US")}`, () => {
          const s = parseFen(pos.fen);
          const got = perft(s, depth);
          if (got !== expected && depth > 1) {
            // Surface the offending move rather than just a number mismatch.
            console.error(`divide(${depth}) for ${pos.name}:`,
              JSON.stringify(perftDivide(parseFen(pos.fen), depth), null, 1));
          }
          assert.equal(got, expected);
        });
      });
    });
  }
});

describe("state integrity", () => {
  test("make/unmake restores the position exactly", () => {
    // A lossy unmake can still produce correct perft counts by coincidence.
    // The FEN round-trip checks castling rights, the ep square and both clocks
    // directly, which is where unmake bugs actually hide.
    for (const fen of POSITIONS.map((p) => p.fen)) {
      const s = parseFen(fen);
      const before = toFen(s);
      perft(s, 3);
      assert.equal(s.stack.length, 0, "every make must be matched by an unmake");
      assert.equal(toFen(s), before, `position drifted after perft: ${fen}`);
    }
  });

  test("FEN parse/serialise is a faithful round-trip", () => {
    for (const fen of POSITIONS.map((p) => p.fen)) {
      assert.equal(toFen(parseFen(fen)), fen);
    }
  });
});
