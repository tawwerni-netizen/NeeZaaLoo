/**
 * Direct Messaging and Friends Service for Nizalo Messenger.
 * Supports:
 * - Member search by handle (NickName) or email
 * - Friends management (send request, accept, remove)
 * - 1-on-1 private messaging with read receipts and conversation summaries
 */
import { randomUUID } from "node:crypto";

export function createDirectChatService(db) {
  async function searchMembers({ query = "", currentUserId = null, limit = 50 } = {}) {
    const q = (query || "").trim().toLowerCase();
    const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 100);

    const includeSelf = Boolean(arguments[0]?.includeSelf);

    let sql;
    let params;

    if (q) {
      sql = `
        SELECT
          p.id,
          p.handle,
          p.avatar_key,
          p.selected_badge_code,
          p.bio,
          f.status AS friend_status,
          f.user_id AS friend_initiator
        FROM player p
        LEFT JOIN email_identity e ON e.player_id = p.id
        LEFT JOIN oauth_identity o ON o.player_id = p.id
        LEFT JOIN friendship f ON (
          (f.user_id = $1 AND f.friend_id = p.id) OR
          (f.user_id = p.id AND f.friend_id = $1)
        )
        WHERE p.is_ai = FALSE
          AND ($4 = TRUE OR $1 IS NULL OR p.id <> $1)
          AND (
            LOWER(p.handle) LIKE '%' || $2 || '%' OR
            LOWER(COALESCE(e.email, '')) LIKE '%' || $2 || '%' OR
            LOWER(COALESCE(o.email, '')) LIKE '%' || $2 || '%' OR
            LOWER(p.id) = $2
          )
        GROUP BY p.id, p.handle, p.avatar_key, p.selected_badge_code, p.bio, f.status, f.user_id
        ORDER BY
          CASE WHEN LOWER(p.handle) = $2 THEN 0
               WHEN LOWER(p.handle) LIKE $2 || '%' THEN 1
               ELSE 2 END,
          p.handle ASC
        LIMIT $3
      `;
      params = [currentUserId, q, safeLimit, includeSelf];
    } else {
      sql = `
        SELECT
          p.id,
          p.handle,
          p.avatar_key,
          p.selected_badge_code,
          p.bio,
          f.status AS friend_status,
          f.user_id AS friend_initiator
        FROM player p
        LEFT JOIN friendship f ON (
          (f.user_id = $1 AND f.friend_id = p.id) OR
          (f.user_id = p.id AND f.friend_id = $1)
        )
        WHERE p.is_ai = FALSE
          AND ($3 = TRUE OR $1 IS NULL OR p.id <> $1)
        ORDER BY p.handle ASC
        LIMIT $2
      `;
      params = [currentUserId, safeLimit, includeSelf];
    }

    const res = await db.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      avatarKey: row.avatar_key,
      selectedBadgeCode: row.selected_badge_code,
      bio: row.bio,
      friendStatus: row.friend_status ?? null,
      isFriend: row.friend_status === "ACCEPTED",
      isPending: row.friend_status === "PENDING",
      isInitiator: row.friend_initiator === currentUserId,
      isSelf: row.id === currentUserId,
    }));
  }

  async function listFriends(userId) {
    const sql = `
      SELECT
        p.id,
        p.handle,
        p.avatar_key,
        p.selected_badge_code,
        p.bio,
        f.status,
        f.user_id AS initiator_id,
        f.created_at AS friendship_date
      FROM friendship f
      JOIN player p ON (p.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END)
      WHERE (f.user_id = $1 OR f.friend_id = $1)
        AND f.status <> 'BLOCKED'
      ORDER BY f.updated_at DESC
    `;
    const res = await db.query(sql, [userId]);
    return res.rows.map((r) => ({
      id: r.id,
      handle: r.handle,
      avatarKey: r.avatar_key,
      selectedBadgeCode: r.selected_badge_code,
      bio: r.bio,
      status: r.status,
      isOutgoing: r.initiator_id === userId,
      since: r.friendship_date,
    }));
  }

  async function sendFriendRequest(userId, targetHandleOrId) {
    const targetQuery = await db.query(
      `SELECT id, handle FROM player WHERE (LOWER(handle) = LOWER($1) OR id = $1) AND is_ai = FALSE`,
      [targetHandleOrId]
    );
    if (!targetQuery.rows.length) return { ok: false, reason: "PLAYER_NOT_FOUND" };
    const friendId = targetQuery.rows[0].id;
    if (friendId === userId) return { ok: false, reason: "CANNOT_FRIEND_SELF" };

    const existing = await db.query(
      `SELECT id, status, user_id FROM friendship WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [userId, friendId]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.status === "ACCEPTED") return { ok: true, status: "ACCEPTED" };
      if (row.status === "PENDING" && row.user_id !== userId) {
        // The other user already sent a request, auto-accept it!
        await db.query(`UPDATE friendship SET status = 'ACCEPTED', updated_at = now() WHERE id = $1`, [row.id]);
        return { ok: true, status: "ACCEPTED" };
      }
      return { ok: true, status: "PENDING" };
    }

    const id = `fr_${randomUUID()}`;
    await db.query(
      `INSERT INTO friendship (id, user_id, friend_id, status) VALUES ($1, $2, $3, 'ACCEPTED')`,
      [id, userId, friendId]
    );
    return { ok: true, status: "ACCEPTED", friendId };
  }

  async function removeFriend(userId, friendId) {
    await db.query(
      `DELETE FROM friendship WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [userId, friendId]
    );
    return { ok: true };
  }

  async function listConversations(userId) {
    const sql = `
      WITH partner_activity AS (
        SELECT
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS partner_id,
          MAX(id) AS latest_message_id,
          COUNT(*) FILTER (WHERE receiver_id = $1 AND read_at IS NULL) AS unread_count
        FROM direct_message
        WHERE sender_id = $1 OR receiver_id = $1
        GROUP BY 1
      )
      SELECT
        p.id AS partner_id,
        p.handle AS partner_handle,
        p.avatar_key AS partner_avatar,
        p.selected_badge_code,
        dm.id AS last_message_id,
        dm.content AS last_message_content,
        dm.sender_id AS last_message_sender,
        dm.created_at AS last_message_time,
        pa.unread_count
      FROM partner_activity pa
      JOIN player p ON p.id = pa.partner_id
      JOIN direct_message dm ON dm.id = pa.latest_message_id
      ORDER BY dm.created_at DESC
    `;
    const res = await db.query(sql, [userId]);
    return res.rows.map((r) => ({
      partnerId: r.partner_id,
      partnerHandle: r.partner_handle,
      partnerAvatar: r.partner_avatar,
      selectedBadgeCode: r.selected_badge_code,
      lastMessage: {
        id: String(r.last_message_id),
        content: r.last_message_content,
        senderId: r.last_message_sender,
        isMine: r.last_message_sender === userId,
        createdAt: r.last_message_time,
      },
      unreadCount: Number(r.unread_count || 0),
    }));
  }

  async function getDirectMessages(userId, partnerId, { limit = 50, after = null } = {}) {
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

    // Mark unread received messages as read
    await db.query(
      `UPDATE direct_message SET read_at = now() WHERE receiver_id = $1 AND sender_id = $2 AND read_at IS NULL`,
      [userId, partnerId]
    );

    let sql;
    let params;

    if (after) {
      sql = `
        SELECT id, sender_id, receiver_id, content, client_message_id, read_at, created_at, deleted_at
        FROM direct_message
        WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
          AND id > $3
        ORDER BY id ASC
        LIMIT $4
      `;
      params = [userId, partnerId, after, safeLimit];
    } else {
      sql = `
        SELECT id, sender_id, receiver_id, content, client_message_id, read_at, created_at, deleted_at
        FROM (
          SELECT id, sender_id, receiver_id, content, client_message_id, read_at, created_at, deleted_at
          FROM direct_message
          WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
          ORDER BY id DESC
          LIMIT $3
        ) sub
        ORDER BY id ASC
      `;
      params = [userId, partnerId, safeLimit];
    }

    const res = await db.query(sql, params);
    return res.rows.map((r) => ({
      id: String(r.id),
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      content: r.deleted_at ? null : r.content,
      removed: r.deleted_at !== null,
      isMine: r.sender_id === userId,
      readAt: r.read_at,
      createdAt: r.created_at,
    }));
  }

  async function sendDirectMessage({ senderId, receiverId, content, clientMessageId }) {
    const trimmed = (content || "").trim();
    if (!trimmed) return { ok: false, reason: "EMPTY_MESSAGE" };
    if (trimmed.length > 2000) return { ok: false, reason: "TOO_LONG" };

    const senderCheck = await db.query("SELECT disabled_at FROM player WHERE id = $1", [senderId]);
    if (senderCheck.rows[0]?.disabled_at) return { ok: false, reason: "ACCOUNT_DISABLED" };

    const blocked = await db.query(
      `SELECT 1 FROM chat_block WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [senderId, receiverId]
    );
    if (blocked.rows.length) return { ok: false, reason: "BLOCKED" };

    const cId = clientMessageId || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const res = await db.query(
      `INSERT INTO direct_message (sender_id, receiver_id, content, client_message_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_id, client_message_id) DO UPDATE SET client_message_id = EXCLUDED.client_message_id
       RETURNING id, sender_id, receiver_id, content, created_at`,
      [senderId, receiverId, trimmed, cId]
    );

    const row = res.rows[0];
    return {
      ok: true,
      messageId: String(row.id),
      message: {
        id: String(row.id),
        senderId: row.sender_id,
        receiverId: row.receiver_id,
        content: row.content,
        isMine: true,
        createdAt: row.created_at,
      },
    };
  }

  async function moderateDeleteDirectMessage({ messageId, moderatorId }) {
    const res = await db.query(
      `UPDATE direct_message SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [messageId, moderatorId]
    );
    if (!res.rows.length) {
      const exists = await db.query("SELECT id FROM direct_message WHERE id = $1", [messageId]);
      return { ok: false, reason: exists.rows.length ? "ALREADY_REMOVED" : "NOT_FOUND" };
    }
    return { ok: true, messageId: String(res.rows[0].id) };
  }

  return {
    searchMembers,
    listFriends,
    sendFriendRequest,
    removeFriend,
    listConversations,
    getDirectMessages,
    sendDirectMessage,
    moderateDeleteDirectMessage,
  };
}
