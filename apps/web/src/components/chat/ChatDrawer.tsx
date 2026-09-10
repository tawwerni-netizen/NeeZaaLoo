"use client";

/**
 * The chat presentation shell for the live game screen: an overlay, never a
 * permanent slice of the layout. The board stays visually dominant --
 * closed, this is a small floating toggle; open, it is a drawer (desktop:
 * right-side floating panel) or a bottom sheet that covers the screen while
 * open (mobile) -- never a column that pushes the board upward the way an
 * inline chat block would.
 *
 * Owns the ONE websocket connection for this channel (useChatChannel) and
 * hands it to the unmodified ChatWindow as a prop -- this is what lets the
 * unread badge keep counting while the window is minimized or fully closed,
 * without opening a second, redundant connection just to watch for new
 * messages.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useChatChannel } from "@/lib/use-chat-socket";
import { useI18n } from "@/lib/i18n/context";
import { ChatWindow } from "./ChatWindow";
import styles from "./ChatDrawer.module.css";

type DrawerMode = "closed" | "minimized" | "open";

export function ChatDrawer({ channelKind, duelId, title }: {
  channelKind: "MATCH" | "SPECTATOR";
  duelId: string;
  title?: string;
}) {
  const { t } = useI18n();
  const spec = channelKind === "SPECTATOR"
    ? { channel: "SPECTATOR" as const, duelId }
    : { channel: "MATCH" as const, duelId };
  const state = useChatChannel(spec);
  const [mode, setMode] = useState<DrawerMode>("closed");
  const [unread, setUnread] = useState(0);
  const seenCountRef = useRef(0);

  useEffect(() => {
    if (mode === "open") {
      seenCountRef.current = state.messages.length;
      setUnread(0);
      return;
    }
    const delta = state.messages.length - seenCountRef.current;
    if (delta > 0) setUnread(delta);
  }, [state.messages.length, mode]);

  const resolvedTitle = title ?? t(channelKind === "SPECTATOR" ? "chat.spectator_title" : "chat.match_title");

  if (mode === "closed") {
    return (
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setMode("open")}
        aria-label={unread > 0 ? t("chat.open_with_unread_cta", { count: unread }) : t("chat.open_cta")}
      >
        <ChatBubbleIcon />
        {unread > 0 && <span className={styles.toggleBadge}>{unread > 9 ? "9+" : unread}</span>}
      </button>
    );
  }

  const style = mode === "open" ? ({ "--chat-window-height": "100%" } as CSSProperties) : undefined;

  return (
    <div className={mode === "minimized" ? styles.minimized : styles.panel} role="complementary" aria-label={resolvedTitle}>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.barTitleButton}
          onClick={() => setMode(mode === "minimized" ? "open" : "minimized")}
        >
          <span className={styles.barTitle}>{resolvedTitle}</span>
          {unread > 0 && <span className={styles.barBadge}>{unread > 9 ? "9+" : unread}</span>}
        </button>
        <span className={styles.barActions}>
          <button
            type="button"
            className={styles.barButton}
            onClick={() => setMode(mode === "minimized" ? "open" : "minimized")}
            aria-label={mode === "minimized" ? t("chat.expand_cta") : t("chat.minimize_cta")}
            title={mode === "minimized" ? t("chat.expand_cta") : t("chat.minimize_cta")}
          >
            {mode === "minimized" ? <ExpandIcon /> : <MinimizeIcon />}
          </button>
          <button
            type="button"
            className={styles.barButton}
            onClick={() => setMode("closed")}
            aria-label={t("chat.close_cta")}
            title={t("chat.close_cta")}
          >
            <CloseIcon />
          </button>
        </span>
      </div>

      {mode === "open" && (
        <div className={styles.body} style={style}>
          <ChatWindow channelKind={channelKind} state={state} title={resolvedTitle} hideTitle />
        </div>
      )}
    </div>
  );
}

function ChatBubbleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
function MinimizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
