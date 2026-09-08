/**
 * Sending and reading chat messages -- the one place that ties channel
 * authorization (channels.mjs), mute enforcement (moderation.mjs), content
 * validation (validate.mjs) and block filtering (blocks.mjs) together
 * around the durable chat_message table.
 *
 * Ordering (directive #7): a message's real position is its `id`, a
 * Postgres IDENTITY column -- a real, server-assigned total order, never a
 * client timestamp. Every list here is `ORDER BY id`, and pagination is a
 * cursor on `id`, never an offset a client could use to reconstruct or
 * manipulate order.
 */
import { normalizeContent, validateContent } from "./validate.mjs";
import { isChannelOpenForWrites, ChatAuthError } from "./channels.mjs";

export const ChatMessageError = Object.freeze({
  INVALID_CLIENT_MESSAGE_ID: "INVALID_CLIENT_MESSAGE_ID",
  MUTED: "MUTED",
  DUPLICATE_MESSAGE: "DUPLICATE_MESSAGE",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_REMOVED: "ALREADY_REMOVED",
});

// Distinct from clientMessageId idempotency (a RETRY of the same logical
// send): this rejects a DISTINCT send whose text matches the sender's own
// immediately preceding message -- directive #19's "repeated identical
// messages" flood pattern.
const DUPLICATE_CONTENT_COOLDOWN_MS = 5000;

function scopeForChannelType(type) {
  if (type === "GLOBAL") return "GLOBAL_CHAT";
  if (type === "MATCH") return "MATCH_CHAT";
  return "SPECTATOR_CHAT";
}

export function createMessageService(db, {
  channels, moderation, blocks, avatarStorage = null, now = () => Date.now(),
  // Optional RealtimeBus (packages/realtime/src/bus.mjs) -- when given,
  // moderateDelete publishes "chat:removed" after its DB update commits, so
  // a gateway process (which holds the actual sockets; this service does
  // not) can relay the removal to already-open chat windows without
  // waiting for a reconnect. Omitted entirely in tests that only assert on
  // the DB-level outcome, and in any context that has no gateway to relay
  // to (e.g. a future admin CLI) -- moderateDelete's own persisted result
  // is authoritative either way; the publish is a best-effort notification
  // on top of it, exactly like every other broadcast in this codebase.
  bus = null,
}) {
  function projectRow(row) {
    return {
      id: String(row.id),
      channelId: row.channel_id,
      senderId: row.sender_id,
      nickname: row.handle,
      avatarUrl: avatarStorage ? avatarStorage.getPublicUrl(row.avatar_key) : null,
      badge: row.selected_badge_code,
      content: row.deleted_at ? null : row.content,
      removed: row.deleted_at != null,
      createdAt: row.created_at,
    };
  }

  /**
   * Persist-then-return; the CALLER (the gateway, or a REST route for a
   * fallback send path) is responsible for broadcasting afterward -- see
   * this package's own header and gateway.mjs's existing "persist first,
   * broadcast second" discipline, reused here rather than re-invented.
   */
  async function sendMessage({ channelId, senderId, content, clientMessageId }) {
    if (typeof clientMessageId !== "string" || !clientMessageId || clientMessageId.length > 100) {
      return { ok: false, reason: ChatMessageError.INVALID_CLIENT_MESSAGE_ID };
    }
    const normalized = normalizeContent(content);
    const contentError = validateContent(normalized);
    if (contentError) return { ok: false, reason: contentError };

    const channel = await channels.getChannel(channelId);
    const access = await channels.canAccessChannel(channel, senderId);
    if (!access.ok) return { ok: false, reason: access.reason };
    // A SEPARATE gate from access above: a match participant can always
    // READ their channel's history (canAccessChannel stays true forever),
    // but once the post-game window has elapsed, no NEW message may land
    // in it -- directive's match-channel-lifecycle "no new messages" once
    // CLOSED, without affecting retention.
    if (!isChannelOpenForWrites(channel, now())) return { ok: false, reason: ChatAuthError.POST_GAME_CLOSED };

    const scope = scopeForChannelType(channel.type);
    if (await moderation.isMuted(senderId, scope)) return { ok: false, reason: ChatMessageError.MUTED };

    // A retry of the SAME logical send (identical channel/sender/
    // clientMessageId) is resolved as a no-op HERE, before the
    // duplicate-CONTENT cooldown below ever runs -- that cooldown targets a
    // DIFFERENT send with coincidentally identical text, not a genuine
    // retry, and must never reject the very idempotency this function
    // promises.
    const alreadySent = await db.query(
      `SELECT cm.id, cm.channel_id, cm.sender_id, cm.content, cm.created_at, cm.deleted_at,
              p.handle, p.avatar_key, p.selected_badge_code
         FROM chat_message cm JOIN player p ON p.id = cm.sender_id
        WHERE cm.channel_id = $1 AND cm.sender_id = $2 AND cm.client_message_id = $3`,
      [channelId, senderId, clientMessageId]
    );
    if (alreadySent.rows.length) return { ok: true, deduped: true, message: projectRow(alreadySent.rows[0]) };

    const recent = await db.query(
      `SELECT content, created_at FROM chat_message
        WHERE channel_id = $1 AND sender_id = $2 AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 1`,
      [channelId, senderId]
    );
    if (recent.rows.length) {
      const last = recent.rows[0];
      const elapsed = now() - new Date(last.created_at).getTime();
      if (last.content === normalized && elapsed < DUPLICATE_CONTENT_COOLDOWN_MS) {
        return { ok: false, reason: ChatMessageError.DUPLICATE_MESSAGE };
      }
    }

    const t = new Date(now()).toISOString();
    let row;
    try {
      const ins = await db.query(
        `INSERT INTO chat_message (channel_id, sender_id, content, client_message_id, created_at)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, channel_id, sender_id, content, created_at, deleted_at`,
        [channelId, senderId, normalized, clientMessageId, t]
      );
      row = ins.rows[0];
    } catch (e) {
      if (!/chat_message_idempotency_idx/.test(e.message)) throw e;
      // A genuine retry of the SAME logical send -- return the row that
      // already exists rather than erroring or creating a duplicate.
      const existing = await db.query(
        `SELECT cm.id, cm.channel_id, cm.sender_id, cm.content, cm.created_at, cm.deleted_at,
                p.handle, p.avatar_key, p.selected_badge_code
           FROM chat_message cm JOIN player p ON p.id = cm.sender_id
          WHERE cm.channel_id = $1 AND cm.sender_id = $2 AND cm.client_message_id = $3`,
        [channelId, senderId, clientMessageId]
      );
      return { ok: true, deduped: true, message: projectRow(existing.rows[0]) };
    }

    const senderInfo = await db.query("SELECT handle, avatar_key, selected_badge_code FROM player WHERE id = $1", [senderId]);
    return { ok: true, deduped: false, message: projectRow({ ...row, ...senderInfo.rows[0] }) };
  }

  /**
   * `before`/`after` are both exclusive `id` cursors -- `before` pages
   * backward into older history (DESC, newest-of-the-page first); `after`
   * recovers what a reconnecting client missed (ASC, oldest-missed first,
   * so appending them in the order received reconstructs real order).
   * Never both at once; never an offset.
   */
  async function queryPage({ channelId, before, after, limit }) {
    const boundedLimit = Math.min(Math.max(1, Number(limit) || 50), 100);
    const params = [channelId];
    const clauses = ["cm.channel_id = $1"];
    let order = "cm.id DESC";
    if (after != null) {
      params.push(after);
      clauses.push(`cm.id > $${params.length}`);
      order = "cm.id ASC";
    } else if (before != null) {
      params.push(before);
      clauses.push(`cm.id < $${params.length}`);
    }
    params.push(boundedLimit);

    const r = await db.query(
      `SELECT cm.id, cm.channel_id, cm.sender_id, cm.content, cm.created_at, cm.deleted_at, cm.deleted_by,
              p.handle, p.avatar_key, p.selected_badge_code
         FROM chat_message cm JOIN player p ON p.id = cm.sender_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY ${order}
        LIMIT $${params.length}`,
      params
    );
    return r.rows;
  }

  /** The customer-facing read: a removed message's content is replaced by
   * null (directive #13's "This message was removed", never silently
   * dropped from the ordering), and every message from someone the VIEWER
   * has blocked is filtered out entirely -- directive #16. */
  async function listHistory({ channelId, viewerId, before = null, after = null, limit = 50 }) {
    const [rows, blockedSet] = await Promise.all([
      queryPage({ channelId, before, after, limit }),
      blocks.blockedSetFor(viewerId),
    ]);
    return rows.filter((row) => !blockedSet.has(row.sender_id)).map((row) => projectRow(row));
  }

  /** The staff-facing read: no block filtering (a moderator must see the
   * real conversation regardless of anyone's personal blocks), and a
   * removed message's real content and remover are visible for audit --
   * never exposed to a customer, only to a caller already authorized via
   * CHAT_VIEW at the route layer. */
  async function listHistoryForStaff({ channelId, before = null, after = null, limit = 50 }) {
    const rows = await queryPage({ channelId, before, after, limit });
    return rows.map((row) => ({ ...projectRow(row), content: row.content, removed: row.deleted_at != null, deletedBy: row.deleted_by }));
  }

  async function moderateDelete({ messageId, moderatorId }) {
    const t = new Date(now()).toISOString();
    const r = await db.query(
      `UPDATE chat_message SET deleted_at = $2, deleted_by = $3
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING channel_id`,
      [messageId, t, moderatorId]
    );
    if (!r.rows.length) {
      const exists = await db.query("SELECT id FROM chat_message WHERE id = $1", [messageId]);
      return { ok: false, reason: exists.rows.length ? ChatMessageError.ALREADY_REMOVED : ChatMessageError.NOT_FOUND };
    }
    const channelId = r.rows[0].channel_id;
    // Persist-then-publish, same discipline as everywhere else: the row is
    // already committed above, so a publish failure here can only ever
    // lose a REALTIME NOTIFICATION -- the message is durably removed either
    // way, and the next history read/reconnect shows it correctly even if
    // this line never ran. Deliberately minimal payload: channelId and
    // messageId ONLY, never moderatorId or a reason -- the same
    // customer-facing shape listHistory()'s own projectRow already
    // enforces for a removed row.
    bus?.publish("chat:removed", { channelId, messageId: String(messageId) });
    return { ok: true, channelId };
  }

  return { sendMessage, listHistory, listHistoryForStaff, moderateDelete, scopeForChannelType, projectRow };
}
