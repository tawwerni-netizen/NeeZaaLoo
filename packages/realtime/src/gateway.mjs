/**
 * The realtime gateway.
 *
 * A separate deployable from the REST API by design: game sockets are bursty,
 * long-lived and stateful, while the money path is low-throughput and must
 * never be starved by a chess rush hour. A crash here must not take settlement
 * with it.
 *
 * Everything the gateway sends is derived from server state. It never echoes a
 * client's claim about anything -- not the clock, not the position, not the
 * result. Reconnection is therefore trivial and safe: the server simply states
 * the truth again.
 */
import http from "node:http";
import { WebSocketServer } from "ws";
import {
  ClientMsg, ServerMsg, ErrorCode, parseClientFrame,
  createRateLimiter, takeToken,
} from "./protocol.mjs";
import {
  start, runIntent, resign, offerDraw, declineDraw, acceptDraw,
  claimTimeout, DuelState, serializeReplay, replayHash, projectClock,
} from "../../duel-engine/src/duel.mjs";
import { globalChannelId, isChannelOpenForWrites } from "../../chat/src/channels.mjs";
import { createInMemoryBus } from "./bus.mjs";

/**
 * @param {object} opts
 * @param {object} [opts.auth]                 the auth service; verifies real access tokens
 * @param {Map<string,string>} [opts.sessions]  token -> playerId, for free play and tests
 * @param {Map<string,object>} opts.duels      duelId -> duel
 * @param {Map<string,object>} opts.plugins    gameId -> plugin
 * @param {() => number} [opts.now]            injectable clock, so tests are not wall-clock bound
 * @param {object} [opts.store]                durable duel store; omit for ephemeral/free play
 * @param {object} [opts.lease]                duel ownership lease manager (A4); omit to assume
 *                                              a single gateway instance, exactly the prior behaviour
 * @param {string} [opts.ownerId]               this instance's identity; required if `lease` is given
 * @param {number} [opts.port]                  fixed listen port; 0 (default) picks any free port,
 *                                               exactly the prior behaviour every existing test relies on
 * @param {string} [opts.host]                  listen host; omitted lets `ws`/Node pick its own default
 */
export function createGateway({
  sessions, duels, plugins, now = () => Date.now(), rateLimit, store = null, auth = null,
  lease = null, ownerId = null, port = 0, host = undefined,
  // Browser origins allowed to open a socket at all. WebSockets are exempt
  // from the same-origin policy and carry no CORS preflight, so without
  // this ANY page on the internet can open a connection to this gateway
  // and start spending its budget. Identity itself is still proved by the
  // token inside JOIN (never by an ambient cookie), so this is not what
  // stops session hijacking -- it is what stops a hostile page getting far
  // enough to try. Empty/omitted keeps every existing test and any
  // non-browser client working unchanged: only a request that actually
  // carries an Origin header is ever judged.
  allowedOrigins = [],
  // Chat (Slice 9) -- a bundle of the chat package's own services
  // ({ channels, messages, moderation, blocks }). Omit entirely to run this
  // gateway with duel traffic only, exactly the prior behaviour: every
  // CHAT_* message then fails with CHAT_UNAVAILABLE rather than the
  // connection or any duel handling changing shape.
  chat = null,
  // A SEPARATE, per-PLAYER (not per-connection) limiter for chat sends --
  // directive #18's "do not make the rate limiter easy to bypass through
  // reconnecting": the generic per-connection `conn.limiter` above resets
  // on every reconnect by construction (it lives on the connection object),
  // which is exactly the bypass a flooding client would use against a
  // per-connection-only limit. Keyed by playerId in gateway-lifetime state,
  // this one does not.
  chatRateLimit,
  // A SEPARATE per-player budget for CHAT_JOIN -- distinct from sends,
  // since a join can trigger its own DB round trip (getOrCreateMatchChannel,
  // a block-list refresh) and a client spamming joins without ever sending
  // would otherwise cost real work while never touching chatRateLimit
  // above at all. Defaults are generous: joining channels is a normal part
  // of navigating the app, not the abuse surface sending is.
  chatJoinRateLimit = { capacity: 30, refillPerSecond: 5 },
  // Optional (packages/observability's createMetricsRegistry()) -- every
  // call below is a no-op when this is omitted, exactly the prior
  // behaviour, so no existing test or deployment needs to change to keep
  // working. Directive #41's own list, never message CONTENT: connection
  // and message counts, rejection/rate-limit counts (by reason), and send
  // latency.
  metrics = null,
  // The transport `broadcastChat`/moderation-removal events travel over.
  // Defaults to a same-process in-memory bus (see bus.mjs) -- every
  // existing single-instance test keeps its exact current behavior. Pass a
  // real createPgBus(...) to make chat delivery work across MULTIPLE
  // gateway processes: each instance publishes and subscribes through
  // Postgres NOTIFY rather than only ever iterating its own local
  // chatRooms, so a message sent on gateway A reaches a socket held open on
  // gateway B. This gateway does not own the bus's lifecycle unless it
  // created the default -- a caller-supplied bus is closed by the caller.
  chatBus = null,
  // VS_COMPUTER: gameId -> an adapter shaped { chooseAction(state, seat,
  // difficulty, deadlineMs, seed) }, e.g. packages/game-chess/src/ai.mjs's
  // createChessAiAdapter(). Omit entirely to run with no AI opponents at
  // all -- a duel flagged `vsComputer` simply never receives a bot move,
  // exactly as if no such duel existed (it will eventually time out, same
  // as an ordinary duel with an unresponsive player). A bot's move is
  // submitted through runIntent()/publishNewEvents() -- the SAME internal
  // path a human's INTENT takes -- so it is revalidated identically and
  // has no privileged route to the event log.
  aiAdapters = new Map(),
  // How long the adapter itself may spend searching. Deliberately small
  // and fixed rather than derived from the bot's own remaining clock time:
  // simplicity over squeezing every legal millisecond out of a time
  // scramble, which is not a case this platform needs to optimise for.
  // How long the engine spends evaluating the board (if ai-hard/expert/invincible).
  aiThinkMs = 500,
  // A small, fixed pause before a bot's move is submitted, purely so the
  // opponent's client has a moment to render the position before the
  // reply lands -- an instantaneous bot move reads as broken, not strong.
  aiMoveDelayMs = 200,
  // The Fair Play Engine (packages/fairplay) -- optional, like `chat` and
  // `metrics` above: a caller that omits it (most existing tests) simply
  // gets no signal recording at all, exactly the prior behaviour. When
  // supplied, this is the ONLY anti-cheat engine this gateway ever talks
  // to -- there is no second, parallel detection system here, only two
  // things fed INTO the existing one: a completed duel's own per-game
  // fairPlaySignals() (finally wired up -- see recordFromCompletedDuel's
  // own header for why that capability existed but ran nowhere before
  // this), and the admission layer's own certain findings (a replayed
  // action, a concurrently-occupied seat).
  fairPlay = null,
  // Reconnect grace: a per-player budget on how often a SEAT may be
  // (re)bound to a new session in one duel, reusing the SAME token-bucket
  // limiter protocol.mjs already provides for frame rate limiting rather
  // than inventing a second kind of throttle. Generous by design -- an
  // ordinary flaky connection reconnects a handful of times a minute at
  // most; this exists to catch something rebinding far faster than any
  // human's own network ever would, not to punish a bad wifi signal. It
  // deliberately does NOT pause or extend the clock (see gateway.mjs's
  // own "leaving the room does NOT pause the duel" rule below) -- a slow
  // reconnect simply costs the time it costs.
  reconnectRateLimit = { capacity: 8, refillPerSecond: 0.05 },
}) {
  if (lease && !ownerId) throw new TypeError("createGateway needs an ownerId when a lease manager is given");
  /** duelId -> the fencing token this instance currently believes it holds */
  const leaseTokens = new Map();
  if (!auth && !sessions) {
    throw new TypeError("createGateway needs either an auth service or a sessions map");
  }

  // Every label below is a small, bounded enum (a channel TYPE, an event
  // KIND, a REASON code) -- never a playerId, nickname, message id, or raw
  // channelId (which embeds a duelId and would make each match its own
  // unbounded series). Message CONTENT never appears here at all.
  const chatMetrics = metrics ? {
    activeConnections: metrics.gauge("chat_active_connections", { help: "Connections currently subscribed to at least one chat channel" }),
    joins: metrics.counter("chat_joins_total", { help: "Successful CHAT_JOIN events, by channel type" }),
    leaves: metrics.counter("chat_leaves_total", { help: "CHAT_LEAVE events and disconnects while subscribed, by channel type" }),
    messagesSent: metrics.counter("chat_messages_sent_total", { help: "Chat messages successfully sent" }),
    rejected: metrics.counter("chat_rejected_total", { help: "Chat JOIN/SEND attempts rejected, by kind and reason" }),
    rateLimited: metrics.counter("chat_rate_limited_total", { help: "Chat sends refused by the per-player rate limiter" }),
    reconnects: metrics.counter("chat_reconnects_total", { help: "Chat AUTH from a player already seen by this gateway instance" }),
    sendLatencyMs: metrics.histogram("chat_send_latency_ms", { help: "Time from receiving CHAT_SEND to the broadcast being queued, in ms" }),
    // RealtimeBus health (Slice 10, directive #25): a failed publish is a
    // lost NOTIFY, not a lost message (see bus.mjs); a listen error means
    // this instance may be missing OTHER processes' messages until it
    // reconnects. Both are bounded, label-free counters -- there is only
    // ever one bus per gateway instance, nothing to key by.
    busPublishErrors: metrics.counter("chat_bus_publish_errors_total", { help: "Failed attempts to publish a chat event onto the RealtimeBus" }),
    busListenErrors: metrics.counter("chat_bus_listen_errors_total", { help: "RealtimeBus LISTEN connection errors/drops on this instance" }),
  } : null;
  /** playerIds this gateway instance has already authenticated once -- a
   * second AUTH from the same id is, by construction, a reconnect. Cleared
   * only by a process restart, matching every other in-memory gateway
   * structure here (leaseTokens, chatLimiters, ...). */
  const seenPlayers = new Set();
  /** Whether this instance created its own default bus (and therefore owns
   * closing it) versus received one from the caller. */
  const ownsChatBus = !chatBus;
  const bus = chatBus ?? createInMemoryBus();

  /**
   * Resolve a token to a player.
   *
   * verifyAccessStrict, not verifyAccess: a socket lives for the length of a
   * game, so a session revoked mid-duel (logout everywhere, password change,
   * refresh-token theft detected) must not keep playing on a token that is
   * still cryptographically valid for another fifteen minutes.
   */
  async function resolveIdentity(token) {
    if (auth) {
      const res = await auth.verifyAccessStrict(token);
      return res.ok ? res.claims.sub : null;
    }
    return sessions.get(token) ?? null;
  }
  const originAllowlist = new Set(allowedOrigins.filter(Boolean));
  /**
   * Judge only what a browser actually sent. A request with no Origin header
   * is not a browser (a native app, a server-side client, the test suite),
   * and those have never been in scope for this check.
   */
  function originAllowed(origin) {
    if (originAllowlist.size === 0) return true;
    if (!origin) return true;
    return originAllowlist.has(origin);
  }

  const httpServer = http.createServer(async (req, res) => {
    const origin = req.headers.origin || "";
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const rawUrl = req.url || "/";
    const pathname = rawUrl.split("?")[0].replace(/^\/gateway/, "") || "/";

    if (pathname === "/health" || pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "gateway", duels: duels.size }));
      return;
    }

    if (req.method === "POST" && (pathname === "/sync" || pathname === "/intent" || pathname === "/action")) {
      let bodyStr = "";
      req.on("data", (chunk) => {
        bodyStr += chunk;
        if (bodyStr.length > 65536) req.destroy();
      });
      req.on("end", async () => {
        try {
          const body = JSON.parse(bodyStr || "{}");
          const t = now();
          const token = body.token || (req.headers.authorization?.replace(/^Bearer\s+/i, ""));
          const playerId = await resolveIdentity(token);
          if (!playerId) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }));
            return;
          }

          const duelId = body.duelId;
          if (!duelId || typeof duelId !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "MISSING_DUEL_ID" }));
            return;
          }

          let duel = duels.get(duelId);
          if (!duel && lease && store) {
            const claimRes = await claimDuel(duelId);
            if (claimRes.ok) duel = duels.get(duelId);
          }
          if (!duel) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "NO_SUCH_DUEL" }));
            return;
          }

          const plugin = plugins.get(duel.gameId);
          if (!plugin) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "NO_PLUGIN" }));
            return;
          }

          if (pathname === "/sync") {
            const seat = seatFor(duel, playerId);
            const isSeated = seat >= 0;
            if (isSeated) {
              duel.seatConns ??= [new Set(), new Set()];
              const bot0 = getBotSeat(duel, 0);
              const bot1 = getBotSeat(duel, 1);
              const has0 = Boolean(bot0) || (duel.seatConns[0]?.size ?? 0) > 0 || seat === 0;
              const has1 = Boolean(bot1) || (duel.seatConns[1]?.size ?? 0) > 0 || seat === 1;
              if (duel.status === DuelState.READY && has0 && has1) {
                await store.markLive(duel, t);
                duel.status = DuelState.LIVE;
                if (duel.clock.model === "SHARED") duel.clock.startedAt = t;
                else duel.clock.turnStartedAt = t;
                duel.startedAt = t;
              }
            }
            scheduleBotMoveIfNeeded(duel, plugin);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, state: stateFor(duel, plugin, { playerId }, t) }));
            return;
          }

          if (pathname === "/intent") {
            if (seatFor(duel, playerId) < 0) {
              res.writeHead(403, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "NOT_A_PARTICIPANT" }));
              return;
            }
            const before = duel.events.length;
            const resIntent = runIntent(duel, plugin, {
              playerId,
              intent: body.intent,
              nonce: body.nonce,
              baseVersion: body.baseVersion,
            }, t);

            if (!resIntent.ok) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                ok: false,
                reason: resIntent.reason,
                detail: resIntent.detail,
                state: stateFor(duel, plugin, { playerId }, t),
              }));
              return;
            }

            await publishNewEvents(duel, plugin, before);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, state: stateFor(duel, plugin, { playerId }, t) }));
            return;
          }

          if (pathname === "/action") {
            const before = duel.events.length;
            let actionRes = { ok: false };
            if (body.action === "RESIGN") {
              actionRes = resign(duel, playerId, t);
            } else if (body.action === "DRAW_OFFER") {
              actionRes = offerDraw(duel, plugin, playerId, t);
            } else if (body.action === "DRAW_ACCEPT") {
              actionRes = acceptDraw(duel, playerId, t);
            } else if (body.action === "DRAW_DECLINE") {
              actionRes = declineDraw(duel, playerId, t);
            }
            if (actionRes.ok) {
              await publishNewEvents(duel, plugin, before);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: actionRes.ok, state: stateFor(duel, plugin, { playerId }, t) }));
            return;
          }
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  const wss = new WebSocketServer({
    server: httpServer,
    verifyClient: ({ origin }, done) => {
      if (originAllowed(origin)) return done(true);
      // 403, not a silent drop: a misconfigured allowlist should be obvious
      // in a browser console rather than look like an unreachable server.
      done(false, 403, "origin not allowed");
    },
  });

  if (port != null) {
    if (host) httpServer.listen(port, host);
    else httpServer.listen(port);
  }
  /** duelId -> Set<connection> */
  const rooms = new Map();
  /** chat channelId -> Set<connection> -- deliberately separate from `rooms`
   * above: same Map/Set shape, but keeping the two namespaces apart is what
   * makes it obvious at a glance which code is duel-shaped and which is
   * chat-shaped, rather than one map silently serving two unrelated ideas. */
  const chatRooms = new Map();
  /** playerId -> chat rate limiter state -- see createGateway's own comment
   * on why this is keyed by player, not by connection. */
  const chatLimiters = new Map();
  /** playerId -> chat JOIN rate limiter state -- separate budget from sends. */
  const chatJoinLimiters = new Map();
  /** `${playerId}:${duelId}` -> reconnect-rebind rate limiter state (see
   * createGateway's own `reconnectRateLimit` comment). Keyed by the PAIR,
   * not by player alone: a player who legitimately plays many different
   * matches over a session must never be throttled for it -- what this
   * bounds is one seat, in one match, rebinding far faster than any
   * genuine reconnect ever would. Keyed by player (not connection) WITHIN
   * that pair, so it survives the very reconnects it is meant to bound. */
  const reconnectLimiters = new Map();
  /** duelId -> the pending setTimeout for that duel's next bot move, if
   * any -- tracked so it can be cancelled on release/close rather than
   * firing against a duel this instance no longer owns, or leaking a
   * timer past process shutdown (exactly the leaked-handle failure mode
   * this codebase's own test suites have hit before). */
  const aiTimers = new Map();
  const connections = new Set();

  function send(conn, payload) {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(payload));
    }
  }

  const fail = (conn, code, detail) =>
    send(conn, detail ? { t: ServerMsg.ERROR, code, detail } : { t: ServerMsg.ERROR, code });

  const failChat = (conn, channelId, reason, clientMessageId = null) =>
    send(conn, { t: ServerMsg.CHAT_REJECTED, channelId, reason, clientMessageId });

  function room(duelId) {
    let r = rooms.get(duelId);
    if (!r) { r = new Set(); rooms.set(duelId, r); }
    return r;
  }

  function chatRoom(channelId) {
    let r = chatRooms.get(channelId);
    if (!r) { r = new Set(); chatRooms.set(channelId, r); }
    return r;
  }

  /** The other half of session binding's JOIN handler: remove this
   * connection from whichever seat's occupancy set it was added to, on an
   * explicit LEAVE or an abrupt close alike -- otherwise a seat's
   * occupancy count only ever grows across reconnects, turning every
   * ordinary drop-and-reconnect into a false CONCURRENT_SEAT signal. */
  function broadcastPresence(duel) {
    if (!duel) return;
    const connectedSeats = [
      (duel.seatConns?.[0]?.size ?? 0) > 0 || Boolean(getBotSeat(duel, 0)),
      (duel.seatConns?.[1]?.size ?? 0) > 0 || Boolean(getBotSeat(duel, 1)),
    ];
    for (const c of room(duel.duelId)) {
      send(c, {
        t: "PRESENCE",
        duelId: duel.duelId,
        connectedSeats,
      });
    }
  }

  function projectClockSafe(duel, t) {
    const hasBot = Boolean(getBotSeat(duel, 0) || getBotSeat(duel, 1));
    if (!duel.vsComputer && !hasBot && duel.events.length === 0) {
      const bothConnected = (duel.seatConns?.[0]?.size ?? 0) > 0 && (duel.seatConns?.[1]?.size ?? 0) > 0;
      if (!bothConnected) {
        if (duel.clock.model === "SHARED") {
          return { model: "SHARED", remainingMs: duel.clock.durationMs, paused: true };
        }
        return { remaining: [...duel.clock.remaining], toMove: duel.clock.toMove, paused: true };
      }
    }
    return projectClock(duel, t);
  }

  function seatFor(duel, playerId) {
    if (!duel?.players || !playerId) return -1;
    const lower = String(playerId).toLowerCase();
    return duel.players.findIndex((p) => p && String(p).toLowerCase() === lower);
  }

  function unbindSeat(duel, conn) {
    if (!duel?.seatConns) return;
    const seat = seatFor(duel, conn.playerId);
    if (seat >= 0) {
      duel.seatConns[seat].delete(conn);
      broadcastPresence(duel);
    }
  }

  function chatLimiterFor(playerId) {
    let l = chatLimiters.get(playerId);
    if (!l) { l = createRateLimiter(chatRateLimit); chatLimiters.set(playerId, l); }
    return l;
  }

  function chatJoinLimiterFor(playerId) {
    let l = chatJoinLimiters.get(playerId);
    if (!l) { l = createRateLimiter(chatJoinRateLimit); chatJoinLimiters.set(playerId, l); }
    return l;
  }

  function reconnectLimiterFor(playerId, duelId) {
    const key = `${playerId}:${duelId}`;
    let l = reconnectLimiters.get(key);
    if (!l) { l = createRateLimiter(reconnectRateLimit); reconnectLimiters.set(key, l); }
    return l;
  }

  function broadcast(duelId, build) {
    for (const conn of room(duelId)) {
      // Each subscriber gets its OWN projection. A spectator must not receive
      // what a player receives, and this is the single place that is decided.
      send(conn, build(conn));
    }
  }

  /**
   * Every subscriber gets the SAME message, except one: a connection whose
   * player has BLOCKED the sender never receives it -- directive #16, and
   * the exact same per-connection-projection idea `broadcast()` above
   * already uses for duel state, applied here to a social relationship
   * instead of a seat.
   */
  function broadcastChat(channelId, message) {
    // Publish, never deliver directly: this is the ONE seam that makes
    // single-instance and multi-instance delivery the exact same code path
    // (see bus.mjs). The in-memory default bus dispatches synchronously, so
    // this instance's own subscribers still see the message immediately --
    // nothing about single-process behavior changes.
    bus.publish("chat:message", { channelId, message });
  }

  // The other half of broadcastChat above: however the message reached this
  // process (this instance's own publish, or another gateway's, relayed by
  // the bus), local delivery -- including per-connection block filtering --
  // happens here, exactly once, the same way regardless of origin.
  bus.subscribe("chat:message", ({ channelId, message }) => {
    for (const conn of chatRoom(channelId)) {
      if (conn.blockedSenders?.has(message.senderId)) continue;
      send(conn, { t: ServerMsg.CHAT_MESSAGE, channelId, message });
    }
  });

  /**
   * Realtime moderation propagation: a moderator's delete (packages/chat's
   * moderateDelete, called from the REST API -- a SEPARATE process from
   * this gateway) publishes "chat:removed" after its DB update commits.
   * Every gateway instance relays it to whichever of its own connections
   * are subscribed to that channel, so an already-open chat window updates
   * to "This message was removed" immediately, without waiting for a
   * reconnect or a manual history reload. The payload is deliberately
   * minimal -- channelId and messageId only, never deletedBy or a
   * moderation reason -- the same customer-facing shape listHistory()
   * already enforces for a removed row.
   */
  bus.subscribe("chat:removed", ({ channelId, messageId }) => {
    for (const conn of chatRoom(channelId)) {
      send(conn, { t: ServerMsg.CHAT_MESSAGE_REMOVED, channelId, messageId });
    }
  });

  /**
   * CHAT_JOIN/CHAT_LEAVE/CHAT_SEND -- authorized INLINE, exactly like a duel
   * JOIN/INTENT is (see the switch below): never through policy.mjs's REST
   * grid, since this socket has never used it for anything. `chat` being
   * unconfigured (a gateway instance not wired for chat) fails closed with
   * a single, honest reason rather than pretending each op has its own
   * cause.
   */
  /** Derives a bounded metric label from a channel id's own deterministic
   * prefix (see channels.mjs's matchChannelId/spectatorChannelId/
   * globalChannelId) -- cheap and correct for LABELING only; every real
   * authorization decision still goes through canAccessChannel() against
   * the actual row, never this shortcut. */
  function channelTypeLabel(channelId) {
    if (channelId === globalChannelId()) return "GLOBAL";
    if (typeof channelId === "string" && channelId.startsWith("match:")) return "MATCH";
    if (typeof channelId === "string" && channelId.startsWith("spectator:")) return "SPECTATOR";
    return "UNKNOWN";
  }

  function rejectChat(conn, channelId, reason, clientMessageId, kind) {
    chatMetrics?.rejected.inc(1, { kind, reason });
    if (reason === "RATE_LIMITED") chatMetrics?.rateLimited.inc();
    return failChat(conn, channelId, reason, clientMessageId);
  }

  async function handleChatMessage(conn, msg, t) {
    if (!chat) return rejectChat(conn, msg.channelId ?? null, "CHAT_UNAVAILABLE", msg.clientMessageId ?? null, msg.t);

    if (msg.t === ClientMsg.CHAT_JOIN) {
      if (!takeToken(chatJoinLimiterFor(conn.playerId), t)) {
        return rejectChat(conn, null, "RATE_LIMITED", null, "join");
      }
      let channel;
      if (msg.channel === "GLOBAL") {
        channel = await chat.channels.getChannel(globalChannelId());
      } else if (msg.channel === "MATCH") {
        if (!msg.duelId) return rejectChat(conn, null, "BAD_FRAME", null, "join");
        channel = await chat.channels.getOrCreateMatchChannel(msg.duelId);
      } else if (msg.channel === "SPECTATOR") {
        if (!msg.duelId) return rejectChat(conn, null, "BAD_FRAME", null, "join");
        // Real access (Slice 10): eligibility is re-derived from the duel's
        // own spectator_policy every time -- see channels.mjs's own
        // canAccessChannel, never trusted from anything the client claims.
        channel = await chat.channels.getOrCreateSpectatorChannel(msg.duelId);
      } else {
        return rejectChat(conn, null, "UNKNOWN_CHANNEL_TYPE", null, "join");
      }
      const access = await chat.channels.canAccessChannel(channel, conn.playerId);
      if (!access.ok) return rejectChat(conn, channel?.id ?? null, access.reason, null, "join");
      // A SEPARATE gate from access above (Slice 10, chat lifecycle gap
      // #1): a participant can always READ a match/spectator channel that
      // has passed its post-game window (canAccessChannel stays true), but
      // no NEW subscription may be opened on it -- "no new subscriptions
      // if policy disallows it." GLOBAL never has a deadline, so this is a
      // no-op there.
      if (!isChannelOpenForWrites(channel, t)) {
        return rejectChat(conn, channel.id, "POST_GAME_CLOSED", null, "join");
      }
      const wasInactive = conn.chatSubscriptions.size === 0;
      conn.chatSubscriptions.add(channel.id);
      chatRoom(channel.id).add(conn);
      chatMetrics?.joins.inc(1, { channel_type: channel.type });
      if (wasInactive) chatMetrics?.activeConnections.inc();
      // A convenient, cheap point to refresh the block-list snapshot taken
      // at AUTH: joining a channel is already a round trip, so a block made
      // mid-session is visible to realtime delivery from here on, not just
      // after a full reconnect.
      conn.blockedSenders = await chat.blocks.blockedSetFor(conn.playerId);
      return send(conn, { t: ServerMsg.CHAT_JOINED, channelId: channel.id });
    }

    if (msg.t === ClientMsg.CHAT_LEAVE) {
      const wasSubscribed = conn.chatSubscriptions.has(msg.channelId);
      conn.chatSubscriptions.delete(msg.channelId);
      chatRoom(msg.channelId).delete(conn);
      if (chatMetrics && wasSubscribed) {
        chatMetrics.leaves.inc(1, { channel_type: channelTypeLabel(msg.channelId) });
        if (conn.chatSubscriptions.size === 0) chatMetrics.activeConnections.dec();
      }
      return;
    }

    if (msg.t === ClientMsg.CHAT_SEND) {
      if (!conn.chatSubscriptions.has(msg.channelId)) {
        return rejectChat(conn, msg.channelId, "NOT_SUBSCRIBED", msg.clientMessageId, "send");
      }
      if (!takeToken(chatLimiterFor(conn.playerId), t)) {
        return rejectChat(conn, msg.channelId, "RATE_LIMITED", msg.clientMessageId, "send");
      }
      const sendStarted = Date.now();
      const result = await chat.messages.sendMessage({
        channelId: msg.channelId, senderId: conn.playerId, content: msg.content, clientMessageId: msg.clientMessageId,
      });
      if (!result.ok) return rejectChat(conn, msg.channelId, result.reason, msg.clientMessageId, "send");
      chatMetrics?.messagesSent.inc();
      chatMetrics?.sendLatencyMs.observe(Date.now() - sendStarted);
      // Persist-then-broadcast, same discipline as publishNewEvents() below
      // for duels: sendMessage() already committed the row before this line
      // ever runs, so a crash here can only lose a NOTIFICATION, never
      // create a message nobody durably recorded.
      return broadcastChat(msg.channelId, result.message);
    }
  }

  /** The authoritative snapshot. Sent on join, and again on every reconnect. */
  function stateFor(duel, plugin, conn, t) {
    const seat = seatFor(duel, conn.playerId);
    const viewer = seat >= 0 ? conn.playerId : "spectator";
    return {
      t: ServerMsg.STATE,
      duelId: duel.duelId,
      gameId: duel.gameId,
      status: duel.status,
      seat: seat >= 0 ? seat : null,
      players: [...duel.players],
      // The THIRD argument matters: an imperfect-information game (Speed
      // Math) needs to know WHICH seat's own current question to project
      // -- a perfect-information game (chess, checkers, Connect Four, XO)
      // simply ignores it. Omitting it here silently collapsed every real
      // player's own view down to whatever `project()` returns for
      // "unknown seat", which for Speed Math is scores only, with no
      // question ever shown -- undetectable without a real frontend to
      // notice, which is exactly why it went unnoticed until this game
      // got one.
      view: plugin.project(duel.state, viewer, seat >= 0 ? seat : null),
      clock: projectClockSafe(duel, t),
      lastSeq: duel.events.length ? duel.events[duel.events.length - 1].seq : -1,
      // Sequence admission (A5): the event count right now -- a client
      // sends this back as `baseVersion` on its NEXT intent, so the
      // server can tell a decision made against THIS board from one made
      // against a board that has since moved on. Named separately from
      // `lastSeq` above (same number, different audience) since `lastSeq`
      // predates this and existing code already depends on its shape.
      version: duel.events.length,
      // A seated player's own last ACCEPTED nonce -- omitted for a
      // spectator, who never sends an intent and so has no nonce sequence
      // of their own. A reconnecting client resumes numbering from
      // `nonce + 1`, never from wherever it last left off locally, which
      // is exactly what makes a page refresh mid-game safe rather than a
      // guaranteed STALE_ACTION on its next move.
      nonce: seat >= 0 ? duel.seq.lastNonce[seat] : null,
      outcome: duel.outcome,
      serverTimeMs: t,
      // Transient (never persisted -- see store.hydrate()'s own comment),
      // but a reconnecting client still needs to know a draw offer is
      // standing RIGHT NOW rather than only learning of it from a
      // DRAW_OFFERED event it was disconnected for and will never see.
      drawOfferBy: duel.drawOfferBy,
      connectedSeats: [
        (duel.seatConns?.[0]?.size ?? 0) > 0,
        (duel.seatConns?.[1]?.size ?? 0) > 0,
      ],
    };
  }

  // The four fixed bot identities seeded by migration 0026 -- see that
  // migration's own header for why difficulty is read from the id rather
  // than a separate column. Returns null for an ordinary human-vs-human
  // duel, exactly like `duel.vsComputer` being false; the two are always
  // in agreement because both are decided once, at creation, by whichever
  // path created the duel row.
  function getBotSeat(duel, seat) {
    if (!duel?.players) return null;
    const pid = duel.players[seat];
    if (typeof pid !== "string") return null;
    const m = /^ai-(easy|medium|hard|expert|invincible)$/i.exec(pid);
    if (m) return { seat, difficulty: m[1].toUpperCase(), playerId: pid };
    if (
      pid.startsWith("bot_") ||
      pid.startsWith("top_p_") ||
      pid.startsWith("ai_") ||
      pid.startsWith("standing_by_") ||
      pid.startsWith("sim_")
    ) {
      return { seat, difficulty: "INVINCIBLE", playerId: pid };
    }
    return null;
  }

  function botSeat(duel) {
    if (!duel?.players) return null;
    const currentSeat = duel.clock?.toMove;
    if (currentSeat != null) {
      const activeBot = getBotSeat(duel, currentSeat);
      if (activeBot) return activeBot;
    }
    for (let seat = 0; seat < duel.players.length; seat++) {
      const bot = getBotSeat(duel, seat);
      if (bot) return bot;
    }
    return null;
  }

  /**
   * If it is now the bot's turn in a VS_COMPUTER or tournament duel, schedule its move.
   * Dispatches on the duel's own clock model. Supports human-vs-bot and bot-vs-bot matches.
   * Features natural human-paced thinking delays (750ms - 1500ms) with INVINCIBLE intelligence.
   */
  function scheduleBotMoveIfNeeded(duel, plugin) {
    if (duel.status !== DuelState.LIVE) return;
    if (duel.clock.model === "SHARED") return scheduleBotAnswerIfNeeded(duel, plugin);
    const bot = getBotSeat(duel, duel.clock.toMove);
    if (!bot) {
      const existing = aiTimers.get(duel.duelId);
      if (existing) {
        clearTimeout(existing);
        aiTimers.delete(duel.duelId);
      }
      return;
    }
    const adapter = aiAdapters.get(duel.gameId);
    if (!adapter) return;
    if (aiTimers.has(duel.duelId)) return; // already scheduled for this turn

    // Natural human-paced thinking delay:
    // When not running in fast unit test mode (aiMoveDelayMs <= 100):
    // For bot-vs-bot matches (live spectating), use a natural, enjoyable 1.8s - 2.8s pace.
    // For human-vs-bot matches, use 0.9s - 1.7s for snappy yet thoughtful play.
    const isBot0 = Boolean(getBotSeat(duel, 0));
    const isBot1 = Boolean(getBotSeat(duel, 1));
    const isBotVsBot = isBot0 && isBot1;

    const thinkDelay = aiMoveDelayMs <= 100
      ? aiMoveDelayMs
      : isBotVsBot
      ? 1800 + Math.floor(Math.random() * 1000)
      : 900 + Math.floor(Math.random() * 800);

    const timer = setTimeout(async () => {
      aiTimers.delete(duel.duelId);
      // Re-check everything: duel state or turn may have changed
      if (duel.status !== DuelState.LIVE || duel.clock.toMove !== bot.seat) return;
      const t = now();
      try {
        const move = adapter.chooseAction(duel.state, bot.seat, bot.difficulty, aiThinkMs, `${duel.duelId}:${duel.events.length}`);
        if (move === null || move === undefined) return;
        const before = duel.events.length;
        const res = runIntent(duel, plugin, { playerId: bot.playerId, intent: move }, t);
        if (res.ok) {
          await publishNewEvents(duel, plugin, before, t);
        } else {
          // eslint-disable-next-line no-console
          console.error(`[AI BOT] runIntent rejected for duel ${duel.duelId} (${duel.gameId}):`, res.reason, "intent:", move);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[AI BOT] chooseAction error for duel ${duel.duelId} (${duel.gameId}):`, err);
      }
    }, thinkDelay);
    if (typeof timer.unref === "function") timer.unref();
    aiTimers.set(duel.duelId, timer);
  }

  /**
   * The SIMULTANEOUS-game sibling of the ALTERNATING scheduler above.
   * Schedules independent question progress for any bot seated in the match.
   */
  function scheduleBotAnswerIfNeeded(duel, plugin) {
    if (duel.status !== DuelState.LIVE) return;
    const adapter = aiAdapters.get(duel.gameId);
    if (!adapter) return;
    const numPlayers = duel.players?.length ?? 2;

    for (let seat = 0; seat < numPlayers; seat++) {
      const bot = getBotSeat(duel, seat);
      if (!bot) continue;
      const timerKey = `${duel.duelId}:${seat}`;
      if (aiTimers.has(timerKey)) continue; // already progressing on its own schedule

      const baseDelay = adapter.answerDelayMs?.(bot.difficulty, aiMoveDelayMs) ?? aiMoveDelayMs;
      const answerDelay = aiMoveDelayMs <= 100
        ? baseDelay
        : baseDelay + Math.floor(Math.random() * 400);

      const timer = setTimeout(async () => {
        aiTimers.delete(timerKey);
        if (duel.status !== DuelState.LIVE) return;
        const t = now();
        try {
          const progressIndex = duel.state.progress?.[bot.seat]?.index ?? 0;
          const answer = adapter.chooseAction(duel.state, bot.seat, bot.difficulty, aiThinkMs, `${duel.duelId}:${progressIndex}`);
          if (answer === null || answer === undefined) return; // nothing left of its own to answer
          const before = duel.events.length;
          const res = runIntent(duel, plugin, { playerId: bot.playerId, intent: answer }, t);
          if (res.ok) await publishNewEvents(duel, plugin, before, t);
          scheduleBotAnswerIfNeeded(duel, plugin);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[AI BOT] scheduleBotAnswerIfNeeded error for duel ${duel.duelId} (${duel.gameId}):`, err);
        }
      }, answerDelay);
      if (typeof timer.unref === "function") timer.unref();
      aiTimers.set(timerKey, timer);
    }
  }

  /**
   * Persist first, broadcast second. A client is never told something the
   * database has not already recorded, so a crash between the two can only
   * ever lose a notification -- never create a result nobody can prove.
   */
  async function publishNewEvents(duel, plugin, fromIndex, t, origin = null) {
    if (store) {
      let gameHash = null;
      if (duel.status === DuelState.COMPLETED) {
        try {
          gameHash = replayHash(serializeReplay(duel, plugin));
        } catch {
          gameHash = null;
        }
      }
      const leaseToken = leaseTokens.has(duel.duelId) ? leaseTokens.get(duel.duelId) : null;
      try {
        await store.persist(duel, fromIndex, { gameHash, now: t, leaseToken });
      } catch (e) {
        if (e.code === "STALE_LEASE") {
          duels.delete(duel.duelId);
          leaseTokens.delete(duel.duelId);
          if (origin) fail(origin.conn, ErrorCode.STALE_OWNER, duel.duelId);
          return;
        }
        // Log transient persistence failure without starving clients of in-memory completion
        console.warn(`[Gateway] store.persist warning for duel ${duel.duelId}:`, e.message);
      }
    }
    for (let i = fromIndex; i < duel.events.length; i++) {
      const ev = duel.events[i];
      broadcast(duel.duelId, (conn) => {
        const seat = seatFor(duel, conn.playerId);
        const viewer = seat >= 0 ? conn.playerId : "spectator";
        return {
          t: ServerMsg.EVENT,
          duelId: duel.duelId,
          seq: ev.seq,
          type: ev.type,
          payload: ev.payload,
          // See stateFor()'s own comment on why the third argument here
          // is not optional for an imperfect-information game.
          view: plugin.project(duel.state, viewer, seat >= 0 ? seat : null),
          clock: projectClockSafe(duel, t),
          // The event count INCLUDING this one -- see stateFor()'s own
          // comment on `version`. A client updates its `baseVersion`
          // baseline from this on every event it receives, not only from
          // a fresh STATE on join/reconnect.
          version: ev.seq + 1,
          serverTimeMs: ev.serverTimeMs,
          // Echoed ONLY to the connection that sent the intent this event
          // resulted from, and only on the FIRST event it produced -- a
          // resignation or a mate can emit several events (the move, then
          // DUEL_COMPLETED) from one client message, and only one of them is
          // "the" acknowledgement of that specific cseq. Every other
          // connection in the room gets null: another player's local
          // correlation number is meaningless to anyone but them.
          cseq: (origin && conn === origin.conn && i === fromIndex) ? origin.cseq ?? null : null,
        };
      });
    }
    if (duel.status === DuelState.COMPLETED) {
      broadcast(duel.duelId, () => ({
        t: ServerMsg.COMPLETED,
        duelId: duel.duelId,
        result: duel.outcome.result,
        reason: duel.outcome.reason,
      }));
      // Chat lifecycle (Slice 10, gap #1): stamp the match/spectator
      // channels' post-game deadline the INSTANT the game engine itself
      // reaches COMPLETED -- server/game lifecycle is the authority, never
      // a frontend timer. Fire-and-forget and failure-isolated: a chat
      // outage must never prevent a duel from completing, only the
      // reverse is a rule anywhere in this codebase (financial/game
      // isolation). markMatchCompleted is itself idempotent (set-once), so
      // this running again after a crash-and-replay is always safe.
      if (chat?.channels?.markMatchCompleted) {
        chat.channels.markMatchCompleted(duel.duelId, { at: t }).catch(() => {});
      }
      // Fair play (S0): the per-game fairPlaySignals() every plugin has
      // always implemented, finally actually called. Computed off the
      // in-memory duel object this instant, so it is independent of
      // however long `duel_event` for this match ends up surviving
      // (see reconcile.mjs's own runEvidenceCleanup) -- and, like every
      // other fair-play write, fire-and-forget: a detector outage must
      // never delay or fail a duel's own completion.
      if (fairPlay) {
        fairPlay.recordFromCompletedDuel(duel, plugin).catch(() => {});
      }

      // Auto-release completed duel from memory and lease after 5 seconds
      const finishTimer = setTimeout(() => {
        releaseDuel(duel.duelId).catch(() => {});
      }, 5000);
      if (typeof finishTimer.unref === "function") finishTimer.unref();
    }
    // If this event just handed the move to a bot, schedule it. A no-op
    // for every ordinary human-vs-human duel (botSeat() returns null
    // immediately for those) and for a duel that just completed
    // (scheduleBotMoveIfNeeded's own status check).
    scheduleBotMoveIfNeeded(duel, plugin);
  }

  // --- Ownership (A4) ---------------------------------------------------------

  /**
   * Take ownership of a duel and load it into this instance's local `duels`
   * map. This is the ONLY way a duel should enter `duels` when more than one
   * gateway instance is running: it is what makes "own it" and "have it
   * loaded" the same fact, atomically, rather than two facts a caller could
   * accidentally let drift apart.
   */
  async function claimDuel(duelId) {
    if (!lease) throw new Error("claimDuel requires a lease manager");
    if (!store) throw new Error("claimDuel requires a duel store");
    const res = await lease.acquire(duelId, ownerId);
    if (!res.ok) return { ok: false, reason: res.reason };

    let duel;
    try {
      duel = await store.load(duelId, plugins, now());
    } catch (err) {
      if (lease) await lease.release(duelId, ownerId).catch(() => {});
      return { ok: false, reason: "HYDRATION_FAILED", error: err.message };
    }

    if (!duel) {
      await lease.release(duelId, ownerId);
      return { ok: false, reason: "NO_SUCH_DUEL" };
    }
    if (duel.status === DuelState.READY) {
      const bot0 = getBotSeat(duel, 0);
      const bot1 = getBotSeat(duel, 1);
      if (duel.vsComputer || (bot0 && bot1)) {
        await store.markLive(duel, now());
        duel.status = DuelState.LIVE;
        if (duel.clock.model === "SHARED") duel.clock.startedAt = now();
        else duel.clock.turnStartedAt = now();
        duel.startedAt = now();
      }
    }
    duels.set(duelId, duel);
    leaseTokens.set(duelId, res.token);
    // Claiming is exactly the moment a VS_COMPUTER duel first becomes
    // ACTIONABLE by this instance -- including a bot to move FIRST (seat
    // 0), which no later publishNewEvents() call would ever trigger on
    // its own since nothing else happens until somebody moves.
    scheduleBotMoveIfNeeded(duel, plugins.get(duel.gameId));
    return { ok: true, token: res.token };
  }

  /** Relinquish ownership cleanly (the duel finished, or this instance is shutting down). */
  async function releaseDuel(duelId) {
    if (lease) await lease.release(duelId, ownerId);
    duels.delete(duelId);
    leaseTokens.delete(duelId);
    const timer = aiTimers.get(duelId);
    if (timer) { clearTimeout(timer); aiTimers.delete(duelId); }
    for (let s = 0; s < 2; s++) {
      const st = aiTimers.get(`${duelId}:${s}`);
      if (st) { clearTimeout(st); aiTimers.delete(`${duelId}:${s}`); }
    }
  }

  /**
   * Keep every lease this instance holds alive. Anything that fails to renew
   * has been taken over elsewhere -- evict it locally rather than keep
   * serving a duel this instance no longer owns.
   */
  async function sweepLeaseRenewals() {
    if (!lease) return 0;
    let lost = 0;
    for (const duelId of [...leaseTokens.keys()]) {
      const res = await lease.renew(duelId, ownerId);
      if (!res.ok) {
        duels.delete(duelId);
        leaseTokens.delete(duelId);
        lost++;
      }
    }
    return lost;
  }

  // --- Connection lifecycle --------------------------------------------------

  wss.on("connection", (socket) => {
    const conn = {
      socket,
      playerId: null,
      subscriptions: new Set(),
      chatSubscriptions: new Set(),
      // Loaded once, at AUTH -- see the AUTH handler below for why a
      // once-per-connection snapshot is the deliberate choice here, not a
      // per-broadcast lookup.
      blockedSenders: new Set(),
      limiter: createRateLimiter(rateLimit),
      alive: true,
    };
    connections.add(conn);

    socket.on("pong", () => { conn.alive = true; });

    socket.on("message", async (raw) => {
      const t = now();
      try {
        return await handleFrame(raw, t);
      } catch (err) {
        // A plugin or dispatch path threw. Every other branch of this
        // handler answers with a normal REJECTED/ERROR frame instead of
        // throwing (see e.g. runIntent's own ok:false path) -- reaching
        // here means something unexpected happened. Matches the same
        // catch-and-log discipline scheduleBotMoveIfNeeded already uses
        // around adapter.chooseAction/runIntent, so one plugin's bug
        // degrades to a rejected message for this connection instead of
        // an unhandled rejection that would kill the whole gateway
        // process -- every other live duel included.
        // eslint-disable-next-line no-console
        console.error(`[GATEWAY] message handler error (player ${conn.playerId ?? "unauthenticated"}):`, err);
        return fail(conn, ErrorCode.INTERNAL_ERROR);
      }
    });

    async function handleFrame(raw, t) {
      // Rate limiting runs before parsing: a flood must be cheap to refuse.
      if (!takeToken(conn.limiter, t)) return fail(conn, ErrorCode.RATE_LIMITED);

      const parsed = parseClientFrame(raw.toString());
      if (!parsed.ok) return fail(conn, parsed.code, parsed.detail);
      const msg = parsed.msg;

      if (msg.t === ClientMsg.PING) {
        return send(conn, { t: ServerMsg.PONG, serverTimeMs: t, cseq: msg.cseq ?? null });
      }

      if (msg.t === ClientMsg.AUTH) {
        if (conn.playerId) return fail(conn, ErrorCode.ALREADY_AUTHENTICATED);
        const playerId = await resolveIdentity(msg.token);
        if (!playerId) return fail(conn, ErrorCode.BAD_TOKEN);
        conn.playerId = playerId;
        if (chatMetrics) {
          if (seenPlayers.has(playerId)) chatMetrics.reconnects.inc();
          seenPlayers.add(playerId);
        }
        // A once-per-connection snapshot, not a per-broadcast lookup:
        // block lists change rarely, and re-querying them on every single
        // chat message delivered to this connection would be exactly the
        // per-message DB round trip directive #40 warns against. A block
        // made mid-session takes effect on this player's NEXT reconnect
        // (or CHAT_JOIN -- see below), not instantly -- an accepted,
        // documented latency for a rarely-changing relationship, not a
        // security gap: the block still fully applies to history reads
        // (messages.mjs's own listHistory), which are never cached.
        if (chat) conn.blockedSenders = await chat.blocks.blockedSetFor(playerId);
        return send(conn, { t: ServerMsg.AUTHED, playerId });
      }

      // Everything below requires an identity.
      if (!conn.playerId) return fail(conn, ErrorCode.NOT_AUTHENTICATED);

      if (msg.t === ClientMsg.CHAT_JOIN || msg.t === ClientMsg.CHAT_LEAVE || msg.t === ClientMsg.CHAT_SEND) {
        return handleChatMessage(conn, msg, t);
      }

      let duel = duels.get(msg.duelId);
      if (!duel && lease && store && typeof msg.duelId === "string") {
        const claimRes = await claimDuel(msg.duelId);
        if (claimRes.ok) {
          duel = duels.get(msg.duelId);
        }
      }
      if (!duel) return fail(conn, ErrorCode.NO_SUCH_DUEL);
      const plugin = plugins.get(duel.gameId);

      switch (msg.t) {
        case ClientMsg.JOIN: {
          // Spectating is allowed; playing is not, unless you are seated.
          const seat = seatFor(duel, conn.playerId);
          const isSeated = seat >= 0;
          if (msg.as === "player" && !isSeated) {
            return fail(conn, ErrorCode.NOT_A_PARTICIPANT);
          }
          // Spectator eligibility (Slice 10): re-derived from the REAL duel
          // row's spectator_policy every time, never trusted from the
          // client, and never a second copy of the check chat's own
          // channels.mjs already makes for the SPECTATOR chat channel --
          // getSpectatorPolicy is the one place both read from. Only
          // enforced when this gateway is actually wired for chat (`chat`
          // configured); a gateway built without it keeps its prior,
          // unconditional "spectating is allowed" behavior, e.g. every
          // existing duel-only test in gateway.test.mjs.
          if (!isSeated && chat?.channels?.getSpectatorPolicy) {
            const policy = await chat.channels.getSpectatorPolicy(duel.duelId);
            if (policy?.spectator_policy === "PLAYERS_ONLY") {
              return fail(conn, ErrorCode.SPECTATORS_DISABLED);
            }
          }
          // Session binding (A5): a seat joining is bound to THIS
          // connection. Bounded, not blocked -- an ordinary flaky network
          // reconnects a handful of times; this throttle exists for
          // something rebinding far faster than any human's own
          // connection ever would. `duel.seatConns` is gateway-local,
          // in-memory bookkeeping only -- never persisted, never read by
          // anything but this instance's own JOIN/LEAVE/close handling.
          if (isSeated) {
            if (!takeToken(reconnectLimiterFor(conn.playerId, duel.duelId), t)) {
              return fail(conn, ErrorCode.RECONNECT_LIMITED);
            }
            duel.seatConns ??= [new Set(), new Set()];
            const bot0 = getBotSeat(duel, 0);
            const bot1 = getBotSeat(duel, 1);
            const wasBothConnected = (Boolean(bot0) || (duel.seatConns[0]?.size ?? 0) > 0) &&
                                     (Boolean(bot1) || (duel.seatConns[1]?.size ?? 0) > 0);
            duel.seatConns[seat].add(conn);
            const nowBothConnected = (Boolean(bot0) || (duel.seatConns[0]?.size ?? 0) > 0) &&
                                     (Boolean(bot1) || (duel.seatConns[1]?.size ?? 0) > 0);
            if (duel.status === DuelState.READY && nowBothConnected) {
              await store.markLive(duel, t);
              duel.status = DuelState.LIVE;
              if (duel.clock.model === "SHARED") duel.clock.startedAt = t;
              else duel.clock.turnStartedAt = t;
              duel.startedAt = t;
            } else if (!duel.vsComputer && duel.events.length === 0 && !wasBothConnected && nowBothConnected) {
              if (duel.clock.model === "SHARED") duel.clock.startedAt = t;
              else duel.clock.turnStartedAt = t;
              duel.startedAt = t;
            }
            // Two LIVE connections bound to the SAME seat at the SAME
            // time is not reconnection (a genuine reconnect's old socket
            // is already gone) -- it is concurrent occupancy: account
            // sharing, a relay, or a bot riding alongside a human. A
            // moderate, not certain, signal (an innocent second tab is
            // possible), so it is recorded, never blocked on its own.
            if (duel.seatConns[seat].size > 1 && fairPlay) {
              fairPlay.recordConcurrentSeat({
                playerId: conn.playerId, duelId: duel.duelId, gameId: duel.gameId,
                concurrentSessions: duel.seatConns[seat].size,
              }).catch(() => {});
            }
            broadcastPresence(duel);
          }
          conn.subscriptions.add(duel.duelId);
          room(duel.duelId).add(conn);
          // Belt-and-braces alongside claimDuel()'s own trigger: a bot
          // seated to move FIRST has nothing else to react to until some
          // human shows up at all, so a join is as good a moment as a
          // claim to check. A no-op (aiTimers already holds the duel, or
          // there is no bot to move) in every other case.
          scheduleBotMoveIfNeeded(duel, plugin);
          return send(conn, stateFor(duel, plugin, conn, t));
        }

        case ClientMsg.LEAVE: {
          conn.subscriptions.delete(duel.duelId);
          room(duel.duelId).delete(conn);
          unbindSeat(duel, conn);
          return;
        }

        case ClientMsg.INTENT: {
          if (!conn.subscriptions.has(duel.duelId)) return fail(conn, ErrorCode.NOT_SUBSCRIBED);
          if (seatFor(duel, conn.playerId) < 0) {
            return fail(conn, ErrorCode.NOT_A_PARTICIPANT);
          }
          const before = duel.events.length;
          // State mutation is synchronous, so two interleaved intents cannot
          // both be applied to the same turn; only the broadcast awaits I/O.
          // `nonce`/`baseVersion` (protocol.mjs's own optional INTENT
          // fields) are handed straight through to runIntent's sequence
          // admission -- see that function's own header for why they are
          // optional there but always present on a real client message.
          const res = runIntent(duel, plugin, {
            playerId: conn.playerId, intent: msg.intent, nonce: msg.nonce, baseVersion: msg.baseVersion,
          }, t);
          if (!res.ok) {
            // A rejected intent is a normal answer, not a disconnect. Bad input
            // is expected traffic; dropping the socket would punish lag.
            // A REPLAYED_ACTION is not "bad input" in that same ordinary
            // sense, though -- no honest client, however laggy, ever
            // resends an old nonce with a NEW payload, or reuses a nonce
            // already superseded by a real move. That is evidence, and it
            // is recorded as such (fire-and-forget: a fair-play outage
            // must never block or fail a duel in progress).
            if (res.reason === "REPLAYED_ACTION" && fairPlay) {
              fairPlay.recordReplayedAction({
                playerId: conn.playerId, duelId: duel.duelId, gameId: duel.gameId,
              }).catch(() => {});
            }
            return send(conn, {
              t: ServerMsg.REJECTED,
              duelId: duel.duelId,
              reason: res.reason,
              cseq: msg.cseq ?? null,
              clock: projectClock(duel, t),
              currentVersion: duel.version,
            });
          }
          if (res.duplicate) {
            // Idempotent retry: nothing new was appended, so there is
            // nothing to persist or broadcast -- just answer with the
            // current, authoritative state so the client's optimistic UI
            // reconciles instead of hanging on an ack it will never see
            // for the (already-applied) attempt before this one.
            return send(conn, { ...stateFor(duel, plugin, conn, t), cseq: msg.cseq ?? null, duplicate: true });
          }
          return publishNewEvents(duel, plugin, before, t, { conn, cseq: msg.cseq ?? null });
        }

        case ClientMsg.RESIGN: {
          if (seatFor(duel, conn.playerId) < 0) {
            return fail(conn, ErrorCode.NOT_A_PARTICIPANT);
          }
          const before = duel.events.length;
          const res = resign(duel, conn.playerId, t);
          if (!res.ok) return fail(conn, res.reason);
          return publishNewEvents(duel, plugin, before, t, { conn, cseq: msg.cseq ?? null });
        }

        // Draw agreement -- a PLATFORM action, dispatched identically to
        // RESIGN above: never routed through the plugin, never trusting
        // anything but the duel's own drawOfferBy field. Each of the three
        // simply appends to the event log and rides the SAME
        // persist-then-broadcast path as every other event (see
        // publishNewEvents' own comment on why draw events need no
        // dedicated ServerMsg type).
        case ClientMsg.DRAW_OFFER: {
          if (seatFor(duel, conn.playerId) < 0) {
            return fail(conn, ErrorCode.NOT_A_PARTICIPANT);
          }
          const before = duel.events.length;
          const res = offerDraw(duel, plugin, conn.playerId, t);
          if (!res.ok) return fail(conn, res.reason);
          return publishNewEvents(duel, plugin, before, t, { conn, cseq: msg.cseq ?? null });
        }

        case ClientMsg.DRAW_DECLINE: {
          if (seatFor(duel, conn.playerId) < 0) {
            return fail(conn, ErrorCode.NOT_A_PARTICIPANT);
          }
          const before = duel.events.length;
          const res = declineDraw(duel, conn.playerId, t);
          if (!res.ok) return fail(conn, res.reason);
          return publishNewEvents(duel, plugin, before, t, { conn, cseq: msg.cseq ?? null });
        }

        case ClientMsg.DRAW_ACCEPT: {
          if (seatFor(duel, conn.playerId) < 0) {
            return fail(conn, ErrorCode.NOT_A_PARTICIPANT);
          }
          const before = duel.events.length;
          const res = acceptDraw(duel, conn.playerId, t);
          if (!res.ok) return fail(conn, res.reason);
          return publishNewEvents(duel, plugin, before, t, { conn, cseq: msg.cseq ?? null });
        }

        default:
          return fail(conn, ErrorCode.UNKNOWN_TYPE);
      }
    }

    socket.on("close", () => {
      // Leaving the room does NOT pause the duel or the clock. A disconnect is
      // not a timeout extension; see clock.mjs.
      for (const duelId of conn.subscriptions) {
        room(duelId).delete(conn);
        unbindSeat(duels.get(duelId), conn);
      }
      if (chatMetrics && conn.chatSubscriptions.size > 0) {
        chatMetrics.activeConnections.dec();
        for (const channelId of conn.chatSubscriptions) chatMetrics.leaves.inc(1, { channel_type: channelTypeLabel(channelId) });
      }
      for (const channelId of conn.chatSubscriptions) chatRoom(channelId).delete(conn);
      connections.delete(conn);
    });
  });

  /**
   * The timeout sweeper. Runs on the server's own schedule and needs no client
   * message: a player who vanishes still loses on time.
   */
  async function sweepTimeouts() {
    const t = now();
    let completed = 0;
    for (const duel of duels.values()) {
      if (duel.status !== DuelState.LIVE) continue;
      const before = duel.events.length;
      const res = claimTimeout(duel, plugins.get(duel.gameId), t);
      if (res.ok) {
        await publishNewEvents(duel, plugins.get(duel.gameId), before, t);
        completed++;
      }
    }
    return completed;
  }

  /** Drop sockets that stopped answering, so rooms do not fill with corpses. */
  function sweepDeadConnections() {
    let dropped = 0;
    for (const conn of connections) {
      if (!conn.alive) { conn.socket.terminate(); dropped++; continue; }
      conn.alive = false;
      if (conn.socket.readyState === conn.socket.OPEN) conn.socket.ping();
    }
    return dropped;
  }

  return {
    wss,
    httpServer,
    get port() { return httpServer.address()?.port ?? (wss.address()?.port || 0); },
    get url() { return `ws://127.0.0.1:${httpServer.address()?.port ?? wss.address()?.port}`; },
    rooms,
    connections,
    sweepTimeouts,
    sweepDeadConnections,
    claimDuel,
    releaseDuel,
    sweepLeaseRenewals,
    close: () => new Promise((resolve) => {
      for (const timer of aiTimers.values()) clearTimeout(timer);
      aiTimers.clear();
      for (const conn of connections) conn.socket.terminate();
      wss.close(() => {
        httpServer.close(async () => {
          // Only close a bus this instance created itself -- a caller-supplied
          // bus may be shared with other code the caller still owns.
          if (ownsChatBus) await bus.close();
          resolve();
        });
      });
    }),
  };
}
