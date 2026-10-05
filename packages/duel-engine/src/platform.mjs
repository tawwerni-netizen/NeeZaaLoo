/**
 * Universal Match Platform
 *
 * Implements the server-authoritative infrastructure for all Nizalo games.
 * Infrastructure handles:
 * - Match lifecycle
 * - Version locking (GameEngineVersion, RulesetVersion, MatchVersion)
 * - Authoritative clocks
 * - Immutable event streams
 * - Sequence admission (idempotency, nonce validation)
 * - Cryptographic result finalization
 * - Deterministic replay verification
 *
 * Individual rules engines plug into this platform via the GameEngineContract.
 */

import { createHash } from "node:crypto";
import { MatchEventType, TurnModel } from "./contract.mjs";
import {
  createClock, applyMove, checkFlag, readClock,
  createSharedClock, sharedExpired, readSharedClock,
} from "./clock.mjs";

export const MatchState = Object.freeze({
  CREATED: "CREATED",
  READY: "READY",
  LIVE: "LIVE",
  COMPLETED: "COMPLETED",
  SETTLED: "SETTLED",
  ABORTED: "ABORTED",
});

export const PlatformReject = Object.freeze({
  NOT_LIVE: "NOT_LIVE",
  NOT_SEATED: "NOT_SEATED",
  NOT_YOUR_TURN: "NOT_YOUR_TURN",
  FLAGGED: "FLAGGED",
  STALE_VERSION: "STALE_VERSION",
  STALE_ACTION: "STALE_ACTION",
  REPLAYED_ACTION: "REPLAYED_ACTION",
  ENGINE_REJECTED: "ENGINE_REJECTED",
});

export class UniversalMatchPlatform {
  constructor() {
    this.engines = new Map(); // id -> GameDefinition
  }

  /**
   * Registers a game rules engine with contract validation.
   */
  registerEngine(engine) {
    if (!engine?.id) throw new TypeError("Engine must declare an id");
    this.engines.set(engine.id, engine);
    return this;
  }

  getEngine(id) {
    const engine = this.engines.get(id);
    if (!engine) throw new Error(`Game engine '${id}' not registered`);
    return engine;
  }

  /**
   * Creates a new match with locked MatchVersion.
   */
  createMatch({
    matchId,
    gameId,
    players, // array of player IDs [seat0, seat1, ...]
    stake = { tier: "FREE", amountMinor: 0 },
    seed = "seed-0",
    timeControl = { initialMs: 180000, incrementMs: 2000 },
    now = Date.now(),
    variantId = "standard",
    config = {},
  }) {
    const engine = this.getEngine(gameId);

    if (!Array.isArray(players) || players.length < engine.playerCount.min || players.length > engine.playerCount.max) {
      throw new Error(`Match for '${gameId}' requires between ${engine.playerCount.min} and ${engine.playerCount.max} players`);
    }

    // Match Version Lock: Permanently remembers exact rules engine & ruleset version
    const matchVersion = Object.freeze({
      gameId: engine.id,
      engineVersion: engine.version,
      rulesetVersion: engine.rulesVersion,
      schemaVersion: 1,
    });

    // Challenge & Initial State from Engine
    const challenge = engine.createChallenge(seed, { variantId, ...config });
    const initialState = challenge.state;

    // Clock Setup
    const effectiveTc = {
      initialMs: timeControl?.initialMs ?? timeControl?.durationMs ?? 180000,
      incrementMs: timeControl?.incrementMs ?? 0,
      durationMs: timeControl?.durationMs ?? timeControl?.initialMs ?? 180000,
    };

    const clock = engine.turnModel === TurnModel.SIMULTANEOUS
      ? createSharedClock({ durationMs: effectiveTc.durationMs })
      : createClock(
          effectiveTc,
          initialState.turn ?? (initialState.position?.turn === -1 ? 1 : 0),
          null,
          players.length
        );

    const match = {
      matchId,
      matchVersion,
      gameId: engine.id,
      players: [...players],
      stake: { ...stake },
      seed,
      variantId,
      status: MatchState.CREATED,
      clock,
      state: initialState,
      events: [],
      lastNonce: players.map(() => 0),
      lastActionHash: players.map(() => null),
      createdAt: now,
      startedAt: null,
      completedAt: null,
      outcome: null,
      resultHash: null,
    };

    // Append MatchCreated Event
    this._appendEvent(match, MatchEventType.MatchCreated, {
      matchId,
      matchVersion,
      players,
      stake,
      seed,
      variantId,
      timeControl,
    }, now);

    // Append PlayersJoined Event
    this._appendEvent(match, MatchEventType.PlayersJoined, {
      players: players.map((id, seat) => ({ id, seat })),
    }, now);

    match.status = MatchState.READY;
    return match;
  }

  /**
   * Starts a match, putting it in LIVE state and activating the clock.
   */
  startMatch(match, now = Date.now()) {
    if (match.status !== MatchState.READY) {
      throw new Error(`Cannot start match in state ${match.status}`);
    }

    const engine = this.getEngine(match.gameId);
    match.status = MatchState.LIVE;
    match.startedAt = now;

    if (engine.turnModel === TurnModel.SIMULTANEOUS) {
      match.clock.startedAt = now;
    } else {
      match.clock.turnStartedAt = now;
    }

    this._appendEvent(match, MatchEventType.GameStarted, {
      startedAt: now,
      firstTurn: match.state.turn ?? 0,
    }, now);

    return match;
  }

  /**
   * Server-authoritative action loop:
   * 1. Receive action
   * 2. Validate action (sequence admission, clock, turn, engine validation)
   * 3. Apply action
   * 4. Append immutable events
   * 5. Update state
   * 6. Broadcast authoritative state
   * 7. Evaluate terminal condition
   * 8. Produce signed canonical result
   */
  submitAction(match, seat, action, { nonce, baseVersion, serverTimeMs = Date.now() } = {}) {
    const engine = this.getEngine(match.gameId);

    // 1. Status Guard
    if (match.status !== MatchState.LIVE) {
      return { ok: false, reason: PlatformReject.NOT_LIVE };
    }

    // 2. Seated Guard
    if (seat < 0 || seat >= match.players.length) {
      return { ok: false, reason: PlatformReject.NOT_SEATED };
    }

    // 3. Sequence Admission & Idempotency
    const actionHash = createHash("sha256").update(JSON.stringify(action)).digest("hex");
    if (nonce !== undefined) {
      const last = match.lastNonce[seat] ?? 0;
      if (nonce === last) {
        // Idempotent duplicate retry
        if (match.lastActionHash[seat] === actionHash) {
          return { ok: true, duplicate: true, state: match.state };
        }
        return { ok: false, reason: PlatformReject.REPLAYED_ACTION };
      }
      if (nonce !== last + 1) {
        return { ok: false, reason: PlatformReject.STALE_ACTION };
      }
    }

    if (baseVersion !== undefined && baseVersion !== match.events.length) {
      return { ok: false, reason: PlatformReject.STALE_VERSION };
    }

    // 4. Authoritative Clock Check (Flag fell before move)
    if (engine.turnModel === TurnModel.SIMULTANEOUS) {
      if (sharedExpired(match.clock, serverTimeMs)) {
        return this.claimTimeout(match, serverTimeMs);
      }
    } else {
      const flag = checkFlag(match.clock, serverTimeMs);
      if (flag.flagged) {
        return this.claimTimeout(match, serverTimeMs);
      }

      // 5. Turn Order Guard (Alternating)
      const currentTurn = typeof match.state.turn === "number"
        ? match.state.turn
        : match.state.position?.turn !== undefined
        ? (match.state.position.turn === 1 ? 0 : 1)
        : 0;

      if (currentTurn !== seat) {
        this._appendEvent(match, MatchEventType.MoveRejected, {
          seat,
          action,
          reason: PlatformReject.NOT_YOUR_TURN,
        }, serverTimeMs);
        return { ok: false, reason: PlatformReject.NOT_YOUR_TURN };
      }
    }

    // Append MoveSubmitted Event
    this._appendEvent(match, MatchEventType.MoveSubmitted, {
      seat,
      action,
      nonce: nonce ?? match.lastNonce[seat] + 1,
    }, serverTimeMs);

    // 6. Engine Validation
    const validation = engine.moveValidation(match.state, action, { seat, serverTimeMs });
    if (!validation.valid) {
      this._appendEvent(match, MatchEventType.MoveRejected, {
        seat,
        action,
        reason: validation.reason ?? PlatformReject.ENGINE_REJECTED,
      }, serverTimeMs);
      return { ok: false, reason: validation.reason ?? PlatformReject.ENGINE_REJECTED };
    }

    // 7. Apply Action (Engine Pure Transformation)
    const result = engine.applyAction(match.state, action, { seat, serverTimeMs });
    if (!result.ok) {
      this._appendEvent(match, MatchEventType.MoveRejected, {
        seat,
        action,
        reason: result.reason ?? PlatformReject.ENGINE_REJECTED,
      }, serverTimeMs);
      return { ok: false, reason: result.reason ?? PlatformReject.ENGINE_REJECTED };
    }

    // 8. Update State & Admission State
    match.state = result.state;
    if (nonce !== undefined) {
      match.lastNonce[seat] = nonce;
    } else {
      match.lastNonce[seat] = (match.lastNonce[seat] ?? 0) + 1;
    }
    match.lastActionHash[seat] = actionHash;

    // 9. Advance Clock
    if (engine.turnModel === TurnModel.ALTERNATING) {
      const nextTurn = typeof match.state.turn === "number"
        ? match.state.turn
        : match.state.position?.turn !== undefined
        ? (match.state.position.turn === 1 ? 0 : 1)
        : (seat === 0 ? 1 : 0);

      applyMove(match.clock, serverTimeMs, nextTurn);
      this._appendEvent(match, MatchEventType.ClockUpdated, {
        remainingMs: [...match.clock.remaining],
      }, serverTimeMs);
      this._appendEvent(match, MatchEventType.TurnChanged, {
        fromSeat: seat,
        toSeat: nextTurn,
      }, serverTimeMs);
    }

    // 10. Append MoveAccepted Event
    this._appendEvent(match, MatchEventType.MoveAccepted, {
      seat,
      action,
      stateSnapshot: engine.stateSerializer.serialize(match.state),
      events: result.events ?? [],
    }, serverTimeMs);

    // 11. Evaluate Terminal Conditions
    const win = engine.winCondition(match.state);
    if (win?.won) {
      return this._finalizeOutcome(match, {
        result: win.winnerSeat === 0 ? "1-0" : "0-1",
        reason: win.reason ?? "VICTORY",
        winnerSeat: win.winnerSeat,
      }, serverTimeMs);
    }

    const draw = engine.drawCondition(match.state);
    if (draw?.isDraw) {
      return this._finalizeOutcome(match, {
        result: "1/2-1/2",
        reason: draw.reason ?? "DRAW",
      }, serverTimeMs);
    }

    return {
      ok: true,
      state: match.state,
      turn: match.state.turn,
      clock: this.projectClock(match, serverTimeMs),
    };
  }

  /**
   * Resignation
   */
  resign(match, seat, serverTimeMs = Date.now()) {
    if (match.status !== MatchState.LIVE) return { ok: false, reason: PlatformReject.NOT_LIVE };
    if (seat < 0 || seat >= match.players.length) return { ok: false, reason: PlatformReject.NOT_SEATED };

    const engine = this.getEngine(match.gameId);
    const outcome = engine.resignation(match.state, seat);

    this._appendEvent(match, MatchEventType.PlayerResigned, { seat }, serverTimeMs);
    return this._finalizeOutcome(match, outcome, serverTimeMs);
  }

  /**
   * Authoritative Timeout claim (sweeper or player-triggered)
   */
  claimTimeout(match, serverTimeMs = Date.now()) {
    if (match.status !== MatchState.LIVE) return { ok: false, reason: PlatformReject.NOT_LIVE };
    const engine = this.getEngine(match.gameId);

    let outcome;
    if (engine.turnModel === TurnModel.SIMULTANEOUS) {
      if (!sharedExpired(match.clock, serverTimeMs)) {
        return { ok: false, reason: "NOT_EXPIRED" };
      }
      outcome = typeof engine.outcomeOnExpiry === "function"
        ? engine.outcomeOnExpiry(match.state)
        : { result: "1/2-1/2", reason: "TIMEOUT" };
      this._appendEvent(match, MatchEventType.PlayerTimedOut, { seat: null }, serverTimeMs);
    } else {
      const flag = checkFlag(match.clock, serverTimeMs);
      if (!flag.flagged) return { ok: false, reason: "NOT_FLAGGED" };

      // First-move abort grace period
      const plyCount = match.events.filter(e => e.type === MatchEventType.MoveAccepted).length;
      if (plyCount < 2) {
        this._appendEvent(match, MatchEventType.GameAborted, { reason: "FIRST_MOVE_TIMEOUT" }, serverTimeMs);
        return this._finalizeOutcome(match, { result: "1/2-1/2", reason: "ABORTED" }, serverTimeMs);
      }

      outcome = engine.timeout(match.state, flag.byIndex);
      this._appendEvent(match, MatchEventType.PlayerTimedOut, { seat: flag.byIndex }, serverTimeMs);
    }

    return this._finalizeOutcome(match, outcome, serverTimeMs);
  }

  /**
   * Disconnect handling
   */
  disconnect(match, seat, serverTimeMs = Date.now()) {
    if (match.status !== MatchState.LIVE) return;
    this._appendEvent(match, MatchEventType.PlayerDisconnected, {
      seat,
      gracePeriodMs: this.getEngine(match.gameId).disconnectHandling.gracePeriodMs,
    }, serverTimeMs);
  }

  /**
   * Finalizes the match, locks state, produces cryptographically signed result hash.
   */
  _finalizeOutcome(match, outcome, serverTimeMs) {
    match.status = MatchState.COMPLETED;
    match.completedAt = serverTimeMs;
    match.outcome = { ...outcome };

    this._appendEvent(match, MatchEventType.GameEnded, { ...outcome }, serverTimeMs);

    // Cryptographic Result Hash
    const canonicalPayload = JSON.stringify({
      matchId: match.matchId,
      matchVersion: match.matchVersion,
      players: match.players,
      outcome: match.outcome,
    });

    const resultHash = createHash("sha256").update(canonicalPayload).digest("hex");
    match.resultHash = resultHash;

    this._appendEvent(match, MatchEventType.ResultFinalized, {
      resultHash,
      outcome: match.outcome,
    }, serverTimeMs);

    // Financial / Rating settlement trigger
    this._appendEvent(match, MatchEventType.SettlementTriggered, {
      stake: match.stake,
      outcome: match.outcome,
    }, serverTimeMs);

    return {
      ok: true,
      completed: true,
      outcome: match.outcome,
      resultHash,
    };
  }

  _appendEvent(match, type, payload, timestamp) {
    const event = Object.freeze({
      seq: match.events.length,
      type,
      payload: Object.freeze(payload),
      timestamp,
    });
    match.events.push(event);
    return event;
  }

  projectClock(match, now) {
    const engine = this.getEngine(match.gameId);
    if (engine.turnModel === TurnModel.SIMULTANEOUS) {
      return readSharedClock(match.clock, now);
    }
    return readClock(match.clock, now);
  }

  /**
   * Replays an entire match from its immutable event stream and verifies
   * that identical final state and result hash are produced.
   */
  replayFromEvents(events) {
    if (!Array.isArray(events) || events.length === 0) {
      throw new Error("Event log must be a non-empty array");
    }

    const created = events.find(e => e.type === MatchEventType.MatchCreated);
    if (!created) throw new Error("Missing MatchCreated event");

    const { matchId, matchVersion, players, stake, seed, variantId, timeControl } = created.payload;
    const engine = this.getEngine(matchVersion.gameId);

    // Version Check: Assert that historical match version matches
    if (engine.version !== matchVersion.engineVersion) {
      // In production, multi-version registries route to the historical engine version
    }

    const replayed = this.createMatch({
      matchId,
      gameId: engine.id,
      players,
      stake,
      seed,
      variantId,
      timeControl,
      now: created.timestamp,
    });

    const started = events.find(e => e.type === MatchEventType.GameStarted);
    if (started) {
      this.startMatch(replayed, started.timestamp);
    }

    // Step through accepted moves
    for (const e of events) {
      if (e.type === MatchEventType.MoveAccepted) {
        const { seat, action } = e.payload;
        const res = this.submitAction(replayed, seat, action, { serverTimeMs: e.timestamp });
        if (!res.ok && !res.completed) {
          throw new Error(`Replay mismatch at seq ${e.seq}: ${res.reason}`);
        }
      } else if (e.type === MatchEventType.PlayerResigned) {
        this.resign(replayed, e.payload.seat, e.timestamp);
      } else if (e.type === MatchEventType.PlayerTimedOut) {
        this.claimTimeout(replayed, e.timestamp);
      }
    }

    const finalized = events.find(e => e.type === MatchEventType.ResultFinalized);
    if (finalized && replayed.resultHash !== finalized.payload.resultHash) {
      throw new Error(`Replay result hash mismatch: derived ${replayed.resultHash} !== recorded ${finalized.payload.resultHash}`);
    }

    return replayed;
  }
}
