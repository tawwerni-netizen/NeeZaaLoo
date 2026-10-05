/**
 * Nizalo Fair Play Infrastructure - LAYER 5: REPLAY & ADJUDICATION.
 *
 * Implements:
 * 1. MatchReplay: Complete record reproducing exact moves, timestamps, server decisions, RNG, clock, and outcome.
 * 2. MoveTimeline: High-level chronological player move progression.
 * 3. EventTimeline: Low-level event log (clock ticks, network, RNG, admissions).
 * 4. GameStateInspector: Point-in-time board inspection at any ply k.
 * 5. ReplayViewer: Interactive playback controller with deterministic state re-simulation.
 */

export class MoveTimeline {
  constructor(moves = []) {
    this.moves = [...moves];
  }

  get length() {
    return this.moves.length;
  }

  getMove(ply) {
    return this.moves[ply - 1] ?? null;
  }

  toArray() {
    return this.moves.map((m) => ({
      ply: m.ply,
      seat: m.seat,
      action: m.action,
      timeTakenMs: m.timeTakenMs,
      timestamp: m.timestamp,
    }));
  }
}

export class EventTimeline {
  constructor(events = []) {
    this.events = [...events];
  }

  get length() {
    return this.events.length;
  }

  filterByType(type) {
    return this.events.filter((e) => e.type === type);
  }

  toArray() {
    return [...this.events];
  }
}

export class GameStateInspector {
  constructor(statesByPly = []) {
    this.statesByPly = [...statesByPly];
  }

  getStateAtPly(ply) {
    if (ply < 0 || ply >= this.statesByPly.length) {
      throw new RangeError(`Ply ${ply} out of bounds [0, ${this.statesByPly.length - 1}]`);
    }
    return structuredClone(this.statesByPly[ply]);
  }
}

export class MatchReplay {
  constructor({
    matchId,
    gameId,
    players,
    tier = "CASH",
    initialState,
    finalState,
    outcome,
    moves = [],
    events = [],
    rngRecord = null,
    clockEvents = [],
    startTime = Date.now(),
    endTime = Date.now(),
  }) {
    if (!matchId) throw new Error("matchId required for MatchReplay");
    if (!gameId) throw new Error("gameId required for MatchReplay");

    this.matchId = matchId;
    this.gameId = gameId;
    this.players = Object.freeze([...players]);
    this.tier = tier;
    this.initialState = structuredClone(initialState);
    this.finalState = structuredClone(finalState);
    this.outcome = Object.freeze({ ...outcome });

    this.moves = Object.freeze(structuredClone(moves));
    this.events = Object.freeze(structuredClone(events));
    this.rngRecord = rngRecord ? Object.freeze(structuredClone(rngRecord)) : null;
    this.clockEvents = Object.freeze(structuredClone(clockEvents));

    this.startTime = startTime;
    this.endTime = endTime;
    this.durationMs = Math.max(0, endTime - startTime);

    // Build timeline and inspector index
    const states = [this.initialState];
    for (const m of this.moves) {
      states.push(m.stateAfter);
    }

    this.moveTimeline = new MoveTimeline(this.moves);
    this.eventTimeline = new EventTimeline(this.events);
    this.stateInspector = new GameStateInspector(states);
  }

  createViewer() {
    return new ReplayViewer(this);
  }

  /**
   * Verifies that the replay can be simulated from scratch with the game's rules
   * to deterministically reproduce the identical final board state and result.
   */
  verifyDeterminism(rulesValidator) {
    let currentState = structuredClone(this.initialState);

    for (let i = 0; i < this.moves.length; i++) {
      const m = this.moves[i];
      const validRes = rulesValidator.validateMove(currentState, m.seat, m.action);
      if (!validRes.valid) {
        return {
          deterministic: false,
          reason: `ILLEGAL_MOVE_IN_REPLAY_AT_PLY_${m.ply}`,
          ply: m.ply,
        };
      }
      currentState = rulesValidator.applyMove(currentState, m.seat, m.action);
    }

    // Compare re-simulated state with recorded final state
    const matchesFinal = JSON.stringify(currentState) === JSON.stringify(this.finalState);
    return {
      deterministic: matchesFinal,
      totalPlies: this.moves.length,
      finalStateMatches: matchesFinal,
    };
  }

  toJSON() {
    return {
      matchId: this.matchId,
      gameId: this.gameId,
      players: this.players,
      tier: this.tier,
      initialState: this.initialState,
      finalState: this.finalState,
      outcome: this.outcome,
      moves: this.moves,
      events: this.events,
      rngRecord: this.rngRecord,
      clockEvents: this.clockEvents,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.durationMs,
    };
  }
}

/**
 * ReplayViewer: Interactive playback controller for reviewers and players.
 */
export class ReplayViewer {
  constructor(matchReplay) {
    this.replay = matchReplay;
    this.currentPly = 0;
  }

  get totalPlies() {
    return this.replay.moves.length;
  }

  getCurrentPly() {
    return this.currentPly;
  }

  getCurrentState() {
    return this.replay.stateInspector.getStateAtPly(this.currentPly);
  }

  getCurrentMove() {
    return this.currentPly > 0 ? this.replay.moveTimeline.getMove(this.currentPly) : null;
  }

  stepForward() {
    if (this.currentPly < this.totalPlies) {
      this.currentPly++;
      return { moved: true, ply: this.currentPly, state: this.getCurrentState() };
    }
    return { moved: false, ply: this.currentPly, state: this.getCurrentState() };
  }

  stepBackward() {
    if (this.currentPly > 0) {
      this.currentPly--;
      return { moved: true, ply: this.currentPly, state: this.getCurrentState() };
    }
    return { moved: false, ply: this.currentPly, state: this.getCurrentState() };
  }

  seekToPly(ply) {
    if (ply < 0 || ply > this.totalPlies) {
      throw new RangeError(`Ply ${ply} out of bounds [0, ${this.totalPlies}]`);
    }
    this.currentPly = ply;
    return { ply: this.currentPly, state: this.getCurrentState() };
  }

  isFinished() {
    return this.currentPly === this.totalPlies;
  }
}
