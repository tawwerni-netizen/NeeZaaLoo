import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { masteryLevel, MasteryLevel, MASTERY_ORDER, masteryIndex } from "../src/mastery.mjs";

describe("masteryLevel — pure, deterministic, both gates required", () => {
  test("not yet established is always BEGINNER, whatever the percentile", () => {
    assert.equal(masteryLevel({ gamesPlayed: 9, established: false, percentile: 0.99 }), MasteryLevel.BEGINNER);
    assert.equal(masteryLevel({ gamesPlayed: 0, established: false, percentile: null }), MasteryLevel.BEGINNER);
  });

  test("established but below every higher bar is INTERMEDIATE", () => {
    assert.equal(masteryLevel({ gamesPlayed: 10, established: true, percentile: 0.10 }), MasteryLevel.INTERMEDIATE);
    assert.equal(masteryLevel({ gamesPlayed: 29, established: true, percentile: 0.60 }), MasteryLevel.INTERMEDIATE);
  });

  test("ADVANCED requires both 30+ games AND the 50th percentile", () => {
    assert.equal(masteryLevel({ gamesPlayed: 30, established: true, percentile: 0.50 }), MasteryLevel.ADVANCED);
    // Enough games, not enough skill.
    assert.equal(masteryLevel({ gamesPlayed: 500, established: true, percentile: 0.49 }), MasteryLevel.INTERMEDIATE);
    // Enough skill, not enough games -- volume cannot be skipped.
    assert.equal(masteryLevel({ gamesPlayed: 29, established: true, percentile: 0.99 }), MasteryLevel.INTERMEDIATE);
  });

  test("EXPERT requires 100+ games AND the 75th percentile", () => {
    assert.equal(masteryLevel({ gamesPlayed: 100, established: true, percentile: 0.75 }), MasteryLevel.EXPERT);
    assert.equal(masteryLevel({ gamesPlayed: 99, established: true, percentile: 0.99 }), MasteryLevel.ADVANCED);
  });

  test("MASTER requires 250+ games AND the 90th percentile -- the top tier cannot be bought with volume alone", () => {
    assert.equal(masteryLevel({ gamesPlayed: 250, established: true, percentile: 0.90 }), MasteryLevel.MASTER);
    assert.equal(masteryLevel({ gamesPlayed: 10000, established: true, percentile: 0.89 }), MasteryLevel.EXPERT);
  });

  test("MASTERY_ORDER is least to most senior, and masteryIndex agrees", () => {
    assert.deepEqual(MASTERY_ORDER, ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT", "MASTER"]);
    assert.ok(masteryIndex(MasteryLevel.MASTER) > masteryIndex(MasteryLevel.EXPERT));
    assert.ok(masteryIndex(MasteryLevel.EXPERT) > masteryIndex(MasteryLevel.ADVANCED));
    assert.ok(masteryIndex(MasteryLevel.ADVANCED) > masteryIndex(MasteryLevel.INTERMEDIATE));
    assert.ok(masteryIndex(MasteryLevel.INTERMEDIATE) > masteryIndex(MasteryLevel.BEGINNER));
  });
});
