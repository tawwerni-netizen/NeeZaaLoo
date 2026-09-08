"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getTokens, get } from "./api";
import type { ChatMessage, ChatHistoryResponse } from "./chat-types";

export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://localhost:3010";

type ChannelSpec = { channel: "GLOBAL" } | { channel: "MATCH"; duelId: string } | { channel: "SPECTATOR"; duelId: string };

const RECONNECT_DELAY_MS = 2000;

/**
 * One chat channel's live feed -- initial history over REST, new messages
 * over the SAME authenticated websocket duel traffic already uses (see
 * packages/realtime/src/gateway.mjs's `chat` option). A drop reconnects on
 * its own and recovers exactly what was missed via the `after` cursor,
 * never a full history reload (directive #40) and never a silently lost
 * message (directive #10).
 */
export function useChatChannel(spec: ChannelSpec) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rejected, setRejected] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const closedByUsRef = useRef(false);

  const historyPath = spec.channel === "GLOBAL"
    ? "/v1/chat/global/messages"
    : spec.channel === "SPECTATOR"
      ? `/v1/duels/${spec.duelId}/spectator-chat/messages`
      : `/v1/duels/${spec.duelId}/chat/messages`;

  const appendUnique = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return prev;
      lastSeenIdRef.current = fresh[fresh.length - 1]!.id;
      return [...prev, ...fresh];
    });
  }, []);

  useEffect(() => {
    closedByUsRef.current = false;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadInitialHistory() {
      try {
        const r = await get<ChatHistoryResponse>(historyPath);
        if (cancelled) return;
        const ordered = [...r.messages].reverse(); // service returns newest-first
        setMessages(ordered);
        lastSeenIdRef.current = ordered.length ? ordered[ordered.length - 1]!.id : null;
      } catch {
        // A failed initial load is not fatal -- the socket may still connect
        // and deliver new messages; the customer simply starts from "now".
      }
    }

    async function recoverMissed() {
      if (!lastSeenIdRef.current) return;
      try {
        const r = await get<ChatHistoryResponse>(`${historyPath}?after=${encodeURIComponent(lastSeenIdRef.current)}`);
        if (!cancelled) appendUnique(r.messages);
      } catch {
        // Best-effort recovery; the next successful reconnect tries again.
      }
    }

    function connectSocket() {
      const { accessToken } = getTokens();
      if (!accessToken) return;

      const ws = new WebSocket(GATEWAY_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "AUTH", token: accessToken }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        if (msg.t === "AUTHED") {
          const joinMsg = spec.channel === "GLOBAL"
            ? { t: "CHAT_JOIN", channel: "GLOBAL" }
            : { t: "CHAT_JOIN", channel: spec.channel, duelId: spec.duelId };
          ws.send(JSON.stringify(joinMsg));
        } else if (msg.t === "CHAT_JOINED") {
          channelIdRef.current = String(msg.channelId);
          setConnected(true);
          void recoverMissed();
        } else if (msg.t === "CHAT_MESSAGE") {
          appendUnique([msg.message as ChatMessage]);
        } else if (msg.t === "CHAT_MESSAGE_REMOVED") {
          // Realtime moderation propagation (Slice 10, chat gap #3): the
          // gateway relays a moderator's delete to every open window on
          // this channel, so the removal shows up immediately -- never
          // waiting for a reconnect or a manual history reload. Payload is
          // deliberately minimal (channelId, messageId); this only ever
          // flips the SAME removed/content fields listHistory() itself
          // would have returned on the next read.
          const removedId = String(msg.messageId);
          setMessages((prev) => prev.map((m) => (m.id === removedId ? { ...m, removed: true, content: null } : m)));
        } else if (msg.t === "CHAT_REJECTED") {
          setRejected(String(msg.reason));
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closedByUsRef.current || cancelled) return;
        reconnectTimer = setTimeout(connectSocket, RECONNECT_DELAY_MS);
      };
      ws.onerror = () => ws.close();
    }

    void loadInitialHistory().then(() => { if (!cancelled) connectSocket(); });

    return () => {
      cancelled = true;
      closedByUsRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.channel, spec.channel !== "GLOBAL" ? spec.duelId : null, historyPath, appendUnique]);

  function sendMessage(content: string) {
    const ws = socketRef.current;
    const channelId = channelIdRef.current;
    if (!ws || ws.readyState !== ws.OPEN || !channelId) return;
    setRejected(null);
    const clientMessageId = crypto.randomUUID();
    ws.send(JSON.stringify({ t: "CHAT_SEND", channelId, content, clientMessageId }));
  }

  return { connected, messages, sendMessage, rejected, clearRejected: () => setRejected(null) };
}
