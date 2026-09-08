"use client";

import { useEffect, useState, type FormEvent } from "react";
import { use } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { authErrorKey } from "@/components/auth/error-messages";
import { get, post, ApiError } from "@/lib/api";
import type { TicketDetailResponse, SendMessageResponse } from "@/lib/support-types";
import { pillClassFor } from "../status-pill";
import styles from "../support.module.css";

export default function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = use(params);
  return (
    <RequireAuth>
      <Header />
      <TicketDetailContent ticketId={ticketId} />
    </RequireAuth>
  );
}

function TicketDetailContent({ ticketId }: { ticketId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<TicketDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justReopened, setJustReopened] = useState(false);

  function reload() {
    return get<TicketDetailResponse>(`/v1/me/tickets/${encodeURIComponent(ticketId)}`)
      .then((r) => setData(r))
      .catch(() => setNotFound(true));
  }

  useEffect(() => {
    let cancelled = false;
    get<TicketDetailResponse>(`/v1/me/tickets/${encodeURIComponent(ticketId)}`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setNotFound(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const r = await post<SendMessageResponse>(`/v1/me/tickets/${encodeURIComponent(ticketId)}/messages`, { content });
      setContent("");
      setJustReopened(r.reopened);
      await reload();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(authErrorKey(code ?? "GENERIC")));
    } finally {
      setSending(false);
    }
  }

  if (notFound) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>{t("support.errors.not_found")}</p>
        <LocaleLink href="/support" className={styles.backLink}>{t("support.back_to_list")}</LocaleLink>
      </div>
    );
  }
  if (!data) return <div className={styles.wrap} />;

  const { ticket, messages } = data;
  const closed = ticket.status === "CLOSED";

  return (
    <div className={styles.wrap}>
      <LocaleLink href="/support" className={styles.backLink}>{t("support.back_to_list")}</LocaleLink>

      <div className={styles.card}>
        <div className={styles.ticketRowTop}>
          <h1 className={styles.title}>{ticket.subject}</h1>
          <span className={`${styles.pill} ${styles[pillClassFor(ticket.status)]}`}>
            {t(`support.status.${ticket.status}`)}
          </span>
        </div>
        <div className={styles.ticketMeta}>
          <span>{t("support.category_label")}: {t(`support.categories.${ticket.category}`)}</span>
          <span>{t("support.created_label")} {new Date(ticket.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {justReopened && <p className={styles.notice}>{t("support.detail.reopened_notice")}</p>}

      <div className={styles.card}>
        <h2 className={styles.title} style={{ fontSize: "var(--nz-text-sm)", textTransform: "uppercase" }}>
          {t("support.detail.conversation_title")}
        </h2>

        <div className={styles.conversation}>
          {messages.length === 0 ? (
            <p className={styles.empty}>{t("support.detail.no_messages")}</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.message} ${m.author_type === "CUSTOMER" ? styles.messageFromCustomer : ""}`}
              >
                <div className={styles.messageAuthor}>
                  {m.author_type === "CUSTOMER" ? t("support.detail.you_label") : t("support.detail.support_label")}
                </div>
                <p className={styles.messageContent}>{m.content}</p>
                <div className={styles.messageTime}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>

        {closed ? (
          <p className={styles.notice}>{t("support.detail.closed_notice")}</p>
        ) : (
          <form className={styles.replyForm} onSubmit={onSend}>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.field}>
              <label htmlFor="replyContent" style={{ display: "none" }}>{t("support.detail.reply_placeholder")}</label>
              <textarea
                id="replyContent"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("support.detail.reply_placeholder")}
                maxLength={4000}
                required
              />
            </div>
            <div className={styles.actions}>
              <Button type="submit" disabled={sending || !content.trim()}>
                {sending ? t("support.detail.sending") : t("support.detail.send_cta")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
