"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { AdminIcon } from "./AdminIcon";
import styles from "./AdminTopbar.module.css";

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
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

      <button type="button" className={styles.iconButton} aria-label={`${alertCount} alerts`}>
        <AdminIcon name="bell" size={18} />
        {alertCount > 0 && <span className={`${styles.badge} nz-num`}>{alertCount > 99 ? "99+" : alertCount}</span>}
      </button>

      <div className={styles.identity}>
        <div className={styles.identityAvatar} aria-hidden="true">{adminHandle.slice(0, 1).toUpperCase()}</div>
        <span className={styles.identityName}>{adminHandle}</span>
        <AdminIcon name="chevronDown" size={14} className={styles.identityChevron} />
      </div>
    </header>
  );
}
