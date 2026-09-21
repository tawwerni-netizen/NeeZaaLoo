"use client";

import { useEffect, useRef, useState } from "react";
import { getTokens, setTokens, post } from "./api";

export function getGatewayUrl(): string {
  if (process.env.NEXT_PUBLIC_GATEWAY_URL) {
    return process.env.NEXT_PUBLIC_GATEWAY_URL;
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/gateway`;
  }
  return "ws://localhost:3010";
}

export const GATEWAY_URL = getGatewayUrl();

export function getGatewayHttpUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}/gateway`;
  }
  return "http://localhost:3010";
}

// A disconnected socket retries on a short, fixed delay -- matching the
// same RECONNECT_DELAY_MS the chat hook (use-chat-socket.ts) already
// established for this app, so a duel and a chat channel behave
// identically on a dropped connection rather than each inventing its own
// backoff feel.
const RECONNECT_DELAY_MS = 2000;

/**
 * The dual-transport duel connection: tries WebSocket while simultaneously
 * providing instant HTTP sync and polling fallback. Operates seamlessly in
 * environments where WebSockets are blocked or dropped (such as Hostinger CDN
 * or restrictive mobile networks), guaranteeing the match renders instantly
 * without ever hanging on "connecting...".
 */
export function useDuelSocket(duelId: string) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  const [seat, setSeat] = useState<number | null | undefined>(undefined);
  const [drawOfferBy, setDrawOfferBy] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const everConnectedRef = useRef(false);
  const closedByUsRef = useRef(false);
  const versionRef = useRef(0);
  const nonceRef = useRef(0);
  const joinRetriesRef = useRef(0);

  function applyState(msg: Record<string, unknown>) {
    setLatest(msg);
    if ("seat" in msg) setSeat((msg.seat as number | null | undefined) ?? null);
    if ("drawOfferBy" in msg) setDrawOfferBy((msg.drawOfferBy as number | null | undefined) ?? null);
    if (typeof msg.version === "number") versionRef.current = msg.version;
    if (typeof msg.nonce === "number") nonceRef.current = msg.nonce;
    setConnected(true);
    setReconnecting(false);
    everConnectedRef.current = true;
  }

  useEffect(() => {
    everConnectedRef.current = false;
    closedByUsRef.current = false;
    joinRetriesRef.current = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket;

    // 1. Immediate HTTP Sync: renders the board and state in ~80ms
    async function syncHttp() {
      let { accessToken } = getTokens();
      if (!accessToken) {
        try {
          const guestRes = await post<{ accessToken: string; refreshToken: string }>("/v1/auth/guest", {});
          setTokens(guestRes.accessToken, guestRes.refreshToken, true);
          accessToken = guestRes.accessToken;
        } catch {
          return;
        }
      }
      if (!accessToken || closedByUsRef.current) return;
      try {
        const res = await fetch(`${getGatewayHttpUrl()}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: accessToken, duelId, as: "player" }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.state && !closedByUsRef.current) {
          applyState(data.state);
        }
      } catch {
        // Non-fatal network error
      }
    }

    void syncHttp();

    // 2. Active sync polling fallback: keeps the duel moving when WS is unavailable
    const pollTimer = setInterval(() => {
      if (closedByUsRef.current) return;
      if (socketRef.current?.readyState !== WebSocket.OPEN) {
        void syncHttp();
      }
    }, 750);

    async function connect() {
      let { accessToken } = getTokens();
      if (!accessToken) {
        try {
          const guestRes = await post<{ accessToken: string; refreshToken: string }>("/v1/auth/guest", {});
          setTokens(guestRes.accessToken, guestRes.refreshToken, true);
          accessToken = guestRes.accessToken;
        } catch {
          return;
        }
      }
      if (!accessToken || closedByUsRef.current) return;

      const gateway = getGatewayUrl();
      try {
        ws = new WebSocket(gateway);
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
          } else if (msg.t === "ERROR") {
            if (msg.code === "NO_SUCH_DUEL" && joinRetriesRef.current < 10) {
              joinRetriesRef.current++;
              const delay = Math.min(250 * joinRetriesRef.current, 1500);
              setTimeout(() => {
                if (socketRef.current?.readyState === WebSocket.OPEN) {
                  socketRef.current.send(JSON.stringify({ t: "JOIN", duelId }));
                }
              }, delay);
            }
          } else if (msg.t === "STATE") {
            applyState(msg);
          } else if (msg.t === "EVENT") {
            const type = msg.type as string;
            const payload = msg.payload as { seat?: number } | undefined;
            if (type === "DRAW_OFFERED") setDrawOfferBy(payload?.seat ?? null);
            else if (type === "DRAW_DECLINED" || type === "INTENT_ACCEPTED") setDrawOfferBy(null);
            if (typeof msg.version === "number") versionRef.current = msg.version;
          } else if (msg.t === "REJECTED") {
            if (typeof msg.currentVersion === "number") {
              versionRef.current = msg.currentVersion;
            }
            if (msg.reason === "STALE_ACTION" && socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ t: "JOIN", duelId }));
            }
          }
        };
        ws.onclose = () => {
          socketRef.current = null;
          if (closedByUsRef.current) return;
          if (everConnectedRef.current) setReconnecting(true);
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        };
        ws.onerror = () => ws.close();
      } catch {
        // WS init failed; fallback polling handles everything
      }
    }

    connect();

    return () => {
      closedByUsRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pollTimer);
      socketRef.current?.close();
    };
  }, [duelId]);

  function sendIntent(intent: unknown, cseq?: number) {
    nonceRef.current += 1;
    const currentNonce = nonceRef.current;
    const currentVersion = versionRef.current;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        t: "INTENT", duelId, intent, cseq, nonce: currentNonce, baseVersion: currentVersion,
      }));
    } else {
      // HTTP Intent fallback
      let { accessToken } = getTokens();
      if (accessToken) {
        fetch(`${getGatewayHttpUrl()}/intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: accessToken,
            duelId,
            intent,
            nonce: currentNonce,
            baseVersion: currentVersion,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok && data.state) {
              applyState(data.state);
            }
          })
          .catch(() => {});
      }
    }
  }

  function sendAction(action: "RESIGN" | "DRAW_OFFER" | "DRAW_ACCEPT" | "DRAW_DECLINE") {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ t: action, duelId }));
    } else {
      let { accessToken } = getTokens();
      if (accessToken) {
        fetch(`${getGatewayHttpUrl()}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: accessToken, duelId, action }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.ok && data.state) {
              applyState(data.state);
            }
          })
          .catch(() => {});
      }
    }
  }

  function resign() { sendAction("RESIGN"); }
  function offerDraw() { sendAction("DRAW_OFFER"); }
  function acceptDraw() { sendAction("DRAW_ACCEPT"); }
  function declineDraw() { sendAction("DRAW_DECLINE"); }

  return {
    connected, reconnecting, latest, seat, drawOfferBy,
    sendIntent, resign, offerDraw, acceptDraw, declineDraw,
  };
}
