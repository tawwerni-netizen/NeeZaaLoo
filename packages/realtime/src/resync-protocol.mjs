/**
 * Nizalo Authoritative Realtime Synchronization & Recovery Protocol
 *
 * Implements:
 * - Server-authoritative sequence numbers & event IDs
 * - Client acknowledgement (ACK) tracking & round-trip latency
 * - Authoritative State Snapshots (reconnecting clients receive complete snapshot)
 * - Heartbeat sweep, socket eviction, and 30-second disconnect grace periods
 * - Replay/resync event buffers for fast forward
 */

export const RealtimeMessageType = Object.freeze({
  // Client -> Server
  AUTH: "AUTH",
  JOIN: "JOIN",
  INTENT: "INTENT",
  ACK: "ACK",
  SYNC: "SYNC",
  PING: "PING",
  RESIGN: "RESIGN",
  LEAVE: "LEAVE",

  // Server -> Client
  AUTHED: "AUTHED",
  STATE_SNAPSHOT: "STATE_SNAPSHOT",
  EVENT: "EVENT",
  ACK_CONFIRM: "ACK_CONFIRM",
  PONG: "PONG",
  REJECTED: "REJECTED",
  PRESENCE: "PRESENCE",
  MATCH_COMPLETED: "MATCH_COMPLETED",
  ERROR: "ERROR",
});

export const MAX_EVENT_BUFFER = 100;
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const HEARTBEAT_TIMEOUT_MS = 15_000;
export const DISCONNECT_GRACE_PERIOD_MS = 30_000; // 30s grace before forfeiture

export class MatchRealtimeSync {
  constructor({ matchId, players, plugin, initialState, now = () => Date.now() }) {
    this.matchId = matchId;
    this.players = [...players]; // ["player1", "player2"]
    this.plugin = plugin;
    this.now = now;

    this.seq = 0; // Monotonically increasing sequence number
    this.eventBuffer = []; // Circular ring buffer of recent events

    // Per-player connection and ACK tracking
    this.playerSessions = new Map(
      players.map((pid, seat) => [
        pid,
        {
          seat,
          socketId: null,
          connected: false,
          lastHeartbeatAt: this.now(),
          rttMs: 0,
          ackedSeq: 0,
          disconnectedAt: null,
          graceExpiryAt: null,
        },
      ])
    );
  }

  /**
   * Generates next authoritative sequence number and event ID.
   */
  nextEvent(type, payload, serverTimeMs = this.now()) {
    this.seq++;
    const eventId = `evt_${this.matchId}_${this.seq}`;
    const event = {
      seq: this.seq,
      eventId,
      type,
      payload,
      serverTimeMs,
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > MAX_EVENT_BUFFER) {
      this.eventBuffer.shift();
    }

    return event;
  }

  /**
   * Process client ACK frame.
   */
  handleAck(playerId, ackedSeq, clientSendTimeMs, serverTimeMs = this.now()) {
    const session = this.playerSessions.get(playerId);
    if (!session) return { ok: false, reason: "NOT_A_PARTICIPANT" };

    if (ackedSeq > session.ackedSeq && ackedSeq <= this.seq) {
      session.ackedSeq = ackedSeq;
    }

    if (clientSendTimeMs && clientSendTimeMs > 0) {
      session.rttMs = Math.max(0, serverTimeMs - clientSendTimeMs);
    }

    return {
      ok: true,
      playerId,
      ackedSeq: session.ackedSeq,
      latestSeq: this.seq,
      rttMs: session.rttMs,
    };
  }

  /**
   * Process client Ping frame.
   */
  handlePing(playerId, clientSendTimeMs, serverTimeMs = this.now()) {
    const session = this.playerSessions.get(playerId);
    if (!session) return { ok: false, reason: "NOT_A_PARTICIPANT" };

    session.lastHeartbeatAt = serverTimeMs;
    if (clientSendTimeMs && clientSendTimeMs > 0) {
      session.rttMs = Math.max(0, serverTimeMs - clientSendTimeMs);
    }

    return {
      ok: true,
      t: RealtimeMessageType.PONG,
      serverTimeMs,
      clientSendTimeMs,
      latestSeq: this.seq,
    };
  }

  /**
   * Bind socket on connection or reconnect (handling browser refresh, device switch, or recovery).
   */
  bindClient(playerId, socketId, serverTimeMs = this.now()) {
    const session = this.playerSessions.get(playerId);
    if (!session) return { ok: false, reason: "NOT_A_PARTICIPANT" };

    const wasDisconnected = Boolean(!session.connected);
    const previousSocket = session.socketId;
    const wasDeviceSwitch = Boolean(previousSocket && previousSocket !== socketId);

    session.socketId = socketId;
    session.connected = true;
    session.lastHeartbeatAt = serverTimeMs;
    session.disconnectedAt = null;
    session.graceExpiryAt = null;

    return {
      ok: true,
      seat: session.seat,
      wasDisconnected,
      wasDeviceSwitch,
      evictedSocket: wasDeviceSwitch ? previousSocket : null,
      serverTimeMs,
    };
  }

  /**
   * Handle socket disconnect or network drop.
   * Starts 30-second disconnect grace period countdown.
   */
  disconnectClient(playerId, socketId, serverTimeMs = this.now()) {
    const session = this.playerSessions.get(playerId);
    if (!session) return { ok: false, reason: "NOT_A_PARTICIPANT" };

    if (session.socketId === socketId) {
      session.connected = false;
      session.socketId = null;
      session.disconnectedAt = serverTimeMs;
      session.graceExpiryAt = serverTimeMs + DISCONNECT_GRACE_PERIOD_MS;

      return {
        ok: true,
        playerId,
        seat: session.seat,
        disconnectedAt: serverTimeMs,
        graceExpiryAt: session.graceExpiryAt,
        gracePeriodMs: DISCONNECT_GRACE_PERIOD_MS,
      };
    }

    return { ok: true, note: "socket was already replaced by newer session" };
  }

  /**
   * Sweep stale heartbeats and disconnect grace expirations.
   */
  sweepHeartbeats(serverTimeMs = this.now()) {
    const alerts = [];

    for (const [playerId, session] of this.playerSessions.entries()) {
      // 1. Check active socket heartbeat timeout
      if (session.connected && serverTimeMs - session.lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
        session.connected = false;
        session.socketId = null;
        session.disconnectedAt = serverTimeMs;
        session.graceExpiryAt = serverTimeMs + DISCONNECT_GRACE_PERIOD_MS;

        alerts.push({
          type: "HEARTBEAT_TIMEOUT",
          playerId,
          seat: session.seat,
          graceExpiryAt: session.graceExpiryAt,
        });
      }

      // 2. Check disconnect grace expiration (match forfeiture / abandonment)
      if (!session.connected && session.graceExpiryAt && serverTimeMs > session.graceExpiryAt) {
        alerts.push({
          type: "GRACE_EXPIRED_ABANDONMENT",
          playerId,
          seat: session.seat,
          expiredAt: serverTimeMs,
        });
      }
    }

    return alerts;
  }

  /**
   * Generates Authoritative State Snapshot for reconnecting client.
   * Client adopts this directly rather than reconstructing state locally!
   */
  generateSnapshot(gameState, clockData, lifecycleState, sinceSeq = null) {
    const serverTimeMs = this.now();

    // Check if missed events can be delivered incrementally
    let missedEvents = null;
    if (Number.isInteger(sinceSeq) && sinceSeq >= 0 && sinceSeq < this.seq) {
      const startIdx = this.eventBuffer.findIndex((e) => e.seq === sinceSeq + 1);
      if (startIdx !== -1) {
        missedEvents = this.eventBuffer.slice(startIdx);
      }
    }

    return {
      t: RealtimeMessageType.STATE_SNAPSHOT,
      matchId: this.matchId,
      seq: this.seq,
      lastEventId: this.seq > 0 ? `evt_${this.matchId}_${this.seq}` : null,
      serverTimeMs,
      lifecycleState,
      state: gameState,
      clock: clockData,
      missedEvents, // Incremental events if within buffer, or null if full state replacement
      presence: Array.from(this.playerSessions.entries()).map(([pid, s]) => ({
        playerId: pid,
        seat: s.seat,
        connected: s.connected,
        rttMs: s.rttMs,
        inGracePeriod: !s.connected && Boolean(s.graceExpiryAt && serverTimeMs < s.graceExpiryAt),
        graceRemainingMs: s.graceExpiryAt ? Math.max(0, s.graceExpiryAt - serverTimeMs) : 0,
      })),
    };
  }
}
