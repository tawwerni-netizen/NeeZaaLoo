/**
 * The wire protocol.
 *
 * The asymmetry is the security model, so it is expressed as two closed sets:
 *
 *   client -> server   INTENTS.  A client may express a wish. That is all.
 *   server -> client   EVENTS.   Only the server states what happened.
 *
 * There is deliberately no client message carrying a result, a score, a clock
 * reading, an opponent, a rating or an amount. A tampered client cannot invent
 * such a message because the parser rejects any field it does not expect --
 * unknown keys are refused rather than ignored, so a forged field is a protocol
 * error and not silently dropped data that some later handler might read.
 */

export const MAX_FRAME_BYTES = 4096;   // an intent is tiny; anything larger is abuse

// --- Client -> server --------------------------------------------------------
export const ClientMsg = {
  AUTH: "AUTH",
  JOIN: "JOIN",
  LEAVE: "LEAVE",
  INTENT: "INTENT",
  RESIGN: "RESIGN",
  // Draw agreement -- a PLATFORM action, exactly like RESIGN: no game
  // plugin can express or refuse it (see duel-engine's own offerDraw/
  // declineDraw/acceptDraw). Three messages, not one with a "kind" field,
  // so each has its own fixed shape and cannot smuggle an unrelated key.
  DRAW_OFFER:   "DRAW_OFFER",
  DRAW_ACCEPT:  "DRAW_ACCEPT",
  DRAW_DECLINE: "DRAW_DECLINE",
  PING: "PING",
  // Chat (Slice 9) -- a parallel, independent message family sharing the
  // SAME connection/auth/rate-limiter machinery as everything above, per
  // this package's own "one realtime architecture, not two" mandate.
  // CHAT_JOIN names a channel TYPE plus (for MATCH/SPECTATOR) a duelId,
  // never an opaque channel id the client would have to construct itself
  // -- see gateway.mjs's own handler for why that is the safer shape.
  CHAT_JOIN: "CHAT_JOIN",
  CHAT_LEAVE: "CHAT_LEAVE",
  CHAT_SEND: "CHAT_SEND",
};

// --- Server -> client --------------------------------------------------------
export const ServerMsg = {
  AUTHED: "AUTHED",
  STATE: "STATE",
  EVENT: "EVENT",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  PONG: "PONG",
  CHAT_JOINED: "CHAT_JOINED",
  CHAT_MESSAGE: "CHAT_MESSAGE",
  CHAT_REJECTED: "CHAT_REJECTED",
  CHAT_MESSAGE_REMOVED: "CHAT_MESSAGE_REMOVED",
  // Note: there is no separate ServerMsg for a draw offer/decline. Exactly
  // like RESIGN's own DUEL_COMPLETED, DRAW_OFFERED/DRAW_DECLINED are plain
  // entries on the duel's event log and travel through the SAME generic
  // ServerMsg.EVENT broadcast every other event already uses -- see
  // gateway.mjs's publishNewEvents().
};

export const ErrorCode = {
  BAD_FRAME: "BAD_FRAME",
  UNKNOWN_TYPE: "UNKNOWN_TYPE",
  UNEXPECTED_FIELD: "UNEXPECTED_FIELD",
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  ALREADY_AUTHENTICATED: "ALREADY_AUTHENTICATED",
  BAD_TOKEN: "BAD_TOKEN",
  NO_SUCH_DUEL: "NO_SUCH_DUEL",
  NOT_A_PARTICIPANT: "NOT_A_PARTICIPANT",
  SPECTATORS_DISABLED: "SPECTATORS_DISABLED",
  NOT_SUBSCRIBED: "NOT_SUBSCRIBED",
  RATE_LIMITED: "RATE_LIMITED",
  FRAME_TOO_LARGE: "FRAME_TOO_LARGE",
  // A4: this gateway instance's lease on the duel was taken over by another
  // instance (its own lease expired) between accepting this message and
  // durably recording the result. The client must reconnect to find whoever
  // holds the duel now; nothing this instance says about it is current.
  STALE_OWNER: "STALE_OWNER",
  // Session binding (A5): this player is (re)binding a seat faster than
  // the reconnect-grace budget allows. Bounded, not permanent -- the
  // token bucket refills; a genuinely flaky connection simply waits a
  // moment and rejoins.
  RECONNECT_LIMITED: "RECONNECT_LIMITED",
};

/**
 * Exactly which fields each client message may carry. Anything else is refused.
 * This is what makes "the client cannot assert a result" a parser property
 * rather than a code-review promise.
 */
const SHAPES = {
  [ClientMsg.AUTH]:   { required: ["t", "token"], optional: [] },
  [ClientMsg.JOIN]:   { required: ["t", "duelId"], optional: ["as"] },
  [ClientMsg.LEAVE]:  { required: ["t", "duelId"], optional: [] },
  // `nonce`/`baseVersion` (A5): optional on the WIRE so an older or
  // narrowly-scoped client frame is never simply refused outright, but
  // see duel-engine's own runIntent() header for why a real client always
  // sends both -- their absence exempts an intent from sequence
  // admission (stale/duplicate/replay rejection) entirely, it does not
  // relax anything else this protocol already refuses.
  [ClientMsg.INTENT]: { required: ["t", "duelId", "intent"], optional: ["cseq", "nonce", "baseVersion"] },
  [ClientMsg.RESIGN]: { required: ["t", "duelId"], optional: [] },
  [ClientMsg.DRAW_OFFER]:   { required: ["t", "duelId"], optional: [] },
  [ClientMsg.DRAW_ACCEPT]:  { required: ["t", "duelId"], optional: [] },
  [ClientMsg.DRAW_DECLINE]: { required: ["t", "duelId"], optional: [] },
  [ClientMsg.PING]:   { required: ["t"], optional: ["cseq"] },
  [ClientMsg.CHAT_JOIN]:  { required: ["t", "channel"], optional: ["duelId"] },
  [ClientMsg.CHAT_LEAVE]: { required: ["t", "channelId"], optional: [] },
  [ClientMsg.CHAT_SEND]:  { required: ["t", "channelId", "content", "clientMessageId"], optional: [] },
};

/**
 * Parse and validate a client frame.
 * @returns {{ok:true, msg:object} | {ok:false, code:string, detail?:string}}
 */
export function parseClientFrame(raw) {
  if (typeof raw !== "string") {
    if (raw?.byteLength > MAX_FRAME_BYTES) return { ok: false, code: ErrorCode.FRAME_TOO_LARGE };
    raw = String(raw);
  }
  if (raw.length > MAX_FRAME_BYTES) return { ok: false, code: ErrorCode.FRAME_TOO_LARGE };

  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return { ok: false, code: ErrorCode.BAD_FRAME };
  }
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    return { ok: false, code: ErrorCode.BAD_FRAME };
  }

  const shape = SHAPES[msg.t];
  if (!shape) return { ok: false, code: ErrorCode.UNKNOWN_TYPE, detail: String(msg.t) };

  for (const key of shape.required) {
    if (!(key in msg)) return { ok: false, code: ErrorCode.BAD_FRAME, detail: `missing ${key}` };
  }
  const allowed = new Set([...shape.required, ...shape.optional]);
  for (const key of Object.keys(msg)) {
    // A forged "result" or "clock" field lands here and stops the frame dead.
    if (!allowed.has(key)) {
      return { ok: false, code: ErrorCode.UNEXPECTED_FIELD, detail: key };
    }
  }

  // Types: token/duelId/as are always short strings. `intent` is the one
  // field whose shape is the game plugin's business, not the protocol's --
  // chess sends a string ("e2e4"), Speed Math sends a plain object
  // ({answer: 19}), Connect Four sends a bare number (a column index --
  // see packages/game-connect-four/src/plugin.mjs's own header on why
  // that is deliberately the simplest possible intent shape, not an
  // oversight), and a future game may need its own shape again. This is
  // the SAME widening this file already made once, for Speed Math (see
  // this test suite's own header) -- a fixed enumeration of "every shape
  // a game has needed so far" breaks the next game with a real need for a
  // new one, and there was never a security reason a JSON number is any
  // less safe here than a JSON string. The protocol only bounds what an
  // intent can never be: not an array, not a nested structure a plugin
  // didn't ask for, not something that couldn't have come from JSON in
  // the first place, and not a boolean (still refused -- no plugin has
  // ever needed one, so there is nothing yet to widen for).
  for (const key of ["token", "duelId", "as", "channel", "channelId", "content", "clientMessageId"]) {
    if (key in msg && typeof msg[key] !== "string") {
      return { ok: false, code: ErrorCode.BAD_FRAME, detail: `${key} must be a string` };
    }
  }
  if ("intent" in msg) {
    const intent = msg.intent;
    const validShape =
      typeof intent === "string" ||
      (typeof intent === "number" && Number.isFinite(intent)) ||
      (typeof intent === "object" && intent !== null && !Array.isArray(intent));
    if (!validShape) {
      return { ok: false, code: ErrorCode.BAD_FRAME, detail: "intent must be a string, a finite number, or a plain object" };
    }
  }
  if ("cseq" in msg && !Number.isInteger(msg.cseq)) {
    return { ok: false, code: ErrorCode.BAD_FRAME, detail: "cseq must be an integer" };
  }
  if ("nonce" in msg && (!Number.isInteger(msg.nonce) || msg.nonce < 0)) {
    return { ok: false, code: ErrorCode.BAD_FRAME, detail: "nonce must be a non-negative integer" };
  }
  if ("baseVersion" in msg && (!Number.isInteger(msg.baseVersion) || msg.baseVersion < 0)) {
    return { ok: false, code: ErrorCode.BAD_FRAME, detail: "baseVersion must be a non-negative integer" };
  }

  return { ok: true, msg };
}

/** Token bucket. Cheap, per-connection, and refills on read. */
export function createRateLimiter({ capacity = 20, refillPerSecond = 10 } = {}) {
  return { capacity, refillPerSecond, tokens: capacity, last: null };
}

export function takeToken(limiter, nowMs) {
  if (limiter.last === null) limiter.last = nowMs;
  const elapsed = Math.max(0, nowMs - limiter.last) / 1000;
  limiter.tokens = Math.min(limiter.capacity, limiter.tokens + elapsed * limiter.refillPerSecond);
  limiter.last = nowMs;
  if (limiter.tokens < 1) return false;
  limiter.tokens -= 1;
  return true;
}
