"use client";

/**
 * The admin shell's left rail. Two of the items below lead somewhere real
 * today (Dashboard, Finance -- the existing Payment & Stablecoin Control
 * Center); the rest name real, planned surfaces this platform already has
 * backend services for, but no admin screen yet. Rendering them as live
 * links to a page that doesn't exist would be its own small dishonesty on
 * a dashboard whose entire point is "never show a value or a destination
 * that isn't real" -- so they render disabled, with a quiet "Soon" mark,
 * until each one actually ships.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminIcon, type IconName } from "./AdminIcon";
import styles from "./AdminSidebar.module.css";

type NavItem = { label: string; icon: IconName; href?: string };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: "dashboard", href: "/admin" },
      { label: "Players", icon: "players" },
      { label: "Games", icon: "games" },
      { label: "Matches", icon: "matches" },
      { label: "Tournaments", icon: "tournaments" },
      { label: "Live Arena", icon: "arena" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Finance", icon: "finance", href: "/admin/payments" },
      { label: "Deposits", icon: "deposits" },
      { label: "Withdrawals", icon: "withdrawals" },
    ],
  },
  {
    label: "Trust & Safety",
    items: [
      { label: "Risk", icon: "risk" },
      { label: "Fair Play", icon: "fairplay" },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Support", icon: "support" },
      { label: "Chat", icon: "chat" },
      { label: "Referrals", icon: "referrals" },
      { label: "Store", icon: "store" },
      { label: "Content / SEO", icon: "content" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "System Health", icon: "systemHealth" },
      { label: "Settings", icon: "settings" },
      { label: "RBAC", icon: "rbac" },
    ],
  },
];

export function AdminSidebar({ adminHandle, open = false }: { adminHandle: string; open?: boolean }) {
  const pathname = usePathname();
  // Strip the /{locale} prefix so an active-state comparison against a
  // bare "/admin" href works regardless of which locale segment the admin
  // happened to land on -- this shell is English-only, but the route
  // itself still lives under [locale] like every other page.
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  return (
    <aside className={styles.sidebar} data-open={open}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>N</span>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Nizalo</span>
          <span className={styles.brandSub}>Admin</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {GROUPS.map((group) => (
          <div key={group.label} className={styles.group}>
            <div className={styles.groupLabel}>{group.label}</div>
            {group.items.map((item) => {
              const active = !!item.href && (item.href === "/admin" ? path === "/admin" : path.startsWith(item.href));
              if (!item.href) {
                return (
                  <span key={item.label} className={styles.navItemDisabled} aria-disabled="true">
                    <AdminIcon name={item.icon} className={styles.navIcon} />
                    {item.label}
                    <span className={styles.soon}>Soon</span>
                  </span>
                );
              }
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
        <div className={styles.avatar} aria-hidden="true">{adminHandle.slice(0, 1).toUpperCase()}</div>
        <div className={styles.footerText}>
          <span className={styles.footerName}>{adminHandle}</span>
          <span className={styles.footerRole}>Administrator</span>
        </div>
      </div>
    </aside>
  );
}
