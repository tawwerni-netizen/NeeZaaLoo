/**
 * The exact shapes the chat REST routes and the realtime gateway's
 * CHAT_MESSAGE event return (packages/chat/src/messages.mjs's own
 * projectRow()). A removed message keeps its place in the list (ordering
 * is never disturbed) with `content: null` and `removed: true` -- the
 * frontend renders that as a placeholder, never as an empty bubble.
 */
export type ChatMessage = {
  id: string;
  channelId: string;
  senderId: string;
  nickname: string;
  avatarUrl: string | null;
  badge: string | null;
  content: string | null;
  removed: boolean;
  createdAt: string;
  /**
   * Present only for a system timeline entry (e.g. MATCH_STARTED) --
   * chat_system_event (db/migrations/0045), never an ordinary player
   * message. senderId/nickname/avatarUrl/badge/content/removed above are
   * meaningless placeholders on a system row; ChatWindow renders it as a
   * centered marker instead of a normal message bubble the moment this
   * field is present, exactly the "system timeline event, not an ordinary
   * user message" distinction the brief asks for.
   */
  system?: { eventType: string };
};

export type ChatSystemEvent = { eventType: string; detail: unknown; createdAt: string };
export type ChatHistoryResponse = { channelId?: string; messages: ChatMessage[]; systemEvents?: ChatSystemEvent[] };
export type BlockedListResponse = { blocked: { blocked_id: string; handle: string; created_at: string }[] };
