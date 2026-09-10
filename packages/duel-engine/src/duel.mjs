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
  // Sequence admission (see runIntent's own header on `nonce`/`baseVersion`).
  // A client named a `baseVersion` other than the duel's current event
  // count: it decided this action against a board it no longer has.
  STALE_VERSION: "STALE_VERSION",
  // A nonce arrived out of order -- neither the next one nor a reuse of
  // the last one. Could be an honest gap (a dropped ack the client never
  // saw) or an attempt to skip ahead; either way it is refused, never
  // guessed at.
  STALE_ACTION: "STALE_ACTION",
  // A nonce already used, with a DIFFERENT payload than what was accepted
  // under it (or a nonce from further back than the last accepted one at
  // all). No honest retry produces this -- an honest retry resends the
  // exact same payload under the exact same nonce, which is a DUPLICATE
  // (see runIntent's `duplicate: true` result), not a replay.
  REPLAYED_ACTION: "REPLAYED_ACTION",
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
 * A seat's own admission state, derived entirely from the event log rather
 * than persisted anywhere new: `lastNonce[seat]` is simply a count of that
 * seat's own accepted INTENT_ACCEPTED events, and `lastIntent[seat]` is the
 * payload of the last one. Both are exactly what `runIntent`'s sequence
 * admission (below) needs to distinguish a fresh action from a duplicate
 * retry, a replay, or a gap -- and both survive a gateway restart for
 * free, since `store.hydrate()` calls this over the SAME `duel_event` rows
 * it already replays into `state`. No new column, no second source of
 * truth that could ever disagree with the log itself.
 */
export function deriveSequenceState(events) {
  const lastNonce = [0, 0];
  const lastIntent = [null, null];
  for (const e of events) {
    if (e.type !== "INTENT_ACCEPTED") continue;
    const seat = e.payload.seat;
    lastNonce[seat] = (lastNonce[seat] ?? 0) + 1;
    lastIntent[seat] = e.payload.intent;
  }
  return { lastNonce, lastIntent };
}

/**
 * How long each seat took to decide each of its own moves, in order --
 * the raw material `plugin.fairPlaySignals()` needs (see its own contract
 * in REQUIRED_PLUGIN_METHODS' header). A seat's Nth think-time is the gap
 * between the event that put the board in front of them and the moment
 * they answered it: the previous event's server time (or `duel.startedAt`
 * for the very first ply of the whole duel), never a client-reported
 * duration. Derived purely from the already-durable event log -- nothing
 * new is recorded to make this possible.
 */
export function deriveMoveTimes(duel) {
  const times = [[], []];
  let previousAt = duel.startedAt;
  for (const e of duel.events) {
    if (e.type !== "INTENT_ACCEPTED") continue;
    times[e.payload.seat].push(Math.max(0, e.serverTimeMs - previousAt));
    previousAt = e.serverTimeMs;
  }
  return times;
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
    // A game's own challenge.state.turn is the ONLY source of truth for
    // who actually moves first -- most launch games always hand that to
    // seat 0 by their own convention, but Dominoes does not (whoever
    // holds the highest double leads, see game-dominoes/src/dominoes.mjs's
    // own header), so the clock must be told, not assumed. See
    // createClock's own header for what silently trusting the default
    // used to cost.
    clock: turnModel === TurnModel.SIMULTANEOUS
      ? createSharedClock({ durationMs: timeControl.durationMs ?? timeControl.initialMs }, now)
      : createClock(timeControl, now, challenge.state?.turn ?? 0),
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
    // Sequence admission (see deriveSequenceState's own header). Empty at
    // creation, since there are no events yet.
    seq: deriveSequenceState([]),
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
 *
 * `nonce`/`baseVersion` are the sequence-admission fields (see
 * Reject.STALE_VERSION/STALE_ACTION/REPLAYED_ACTION above): a per-seat,
 * client-incremented counter and the event count the client last saw.
 * Both are OPTIONAL here -- omitting `nonce` entirely exempts this call
 * from admission checking, which is deliberate, not a gap: an internal
 * caller with no client frame behind it at all (the VS_COMPUTER bot
 * adapter submitting its own move, `store.hydrate()` replaying the event
 * log back through this same function) has no nonce to check and needs
 * none. Every REAL client message reaches this function through the
 * gateway, which always supplies both -- see protocol.mjs's own INTENT
 * shape and gateway.mjs's INTENT handler.
 */
export function runIntent(duel, plugin, { playerId, intent, nonce, baseVersion }, serverTimeMs) {
  if (duel.status !== DuelState.LIVE) return { ok: false, reason: Reject.NOT_LIVE };

  const seat = duel.players.indexOf(playerId);
  if (seat < 0) return { ok: false, reason: Reject.MALFORMED };

  if (nonce !== undefined) {
    // Nonce is checked BEFORE baseVersion, deliberately: confirming an
    // action this seat already got accepted (a duplicate) or refusing one
    // it forged (a replay) is a judgement about the PAST, and must not
    // depend on whether the board has moved on since -- a client that
    // never saw its own first ack still has yesterday's baseVersion in
    // hand when it retries, and that retry is exactly as valid as the
    // original was. Only a FRESH decision (a nonce actually advancing the
    // sequence) needs to be checked against the board it claims to have
    // been decided against.
    const last = duel.seq.lastNonce[seat];
    if (nonce === last) {
      // A reused nonce is either an honest retry (the client never saw the
      // server's ack and resent exactly what it sent before) or a forged
      // replay wearing the retry's shape. The payload is what tells them
      // apart -- and only the exact same payload gets the free, no-op pass.
      if (canonical(intent) === canonical(duel.seq.lastIntent[seat])) {
        return { ok: true, duplicate: true, events: [], clock: projectClock(duel, serverTimeMs) };
      }
      return { ok: false, reason: Reject.REPLAYED_ACTION };
    }
    if (nonce < last) {
      // Older than the seat's own last accepted action: whatever this was
      // an attempt to redo, it has already been superseded by a real move.
      return { ok: false, reason: Reject.REPLAYED_ACTION };
    }
    if (nonce !== last + 1) {
      // Neither the next nonce nor a reuse of the last one -- a gap.
      return { ok: false, reason: Reject.STALE_ACTION };
    }
    // nonce === last + 1: a genuinely fresh decision -- NOW it matters
    // whether it was decided against the board that actually exists.
    if (baseVersion !== undefined && baseVersion !== duel.events.length) {
      return { ok: false, reason: Reject.STALE_VERSION, currentVersion: duel.events.length };
    }
  }

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

  // Captured BEFORE applyIntent overwrites duel.state below -- this is the
  // only way to tell whether the ply just accepted actually handed the
  // turn to the other seat, or left it with the SAME seat (a checkers
  // mandatory multi-jump continuing, a Backgammon turn with dice still
  // unplayed). See applyMove's own `keepMover` header for why that
  // distinction matters to the CLOCK, not just the board.
  const turnBefore = isShared(duel) ? null : duel.state.turn;

  const res = plugin.applyIntent(duel.state, intent, { seat, serverTimeMs });
  if (!res.ok) return { ok: false, reason: res.reason };

  duel.state = res.state;
  if (!isShared(duel)) {
    const turnAfter = res.state.turn;
    const keepMover = turnAfter !== undefined && turnAfter === turnBefore;
    applyMove(duel.clock, serverTimeMs, { keepMover });
  }
  // The board just changed, so any open draw offer is stale -- whoever
  // still wants one must ask again, exactly like the physical convention
  // that a move withdraws a standing offer.
  duel.drawOfferBy = null;

  if (nonce !== undefined) {
    duel.seq.lastNonce[seat] = nonce;
    duel.seq.lastIntent[seat] = intent;
  }

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
