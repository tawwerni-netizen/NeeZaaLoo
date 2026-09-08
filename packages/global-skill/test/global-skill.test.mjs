/**
 * The Global Skill Score.
 *
 * The property every test here ultimately serves: no single game may
 * dominate the score. That is checked directly, not just implied by the
 * weighting math being "reasonable".
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  maturityOf, confidenceOf, rawWeight, capNormalize, breadthMultiplier,
  globalSkillScore, assignTiers, tierForPercentile,
  MAX_GAME_WEIGHT, MIN_GAMES_FOR_CAP, SCORE_SCALE,
} from "../src/global-skill.mjs";

const entry = (gameId, { rating = 150000, rd = 8000, games = 30, percentile = 0.5 } = {}) => ({
  gameId, ratingX100: rating, rdX100: rd, gamesPlayed: games, percentile,
});

// ---------------------------------------------------------------------------

describe("maturity and confidence", () => {
  test("maturity saturates at MATURITY_GAMES and is bounded [0,1]", () => {
    assert.equal(maturityOf(0), 0);
    assert.equal(maturityOf(15), 0.5);
    assert.equal(maturityOf(30), 1);
    assert.equal(maturityOf(1000), 1, "must not exceed 1 for very high game counts");
  });

  test("confidence falls as RD rises, bounded [0,1]", () => {
    assert.equal(confidenceOf(0), 1, "a theoretically perfect RD is full confidence");
    assert.equal(confidenceOf(35000), 0, "a brand-new player's RD is zero confidence");
    assert.ok(confidenceOf(11000) > confidenceOf(20000));
  });

  test("raw weight is the product, so a low-confidence game contributes little however mature", () => {
    const mature_uncertain = rawWeight(entry("x", { games: 500, rd: 30000 }));
    const fresh_confident = rawWeight(entry("y", { games: 30, rd: 5000 }));
    assert.ok(fresh_confident > mature_uncertain);
  });
});

describe("capNormalize — the 35% ceiling", () => {
  test("with fewer than 3 games the cap cannot be satisfied, so it does not apply", () => {
    assert.equal(MIN_GAMES_FOR_CAP, 3);
    const { weights, applied } = capNormalize([0.8, 0.2], MAX_GAME_WEIGHT);
    assert.equal(applied, false);
    assert.deepEqual(weights.map((w) => Number(w.toFixed(4))), [0.8, 0.2]);
  });

  test("a single game always gets 100% — there is nothing to cap against", () => {
    const { weights, applied } = capNormalize([0.42], MAX_GAME_WEIGHT);
    assert.deepEqual(weights, [1]);
    assert.equal(applied, false);
  });

  test("three equal games split evenly, under the cap, with no redistribution needed", () => {
    const { weights, capped, applied } = capNormalize([1, 1, 1], MAX_GAME_WEIGHT);
    assert.equal(applied, true);
    for (const w of weights) assert.ok(Math.abs(w - 1 / 3) < 1e-9);
    assert.deepEqual(capped, [false, false, false]);
  });

  test("a dominant raw weight is capped, and the excess redistributes to the others", () => {
    // Game A would naturally be 90% of the mass; it must be pinned at 35%.
    const { weights, capped, applied } = capNormalize([9, 0.5, 0.5], MAX_GAME_WEIGHT);
    assert.equal(applied, true);
    assert.ok(Math.abs(weights[0] - 0.35) < 1e-9, `dominant weight was ${weights[0]}, not capped at 0.35`);
    assert.equal(capped[0], true);
    // The other two split the remaining 65% in their original 1:1 proportion.
    assert.ok(Math.abs(weights[1] - 0.325) < 1e-9);
    assert.ok(Math.abs(weights[2] - 0.325) < 1e-9);
  });

  test("weights always sum to 1 once the cap can be satisfied, for any input", () => {
    const cases = [
      [10, 1, 1, 1], [5, 5, 0.1, 0.1, 0.1], [1, 1, 1, 1, 1, 1],
      [100, 1, 1, 1, 1, 1, 1], [0.001, 0.001, 0.001, 0.001],
    ];
    for (const raws of cases) {
      const { weights } = capNormalize(raws, MAX_GAME_WEIGHT);
      const sum = weights.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-6, `case ${JSON.stringify(raws)} summed to ${sum}`);
    }
  });

  test("no weight ever exceeds the cap once the cap applies", () => {
    const raws = [50, 1, 1, 1, 0.01];
    const { weights, applied } = capNormalize(raws, MAX_GAME_WEIGHT);
    assert.equal(applied, true);
    for (const w of weights) assert.ok(w <= MAX_GAME_WEIGHT + 1e-9);
  });

  test("a cascading cap: capping the top weight can push a second weight over the cap too", () => {
    // 4 games: one huge, one large, two tiny. Capping the huge one and
    // redistributing can still leave the second-largest over the cap,
    // requiring a second iteration of water-filling.
    const raws = [20, 6, 0.1, 0.1];
    const { weights, capped } = capNormalize(raws, MAX_GAME_WEIGHT);
    assert.ok(weights[0] <= MAX_GAME_WEIGHT + 1e-9);
    assert.ok(weights[1] <= MAX_GAME_WEIGHT + 1e-9);
    assert.equal(capped[0], true);
    const sum = weights.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6);
  });

  test("zero-length input is handled without error", () => {
    assert.deepEqual(capNormalize([], MAX_GAME_WEIGHT), { weights: [], capped: [], applied: false });
  });
});

describe("breadth multiplier", () => {
  test("a single game gets no bonus", () => assert.equal(breadthMultiplier(1), 1));
  test("the bonus grows with more established games, then stops", () => {
    const b3 = breadthMultiplier(3);
    const b6 = breadthMultiplier(6);
    const b10 = breadthMultiplier(10);
    assert.ok(b3 > 1 && b3 < b6);
    assert.equal(b6, b10, "the bonus must stop growing past the configured maximum");
  });
});

describe("globalSkillScore — the actual guarantee: no game may dominate", () => {
  test("no established games produces no score", () => {
    const r = globalSkillScore([]);
    assert.equal(r.score, null);
    assert.deepEqual(r.breakdown, []);
  });

  test("a single game's score is (roughly) its own percentile on the 0-1000 scale", () => {
    const r = globalSkillScore([entry("chess", { percentile: 0.8, games: 100, rd: 5000 })]);
    assert.ok(r.score >= 780 && r.score <= 800, `expected ~800, got ${r.score}`);
    assert.equal(r.appliedCap, false, "cannot cap with only one game");
  });

  test("THE guarantee: a perfect score in one game cannot carry the total past its capped share", () => {
    // World #1 at chess, deeply established (500 games, RD near its floor) --
    // and only JUST established (the minimum 10 games, RD near the 110
    // threshold) in five other games, at percentile 0.5 each. Chess's raw
    // weight genuinely dominates here (roughly 46% of the unnormalised mass),
    // which is exactly the case the 35% cap exists to catch. If chess were
    // uncapped it would pull the score toward 1000; capped, it cannot.
    const entries = [
      entry("chess", { percentile: 1.0, games: 500, rd: 500 }),
      ...["a", "b", "c", "d", "e"].map((g) => entry(g, { percentile: 0.5, games: 10, rd: 11000 })),
    ];
    const r = globalSkillScore(entries);
    const chess = r.breakdown.find((b) => b.gameId === "chess");
    assert.ok(chess.weightPct <= 35.5, `chess contributed ${chess.weightPct}% of the score`);
    assert.equal(chess.wasCapped, true, "chess's raw weight must have exceeded the cap here");
    // Being #1 at one game among six should NOT put you near a perfect score.
    assert.ok(r.score < 800, `score was ${r.score}, too close to the ceiling for one dominant game among six`);
  });

  test("being merely average in every game scores near the middle", () => {
    const entries = ["chess", "speed-math", "memory"].map((g) => entry(g, { percentile: 0.5 }));
    const r = globalSkillScore(entries);
    assert.ok(Math.abs(r.score - 500) < 30, `expected close to 500, got ${r.score}`);
  });

  test("the score never exceeds the scale even with breadth and cap combined", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry(`g${i}`, { percentile: 1.0, games: 500, rd: 1000 }));
    const r = globalSkillScore(entries);
    assert.ok(r.score <= SCORE_SCALE);
  });

  test("the breakdown is sorted by actual contribution, most important first", () => {
    const entries = [
      entry("weak", { percentile: 0.1, games: 200, rd: 3000 }),
      entry("strong", { percentile: 0.9, games: 200, rd: 3000 }),
    ];
    const r = globalSkillScore(entries);
    assert.equal(r.breakdown[0].gameId, "strong");
  });

  test("every breakdown row explains itself with numbers a player can verify", () => {
    const r = globalSkillScore([entry("chess", { percentile: 0.7, games: 50, rd: 6000 })]);
    const row = r.breakdown[0];
    for (const key of ["gameId", "percentile", "rawWeight", "weight", "weightPct", "contribution"]) {
      assert.ok(key in row, `missing ${key}`);
    }
  });
});

describe("tiers are percentile bands over the actual population", () => {
  test("boundary values map correctly", () => {
    assert.equal(tierForPercentile(0.99), "Grandmaster");
    assert.equal(tierForPercentile(0.989), "Master");
    assert.equal(tierForPercentile(0.35), "Gold");
    assert.equal(tierForPercentile(0.349), "Silver");
    assert.equal(tierForPercentile(0), "Bronze");
  });

  test("a player with no score is UNRANKED, not Bronze", () => {
    const r = assignTiers([{ playerId: "a", score: null }, { playerId: "b", score: 500 }]);
    assert.equal(r.find((x) => x.playerId === "a").tier, "UNRANKED");
    assert.equal(r.find((x) => x.playerId === "a").percentile, null);
  });

  test("tied scores land in the same tier, never split across a boundary", () => {
    const scores = Array.from({ length: 20 }, (_, i) => ({ playerId: `p${i}`, score: i < 10 ? 500 : 500 }));
    const r = assignTiers(scores);
    const tiers = new Set(r.map((x) => x.tier));
    assert.equal(tiers.size, 1, "an identical score must never split into two tiers");
  });

  test("a realistic spread produces a realistic tier distribution", () => {
    const scores = Array.from({ length: 200 }, (_, i) => ({ playerId: `p${i}`, score: i * 5 }));
    const r = assignTiers(scores);
    const counts = {};
    for (const x of r) counts[x.tier] = (counts[x.tier] ?? 0) + 1;
    assert.ok(counts.Grandmaster <= counts.Bronze, "the top tier must be rarer than the bottom");
    assert.ok(counts.Bronze > 0 && counts.Grandmaster > 0);
  });
});
