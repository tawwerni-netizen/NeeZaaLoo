/**
 * Glicko-2 correctness.
 *
 * The anchor is Glickman's own worked example, which publishes the expected
 * output to two decimal places. An implementation that reproduces it has the
 * volatility root-find right; one that merely "looks reasonable" usually does
 * not, because a broken root-find still returns plausible ratings.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  updateRating, applyDuel, expectedScore, defaultRating,
  toStorage, fromStorage, isEstablished,
} from "../src/glicko2.mjs";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: expected ~${expected}, got ${actual} (tolerance ${tol})`);

describe("Glickman's published worked example", () => {
  // From "Example of the Glicko-2 system", Mark E. Glickman.
  // Player: 1500 / RD 200 / vol 0.06, tau = 0.5, three games in one period.
  const player = { rating: 1500, rd: 200, volatility: 0.06 };
  const results = [
    { rating: 1400, rd: 30, score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ];

  test("rating becomes 1464.06", () => {
    near(updateRating(player, results, { tau: 0.5 }).rating, 1464.06, 0.01, "rating");
  });

  test("RD becomes 151.52", () => {
    near(updateRating(player, results, { tau: 0.5 }).rd, 151.52, 0.01, "rd");
  });

  test("volatility becomes 0.05999", () => {
    near(updateRating(player, results, { tau: 0.5 }).volatility, 0.05999, 0.00001, "volatility");
  });
});

describe("rating behaviour", () => {
  test("a player who does not compete only becomes less certain", () => {
    const before = { rating: 1500, rd: 200, volatility: 0.06 };
    const after = updateRating(before, []);
    assert.equal(after.rating, 1500, "rating must not drift");
    assert.equal(after.volatility, 0.06, "volatility must not drift");
    assert.ok(after.rd > before.rd, "uncertainty must grow");
  });

  test("RD is capped so nobody is more unknown than a new player", () => {
    let p = { rating: 1500, rd: 349, volatility: 0.06 };
    for (let i = 0; i < 500; i++) p = updateRating(p, []);
    assert.ok(p.rd <= 350, `rd ran away to ${p.rd}`);
  });

  test("playing games reduces uncertainty", () => {
    let p = defaultRating();
    const opponent = { rating: 1500, rd: 50 };
    for (let i = 0; i < 15; i++) {
      p = updateRating(p, [{ ...opponent, score: i % 2 }]);
    }
    assert.ok(p.rd < 350, `rd should fall from 350, got ${p.rd}`);
    assert.ok(p.rd < 150, `rd should fall well below 150 after 15 games, got ${p.rd}`);
  });

  test("beating a much stronger player gains more than beating a weaker one", () => {
    const p = { rating: 1500, rd: 100, volatility: 0.06 };
    const strong = updateRating(p, [{ rating: 2000, rd: 50, score: 1 }]);
    const weak = updateRating(p, [{ rating: 1000, rd: 50, score: 1 }]);
    assert.ok(strong.rating - 1500 > weak.rating - 1500,
      "an upset must be worth more than an expected win");
  });

  test("a result against an uncertain opponent moves the rating less", () => {
    const p = { rating: 1500, rd: 100, volatility: 0.06 };
    const vsKnown = updateRating(p, [{ rating: 1700, rd: 30, score: 1 }]);
    const vsUnknown = updateRating(p, [{ rating: 1700, rd: 330, score: 1 }]);
    assert.ok(vsKnown.rating > vsUnknown.rating,
      "beating a well-measured opponent is stronger evidence");
  });

  test("a draw between equals barely moves either rating", () => {
    const a = { rating: 1500, rd: 60, volatility: 0.06 };
    const { a: newA, b: newB } = applyDuel(a, { ...a }, 0.5);
    near(newA.rating, 1500, 0.5, "drawn player A");
    near(newB.rating, 1500, 0.5, "drawn player B");
  });

  test("a duel updates both players from the same pre-duel snapshot", () => {
    // Order of evaluation must not matter: if B's new rating fed into A's
    // update, swapping the arguments would change the outcome.
    const a = { rating: 1600, rd: 80, volatility: 0.06 };
    const b = { rating: 1450, rd: 120, volatility: 0.06 };
    const forward = applyDuel(a, b, 1);
    const reverse = applyDuel(b, a, 0);
    near(forward.a.rating, reverse.b.rating, 1e-9, "A via both orderings");
    near(forward.b.rating, reverse.a.rating, 1e-9, "B via both orderings");
  });

  test("the winner gains and the loser loses", () => {
    const { a, b } = applyDuel(
      { rating: 1500, rd: 80, volatility: 0.06 },
      { rating: 1500, rd: 80, volatility: 0.06 },
      1
    );
    assert.ok(a.rating > 1500 && b.rating < 1500);
    near(a.rating - 1500, 1500 - b.rating, 1e-9, "symmetric between equals");
  });

  test("erratic results raise volatility; consistent results do not", () => {
    const start = { rating: 1500, rd: 80, volatility: 0.06 };
    let erratic = start;
    let steady = start;
    for (let i = 0; i < 10; i++) {
      // Alternating shock results against a far stronger opponent.
      erratic = updateRating(erratic, [{ rating: 2200, rd: 40, score: i % 2 }]);
      steady = updateRating(steady, [{ rating: 1500, rd: 40, score: 0.5 }]);
    }
    assert.ok(erratic.volatility > steady.volatility,
      `erratic ${erratic.volatility} should exceed steady ${steady.volatility}`);
  });
});

describe("expected score", () => {
  test("equal players expect a draw", () => {
    near(expectedScore({ rating: 1500, rd: 50 }, { rating: 1500, rd: 50 }), 0.5, 1e-9, "E");
  });

  test("a stronger player expects more, and the two sides sum to 1", () => {
    const a = { rating: 1800, rd: 50 };
    const b = { rating: 1500, rd: 50 };
    const ea = expectedScore(a, b);
    assert.ok(ea > 0.5 && ea < 1);
    near(ea + expectedScore(b, a), 1, 1e-9, "complementary");
  });
});

describe("integer storage", () => {
  test("round-trips through the DB representation", () => {
    const p = { rating: 1464.06, rd: 151.52, volatility: 0.05999 };
    const stored = toStorage(p);
    assert.deepEqual(stored, { rating_x100: 146406, rd_x100: 15152, volatility_x1e6: 59990 });
    const back = fromStorage(stored);
    near(back.rating, p.rating, 0.005, "rating");
    near(back.rd, p.rd, 0.005, "rd");
    near(back.volatility, p.volatility, 5e-7, "volatility");
  });

  test("defaults match the column defaults in migration 0003", () => {
    // If these drift apart, a new player gets a different rating depending on
    // whether the row was created by SQL default or by application code.
    assert.deepEqual(toStorage(defaultRating()), {
      rating_x100: 150000,
      rd_x100: 35000,
      volatility_x1e6: 60000,
    });
  });
});

describe("cash-tier eligibility", () => {
  test("an unrated player is not established", () => {
    assert.equal(isEstablished(defaultRating(), 0), false);
  });

  test("a low-RD, well-played rating is established", () => {
    assert.equal(isEstablished({ rating: 1600, rd: 90, volatility: 0.06 }, 25), true);
  });

  test("low RD alone is not enough — game count matters too", () => {
    assert.equal(isEstablished({ rating: 1600, rd: 90, volatility: 0.06 }, 4), false);
  });

  test("many games with a still-uncertain rating is not enough either", () => {
    assert.equal(isEstablished({ rating: 1600, rd: 200, volatility: 0.06 }, 200), false);
  });
});
