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
};

export type ChatHistoryResponse = { channelId?: string; messages: ChatMessage[] };
export type BlockedListResponse = { blocked: { blocked_id: string; handle: string; created_at: string }[] };
