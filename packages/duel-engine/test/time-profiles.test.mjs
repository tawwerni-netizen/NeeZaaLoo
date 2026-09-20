import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTimeControl, tryResolveTimeControl, PROFILED_GAMES, DEFAULT_TIME_PROFILE, TimeProfileError,
} from "../src/time-profiles.mjs";

const ALL_TEN = [
  "chess", "checkers", "dominoes", "backgammon", "seega",
  "connect-four", "xo", "speed-math", "reversi", "gomoku",
];

describe("per-game time controls: every launch game has a safe, real profile", () => {
  test("the catalogue knows exactly the ten launch games -- no more, no fewer", () => {
    assert.deepEqual([...PROFILED_GAMES].sort(), [...ALL_TEN].sort());
  });

  test("every game resolves all three profiles without throwing", () => {
    for (const gameId of ALL_TEN) {
      for (const profile of ["BLITZ", "STANDARD", "EXTENDED"]) {
        assert.doesNotThrow(() => resolveTimeControl(gameId, profile), `${gameId}/${profile}`);
      }
    }
  });

  test("STANDARD is the default when no profile is named", () => {
    assert.deepEqual(resolveTimeControl("chess"), resolveTimeControl("chess", DEFAULT_TIME_PROFILE));
  });

  test("every ALTERNATING game's profile is {initialMs, incrementMs}, both positive", () => {
    for (const gameId of ALL_TEN) {
      if (gameId === "speed-math") continue;
      for (const profile of ["BLITZ", "STANDARD", "EXTENDED"]) {
        const tc = resolveTimeControl(gameId, profile);
        assert.ok(Number.isFinite(tc.initialMs) && tc.initialMs > 0, `${gameId}/${profile} initialMs`);
        assert.ok(Number.isFinite(tc.incrementMs) && tc.incrementMs >= 0, `${gameId}/${profile} incrementMs`);
        assert.equal(tc.durationMs, undefined, `${gameId}/${profile} must not carry durationMs`);
      }
    }
  });

  test("Speed Math (SIMULTANEOUS) is {durationMs} only -- never initialMs/incrementMs", () => {
    for (const profile of ["BLITZ", "STANDARD", "EXTENDED"]) {
      const tc = resolveTimeControl("speed-math", profile);
      assert.ok(Number.isFinite(tc.durationMs) && tc.durationMs > 0, profile);
      assert.equal(tc.initialMs, undefined);
      assert.equal(tc.incrementMs, undefined);
    }
  });

  test("Dominoes and Backgammon are increment-led, not just a smaller copy of chess's clock", () => {
    // The whole point of Finding C: many shallow/forced turns need
    // increment more than base time. Confirm the catalogue actually
    // encodes that shape rather than reusing chess's own numbers.
    const chess = resolveTimeControl("chess", "STANDARD");
    const dominoes = resolveTimeControl("dominoes", "STANDARD");
    const backgammon = resolveTimeControl("backgammon", "STANDARD");
    assert.ok(dominoes.initialMs < chess.initialMs, "dominoes base time is smaller than chess's");
    assert.ok(dominoes.incrementMs > chess.incrementMs, "dominoes increment is larger than chess's");
    assert.ok(backgammon.incrementMs > chess.incrementMs, "backgammon increment is larger than chess's");
  });

  test("BLITZ < STANDARD < EXTENDED in total base time, for every game", () => {
    for (const gameId of ALL_TEN) {
      const key = gameId === "speed-math" ? "durationMs" : "initialMs";
      const blitz = resolveTimeControl(gameId, "BLITZ")[key];
      const standard = resolveTimeControl(gameId, "STANDARD")[key];
      const extended = resolveTimeControl(gameId, "EXTENDED")[key];
      assert.ok(blitz < standard, `${gameId}: BLITZ < STANDARD`);
      assert.ok(standard < extended, `${gameId}: STANDARD < EXTENDED`);
    }
  });

  test("an unknown game throws UNKNOWN_GAME, never silently reissuing chess's clock", () => {
    try {
      resolveTimeControl("memory-grid");
      assert.fail("expected a throw");
    } catch (e) {
      assert.equal(e.code, TimeProfileError.UNKNOWN_GAME);
    }
  });

  test("an unknown profile name throws UNKNOWN_PROFILE", () => {
    try {
      resolveTimeControl("chess", "SPEEDRUN");
      assert.fail("expected a throw");
    } catch (e) {
      assert.equal(e.code, TimeProfileError.UNKNOWN_PROFILE);
    }
  });

  test("tryResolveTimeControl returns null instead of throwing, for a caller that wants a 400", () => {
    assert.equal(tryResolveTimeControl("memory-grid"), null);
    assert.equal(tryResolveTimeControl("chess", "SPEEDRUN"), null);
    assert.ok(tryResolveTimeControl("chess", "BLITZ"));
  });

  test("resolveTimeControl returns a fresh object each call -- a caller mutating one never corrupts the catalogue", () => {
    const a = resolveTimeControl("chess", "STANDARD");
    a.initialMs = 1;
    const b = resolveTimeControl("chess", "STANDARD");
    assert.notEqual(b.initialMs, 1);
  });
});
