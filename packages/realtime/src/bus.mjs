/**
 * RealtimeBus -- the one seam between "a gateway process has this message"
 * and "every gateway process delivers this message to its own local
 * sockets." Nothing else in this package talks to Postgres NOTIFY or holds
 * process topology knowledge; they only ever see publish/subscribe.
 *
 * Two implementations:
 *   - createInMemoryBus(): a same-process Map<topic, Set<handler>>. What
 *     every existing single-instance test uses today (the default when a
 *     gateway is built without a `chatBus` option) -- so this refactor
 *     changes zero behavior for anything not explicitly wired to a real bus.
 *   - createPgBus({ pool, connect }): a REAL cross-process transport, built
 *     entirely on Postgres LISTEN/NOTIFY -- the database this project
 *     already requires for everything else, not a new infrastructure
 *     dependency (directive: "do not add a heavy external infra dependency
 *     to local development unless necessary"). `publish` uses the ordinary
 *     pool (pg_notify() is a plain statement, no dedicated connection
 *     needed). `subscribe` lazily opens ONE dedicated long-lived LISTEN
 *     connection via `connect()` on first use -- Postgres delivers a
 *     NOTIFY to every session listening on that channel, including the
 *     session that issued it, so a single process's own publish reaches its
 *     own subscribers through the exact same path as a remote process's
 *     publish. No special-casing "is this notification mine."
 */

const CHANNEL = "nizalo_realtime_bus";
// Postgres NOTIFY payloads are capped at 8000 bytes. Chat content itself is
// capped at 1000 characters (packages/chat/src/validate.mjs), so a normal
// envelope is nowhere near this -- the guard exists only so a future,
// larger payload fails loudly here instead of silently vanishing at the
// database layer.
const MAX_NOTIFY_PAYLOAD_BYTES = 7900;

export function createInMemoryBus() {
  const topics = new Map();
  return {
    publish(topic, message) {
      const handlers = topics.get(topic);
      if (!handlers) return;
      // A copy: a handler that unsubscribes itself (or another) mid-dispatch
      // must never mutate the Set this loop is iterating.
      for (const handler of [...handlers]) {
        try { handler(message); } catch { /* one bad subscriber must not break the others */ }
      }
    },
    subscribe(topic, handler) {
      let handlers = topics.get(topic);
      if (!handlers) { handlers = new Set(); topics.set(topic, handlers); }
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async close() { topics.clear(); },
  };
}

export function createPgBus({ pool, connect, onPublishError, onListenError }) {
  const local = createInMemoryBus();
  let listenClient = null;
  let listening = null; // in-flight connect promise, so concurrent subscribe() calls share one connection attempt
  let closed = false;

  async function ensureListening() {
    if (listenClient || closed) return;
    if (listening) return listening;
    listening = (async () => {
      const client = await connect();
      client.on("notification", (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        let envelope;
        try { envelope = JSON.parse(msg.payload); } catch { return; }
        local.publish(envelope.topic, envelope.message);
      });
      // A dropped LISTEN connection must not fail silently forever: log and
      // retry once, rather than pretend this instance is still receiving
      // cross-process events when it is not.
      client.on("error", (err) => { onListenError?.(err); });
      client.on("end", () => {
        if (closed || listenClient !== client) return;
        listenClient = null;
        listening = null;
        setTimeout(() => { ensureListening().catch((err) => onListenError?.(err)); }, 1000).unref?.();
      });
      await client.query(`LISTEN ${CHANNEL}`);
      listenClient = client;
    })();
    return listening;
  }

  return {
    publish(topic, message) {
      const envelope = JSON.stringify({ topic, message });
      if (Buffer.byteLength(envelope, "utf8") > MAX_NOTIFY_PAYLOAD_BYTES) {
        throw new Error(`RealtimeBus payload too large for topic "${topic}" (${Buffer.byteLength(envelope, "utf8")} bytes)`);
      }
      // Fire-and-forget from the caller's perspective (publish is
      // synchronous everywhere else in this package); a failed NOTIFY is a
      // lost broadcast notification, never a lost persisted message -- the
      // same "persist is authoritative, broadcast is best-effort" contract
      // messages.mjs's own sendMessage already documents. `onPublishError`
      // is how a caller observes this without publish() itself needing to
      // become async or throwing -- see directive #25's "realtime bus
      // publish[/delivery] failures" metric, wired by apps/gateway and
      // apps/api, never a second metrics system of its own.
      pool.query("SELECT pg_notify($1, $2)", [CHANNEL, envelope]).catch((err) => { onPublishError?.(err, topic); });
    },
    subscribe(topic, handler) {
      const unsubLocal = local.subscribe(topic, handler);
      ensureListening().catch(() => {});
      return unsubLocal;
    },
    async close() {
      closed = true;
      await local.close();
      if (listenClient) {
        try { await listenClient.query(`UNLISTEN ${CHANNEL}`); } catch { /* connection may already be gone */ }
        await listenClient.end().catch(() => {});
        listenClient = null;
      }
    },
  };
}

// Re-exported purely so a test can assert on the channel name without
// duplicating the literal.
export const REALTIME_BUS_CHANNEL = CHANNEL;
