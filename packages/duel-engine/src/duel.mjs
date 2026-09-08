/**
 * The Skill Duel Engine core.
 *
 * Owns everything that touches money, identity, or trust: lifecycle, clock,
 * the event log, and settlement hand-off. A game plugin owns only its rules.
 *
 * The protocol asymmetry is the whole design:
 *   client -> server   INTENTS  ("I want to play e2e4")
 *   server -> client   EVENTS   ("move 7 was accepted at t=1234")
 * There is no message shape in which a client asserts a result, a score, or a
 * clock reading. That is enforced here, not by convention in each plugin.
 */
import { createHash } from "node:crypto";
import {
  createClock, applyMove, checkFlag, readClock,
  createSharedClock, sharedExpired, readSharedClock,
} from "./clock.mjs";

export const DuelState = {
  CREATED: "CREATED",
  RESERVED: "RESERVED",
  READY: "READY",
  LIVE: "LIVE",
  COMPLETED: "COMPLETED",
  SETTLED: "SETTLED",
  ABORTED: "ABORTED",
  VOIDED: "VOIDED",
};

/** Reasons an intent can be refused. Never an exception path — always data. */
export const Reject = {
  NOT_LIVE: "NOT_LIVE",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  ILLEGAL: "ILLEGAL",
  MALFORMED: "MALFORMED",
  FLAGGED: "FLAGGED",
};

/**
 * A plugin must supply these. The types are enforced at registration so a
 * malformed plugin fails at startup rather than mid-duel.
 *
 * Note what is absent: there is no hook by which a plugin can ban a player,
 * move money, or declare a player a cheat. `fairPlaySignals` returns evidence;
 * only the Fair Play Engine scores it and only the case system acts on it.
 */
export const TurnModel = {
  /** One player acts at a time; each is charged for their own thinking. */
  ALTERNATING: "ALTERNATING",
  /** Both players race one shared deadline; nobody is "to move". */
  SIMULTANEOUS: "SIMULTANEOUS",
};

const REQUIRED_PLUGIN_METHODS = [
  "createChallenge",
  "applyIntent",
  "evaluate",
  "score",
  "project",
  "fairPlaySignals",
  "serializeReplay",
];

export function registerPlugin(registry, plugin) {
  if (!plugin?.id) throw new TypeError("plugin must declare an id");
  if (!Number.isInteger(plugin.version)) {
    throw new TypeError(`plugin ${plugin.id}: version must be an integer`);
  }
  for (const m of REQUIRED_PLUGIN_METHODS) {
    if (typeof plugin[m] !== "function") {
      throw new TypeError(`plugin ${plugin.id}: missing ${m}()`);
    }
  }
  const model = plugin.turnModel ?? TurnModel.ALTERNATING;
  if (!Object.values(TurnModel).includes(model)) {
    throw new TypeError(`plugin ${plugin.id}: unknown turnModel ${model}`);
  }
  // A simultaneous game has no losing mover when the clock runs out, so it must
  // say how the position is scored at expiry. Chess does not need this: whoever
  // flagged, lost.
  if (model === TurnModel.SIMULTANEOUS && typeof plugin.outcomeOnExpiry !== "function") {
    throw new TypeError(
      `plugin ${plugin.id}: a SIMULTANEOUS game must implement outcomeOnExpiry()`
    );
  }
  if (registry.has(plugin.id)) throw new Error(`plugin ${plugin.id} already registered`);
  registry.set(plugin.id, plugin);
  return registry;
}

/**
 * Create a duel. The challenge is generated server-side from a seed the client
 * never receives; for chess that is the start position, for Speed Math it is
 * the question set. Same contract either way.
 */
export function createDuel({ duelId, plugin, players, seed, config = {}, timeControl, now }) {
  if (players.length !== 2) throw new TypeError("a duel has exactly two players");

  const challenge = plugin.createChallenge(seed, config);
  const turnModel = plugin.turnModel ?? TurnModel.ALTERNATING;

  return {
    duelId,
    gameId: plugin.id,
    pluginVersion: plugin.version,   // persisted: a rules change must not alter old replays
    turnModel,
    players: [...players],
    seed,
    config,
    challenge,
    state: challenge.state,
    status: DuelState.READY,
    clock: turnModel === TurnModel.SIMULTANEOUS
      ? createSharedClock({ durationMs: timeControl.durationMs ?? timeControl.initialMs }, now)
      : createClock(timeControl, now),
    timeControl: turnModel === TurnModel.SIMULTANEOUS
      ? { durationMs: timeControl.durationMs ?? timeControl.initialMs }
      : { initialMs: timeControl.initialMs, incrementMs: timeControl.incrementMs ?? 0 },
    events: [],
    startedAt: now,
    outcome: null,
    // Draw agreement (a PLATFORM action -- see offerDraw/declineDraw/
    // acceptDraw below): which seat currently has an open offer, or null.
    // A plugin cannot see or influence this field.
    drawOfferBy: null,
    drawCooldownUntil: null,
  };
}

export function start(duel, now) {
  duel.status = DuelState.LIVE;
  if (duel.clock.model === "SHARED") duel.clock.startedAt = now;
  else duel.clock.turnStartedAt = now;
  duel.startedAt = now;
  return duel;
}

const isShared = (duel) => duel.clock.model === "SHARED";

/** Clock projection, whichever model this game uses. */
export const projectClock = (duel, t) =>
  isShared(duel) ? readSharedClock(duel.clock, t) : readClock(duel.clock, t);

function append(duel, type, payload, serverTimeMs) {
  const event = { seq: duel.events.length, type, payload, serverTimeMs };
  duel.events.push(event);
  return event;
}

/**
 * The only way a duel advances. `intent` came from a client and is treated as
 * hostile: the plugin decides legality, the engine decides time, and neither
 * consults anything the client claimed about either.
 *
 * The plugin is passed in rather than stored on the duel, so a duel stays a
 * plain serialisable object that can be written to Postgres and read back.
 */
export function runIntent(duel, plugin, { playerId, intent }, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };

  const seat = duel.players.indexOf(playerId);
  if (seat < 0) return { ok: false, reason: Reject.MALFORMED };

  if (isShared(duel)) {
    // No turns to take out of order; the only question is whether time is up.
    if (sharedExpired(duel.clock, serverTimeMs)) {
      return finish(duel, plugin.outcomeOnExpiry(duel.state), serverTimeMs);
    }
  } else {
    if (seat !== duel.clock.toMove) return { ok: false, reason: Reject.NOT_YOUR_TURN };
    const flag = checkFlag(duel.clock, serverTimeMs);
    if (flag.flagged) {
      return finish(duel, {
        result: flag.byIndex === 0 ? "0-1" : "1-0",
        reason: "TIMEOUT",
      }, serverTimeMs);
    }
  }

  const res = plugin.applyIntent(duel.state, intent, { seat, serverTimeMs });
  if (!res.ok) return { ok: false, reason: res.reason };

  duel.state = res.state;
  if (!isShared(duel)) applyMove(duel.clock, serverTimeMs);
  // The board just changed, so any open draw offer is stale -- whoever
  // still wants one must ask again, exactly like the physical convention
  // that a move withdraws a standing offer.
  duel.drawOfferBy = null;

  append(duel, "INTENT_ACCEPTED", { seat, intent, ...res.record }, serverTimeMs);
  for (const e of res.events ?? []) append(duel, e.type, e.payload, serverTimeMs);

  const outcome = plugin.evaluate(duel.state);
  if (outcome) return finish(duel, outcome, serverTimeMs);

  return { ok: true, events: duel.events.slice(-1), clock: projectClock(duel, serverTimeMs) };
}

/** Resignation is an intent like any other, and is always legal. */
export function resign(duel, playerId, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };
  const seat = duel.players.indexOf(playerId);
  if (seat < 0) return { ok: false, reason: Reject.MALFORMED };
  return finish(duel, {
    result: seat === 0 ? "0-1" : "1-0",
    reason: "RESIGNATION",
  }, serverTimeMs);
}

// How long a seat must wait after a DECLINED offer before it may offer
// again. This is the platform's entire defence against draw-offer spam as
// a harassment vector (see the Universal Game Platform spec's own note on
// this) -- a short, fixed cooldown rather than a rate limiter of its own,
// since a genuine draw offer is already a rare, deliberate act.
export const DRAW_OFFER_COOLDOWN_MS = 15000;

/**
 * True for any plugin whose turn model makes "propose to end the game
 * early, by mutual agreement" a coherent idea. A SIMULTANEOUS game (both
 * players racing one shared deadline, nobody "to move") has no natural
 * moment to make or answer an offer, so it is excluded by default; a
 * future SIMULTANEOUS game may opt back in by declaring
 * `allowsDrawOffers: true` explicitly.
 */
function allowsDrawOffers(plugin) {
  if (typeof plugin.allowsDrawOffers === "boolean") return plugin.allowsDrawOffers;
  return (plugin.turnModel ?? TurnModel.ALTERNATING) !== TurnModel.SIMULTANEOUS;
}

/** A player proposes ending the game as an agreed draw. Never final on its
 * own -- see acceptDraw. */
export function offerDraw(duel, plugin, playerId, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };
  if (!allowsDrawOffers(plugin)) return { ok: false, reason: "DRAWS_NOT_ALLOWED" };
  const seat = duel.players.indexOf(playerId);
  if (seat < 0) return { ok: false, reason: Reject.MALFORMED };
  if (duel.drawOfferBy === seat) return { ok: false, reason: "ALREADY_OFFERED" };
  if (duel.drawCooldownUntil !== null && serverTimeMs < duel.drawCooldownUntil) {
    return { ok: false, reason: "ON_COOLDOWN" };
  }
  duel.drawOfferBy = seat;
  append(duel, "DRAW_OFFERED", { seat }, serverTimeMs);
  return { ok: true, offered: true };
}

/** The other player refuses the standing offer. Play continues unchanged. */
export function declineDraw(duel, playerId, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };
  const seat = duel.players.indexOf(playerId);
  if (seat < 0) return { ok: false, reason: Reject.MALFORMED };
  if (duel.drawOfferBy === null || duel.drawOfferBy === seat) {
    return { ok: false, reason: "NO_OFFER" };
  }
  duel.drawOfferBy = null;
  duel.drawCooldownUntil = serverTimeMs + DRAW_OFFER_COOLDOWN_MS;
  append(duel, "DRAW_DECLINED", { seat }, serverTimeMs);
  return { ok: true, declined: true };
}

/** The other player accepts. This is the only path to a "1/2-1/2" result
 * that no plugin ever derives from a position. */
export function acceptDraw(duel, playerId, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };
  const seat = duel.players.indexOf(playerId);
  if (seat < 0) return { ok: false, reason: Reject.MALFORMED };
  if (duel.drawOfferBy === null || duel.drawOfferBy === seat) {
    return { ok: false, reason: "NO_OFFER" };
  }
  return finish(duel, { result: "1/2-1/2", reason: "DRAW_AGREED" }, serverTimeMs);
}

/** Sweeper entry point: no client message involved. */
export function claimTimeout(duel, plugin, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };

  if (isShared(duel)) {
    if (!sharedExpired(duel.clock, serverTimeMs)) return { ok: false, reason: "NOT_FLAGGED" };
    // Nobody forfeits when a shared deadline passes; the position is scored.
    return finish(duel, plugin.outcomeOnExpiry(duel.state), serverTimeMs);
  }

  const flag = checkFlag(duel.clock, serverTimeMs);
  if (!flag.flagged) return { ok: false, reason: "NOT_FLAGGED" };
  return finish(duel, {
    result: flag.byIndex === 0 ? "0-1" : "1-0",
    reason: "TIMEOUT",
  }, serverTimeMs);
}

function finish(duel, outcome, serverTimeMs) {
  duel.status = DuelState.COMPLETED;
  duel.outcome = { ...outcome };
  duel.completedAt = serverTimeMs;
  append(duel, "DUEL_COMPLETED", { ...outcome }, serverTimeMs);
  // Deliberately NOT settled here. Completion and settlement are separate so a
  // settlement failure can retry without re-running the game, and so a duel
  // under fair-play hold can sit in COMPLETED indefinitely.
  return { ok: true, completed: true, outcome: duel.outcome };
}

// --- Replay ------------------------------------------------------------------

/**
 * The canonical, hashable record of a duel. Everything needed to reproduce the
 * result and nothing that varies between runs — no wall-clock "now", no object
 * key ordering left to chance.
 */
export function serializeReplay(duel, plugin) {
  return {
    duelId: duel.duelId,
    gameId: duel.gameId,
    pluginVersion: duel.pluginVersion,
    players: [...duel.players],
    seed: duel.seed,
    config: duel.config,
    timeControl: duel.timeControl,
    initial: plugin.serializeReplay(duel.challenge.state, { initialOnly: true }),
    moves: duel.events
      .filter((e) => e.type === "INTENT_ACCEPTED")
      .map((e) => ({
        seq: e.seq,
        seat: e.payload.seat,
        intent: e.payload.intent,
        atMs: e.serverTimeMs - duel.startedAt,
      })),
    outcome: duel.outcome,
  };
}

/** Stable stringify: key order is fixed by sorting, so the hash is reproducible. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

export function replayHash(replay) {
  return createHash("sha256").update(canonical(replay)).digest("hex");
}

/**
 * Re-run a replay from its initial state and assert it lands where it claims.
 *
 * This is the audit primitive. It is what lets a dispute, a fair-play case, or
 * a regulator be answered with "here is the game, re-run it yourself" rather
 * than "our database says so".
 */
export function verifyReplay(replay, plugin) {
  const rebuilt = plugin.rehydrate(replay.initial, replay.config, replay.seed);
  const simultaneous = (plugin.turnModel ?? TurnModel.ALTERNATING) === TurnModel.SIMULTANEOUS;

  // A simultaneous game has no turn order to check and no per-player clock to
  // charge; its only temporal rule is the shared deadline.
  const clock = simultaneous
    ? createSharedClock({ durationMs: replay.timeControl.durationMs }, 0)
    : createClock(replay.timeControl, 0);

  // Errors are reported by ply — the number a human auditor counts — rather
  // than by internal event sequence, which is an implementation detail.
  for (let i = 0; i < replay.moves.length; i++) {
    const mv = replay.moves[i];
    const ply = i + 1;

    if (simultaneous) {
      if (sharedExpired(clock, mv.atMs)) {
        return { valid: false, error: `ply ${ply}: recorded after the shared deadline` };
      }
    } else if (mv.seat !== clock.toMove) {
      return { valid: false, error: `ply ${ply}: wrong seat` };
    }

    const res = plugin.applyIntent(rebuilt.state, mv.intent, { seat: mv.seat, serverTimeMs: mv.atMs });
    if (!res.ok) {
      return { valid: false, error: `ply ${ply} (${JSON.stringify(mv.intent)}): ${res.reason}` };
    }
    rebuilt.state = res.state;

    if (!simultaneous && applyMove(clock, mv.atMs).flagged) {
      return { valid: false, error: `ply ${ply}: clock flagged during replay` };
    }
  }

  const outcome = plugin.evaluate(rebuilt.state);
  const claimed = replay.outcome;

  // A duel that ended by resignation or timeout has no position-derived
  // outcome; the moves must simply be legal and the record consistent.
  const derivable = outcome !== null;
  if (derivable && (outcome.result !== claimed.result || outcome.reason !== claimed.reason)) {
    return {
      valid: false,
      error: `outcome mismatch: replay derives ${outcome.result}/${outcome.reason}, record claims ${claimed.result}/${claimed.reason}`,
    };
  }

  return { valid: true, derived: outcome, hash: replayHash(replay) };
}
