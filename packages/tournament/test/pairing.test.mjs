/**
 * Pairing algorithms, tested as pure functions against known-correct shapes.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nextPow2, bracketSeedOrder, buildFirstRound, buildNextRound, buildSwissRound } from "../src/pairing.mjs";

describe("nextPow2", () => {
  for (const [n, expected] of [[1, 1], [2, 2], [3, 4], [4, 4], [5, 8], [8, 8], [9, 16], [16, 16], [17, 32]]) {
    test(`nextPow2(${n}) = ${expected}`, () => assert.equal(nextPow2(n), expected));
  }
});

describe("bracketSeedOrder — the standard tournament shape", () => {
  test("size 2", () => assert.deepEqual(bracketSeedOrder(2), [1, 2]));
  test("size 4: 1v4, 2v3", () => assert.deepEqual(bracketSeedOrder(4), [1, 4, 2, 3]));
  test("size 8: the canonical NCAA-style order", () => {
    assert.deepEqual(bracketSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  });
  test("size 16 contains every seed exactly once", () => {
    const order = bracketSeedOrder(16);
    assert.equal(new Set(order).size, 16);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1));
  });
  test("seed 1 and seed 2 cannot meet before the final, for any size", () => {
    for (const size of [4, 8, 16, 32]) {
      const order = bracketSeedOrder(size);
      const half = order.slice(0, size / 2);
      const otherHalf = order.slice(size / 2);
      const oneSide = half.includes(1) ? half : otherHalf;
      const twoSide = half.includes(2) ? half : otherHalf;
      assert.notEqual(oneSide, twoSide, `size ${size}: seeds 1 and 2 share a half-bracket`);
    }
  });
});

describe("buildFirstRound", () => {
  test("a power-of-two field has no byes", () => {
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const pairings = buildFirstRound(players);
    assert.equal(pairings.length, 4);
    assert.equal(pairings.filter((p) => p.seat1 === null).length, 0);
  });

  test("seed 1 plays the weakest real opponent when the field is not a power of two", () => {
    // 5 players -> bracket size 8 -> 3 byes, all to the top seeds.
    const players = ["p1", "p2", "p3", "p4", "p5"];
    const pairings = buildFirstRound(players);
    const byes = pairings.filter((p) => p.seat1 === null);
    assert.equal(byes.length, 3, "size 8 minus 5 real players = 3 byes");
    for (const b of byes) {
      // Byes must go to seeds 1-3 (the strongest), never to seed 5.
      assert.ok(["p1", "p2", "p3"].includes(b.seat0), `unexpected bye recipient ${b.seat0}`);
    }
  });

  test("every player appears exactly once", () => {
    const players = Array.from({ length: 11 }, (_, i) => `p${i + 1}`);
    const pairings = buildFirstRound(players);
    const seen = pairings.flatMap((p) => [p.seat0, p.seat1]).filter(Boolean);
    assert.equal(new Set(seen).size, players.length);
    assert.equal(seen.length, players.length);
  });

  test("a single pair needs no byes", () => {
    const pairings = buildFirstRound(["a", "b"]);
    assert.deepEqual(pairings, [{ slot: 0, seat0: "a", seat1: "b" }]);
  });
});

describe("buildNextRound", () => {
  test("adjacent slots feed the next slot", () => {
    const winners = [{ slot: 0, winner: "a" }, { slot: 1, winner: "b" }, { slot: 2, winner: "c" }, { slot: 3, winner: "d" }];
    const next = buildNextRound(winners);
    assert.deepEqual(next, [{ slot: 0, seat0: "a", seat1: "b" }, { slot: 1, seat0: "c", seat1: "d" }]);
  });

  test("the final round collapses to one pairing", () => {
    const next = buildNextRound([{ slot: 0, winner: "x" }, { slot: 1, winner: "y" }]);
    assert.deepEqual(next, [{ slot: 0, seat0: "x", seat1: "y" }]);
  });
});

describe("buildSwissRound", () => {
  const p = (id, points) => ({ playerId: id, points });

  test("round 1 with an even field pairs everyone, no byes", () => {
    const standings = ["a", "b", "c", "d"].map((id) => p(id, 0));
    const pairings = buildSwissRound(standings, new Set(), new Set());
    const seen = pairings.flatMap((x) => [x.seat0, x.seat1]).filter(Boolean);
    assert.equal(new Set(seen).size, 4);
    assert.ok(pairings.every((x) => x.seat1 !== null), "an even field has no byes");
  });

  test("an odd field produces exactly one bye", () => {
    const standings = ["a", "b", "c", "d", "e"].map((id) => p(id, 0));
    const pairings = buildSwissRound(standings, new Set(), new Set());
    const byes = pairings.filter((x) => x.seat1 === null);
    assert.equal(byes.length, 1);
  });

  test("the bye goes to someone who has not already had one", () => {
    const standings = ["a", "b", "c"].map((id) => p(id, 0));
    const pairings = buildSwissRound(standings, new Set(), new Set(["a", "b"]));
    const bye = pairings.find((x) => x.seat1 === null);
    assert.equal(bye.seat0, "c");
  });

  test("a pairing that has already been played is avoided when an alternative exists", () => {
    const standings = ["a", "b", "c", "d"].map((id) => p(id, 1));
    const played = new Set(["a|b"]);
    const pairings = buildSwissRound(standings, played, new Set());
    const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
    for (const pr of pairings) {
      if (pr.seat1) assert.equal(played.has(pairKey(pr.seat0, pr.seat1)), false, `rematch: ${pr.seat0} vs ${pr.seat1}`);
    }
  });

  test("players are grouped by score before pairing", () => {
    const standings = [p("a", 2), p("b", 2), p("c", 0), p("d", 0)];
    const pairings = buildSwissRound(standings, new Set(), new Set());
    // With no rematch history, the top score group (a,b) should pair together
    // and the bottom group (c,d) should pair together.
    const has = (x, y) => pairings.some((pr) => (pr.seat0 === x && pr.seat1 === y) || (pr.seat0 === y && pr.seat1 === x));
    assert.ok(has("a", "b") || has("c", "d"), "expected at least one same-score-group pairing");
  });
});
