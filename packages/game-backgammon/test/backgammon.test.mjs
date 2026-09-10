import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SEAT_0, SEAT_1, POINTS, CHECKERS_PER_SIDE, initialBoard, pointSeat,
  isHomeIndex, distanceToOff, destinationFor, isBearOffDestination,
  entryDestination, isOpenFor, allCheckersHome, isLegalBearOff,
  legalActionsForDie, legalActions, hasAnyLegalAction, rollDiceFor, openingRoll,
} from "../src/backgammon.mjs";

describe("initialBoard", () => {
  test("15 checkers per side, the standard symmetric starting layout", () => {
    const board = initialBoard();
    let s0 = 0, s1 = 0;
    for (const v of board) {
      if (v > 0) s0 += v;
      if (v < 0) s1 += -v;
    }
    assert.equal(s0, CHECKERS_PER_SIDE);
    assert.equal(s1, CHECKERS_PER_SIDE);
    assert.equal(board[23], 2);
    assert.equal(board[12], 5);
    assert.equal(board[7], 3);
    assert.equal(board[5], 5);
    assert.equal(board[0], -2);
    assert.equal(board[11], -5);
    assert.equal(board[16], -3);
    assert.equal(board[18], -5);
  });
});

describe("direction and distance", () => {
  test("seat 0 moves toward index 0; seat 1 moves toward index 23", () => {
    assert.equal(destinationFor(SEAT_0, 10, 4), 6);
    assert.equal(destinationFor(SEAT_1, 10, 4), 14);
  });

  test("distanceToOff mirrors correctly for both seats", () => {
    assert.equal(distanceToOff(SEAT_0, 5), 6);
    assert.equal(distanceToOff(SEAT_0, 0), 1);
    assert.equal(distanceToOff(SEAT_1, 18), 6);
    assert.equal(distanceToOff(SEAT_1, 23), 1);
  });

  test("isBearOffDestination fires only past each seat's own edge", () => {
    assert.equal(isBearOffDestination(SEAT_0, -1), true);
    assert.equal(isBearOffDestination(SEAT_0, 0), false);
    assert.equal(isBearOffDestination(SEAT_1, POINTS), true);
    assert.equal(isBearOffDestination(SEAT_1, POINTS - 1), false);
  });

  test("home board indices are 0-5 for seat 0 and 18-23 for seat 1", () => {
    assert.equal(isHomeIndex(SEAT_0, 5), true);
    assert.equal(isHomeIndex(SEAT_0, 6), false);
    assert.equal(isHomeIndex(SEAT_1, 18), true);
    assert.equal(isHomeIndex(SEAT_1, 17), false);
  });
});

describe("entering from the bar", () => {
  test("a hit checker re-enters in the OPPONENT's home board", () => {
    // seat 0 re-enters at idx 18-23 (seat 1's home); seat 1 re-enters at idx 0-5 (seat 0's home).
    assert.equal(entryDestination(SEAT_0, 1), 23);
    assert.equal(entryDestination(SEAT_0, 6), 18);
    assert.equal(entryDestination(SEAT_1, 1), 0);
    assert.equal(entryDestination(SEAT_1, 6), 5);
  });

  test("entry is blocked when the opponent holds 2+ checkers on that point", () => {
    const board = new Array(POINTS).fill(0);
    board[18] = -2; // seat 1 owns idx18 with 2 -- blocked for seat 0 entering with die 6
    assert.equal(isOpenFor(SEAT_0, 18, board), false);
  });

  test("entry hits a lone blot on that point", () => {
    const board = new Array(POINTS).fill(0);
    board[18] = -1;
    assert.equal(isOpenFor(SEAT_0, 18, board), true);
  });

  test("with a checker on the bar, only BAR entry is offered -- no other move", () => {
    const board = initialBoard();
    const bar = [1, 0];
    const actions = legalActionsForDie({ board, bar }, SEAT_0, 3);
    assert.ok(actions.every((a) => a.from === "BAR"));
  });

  test("a fully closed opponent home board leaves no entry action at all", () => {
    const board = new Array(POINTS).fill(0);
    for (let idx = 18; idx < 24; idx++) board[idx] = -2; // seat 1 closes every home point
    const bar = [1, 0];
    for (let die = 1; die <= 6; die++) {
      assert.deepEqual(legalActionsForDie({ board, bar }, SEAT_0, die), []);
    }
  });
});

describe("landing and hitting", () => {
  test("an empty point and a point with your own checkers are both open", () => {
    const board = new Array(POINTS).fill(0);
    board[10] = 3;
    assert.equal(isOpenFor(SEAT_0, 5, board), true);
    assert.equal(isOpenFor(SEAT_0, 10, board), true);
  });

  test("two or more opposing checkers block the point", () => {
    const board = new Array(POINTS).fill(0);
    board[10] = -2;
    assert.equal(isOpenFor(SEAT_0, 10, board), false);
  });

  test("exactly one opposing checker is a blot -- open, and would be hit", () => {
    const board = new Array(POINTS).fill(0);
    board[10] = -1;
    assert.equal(isOpenFor(SEAT_0, 10, board), true);
  });
});

describe("bearing off", () => {
  test("not legal while any checker is outside the home board or on the bar", () => {
    const board = initialBoard();
    assert.equal(allCheckersHome(SEAT_0, board, [0, 0]), false);
  });

  test("legal once every checker is home, and none on the bar", () => {
    const board = new Array(POINTS).fill(0);
    board[0] = 15;
    assert.equal(allCheckersHome(SEAT_0, board, [0, 0]), true);
    assert.equal(allCheckersHome(SEAT_0, board, [1, 0]), false);
  });

  test("an exact die bears off the checker at that exact distance", () => {
    const board = new Array(POINTS).fill(0);
    board[2] = 15; // distance 3 for seat 0
    assert.equal(isLegalBearOff(SEAT_0, 2, 3, board, [0, 0]), true);
    assert.equal(isLegalBearOff(SEAT_0, 2, 2, board, [0, 0]), false);
  });

  test("overage: a larger die may bear off the farthest-out occupied point", () => {
    const board = new Array(POINTS).fill(0);
    board[2] = 5; board[0] = 10; // farthest occupied is idx2 (distance 3)
    assert.equal(isLegalBearOff(SEAT_0, 2, 6, board, [0, 0]), true);
    // idx0 (distance 1) is NOT the farthest point, so overage does not apply to it
    assert.equal(isLegalBearOff(SEAT_0, 0, 6, board, [0, 0]), false);
  });
});

describe("rollDiceFor / openingRoll", () => {
  test("deterministic given the same seed and roll index", () => {
    assert.deepEqual(rollDiceFor("seed-a", 0), rollDiceFor("seed-a", 0));
  });

  test("a double yields four copies of the same value", () => {
    // Scan several roll indices for a seed known to produce a double, to
    // avoid depending on exactly which index happens to roll one.
    let sawDouble = false;
    for (let i = 0; i < 200; i++) {
      const dice = rollDiceFor("scan-for-double", i);
      if (dice.length === 4) {
        sawDouble = true;
        assert.ok(dice.every((d) => d === dice[0]));
      } else {
        assert.equal(dice.length, 2);
      }
    }
    assert.ok(sawDouble, "expected at least one double across 200 rolls");
  });

  test("openingRoll always returns two DIFFERENT dice and a leader", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const { leader, dice } = openingRoll(seed);
      assert.equal(dice.length, 2);
      assert.notEqual(dice[0], dice[1]);
      assert.ok(leader === SEAT_0 || leader === SEAT_1);
    }
  });

  test("openingRoll is deterministic per seed", () => {
    assert.deepEqual(openingRoll("stable-seed"), openingRoll("stable-seed"));
  });
});

describe("hasAnyLegalAction / legalActions", () => {
  test("the standard opening position always has legal actions for any two dice", () => {
    const board = initialBoard();
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const state = { board, bar: [0, 0], dice: [a, b] };
        assert.ok(hasAnyLegalAction(state, SEAT_0), `seat0 must have a move for [${a},${b}]`);
        assert.ok(hasAnyLegalAction(state, SEAT_1), `seat1 must have a move for [${a},${b}]`);
      }
    }
  });
});
