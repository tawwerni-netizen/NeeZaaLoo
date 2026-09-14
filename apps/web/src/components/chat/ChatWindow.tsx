"use client";

/**
 * The one reusable chat surface behind Global Chat and Match Chat --
 * directive #3/#24: expose the component now, mount it wherever it is
 * needed (the /chat page, the game screen), without waiting for the
 * homepage this will eventually also live on.
 *
 * Deliberately simple, per directive #33: avatar, nickname, badge,
 * message, timestamp, and a single input + send button. No reactions, no
 * GIFs, no stickers.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/context";
import type { useChatChannel } from "@/lib/use-chat-socket";
import { post } from "@/lib/api";
import { Avatar } from "@/components/profile/Avatar";
import { badgeIcon } from "@/components/profile/badge-icons";
import type { ChatMessage } from "@/lib/chat-types";
import styles from "./ChatWindow.module.css";

const REPORT_CATEGORIES = ["ABUSE", "HARASSMENT", "SPAM", "SCAM", "THREATS", "INAPPROPRIATE_CONTENT", "OTHER"];

// The connection itself (useChatChannel(spec)) is owned by the CALLER, not
// by this component -- the ChatDrawer wrapper needs the same live message
// list to compute an unread count while the window is closed/minimized, and
// a second useChatChannel() call for the same channel would open a second,
// wasteful websocket connection rather than sharing the caller's one.
type ChatWindowProps = {
  channelKind: "GLOBAL" | "MATCH" | "SPECTATOR";
  state: ReturnType<typeof useChatChannel>;
  title?: string;
  /** ChatDrawer's own bar already shows the title, with minimize/close
   * controls -- rendering it again here would be the same text twice in
   * one small panel. The connection dot still renders either way; only
   * the duplicate heading text is skipped. */
  hideTitle?: boolean;
};

export function ChatWindow({ channelKind, state, title: titleProp, hideTitle = false }: ChatWindowProps) {
  const { player } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { connected, messages, sendMessage, rejected, clearRejected } = state;
  const [draft, setDraft] = useState("");
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [muteTarget, setMuteTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [banTarget, setBanTarget] = useState<{ id: string; nickname: string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    sendMessage(content);
    setDraft("");
  }

  const titleKey = channelKind === "GLOBAL" ? "chat.global_title" : channelKind === "SPECTATOR" ? "chat.spectator_title" : "chat.match_title";
  const title = titleProp ?? t(titleKey);

  return (
    <div className={styles.window}>
      <div className={styles.header}>
        {!hideTitle && <h2 className={styles.title}>{title}</h2>}
        <span className={`${styles.status} ${connected ? styles.statusLive : ""} ${hideTitle ? styles.statusAlone : ""}`}>
          {connected ? "" : t("chat.reconnecting")}
        </span>
      </div>

      <div className={styles.list} ref={listRef}>
        {messages.length === 0 ? (
          <p className={styles.empty}>{t("chat.empty")}</p>
        ) : (
          messages.map((m) =>
            m.system ? (
              <div key={m.id} className={styles.systemRow}>
                <span className={styles.systemLabel}>{t(`chat.system_event.${m.system.eventType}`)}</span>
              </div>
            ) : (
            <div key={m.id} className={styles.row}>
              <Avatar nickname={m.nickname} avatarUrl={m.avatarUrl} size={36} />
              <div className={styles.bubble}>
                <div className={styles.metaRow}>
                  <button
                    type="button"
                    className={styles.nicknameButton}
                    onClick={() => router.push(`/${locale}/players/${encodeURIComponent(m.nickname)}`)}
                  >
                    {m.nickname}
                  </button>
                  {m.badge && <span className={styles.badge}>{badgeIcon(m.badge)}</span>}
                  <span className={styles.time}>
                    {new Date(m.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {m.removed ? (
                  <p className={styles.removedContent}>{t("chat.removed_message")}</p>
                ) : (
                  <p className={styles.content}>{m.content}</p>
                )}
                {!m.removed && (
                  <div className={styles.actions}>
                    <button type="button" className={styles.actionLink} onClick={() => setReportTarget(m)}>
                      {t("chat.report_cta")}
                    </button>
                    <button
                      type="button"
                      className={styles.actionLink}
                      onClick={() => setBlockTarget({ id: m.senderId, nickname: m.nickname })}
                    >
                      {t("chat.block_cta")}
                    </button>
                    {player?.isAdmin && (
                      <>
                        <button
                          type="button"
                          className={`${styles.actionLink} ${styles.actionLinkDanger}`}
                          onClick={async () => {
                            if (confirm(locale === "ar" ? "هل أنت متأكد من حذف هذه الرسالة نهائياً؟" : "Are you sure you want to delete this message?")) {
                              try {
                                await post(`/v1/admin/chat/messages/${m.id}/delete`, {});
                              } catch {
                                alert("Failed to delete message");
                              }
                            }
                          }}
                          title={locale === "ar" ? "حذف الرسالة (مشرف)" : "Delete Message (Mod)"}
                        >
                          🗑️ {locale === "ar" ? "حذف" : "Delete"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionLink} ${styles.actionLinkAdmin}`}
                          onClick={() => setMuteTarget({ id: m.senderId, nickname: m.nickname })}
                          title={locale === "ar" ? "كتم اللاعب من الشات (مشرف)" : "Mute User from Chat (Mod)"}
                        >
                          🔇 {locale === "ar" ? "كتم" : "Mute"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionLink} ${styles.actionLinkDanger}`}
                          onClick={() => setBanTarget({ id: m.senderId, nickname: m.nickname })}
                          title={locale === "ar" ? "حظر اللاعب من الموقع نهائياً (مشرف)" : "Ban User from Platform (Mod)"}
                        >
                          🚫 {locale === "ar" ? "حظر" : "Ban"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            )
          )
        )}
      </div>

      {rejected && (
        <p className={styles.notice} role="alert">
          {t(`chat.errors.${rejected}`) === `chat.errors.${rejected}` ? t("chat.errors.generic") : t(`chat.errors.${rejected}`)}
        </p>
      )}

      <form className={styles.form} onSubmit={onSubmit}>
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (rejected) clearRejected(); }}
          placeholder={t("chat.placeholder")}
          maxLength={1000}
        />
        <button type="submit" disabled={!connected || !draft.trim()}>{t("chat.send_cta")}</button>
      </form>

      {reportTarget && (
        <ReportPanel message={reportTarget} onDone={() => setReportTarget(null)} onCancel={() => setReportTarget(null)} />
      )}
      {blockTarget && (
        <BlockPanel target={blockTarget} onDone={() => setBlockTarget(null)} onCancel={() => setBlockTarget(null)} />
      )}
      {muteTarget && (
        <AdminMutePanel target={muteTarget} onDone={() => setMuteTarget(null)} onCancel={() => setMuteTarget(null)} />
      )}
      {banTarget && (
        <AdminBanPanel target={banTarget} onDone={() => setBanTarget(null)} onCancel={() => setBanTarget(null)} />
      )}
    </div>
  );
}

function ReportPanel({ message, onDone, onCancel }: { message: ChatMessage; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!category) return;
    setSubmitting(true);
    try {
      await post("/v1/chat/reports", { messageId: message.id, category, reason: reason || undefined });
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {done ? (
          <>
            <p>{t("chat.report_submitted")}</p>
            <button type="button" onClick={onDone}>{t("chat.cancel_cta")}</button>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <h3 className={styles.panelTitle}>{t("chat.report_title")}</h3>
            <div className={styles.field}>
              <label htmlFor="reportCategory">{t("chat.report_category_label")}</label>
              <select id="reportCategory" value={category} onChange={(e) => setCategory(e.target.value)} required>
                <option value="" disabled>{t("chat.report_category_placeholder")}</option>
                {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`chat.categories.${c}`)}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="reportReason">{t("chat.report_reason_label")}</label>
              <input id="reportReason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </div>
            <div className={styles.panelActions}>
              <button type="submit" disabled={submitting || !category}>{t("chat.report_submit_cta")}</button>
              <button type="button" onClick={onCancel}>{t("chat.cancel_cta")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function BlockPanel({ target, onDone, onCancel }: { target: { id: string; nickname: string }; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm() {
    setSubmitting(true);
    try {
      await post("/v1/chat/blocks", { blockedId: target.id });
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>{t("chat.block_confirm_title", { nickname: target.nickname })}</h3>
        <p>{t("chat.block_confirm_body")}</p>
        <div className={styles.panelActions}>
          <button type="button" disabled={submitting} onClick={onConfirm}>{t("chat.block_confirm_cta")}</button>
          <button type="button" onClick={onCancel}>{t("chat.cancel_cta")}</button>
        </div>
      </div>
    </div>
  );
}

function AdminMutePanel({ target, onDone, onCancel }: { target: { id: string; nickname: string }; onDone: () => void; onCancel: () => void }) {
  const { locale } = useI18n();
  const [duration, setDuration] = useState<number>(3600000);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await post("/v1/admin/chat/mutes", {
        targetId: target.id,
        reason: reason.trim() || "Violation of chat rules",
        scope: "ALL_CHAT",
        durationMs: duration > 0 ? duration : null,
      });
      onDone();
    } catch {
      alert("Failed to mute player");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <form onSubmit={onConfirm}>
          <h3 className={styles.panelTitle} style={{ color: "#f59e0b" }}>
            🔇 {locale === "ar" ? `كتم @${target.nickname} من الشات` : `Mute @${target.nickname} from Chat`}
          </h3>
          <div className={styles.field}>
            <label>{locale === "ar" ? "المدة" : "Duration"}</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={3600000}>{locale === "ar" ? "ساعة واحدة" : "1 Hour"}</option>
              <option value={86400000}>{locale === "ar" ? "24 ساعة (يوم)" : "24 Hours (1 Day)"}</option>
              <option value={604800000}>{locale === "ar" ? "7 أيام" : "7 Days"}</option>
              <option value={0}>{locale === "ar" ? "دائم" : "Permanent"}</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>{locale === "ar" ? "السبب" : "Reason"}</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={locale === "ar" ? "سبب الكتم..." : "Reason for mute..."}
              maxLength={500}
            />
          </div>
          <div className={styles.panelActions}>
            <button type="submit" disabled={submitting} style={{ background: "#f59e0b", color: "#000", fontWeight: 700 }}>
              {locale === "ar" ? "تأكيد الكتم" : "Confirm Mute"}
            </button>
            <button type="button" onClick={onCancel}>
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdminBanPanel({ target, onDone, onCancel }: { target: { id: string; nickname: string }; onDone: () => void; onCancel: () => void }) {
  const { locale } = useI18n();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await post(`/v1/admin/players/${target.id}/ban`, {
        reason: reason.trim() || "Banned by administrator",
      });
      onDone();
    } catch {
      alert("Failed to ban player. Super Admins cannot be banned.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <form onSubmit={onConfirm}>
          <h3 className={styles.panelTitle} style={{ color: "#ef4444" }}>
            🚫 {locale === "ar" ? `حظر @${target.nickname} من الموقع` : `Ban @${target.nickname} from Platform`}
          </h3>
          <p style={{ fontSize: "12px", color: "var(--nz-text-3)", marginBottom: "12px", lineHeight: 1.4 }}>
            {locale === "ar"
              ? "سيتم إنهاء جميع الجلسات النشطة للمستخدم فوراً ومنعه من تسجيل الدخول أو استخدام الموقع."
              : "All active user sessions will be revoked immediately and login access blocked."}
          </p>
          <div className={styles.field}>
            <label>{locale === "ar" ? "سبب الحظر" : "Reason for Ban"}</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={locale === "ar" ? "سبب الحظر من الموقع..." : "Reason for site ban..."}
              maxLength={500}
            />
          </div>
          <div className={styles.panelActions}>
            <button type="submit" disabled={submitting} style={{ background: "#ef4444", color: "#fff", fontWeight: 700 }}>
              {locale === "ar" ? "تأكيد الحظر الكلي" : "Confirm Site Ban"}
            </button>
            <button type="button" onClick={onCancel}>
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
