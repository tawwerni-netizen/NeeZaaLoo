"use client";

import { AdminIcon } from "./AdminIcon";
import styles from "./AdminTopbar.module.css";

export function AdminTopbar({
  breadcrumb, alertCount = 0, adminHandle, onMenuClick,
}: {
  breadcrumb: string[];
  alertCount?: number;
  adminHandle: string;
  onMenuClick?: () => void;
}) {
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

      {/* Not wired to anything real yet -- disabled rather than a live-looking
          input that silently does nothing when typed into, the same honesty
          rule AdminSidebar's own "Soon" items already follow. */}
      <div className={styles.search} title="Global search is not available yet">
        <AdminIcon name="search" size={16} className={styles.searchIcon} />
        <input type="search" placeholder="Search — coming soon" aria-label="Search (not yet available)" disabled />
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
