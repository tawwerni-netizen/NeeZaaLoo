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
  const { t, locale } = useI18n();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void get<TicketListResponse>("/v1/me/tickets")
      .then((r) => { if (!cancelled) setTickets(r.tickets); })
      .catch(() => { if (!cancelled) setTickets([]); });
    return () => { cancelled = true; };
  }, []);

  const quickTopics = [
    { icon: "💎", title: locale === "ar" ? "شحن وسحب الأرصدة" : "Deposits & Withdrawals", desc: locale === "ar" ? "استفسارات محفظة USDT وعمليات الدفع" : "Inquiries about wallet & payouts" },
    { icon: "⚔️", title: locale === "ar" ? "النزالات والتحكيم" : "Duels & Match Arbitrage", desc: locale === "ar" ? "مراجعة نتائج المباريات ونظام النزاهة" : "Review match results & fair play" },
    { icon: "🛡️", title: locale === "ar" ? "الأمان وتوثيق الحساب" : "Account Security & 2FA", desc: locale === "ar" ? "استعادة الحسابات وتأمين الدخول" : "Account recovery & authentication" },
  ];

  return (
    <div className={styles.wrap}>
      {/* Hero Header */}
      <div className={styles.heroBox}>
        <div className={styles.heroText}>
          <div className={styles.heroBadge}>
            <span className={styles.pulseDot} />
            {locale === "ar" ? "دعم فني متخصص على مدار 24 ساعة" : "24/7 Dedicated Player Support"}
          </div>
          <h1 className={styles.title}>
            {locale === "ar" ? "مركز الدعم وتذاكر المساعدة" : "Support & Help Tickets"}
          </h1>
          <p className={styles.subtitle}>
            {locale === "ar"
              ? "فريق نيزالو متاح لخدمتك لحل أي استفسار أو مشكلة تقنية فوراً بكل احترافية."
              : "Our team is here to assist with any technical or account questions swiftly and professionally."}
          </p>
        </div>
        <div className={styles.heroAction}>
          <LocaleLink href="/support/new">
            <Button variant="primary" className={styles.newTicketBtn}>
              <span>➕</span> {t("support.new_ticket_cta")}
            </Button>
          </LocaleLink>
        </div>
      </div>

      {/* Quick Help Categories */}
      <div className={styles.quickGrid}>
        {quickTopics.map((tp, idx) => (
          <LocaleLink key={idx} href="/support/new" className={styles.quickCard}>
            <span className={styles.quickIcon}>{tp.icon}</span>
            <div>
              <h3 className={styles.quickTitle}>{tp.title}</h3>
              <p className={styles.quickDesc}>{tp.desc}</p>
            </div>
          </LocaleLink>
        ))}
      </div>

      {/* Tickets Section */}
      <div className={styles.ticketsSectionHead}>
        <h2 className={styles.ticketsSectionTitle}>
          <span>🎫</span> {t("support.my_tickets_title")}
        </h2>
        {tickets && (
          <span className={styles.ticketCountTag}>
            {tickets.length} {locale === "ar" ? "تذكرة مسجلة" : "tickets"}
          </span>
        )}
      </div>

      {tickets === null ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>{locale === "ar" ? "جارٍ تحميل تذاكر الدعم..." : "Loading tickets..."}</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className={styles.emptyCard}>
          <span className={styles.emptyIcon}>💬</span>
          <h3 className={styles.emptyTitle}>
            {locale === "ar" ? "لا توجد تذاكر دعم مفتوحة حالياً" : "No Support Tickets Found"}
          </h3>
          <p className={styles.emptyText}>
            {locale === "ar"
              ? "كل شيء يعمل على ما يرام! إذا واجهت أي استفسار، لا تتردد في فتح تذكرة جديدة وسنرد عليك فوراً."
              : "Everything looks clear! If you ever need help, create a ticket and our agents will respond promptly."}
          </p>
          <LocaleLink href="/support/new" style={{ marginTop: "1rem" }}>
            <Button variant="primary">
              <span>➕</span> {locale === "ar" ? "فتح تذكرة مساعدة جديدة" : "Open a Support Ticket"}
            </Button>
          </LocaleLink>
        </div>
      ) : (
        <div className={styles.ticketsList}>
          {tickets.map((ticket) => (
            <LocaleLink key={ticket.id} href={`/support/${ticket.id}`} className={styles.ticketRow}>
              <div className={styles.ticketRowTop}>
                <span className={styles.ticketSubject}>{ticket.subject}</span>
                <span className={`${styles.pill} ${styles[pillClassFor(ticket.status)]}`}>
                  {t(`support.status.${ticket.status}`)}
                </span>
              </div>
              <div className={styles.ticketMeta}>
                <span className={styles.categoryChip}>🏷️ {t(`support.categories.${ticket.category}`)}</span>
                <span>📅 {t("support.updated_label")} {new Date(ticket.updated_at).toLocaleDateString()}</span>
                <span className={styles.arrowIcon}>{dir === "rtl" ? "←" : "→"}</span>
              </div>
            </LocaleLink>
          ))}
        </div>
      )}
    </div>
  );
}
