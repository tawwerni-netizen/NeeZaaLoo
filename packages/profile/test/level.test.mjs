import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { expRequiredForLevel, levelForExp, expProgress, BASE_EXP_PER_LEVEL } from "../src/level.mjs";

describe("expRequiredForLevel", () => {
  test("level 1 requires zero EXP", () => {
    assert.equal(expRequiredForLevel(1), 0);
  });

  test("each level's requirement strictly increases", () => {
    let prev = expRequiredForLevel(1);
    for (let level = 2; level <= 20; level++) {
      const req = expRequiredForLevel(level);
      assert.ok(req > prev, `level ${level} (${req}) must exceed level ${level - 1} (${prev})`);
      prev = req;
    }
  });

  test("level 2 costs exactly BASE_EXP_PER_LEVEL", () => {
    assert.equal(expRequiredForLevel(2), BASE_EXP_PER_LEVEL);
  });
});

describe("levelForExp", () => {
  test("zero EXP is level 1", () => {
    assert.equal(levelForExp(0), 1);
  });

  test("negative EXP is clamped to level 1, never throws or goes negative", () => {
    assert.equal(levelForExp(-500), 1);
  });

  test("exactly at a level's threshold reaches that level, not the one below", () => {
    const threshold = expRequiredForLevel(5);
    assert.equal(levelForExp(threshold), 5);
    assert.equal(levelForExp(threshold - 1), 4);
  });

  test("a huge EXP total still resolves to a real (higher) level, not infinite loop or NaN", () => {
    const level = levelForExp(1_000_000);
    assert.ok(Number.isInteger(level) && level > 10);
  });
});

describe("expProgress", () => {
  test("bundles level, floors and remaining EXP consistently", () => {
    const p = expProgress(150);
    assert.equal(p.level, 2);
    assert.equal(p.totalExp, 150);
    assert.equal(p.currentLevelFloor, expRequiredForLevel(2));
    assert.equal(p.nextLevelFloor, expRequiredForLevel(3));
    assert.equal(p.expIntoLevel, 150 - p.currentLevelFloor);
    assert.equal(p.expToNextLevel, p.nextLevelFloor - 150);
    assert.equal(p.expIntoLevel + p.expToNextLevel, p.nextLevelFloor - p.currentLevelFloor);
  });
});
