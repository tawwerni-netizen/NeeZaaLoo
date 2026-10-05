"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { AdminIcon } from "./AdminIcon";
import { get } from "@/lib/api";
import styles from "./AdminTopbar.module.css";

type PlatformEvent = {
  id: string;
  actor_id: string | null;
  action: string;
  subject_type: string;
  subject_id: string | null;
  created_at: string;
  event_type: "AUDIT" | "SECURITY" | "TOURNAMENT";
  detail?: string;
};

type SearchResult = {
  category: string;
  label: string;
  meta: string;
  href: string;
};

const SAMPLE_SEARCH_INDEX: SearchResult[] = [
  { category: "Players", label: "Grandmaster77", meta: "Rating: 1842 · Clean", href: "/admin/players?q=Grandmaster77" },
  { category: "Players", label: "CheckersKing", meta: "Rating: 1520 · Verified", href: "/admin/players?q=CheckersKing" },
  { category: "Players", label: "NizaloElite", meta: "Rating: 1980 · VIP", href: "/admin/players?q=NizaloElite" },
  { category: "Matches", label: "duel_chess_blitz_091", meta: "Chess · Stake: 25 USDT", href: "/admin/matches?q=duel_chess" },
  { category: "Matches", label: "duel_dominoes_1v1_88", meta: "Dominoes · Stake: 50 USDT", href: "/admin/matches?q=duel_dominoes" },
  { category: "Finance", label: "TX-USDT-99420", meta: "Deposit · 500 USDT · Approved", href: "/admin/deposits?q=TX-USDT-99420" },
  { category: "Finance", label: "WD-USDT-18492", meta: "Withdrawal · 120 USDT · Pending", href: "/admin/withdrawals?q=WD-USDT-18492" },
  { category: "Support", label: "TCK-882 (Deposit Inquiry)", meta: "Open · High Priority", href: "/admin/support?q=TCK-882" },
  { category: "Fair Play", label: "CASE-FP-401 (Engine Flag)", meta: "Review Required", href: "/admin/fair-play?q=CASE-FP-401" },
];

export function AdminTopbar({
  breadcrumb,
  alertCount = 0,
  adminHandle,
  onMenuClick,
}: {
  breadcrumb: string[];
  alertCount?: number;
  adminHandle: string;
  onMenuClick?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    get<{ ok: boolean; events: PlatformEvent[] }>("/v1/admin/events?limit=25")
      .then((res) => {
        if (res.ok && res.events) {
          setEvents(res.events);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const effectiveCount = events.length > 0 ? events.length : alertCount;

  const results = query.trim()
    ? SAMPLE_SEARCH_INDEX.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.meta.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.menuButton} onClick={onMenuClick} aria-label="Toggle navigation">
        <AdminIcon name="menu" size={18} />
      </button>

      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        {breadcrumb.map((crumb, i) => (
          <span key={crumb} className={styles.crumbGroup}>
            <span className={i === breadcrumb.length - 1 ? styles.crumbCurrent : styles.crumb}>{crumb}</span>
            {i < breadcrumb.length - 1 && <span className={styles.crumbSep}>/</span>}
          </span>
        ))}
      </nav>

      <div className={styles.spacer} />

      {/* Global Interactive Search */}
      <div className={styles.search} ref={searchRef}>
        <AdminIcon name="search" size={16} className={styles.searchIcon} />
        <input
          type="search"
          placeholder="Search players, duels, finance, tickets..."
          aria-label="Global Admin Search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
        />

        {isOpen && query.trim().length > 0 && (
          <div className={styles.searchDropdown}>
            {results.length === 0 ? (
              <div className={styles.searchEmpty}>No results found for &ldquo;{query}&rdquo;</div>
            ) : (
              results.map((r, i) => (
                <Link
                  key={`${r.href}-${i}`}
                  href={r.href}
                  className={styles.searchResultItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div>
                    <div className={styles.searchResultLabel}>{r.label}</div>
                    <div className={styles.searchResultMeta}>{r.meta}</div>
                  </div>
                  <span className={styles.searchGroupTitle}>{r.category}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ position: "relative" }} ref={notifRef}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`${effectiveCount} platform alerts`}
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
        >
          <AdminIcon name="bell" size={18} />
          {effectiveCount > 0 && <span className={`${styles.badge} nz-num`}>{effectiveCount > 99 ? "99+" : effectiveCount}</span>}
        </button>

        {isNotificationsOpen && (
          <div className={styles.notificationsDropdown}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.5px" }}>Live Platform Events</span>
              <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>Stream Active</span>
            </div>
            {events.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                No recent platform alerts
              </div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className={styles.notificationItem}>
                  <div className={styles.notificationHead}>
                    <span
                      className={`${styles.notificationType} ${
                        ev.event_type === "SECURITY"
                          ? styles.notificationTypeSecurity
                          : ev.event_type === "TOURNAMENT"
                          ? styles.notificationTypeTournament
                          : styles.notificationTypeAudit
                      }`}
                    >
                      {ev.event_type}
                    </span>
                    <span className={styles.notificationTime}>
                      {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className={styles.notificationAction}>{ev.action}</div>
                  <div className={styles.notificationDetail}>
                    {ev.subject_type}: {ev.subject_id || ev.actor_id || "System"}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Link href="/" className={styles.websiteLink}>
        <AdminIcon name="dashboard" size={16} />
        <span>Return to Website</span>
      </Link>

      <div className={styles.identity}>
        <div className={styles.identityAvatar} aria-hidden="true">{adminHandle.slice(0, 1).toUpperCase()}</div>
        <span className={styles.identityName}>{adminHandle}</span>
      </div>
    </header>
  );
}
