"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminIcon, type IconName } from "./AdminIcon";
import styles from "./AdminSidebar.module.css";

type NavItem = { label: string; icon: IconName; href: string };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: "dashboard", href: "/admin" },
      { label: "Players", icon: "players", href: "/admin/players" },
      { label: "Games", icon: "games", href: "/admin/games" },
      { label: "Matches", icon: "matches", href: "/admin/matches" },
      { label: "Tournaments", icon: "tournaments", href: "/admin/tournaments" },
      { label: "AI & Bots", icon: "bot", href: "/admin/bots" },
      { label: "Live Arena", icon: "arena", href: "/admin/arena" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Finance Control", icon: "finance", href: "/admin/payments" },
      { label: "Deposits", icon: "deposits", href: "/admin/deposits" },
      { label: "Withdrawals", icon: "withdrawals", href: "/admin/withdrawals" },
      { label: "Vodafone Cash / InstaPay", icon: "deposits", href: "/admin/local-payments" },
    ],
  },
  {
    label: "Trust & Safety",
    items: [
      { label: "Risk Radar", icon: "risk", href: "/admin/risk" },
      { label: "Fair Play & Anti-Cheat", icon: "fairplay", href: "/admin/fair-play" },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Support Tickets", icon: "support", href: "/admin/support" },
      { label: "Live Chat Moderation", icon: "chat", href: "/admin/chat" },
      { label: "Referrals & Affiliates", icon: "referrals", href: "/admin/referrals" },
      { label: "Store & Inventory", icon: "store", href: "/admin/store" },
      { label: "Content & SEO", icon: "content", href: "/admin/content" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "System Health", icon: "systemHealth", href: "/admin/health" },
      { label: "Platform Settings", icon: "settings", href: "/admin/settings" },
      { label: "RBAC & Permissions", icon: "rbac", href: "/admin/rbac" },
    ],
  },
];

export function AdminSidebar({
  adminHandle,
  open = false,
  onClose,
}: {
  adminHandle: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  return (
    <aside className={styles.sidebar} data-open={open}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>N</span>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Nizalo</span>
          <span className={styles.brandSub}>Admin</span>
        </div>
        {onClose && (
          <button
            type="button"
            className={styles.mobileCloseBtn}
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        )}
      </div>

      <nav className={styles.nav}>
        {GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <div className={styles.groupLabel}>{group.label}</div>
            {group.items.map((item) => {
              const active = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                >
                  <AdminIcon name={item.icon} className={styles.navIcon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.avatar} aria-hidden="true">
          {adminHandle.slice(0, 1).toUpperCase()}
        </div>
        <div className={styles.footerText}>
          <span className={styles.footerName}>{adminHandle}</span>
          <span className={styles.footerRole}>Administrator</span>
        </div>
      </div>
    </aside>
  );
}
