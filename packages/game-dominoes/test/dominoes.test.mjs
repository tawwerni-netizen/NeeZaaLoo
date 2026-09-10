import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fullSet, pipSum, dealHands, determineOpening, initialLine,
  legalEndsForTile, handHasLegalMove, attach, SEAT_0, SEAT_1,
} from "../src/dominoes.mjs";

describe("fullSet", () => {
  test("28 tiles, every unordered pair 0-6 exactly once", () => {
    const set = fullSet();
    assert.equal(set.length, 28);
    const keys = new Set(set.map(([a, b]) => `${a}-${b}`));
    assert.equal(keys.size, 28);
    for (const [a, b] of set) assert.ok(a <= b, "canonical form is low-pip-first");
  });
});

describe("dealHands", () => {
  test("deals 7 and 7 from a 28-tile set, no overlap, deterministic per seed", () => {
    const { hand0, hand1 } = dealHands("seed-a");
    assert.equal(hand0.length, 7);
    assert.equal(hand1.length, 7);
    const keys = new Set([...hand0, ...hand1].map(([a, b]) => `${a}-${b}`));
    assert.equal(keys.size, 14, "no tile dealt to both hands");

    const again = dealHands("seed-a");
    assert.deepEqual(again.hand0, hand0);
    assert.deepEqual(again.hand1, hand1);
  });

  test("a different seed produces a different deal", () => {
    const a = dealHands("seed-a");
    const b = dealHands("seed-b");
    assert.notDeepEqual(a.hand0, b.hand0);
  });
});

describe("determineOpening", () => {
  test("the higher double leads and is forced to open with it", () => {
    const hand0 = [[6, 6], [1, 2]];
    const hand1 = [[5, 5], [0, 3]];
    const { leader, mustPlayTile } = determineOpening(hand0, hand1);
    assert.equal(leader, SEAT_0);
    assert.deepEqual(mustPlayTile, [6, 6]);
  });

  test("the other seat's higher double still wins the lead", () => {
    const hand0 = [[2, 2], [1, 2]];
    const hand1 = [[6, 6], [0, 3]];
    const { leader, mustPlayTile } = determineOpening(hand0, hand1);
    assert.equal(leader, SEAT_1);
    assert.deepEqual(mustPlayTile, [6, 6]);
  });

  test("no double in either hand: the heaviest single tile leads, free choice", () => {
    const hand0 = [[1, 2], [0, 3]]; // pip sums 3, 3
    const hand1 = [[4, 5], [2, 3]]; // pip sums 9, 5
    const { leader, mustPlayTile } = determineOpening(hand0, hand1);
    assert.equal(leader, SEAT_1);
    assert.equal(mustPlayTile, null);
  });
});

describe("legalEndsForTile / attach", () => {
  test("an empty line accepts any tile as ANY", () => {
    assert.deepEqual(legalEndsForTile([3, 4], initialLine()), ["ANY"]);
  });

  test("attach() on an empty line opens the line with that tile's own values", () => {
    const line = attach(initialLine(), [3, 4], "LEFT");
    assert.equal(line.left, 3);
    assert.equal(line.right, 4);
    assert.equal(line.tiles.length, 1);
  });

  test("a tile matching only one end reports only that end as legal", () => {
    const line = attach(initialLine(), [3, 4], "LEFT"); // left=3, right=4
    assert.deepEqual(legalEndsForTile([3, 5], line), ["LEFT"]);
    assert.deepEqual(legalEndsForTile([4, 5], line), ["RIGHT"]);
    assert.deepEqual(legalEndsForTile([1, 2], line), []);
  });

  test("attach() at LEFT exposes the tile's other pip as the new left end", () => {
    let line = attach(initialLine(), [3, 4], "LEFT"); // left=3, right=4
    line = attach(line, [1, 3], "LEFT"); // matches left(3); new left = 1
    assert.equal(line.left, 1);
    assert.equal(line.right, 4);
    assert.equal(line.tiles.length, 2);
    assert.deepEqual(line.tiles[0].tile, [1, 3]);
  });

  test("attach() at RIGHT exposes the tile's other pip as the new right end", () => {
    let line = attach(initialLine(), [3, 4], "LEFT"); // left=3, right=4
    line = attach(line, [4, 6], "RIGHT"); // matches right(4); new right = 6
    assert.equal(line.left, 3);
    assert.equal(line.right, 6);
  });

  test("a double re-exposes the SAME value at that end", () => {
    let line = attach(initialLine(), [3, 4], "LEFT"); // left=3, right=4
    line = attach(line, [4, 4], "RIGHT");
    assert.equal(line.right, 4);
  });

  test("handHasLegalMove is false only when nothing in hand matches either end", () => {
    const line = attach(initialLine(), [3, 4], "LEFT");
    assert.equal(handHasLegalMove([[1, 2], [5, 6]], line), false);
    assert.equal(handHasLegalMove([[1, 2], [4, 6]], line), true);
  });
});

describe("pipSum", () => {
  test("sums both pips of every tile in a hand", () => {
    assert.equal(pipSum([[1, 2], [3, 3], [0, 6]]), 1 + 2 + 3 + 3 + 0 + 6);
    assert.equal(pipSum([]), 0);
  });
});
