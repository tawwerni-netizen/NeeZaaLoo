/**
 * Per-game time controls, resolved server-side only.
 *
 * Before this file existed, two separate call sites (the matchmaking ticket
 * route and the friend-challenge accept path) each hardcoded the SAME
 * chess-shaped clock -- 5 minutes, no increment -- and applied it to EVERY
 * game, including Dominoes and Backgammon, which have many shallow, often
 * forced turns and need increment far more than base time. VS_COMPUTER had
 * its own, third, identical hardcoded default. A caller could also simply
 * pass its own `timeControl` object in the request body and have it
 * accepted verbatim -- "the UI must never allow an invalid value; the
 * backend must revalidate everything" was not actually true for the clock.
 *
 * This file replaces all of that with one named catalogue, keyed by
 * (gameId, profile), that every entry point resolves from -- never a raw
 * `{initialMs, incrementMs}` a caller supplied. A request may name a
 * profile; it may not invent one.
 *
 * Base time pays for deliberation; increment pays for turn count. A game
 * with many shallow turns (Dominoes, Backgammon) is punished by a large
 * base and no increment -- the clock drains on mechanical moves rather
 * than real decisions. A game with few deep turns (Chess, Reversi) needs
 * the base. STANDARD is what every queued ticket, friend challenge, and
 * VS_COMPUTER duel resolves to unless a caller names a different profile;
 * BLITZ and EXTENDED exist for a future explicit choice (e.g. a
 * tournament's own configuration) and are validated identically.
 */
import { TurnModel } from "./duel.mjs";

/** `durationMs` for a SIMULTANEOUS game (Speed Math); `{initialMs,
 * incrementMs}` (in ms) for an ALTERNATING one. Minutes/seconds in the
 * comments are the human-readable "m+s" shorthand this table was designed
 * against; the values below are always plain milliseconds. */
const PROFILES = {
  chess: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 180_000, incrementMs: 2_000, perMoveMs: 10_000 },  // 10s per move
    STANDARD: { initialMs: 300_000, incrementMs: 3_000, perMoveMs: 60_000 },  // 1m per move (Anti-cheat strict cap)
    EXTENDED: { initialMs: 600_000, incrementMs: 5_000, perMoveMs: 120_000 }, // 2m per move
    PER_MOVE_5S:   { initialMs: 5_000, incrementMs: 0, perMoveMs: 5_000 },
    PER_MOVE_10S:  { initialMs: 10_000, incrementMs: 0, perMoveMs: 10_000 },
    PER_MOVE_30S:  { initialMs: 30_000, incrementMs: 0, perMoveMs: 30_000 },
    PER_MOVE_60S:  { initialMs: 60_000, incrementMs: 0, perMoveMs: 60_000 },
    PER_MOVE_120S: { initialMs: 120_000, incrementMs: 0, perMoveMs: 120_000 },
    UNLIMITED:     { initialMs: 86_400_000, incrementMs: 0, perMoveMs: 86_400_000 },
  },
  checkers: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 180_000, incrementMs: 2_000 },  // 3+2
    STANDARD: { initialMs: 240_000, incrementMs: 3_000 },  // 4+3
    EXTENDED: { initialMs: 480_000, incrementMs: 5_000 },  // 8+5
  },
  dominoes: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 120_000, incrementMs: 3_000 },  // 2+3
    STANDARD: { initialMs: 180_000, incrementMs: 5_000 },  // 3+5
    EXTENDED: { initialMs: 300_000, incrementMs: 8_000 },  // 5+8
  },
  backgammon: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 180_000, incrementMs: 5_000 },  // 3+5
    STANDARD: { initialMs: 300_000, incrementMs: 8_000 },  // 5+8
    EXTENDED: { initialMs: 600_000, incrementMs: 12_000 }, // 10+12
  },
  seega: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 180_000, incrementMs: 3_000 },  // 3+3
    STANDARD: { initialMs: 300_000, incrementMs: 5_000 },  // 5+5
    EXTENDED: { initialMs: 600_000, incrementMs: 8_000 },  // 10+8
  },
  "connect-four": {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 120_000, incrementMs: 2_000 },  // 2+2
    STANDARD: { initialMs: 180_000, incrementMs: 3_000 },  // 3+3
    EXTENDED: { initialMs: 300_000, incrementMs: 5_000 },  // 5+5
  },
  xo: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 30_000,  incrementMs: 2_000 },  // 30s+2
    STANDARD: { initialMs: 60_000,  incrementMs: 3_000 },  // 60s+3
    EXTENDED: { initialMs: 120_000, incrementMs: 5_000 },  // 120s+5
  },
  "speed-math": {
    turnModel: TurnModel.SIMULTANEOUS,
    BLITZ:    { durationMs: 30_000 },
    STANDARD: { durationMs: 60_000 },
    EXTENDED: { durationMs: 120_000 },
  },
  reversi: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 180_000, incrementMs: 2_000 },  // 3+2
    STANDARD: { initialMs: 300_000, incrementMs: 3_000 },  // 5+3
    EXTENDED: { initialMs: 600_000, incrementMs: 5_000 },  // 10+5
  },
  gomoku: {
    turnModel: TurnModel.ALTERNATING,
    BLITZ:    { initialMs: 180_000, incrementMs: 3_000 },  // 3+3
    STANDARD: { initialMs: 300_000, incrementMs: 5_000 },  // 5+5
    EXTENDED: { initialMs: 600_000, incrementMs: 8_000 },  // 10+8
  },
};

export const DEFAULT_TIME_PROFILE = "STANDARD";

export const TimeProfileError = Object.freeze({
  UNKNOWN_GAME: "UNKNOWN_GAME",
  UNKNOWN_PROFILE: "UNKNOWN_PROFILE",
});

/** Every game this catalogue knows, for callers that want to validate a
 * gameId before ever reaching resolveTimeControl. */
export const PROFILED_GAMES = Object.freeze(Object.keys(PROFILES));

/**
 * The only path to a real time control. Returns a fresh, ms-shaped object
 * (safe to JSON.stringify straight into `duel.time_control`); throws on an
 * unknown game or profile rather than silently falling back, so a typo in
 * a caller reads as a bug immediately instead of quietly reissuing chess's
 * clock to whatever game was actually requested.
 */
export function resolveTimeControl(gameId, profile = DEFAULT_TIME_PROFILE) {
  const table = PROFILES[gameId];
  if (!table) {
    throw Object.assign(new Error(`no time profile for game ${gameId}`), { code: TimeProfileError.UNKNOWN_GAME });
  }
  const tc = table[profile];
  if (!tc) {
    throw Object.assign(
      new Error(`game ${gameId} has no "${profile}" time profile`),
      { code: TimeProfileError.UNKNOWN_PROFILE }
    );
  }
  return { ...tc };
}

/** Same lookup, but returns `null` instead of throwing -- for a caller
 * (an HTTP handler) that wants to turn an invalid request into a 400
 * rather than an uncaught exception. */
export function tryResolveTimeControl(gameId, profile = DEFAULT_TIME_PROFILE) {
  try {
    return resolveTimeControl(gameId, profile);
  } catch {
    return null;
  }
}
