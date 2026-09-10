"use client";

import { useEffect, useRef, useState } from "react";
import { getTokens } from "./api";

export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "ws://localhost:3010";

// A disconnected socket retries on a short, fixed delay -- matching the
// same RECONNECT_DELAY_MS the chat hook (use-chat-socket.ts) already
// established for this app, so a duel and a chat channel behave
// identically on a dropped connection rather than each inventing its own
// backoff feel.
const RECONNECT_DELAY_MS = 2000;

/**
 * The one WebSocket connection a game screen needs. Sends only INTENTS
 * (never asserts a result, a score, or a clock reading -- see
 * packages/realtime/src/protocol.mjs, which structurally refuses any field
 * shaped like a client-claimed outcome). Everything this hook exposes is
 * exactly what the server sent; nothing here re-derives or predicts state.
 */
export function useDuelSocket(duelId: string) {
  const [connected, setConnected] = useState(false);
  // True only on a RECONNECT attempt (a socket that closed after already
  // having been open once) -- distinct from the initial "connecting" state
  // so the UI can say "reconnecting" rather than implying this is a fresh
  // join.
  const [reconnecting, setReconnecting] = useState(false);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  // Whether THIS viewer is a real seated participant, or a spectator --
  // set ONCE from the server's own STATE message (seat: null means
  // spectator; a number means seated) and never re-derived from `latest`,
  // since only STATE carries a `seat` field at all -- every later EVENT
  // does not, and re-reading `latest.seat` after the first game event
  // would otherwise flicker back to "spectator" for a real player. This
  // is what lets the game screen decide MATCH vs SPECTATOR chat correctly
  // and never trust anything the client itself asserts about its own role.
  const [seat, setSeat] = useState<number | null | undefined>(undefined);
  // Which seat currently has a standing draw offer, or null -- always
  // taken from the server (a fresh STATE on join/reconnect, or the
  // DRAW_OFFERED/DRAW_DECLINED/INTENT_ACCEPTED events that update it
  // live), never inferred client-side.
  const [drawOfferBy, setDrawOfferBy] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const everConnectedRef = useRef(false);
  const closedByUsRef = useRef(false);
  // Sequence admission (see packages/realtime/src/protocol.mjs's own
  // nonce/baseVersion fields): the event count this client has actually
  // seen, and this seat's own last-accepted action number -- both refs,
  // not state, because sendIntent needs the CURRENT value synchronously,
  // not whatever React last rendered with. Reseeded from the server's own
  // STATE on every join/reconnect (never carried over from a stale local
  // guess), and advanced from every EVENT after that.
  const versionRef = useRef(0);
  const nonceRef = useRef(0);

  useEffect(() => {
    everConnectedRef.current = false;
    closedByUsRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket;

    function connect() {
      const { accessToken } = getTokens();
      if (!accessToken) return;

      ws = new WebSocket(GATEWAY_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "AUTH", token: accessToken }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        setLatest(msg);
        if (msg.t === "AUTHED") {
          ws.send(JSON.stringify({ t: "JOIN", duelId }));
          setConnected(true);
          setReconnecting(false);
          everConnectedRef.current = true;
        } else if (msg.t === "STATE") {
          setSeat((msg.seat as number | null | undefined) ?? null);
          setDrawOfferBy((msg.drawOfferBy as number | null | undefined) ?? null);
          versionRef.current = (msg.version as number | undefined) ?? 0;
          nonceRef.current = (msg.nonce as number | null | undefined) ?? 0;
        } else if (msg.t === "EVENT") {
          const type = msg.type as string;
          const payload = msg.payload as { seat?: number } | undefined;
          if (type === "DRAW_OFFERED") setDrawOfferBy(payload?.seat ?? null);
          else if (type === "DRAW_DECLINED" || type === "INTENT_ACCEPTED") setDrawOfferBy(null);
          if (typeof msg.version === "number") versionRef.current = msg.version;
        }
      };
      ws.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (closedByUsRef.current) return;
        if (everConnectedRef.current) setReconnecting(true);
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      closedByUsRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [duelId]);

  function sendIntent(intent: unknown, cseq?: number) {
    // A fresh nonce for every call: the server treats an OLD nonce as a
    // replay the instant a newer one has been accepted, so a genuinely
    // new decision must always claim the next number, never resend a
    // prior one. `baseVersion` is whatever this client last actually saw
    // -- a stale one (this client is behind) is refused and resynced
    // rather than applied against a board it never looked at.
    nonceRef.current += 1;
    socketRef.current?.send(JSON.stringify({
      t: "INTENT", duelId, intent, cseq, nonce: nonceRef.current, baseVersion: versionRef.current,
    }));
  }

  function resign() {
    socketRef.current?.send(JSON.stringify({ t: "RESIGN", duelId }));
  }

  function offerDraw() {
    socketRef.current?.send(JSON.stringify({ t: "DRAW_OFFER", duelId }));
  }

  function acceptDraw() {
    socketRef.current?.send(JSON.stringify({ t: "DRAW_ACCEPT", duelId }));
  }

  function declineDraw() {
    socketRef.current?.send(JSON.stringify({ t: "DRAW_DECLINE", duelId }));
  }

  return {
    connected, reconnecting, latest, seat, drawOfferBy,
    sendIntent, resign, offerDraw, acceptDraw, declineDraw,
  };
}
