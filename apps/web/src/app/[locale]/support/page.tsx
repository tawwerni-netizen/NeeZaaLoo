"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/Button";
import { LocaleLink } from "@/components/LocaleLink";
import { useI18n } from "@/lib/i18n/context";
import { get } from "@/lib/api";
import type { TicketListResponse, TicketSummary } from "@/lib/support-types";
import { pillClassFor } from "./status-pill";
import styles from "./support.module.css";

export default function SupportPage() {
  return (
    <RequireAuth>
      <Header />
      <SupportContent />
    </RequireAuth>
  );
}

function SupportContent() {
  const { t } = useI18n();
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void get<TicketListResponse>("/v1/me/tickets")
      .then((r) => { if (!cancelled) setTickets(r.tickets); })
      .catch(() => { if (!cancelled) setTickets([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>{t("support.my_tickets_title")}</h1>
        <LocaleLink href="/support/new">
          <Button variant="primary">{t("support.new_ticket_cta")}</Button>
        </LocaleLink>
      </div>

      {tickets === null ? (
        <div className={styles.card} />
      ) : tickets.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.empty}>{t("support.no_tickets")}</p>
        </div>
      ) : (
        tickets.map((ticket) => (
          <LocaleLink key={ticket.id} href={`/support/${ticket.id}`} className={styles.ticketRow}>
            <div className={styles.ticketRowTop}>
              <span className={styles.ticketSubject}>{ticket.subject}</span>
              <span className={`${styles.pill} ${styles[pillClassFor(ticket.status)]}`}>
                {t(`support.status.${ticket.status}`)}
              </span>
            </div>
            <div className={styles.ticketMeta}>
              <span>{t(`support.categories.${ticket.category}`)}</span>
              <span>{t("support.updated_label")} {new Date(ticket.updated_at).toLocaleDateString()}</span>
            </div>
          </LocaleLink>
        ))
      )}
    </div>
  );
}
