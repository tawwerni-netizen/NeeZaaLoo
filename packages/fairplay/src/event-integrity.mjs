/**
 * Nizalo Fair Play Infrastructure - LAYER 2: EVENT INTEGRITY.
 *
 * Enforces:
 * 1. Strictly ordered: Every event has a sequential, gapless sequence number.
 * 2. Uniquely identified: Global UUID / cryptographic identifier per event.
 * 3. Immutable: Cryptographically chained using SHA-256 hashes (Merkle-link chaining).
 * 4. Replayable: Contains sufficient data to reproduce exact state transitions.
 */

import { createHash, randomUUID } from "node:crypto";

export const GENESIS_HASH = "0".repeat(64);

export const EventType = {
  MATCH_INIT: "MATCH_INIT",
  CLOCK_START: "CLOCK_START",
  INTENT_ACCEPTED: "INTENT_ACCEPTED",
  INTENT_REJECTED: "INTENT_REJECTED",
  RNG_GENERATED: "RNG_GENERATED",
  TURN_SWITCH: "TURN_SWITCH",
  FLAG_FALL: "FLAG_FALL",
  PLAYER_DISCONNECT: "PLAYER_DISCONNECT",
  PLAYER_RECONNECT: "PLAYER_RECONNECT",
  DISPUTE_RAISED: "DISPUTE_RAISED",
  RESULT_FINALIZED: "RESULT_FINALIZED",
};

/**
 * Immutable Match Event with cryptographic chaining.
 */
export class MatchEvent {
  constructor({
    sequenceNumber,
    eventId = `evt_${randomUUID()}`,
    matchId,
    timestamp = Date.now(),
    type,
    actor = "SERVER",
    payload = {},
    previousEventHash = GENESIS_HASH,
  }) {
    if (typeof sequenceNumber !== "number" || sequenceNumber < 1) {
      throw new Error(`Invalid sequenceNumber: ${sequenceNumber}`);
    }
    if (!matchId) throw new Error("matchId is required");
    if (!type) throw new Error("type is required");

    this.sequenceNumber = sequenceNumber;
    this.eventId = eventId;
    this.matchId = matchId;
    this.timestamp = Number(timestamp);
    this.type = type;
    this.actor = actor;
    this.payload = Object.freeze(structuredClone(payload));
    this.previousEventHash = previousEventHash;
    this.eventHash = this.computeHash();

    Object.freeze(this);
  }

  computeHash() {
    const raw = `${this.sequenceNumber}:${this.eventId}:${this.matchId}:${this.timestamp}:${this.type}:${this.actor}:${JSON.stringify(this.payload)}:${this.previousEventHash}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  toJSON() {
    return {
      sequenceNumber: this.sequenceNumber,
      eventId: this.eventId,
      matchId: this.matchId,
      timestamp: this.timestamp,
      type: this.type,
      actor: this.actor,
      payload: this.payload,
      previousEventHash: this.previousEventHash,
      eventHash: this.eventHash,
    };
  }
}

/**
 * Append-only Event Chain Log.
 */
export class EventChainLog {
  constructor({ matchId }) {
    if (!matchId) throw new Error("matchId required for EventChainLog");
    this.matchId = matchId;
    this.events = [];
    this.eventIdSet = new Set();
  }

  get length() {
    return this.events.length;
  }

  get lastEvent() {
    return this.events.length > 0 ? this.events[this.events.length - 1] : null;
  }

  append({ type, actor = "SERVER", payload = {}, timestamp = Date.now() }) {
    const seq = this.events.length + 1;
    const prevHash = this.lastEvent ? this.lastEvent.eventHash : GENESIS_HASH;

    const event = new MatchEvent({
      sequenceNumber: seq,
      matchId: this.matchId,
      timestamp,
      type,
      actor,
      payload,
      previousEventHash: prevHash,
    });

    this.events.push(event);
    this.eventIdSet.add(event.eventId);
    return event;
  }

  verify() {
    return verifyEventChain(this.events);
  }

  toArray() {
    return [...this.events];
  }
}

/**
 * Validates an entire event chain for ordering, uniqueness, and cryptographic integrity.
 * Returns { valid: boolean, errors: [] }
 */
export function verifyEventChain(events) {
  const errors = [];
  if (!Array.isArray(events) || events.length === 0) {
    return { valid: true, eventCount: 0, errors: [] };
  }

  const seenIds = new Set();
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const expectedSeq = i + 1;

    // 1. Strict sequence ordering
    if (ev.sequenceNumber !== expectedSeq) {
      errors.push(`SEQUENCE_GAP: At index ${i}, expected sequence ${expectedSeq}, got ${ev.sequenceNumber}`);
    }

    // 2. Uniqueness
    if (seenIds.has(ev.eventId)) {
      errors.push(`DUPLICATE_EVENT_ID: Event ${ev.eventId} is duplicated`);
    }
    seenIds.add(ev.eventId);

    // 3. Parent hash linking
    if (ev.previousEventHash !== expectedPrevHash) {
      errors.push(`CHAIN_BROKEN: At seq ${ev.sequenceNumber}, expected previous hash ${expectedPrevHash}, got ${ev.previousEventHash}`);
    }

    // 4. Cryptographic hash validity
    const raw = `${ev.sequenceNumber}:${ev.eventId}:${ev.matchId}:${ev.timestamp}:${ev.type}:${ev.actor}:${JSON.stringify(ev.payload)}:${ev.previousEventHash}`;
    const calculatedHash = createHash("sha256").update(raw).digest("hex");
    if (calculatedHash !== ev.eventHash) {
      errors.push(`TAMPERED_EVENT: Hash mismatch at seq ${ev.sequenceNumber}. Expected ${ev.eventHash}, calculated ${calculatedHash}`);
    }

    expectedPrevHash = ev.eventHash;
  }

  return {
    valid: errors.length === 0,
    eventCount: events.length,
    errors,
  };
}
