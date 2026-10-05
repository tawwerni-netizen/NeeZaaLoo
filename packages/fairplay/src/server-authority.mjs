/**
 * Nizalo Fair Play Infrastructure - LAYER 1: SERVER AUTHORITY.
 *
 * CRITICAL FAIR PLAY INVARIANT:
 * The server authoritatively owns:
 * 1. State: Complete authoritative state of the game board/match.
 * 2. Legal Moves: Validates all player actions; illegal intents are refused without state mutation.
 * 3. Clock: Server tracks time remaining; client timestamps cannot dictate clock deductions.
 * 4. RNG: Cryptographic commit-reveal and deterministic PRNG; client cannot force dice or randomness.
 * 5. Result: Server evaluates win/loss/draw/timeout; client-claimed outcomes are strictly ignored.
 */

import { randomBytes, createHmac, createHash } from "node:crypto";

/**
 * Authoritative Cryptographic RNG with Commit-Reveal.
 * Used for all games involving randomness (Backgammon, Dominoes, Ludo).
 */
export class AuthoritativeRng {
  constructor({ serverSeed = null, clientSeed = "nizalo_default" } = {}) {
    this.serverSeed = serverSeed ?? randomBytes(32).toString("hex");
    this.clientSeed = String(clientSeed);
    this.counter = 0;
    this.revealed = false;
    this.commitHash = createHash("sha256").update(this.serverSeed).digest("hex");
    this.rollHistory = [];
  }

  getCommitment() {
    return {
      commitHash: this.commitHash,
      clientSeed: this.clientSeed,
    };
  }

  setClientSeed(seed) {
    if (this.counter > 0) {
      throw new Error("Cannot change clientSeed after RNG generation has commenced");
    }
    this.clientSeed = String(seed);
  }

  /**
   * Generates a deterministic integer between [min, max] inclusive using HMAC-SHA256.
   */
  nextRange(min, max, purpose = "general") {
    if (max < min) throw new RangeError("max must be >= min");
    const span = max - min + 1;

    // HMAC of serverSeed with clientSeed:counter:purpose
    const hmac = createHmac("sha256", this.serverSeed)
      .update(`${this.clientSeed}:${this.counter}:${purpose}`)
      .digest();

    // Take first 4 bytes as unsigned 32-bit int
    const rawVal = hmac.readUInt32BE(0);
    const result = min + (rawVal % span);

    const record = {
      sequence: this.counter,
      purpose,
      min,
      max,
      result,
      counter: this.counter,
    };

    this.rollHistory.push(record);
    this.counter++;
    return result;
  }

  /** Roll standard 6-sided dice (1-6) */
  rollDie(purpose = "die_roll") {
    return this.nextRange(1, 6, purpose);
  }

  /** Roll a pair of dice (e.g. Backgammon / Ludo) */
  rollDicePair(purpose = "dice_pair") {
    const d1 = this.rollDie(`${purpose}_1`);
    const d2 = this.rollDie(`${purpose}_2`);
    return [d1, d2];
  }

  /**
   * Reveals the server seed at the conclusion of the game for verification.
   */
  reveal() {
    this.revealed = true;
    return {
      serverSeed: this.serverSeed,
      commitHash: this.commitHash,
      clientSeed: this.clientSeed,
      totalRolls: this.counter,
      history: [...this.rollHistory],
    };
  }

  /**
   * Standalone audit verifier to prove the sequence was deterministic and untampered.
   */
  static verifyAudit({ serverSeed, commitHash, clientSeed, rolls }) {
    // 1. Verify commitment hash
    const computedHash = createHash("sha256").update(serverSeed).digest("hex");
    if (computedHash !== commitHash) {
      return { valid: false, reason: "COMMITMENT_HASH_MISMATCH" };
    }

    // 2. Re-simulate all rolls
    for (let i = 0; i < rolls.length; i++) {
      const { purpose, min, max, result, sequence } = rolls[i];
      const hmac = createHmac("sha256", serverSeed)
        .update(`${clientSeed}:${sequence}:${purpose}`)
        .digest();
      const rawVal = hmac.readUInt32BE(0);
      const expected = min + (rawVal % (max - min + 1));
      if (expected !== result) {
        return {
          valid: false,
          reason: `ROLL_DIVERGENCE_AT_SEQUENCE_${sequence}`,
          expected,
          actual: result,
        };
      }
    }

    return { valid: true, verifiedRollCount: rolls.length };
  }
}

/**
 * Authoritative Server Clock.
 * Client timestamps are strictly ignored; server arrival time controls clock deductions.
 */
export class AuthoritativeClock {
  constructor({
    initialTimeMs = 300_000, // 5 minutes default
    incrementMs = 3_000,    // 3 second increment
    playerCount = 2,
    now = () => Date.now(),
  } = {}) {
    this.initialTimeMs = initialTimeMs;
    this.incrementMs = incrementMs;
    this.now = now;
    this.playerCount = playerCount;

    this.remainingMs = Array(playerCount).fill(initialTimeMs);
    this.activeSeat = null;
    this.turnStartedAt = null;
    this.flaggedSeat = null;
    this.clockEvents = [];
  }

  start(initialSeat = 0) {
    const t = this.now();
    this.activeSeat = initialSeat;
    this.turnStartedAt = t;
    this._recordEvent("CLOCK_STARTED", { seat: initialSeat, timestamp: t });
  }

  switchTurn(nextSeat) {
    const t = this.now();
    if (this.activeSeat !== null && this.turnStartedAt !== null) {
      const elapsed = Math.max(0, t - this.turnStartedAt);
      this.remainingMs[this.activeSeat] -= elapsed;

      // Add increment
      this.remainingMs[this.activeSeat] += this.incrementMs;

      this._recordEvent("TURN_SWITCHED", {
        seat: this.activeSeat,
        elapsed,
        remainingAfterIncrement: this.remainingMs[this.activeSeat],
        nextSeat,
        timestamp: t,
      });

      // Check flag
      if (this.remainingMs[this.activeSeat] <= 0) {
        this.flaggedSeat = this.activeSeat;
        this.remainingMs[this.activeSeat] = 0;
        this._recordEvent("FLAG_FELL", { seat: this.activeSeat, timestamp: t });
        return { flagged: true, flaggedSeat: this.activeSeat };
      }
    }

    this.activeSeat = nextSeat;
    this.turnStartedAt = t;
    return { flagged: false, flaggedSeat: null };
  }

  checkFlag() {
    if (this.flaggedSeat !== null) return { flagged: true, seat: this.flaggedSeat };
    if (this.activeSeat === null || this.turnStartedAt === null) return { flagged: false };

    const t = this.now();
    const elapsed = t - this.turnStartedAt;
    if (this.remainingMs[this.activeSeat] - elapsed <= 0) {
      this.flaggedSeat = this.activeSeat;
      this.remainingMs[this.activeSeat] = 0;
      this._recordEvent("FLAG_FELL", { seat: this.activeSeat, timestamp: t });
      return { flagged: true, seat: this.activeSeat };
    }
    return { flagged: false };
  }

  getSnapshot() {
    const t = this.now();
    const remaining = [...this.remainingMs];
    if (this.activeSeat !== null && this.turnStartedAt !== null && this.flaggedSeat === null) {
      const elapsed = Math.max(0, t - this.turnStartedAt);
      remaining[this.activeSeat] = Math.max(0, remaining[this.activeSeat] - elapsed);
    }
    return {
      activeSeat: this.activeSeat,
      remainingMs: remaining,
      flaggedSeat: this.flaggedSeat,
    };
  }

  _recordEvent(type, details) {
    this.clockEvents.push({ type, details, at: details.timestamp ?? this.now() });
  }
}

/**
 * Authoritative Match Server.
 * Combines State, Legal Move Validation, Clock, RNG, and Result Evaluation.
 */
export class AuthoritativeMatchServer {
  constructor({
    matchId,
    gameId,
    players,
    rulesValidator,
    initialState,
    initialTimeMs = 300_000,
    incrementMs = 3_000,
    rng = null,
    now = () => Date.now(),
  }) {
    if (!matchId) throw new Error("matchId is required");
    if (!gameId) throw new Error("gameId is required");
    if (!Array.isArray(players) || players.length < 2) throw new Error("At least 2 players required");
    if (!rulesValidator || typeof rulesValidator.validateMove !== "function") {
      throw new Error("rulesValidator with validateMove() is required");
    }

    this.matchId = matchId;
    this.gameId = gameId;
    this.players = Object.freeze([...players]);
    this.rulesValidator = rulesValidator;
    this.state = structuredClone(initialState);
    this.now = now;

    this.clock = new AuthoritativeClock({
      initialTimeMs,
      incrementMs,
      playerCount: players.length,
      now,
    });

    this.rng = rng ?? new AuthoritativeRng();
    this.status = "INITIALIZING";
    this.currentSeat = 0;
    this.outcome = null;
    this.actionHistory = [];
    this.rejectedAttempts = [];
  }

  start() {
    if (this.status !== "INITIALIZING" && this.status !== "READY") {
      throw new Error(`Cannot start match in status: ${this.status}`);
    }
    this.status = "LIVE";
    this.clock.start(this.currentSeat);
    return this;
  }

  /**
   * Submits an action intent.
   * Authoritatively verifies:
   * 1. Match is LIVE
   * 2. Seat matches active player
   * 3. Move is legal per game engine rules
   * 4. Clock has not expired
   * 5. Client cannot forge state or result
   */
  processIntent({
    seat,
    action,
    clientClaimedResult = null,
    clientClaimedScore = null,
  }) {
    const t = this.now();

    // Check status
    if (this.status !== "LIVE") {
      this._reject(seat, action, "MATCH_NOT_LIVE");
      return { ok: false, reason: "MATCH_NOT_LIVE", state: this.state };
    }

    // Check timeout
    const flag = this.clock.checkFlag();
    if (flag.flagged) {
      this.status = "FINALIZED";
      const winnerSeat = flag.seat === 0 ? 1 : 0;
      this.outcome = {
        winnerId: this.players[winnerSeat],
        winnerSeat,
        result: winnerSeat === 0 ? "1-0" : "0-1",
        reason: "TIMEOUT",
        decidedBy: "SERVER_AUTHORITATIVE_CLOCK",
      };
      return { ok: false, reason: "TIMEOUT", outcome: this.outcome };
    }

    // Check active seat
    if (seat !== this.currentSeat) {
      this._reject(seat, action, "NOT_YOUR_TURN");
      return { ok: false, reason: "NOT_YOUR_TURN", activeSeat: this.currentSeat };
    }

    // Check move legality with server rules validator
    const legalResult = this.rulesValidator.validateMove(this.state, seat, action);
    if (!legalResult.valid) {
      this._reject(seat, action, legalResult.reason ?? "ILLEGAL_MOVE");
      return { ok: false, reason: legalResult.reason ?? "ILLEGAL_MOVE", state: this.state };
    }

    // Move is legal: apply mutation authoritatively
    this.state = this.rulesValidator.applyMove(this.state, seat, action);

    // Record accepted action
    this.actionHistory.push({
      ply: this.actionHistory.length + 1,
      seat,
      action,
      stateSnapshot: structuredClone(this.state),
      serverTimestamp: t,
    });

    // Check if terminal outcome achieved
    const terminal = this.rulesValidator.checkTerminal(this.state);
    if (terminal.isOver) {
      this.status = "FINALIZED";
      this.outcome = {
        winnerId: terminal.winnerSeat !== null ? this.players[terminal.winnerSeat] : null,
        winnerSeat: terminal.winnerSeat,
        result: terminal.result, // "1-0", "0-1", "1/2-1/2"
        reason: terminal.reason,
        decidedBy: "SERVER_RULES_AUTHORITY",
      };
      return { ok: true, state: this.state, outcome: this.outcome };
    }

    // Advance turn and switch clock
    const nextSeat = (this.currentSeat + 1) % this.players.length;
    const switchRes = this.clock.switchTurn(nextSeat);
    if (switchRes.flagged) {
      this.status = "FINALIZED";
      const winnerSeat = switchRes.flaggedSeat === 0 ? 1 : 0;
      this.outcome = {
        winnerId: this.players[winnerSeat],
        winnerSeat,
        result: winnerSeat === 0 ? "1-0" : "0-1",
        reason: "TIMEOUT",
        decidedBy: "SERVER_AUTHORITATIVE_CLOCK",
      };
      return { ok: true, state: this.state, outcome: this.outcome };
    }

    this.currentSeat = nextSeat;
    return { ok: true, state: this.state, activeSeat: this.currentSeat };
  }

  _reject(seat, action, reason) {
    this.rejectedAttempts.push({
      seat,
      action,
      reason,
      timestamp: this.now(),
    });
  }
}
