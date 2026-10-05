import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SpeedMathPlugin, getStreakMultiplier } from "../src/plugin.mjs";

describe("Speed Math Combos, Telemetry & Synchronization", () => {
  describe("Streak Combo Multipliers", () => {
    it("computes standard combo multipliers: 1.0x (<3), 1.2x (3-4), 1.5x (5+)", () => {
      assert.equal(getStreakMultiplier(0), 1.0);
      assert.equal(getStreakMultiplier(1), 1.0);
      assert.equal(getStreakMultiplier(2), 1.0);
      assert.equal(getStreakMultiplier(3), 1.2);
      assert.equal(getStreakMultiplier(4), 1.2);
      assert.equal(getStreakMultiplier(5), 1.5);
      assert.equal(getStreakMultiplier(10), 1.5);
    });

    it("accrues points with multipliers and resets on wrong answer", () => {
      const { state } = SpeedMathPlugin.createChallenge("streak-seed-1", { questionCount: 10 });
      let current = state;

      // Question 0: Correct (streak 1 -> +100)
      const q0 = current.questions[0];
      let res = SpeedMathPlugin.applyIntent(current, { answer: q0.answer }, { seat: 0, serverTimeMs: 1000 });
      assert.equal(res.ok, true);
      assert.equal(res.state.progress[0].streak, 1);
      assert.equal(res.state.progress[0].points, 100);
      current = res.state;

      // Question 1: Correct (streak 2 -> +100 -> 200)
      const q1 = current.questions[1];
      res = SpeedMathPlugin.applyIntent(current, { answer: q1.answer }, { seat: 0, serverTimeMs: 2000 });
      assert.equal(res.state.progress[0].streak, 2);
      assert.equal(res.state.progress[0].points, 200);
      current = res.state;

      // Question 2: Correct (streak 3 -> 1.2x combo -> +120 -> 320)
      const q2 = current.questions[2];
      res = SpeedMathPlugin.applyIntent(current, { answer: q2.answer }, { seat: 0, serverTimeMs: 3000 });
      assert.equal(res.state.progress[0].streak, 3);
      assert.equal(res.state.progress[0].points, 320);
      current = res.state;

      // Question 3: Correct (streak 4 -> 1.2x combo -> +120 -> 440)
      const q3 = current.questions[3];
      res = SpeedMathPlugin.applyIntent(current, { answer: q3.answer }, { seat: 0, serverTimeMs: 4000 });
      assert.equal(res.state.progress[0].streak, 4);
      assert.equal(res.state.progress[0].points, 440);
      current = res.state;

      // Question 4: Correct (streak 5 -> 1.5x mega combo -> +150 -> 590)
      const q4 = current.questions[4];
      res = SpeedMathPlugin.applyIntent(current, { answer: q4.answer }, { seat: 0, serverTimeMs: 5000 });
      assert.equal(res.state.progress[0].streak, 5);
      assert.equal(res.state.progress[0].points, 590);
      current = res.state;

      // Question 5: WRONG answer -> streak resets to 0, points remain 590
      res = SpeedMathPlugin.applyIntent(current, { answer: -999 }, { seat: 0, serverTimeMs: 6000 });
      assert.equal(res.state.progress[0].streak, 0);
      assert.equal(res.state.progress[0].points, 590);
      assert.equal(res.state.progress[0].wrong, 1);
      current = res.state;

      // Question 6: Correct -> streak restarts at 1 -> +100 -> 690
      const q6 = current.questions[6];
      res = SpeedMathPlugin.applyIntent(current, { answer: q6.answer }, { seat: 0, serverTimeMs: 7000 });
      assert.equal(res.state.progress[0].streak, 1);
      assert.equal(res.state.progress[0].points, 690);
    });
  });

  describe("Identical Synchronized Problem Set", () => {
    it("guarantees both seats have access to identical question sequences", () => {
      const { state } = SpeedMathPlugin.createChallenge("sync-seed-44", { questionCount: 20 });
      const p0 = SpeedMathPlugin.project(state, "player", 0);
      const p1 = SpeedMathPlugin.project(state, "player", 1);

      assert.deepEqual(p0.current, p1.current);
      assert.equal(state.questions.length, 20);
    });
  });

  describe("Tie Resolution Hierarchy", () => {
    it("breaks points tie in favor of higher accuracy (fewer wrong answers)", () => {
      const state = {
        config: { questionCount: 10 },
        questions: [{ answer: 1 }],
        progress: [
          // Player 0: 300 points, 0 wrong
          { index: 3, correct: 3, wrong: 0, streak: 3, bestStreak: 3, points: 300, totalMs: 5000, times: [] },
          // Player 1: 300 points, 2 wrong
          { index: 5, correct: 3, wrong: 2, streak: 1, bestStreak: 2, points: 300, totalMs: 4000, times: [] },
        ],
        answers: [[], []],
      };

      const outcome = SpeedMathPlugin.outcomeOnExpiry(state);
      assert.equal(outcome.result, "1-0");
      assert.match(outcome.reason, /TIEBREAK_ACCURACY/);
    });

    it("breaks points and accuracy tie in favor of lower total answering time", () => {
      const state = {
        config: { questionCount: 10 },
        questions: [{ answer: 1 }],
        progress: [
          // Player 0: 300 points, 1 wrong, 6500ms
          { index: 4, correct: 3, wrong: 1, streak: 2, bestStreak: 2, points: 300, totalMs: 6500, times: [] },
          // Player 1: 300 points, 1 wrong, 4200ms -> Winner on time!
          { index: 4, correct: 3, wrong: 1, streak: 2, bestStreak: 2, points: 300, totalMs: 4200, times: [] },
        ],
        answers: [[], []],
      };

      const outcome = SpeedMathPlugin.outcomeOnExpiry(state);
      assert.equal(outcome.result, "0-1");
      assert.match(outcome.reason, /TIEBREAK_TIME/);
    });
  });

  describe("Anti-Bot Telemetry (<120ms Inhuman Threshold)", () => {
    it("flags any answer delivered in under 120ms as IMPOSSIBLE_INPUT", () => {
      const state = {
        progress: [
          {
            times: [
              { at: 500, ms: 500 },
              { at: 900, ms: 400 },
              { at: 1300, ms: 400 },
              { at: 1700, ms: 400 },
              { at: 2100, ms: 400 },
              { at: 2500, ms: 400 },
              { at: 2900, ms: 400 },
              { at: 2985, ms: 85 }, // 85ms is < 120ms!
            ],
          },
          { times: [] },
        ],
      };

      const signals = SpeedMathPlugin.fairPlaySignals(state, { seat: 0 });
      const sub120 = signals.find((s) => s.id === "speed_math.sub_120ms_threshold");
      assert.ok(sub120, "Must detect sub-120ms answer");
      assert.equal(sub120.kind, "IMPOSSIBLE_INPUT");
      assert.equal(sub120.strength, 1.0);
      assert.equal(sub120.baseline.humanFloorMs, 120);
    });
  });
});
