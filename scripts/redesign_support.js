const fs = require('fs');
let tsx = fs.readFileSync('apps/web/src/app/[locale]/support/page.tsx', 'utf8');

tsx = tsx.replace(
  '<h1 className={styles.title}>{t("support.my_tickets_title")}</h1>',
  '<h1 className={styles.title}><span className={styles.titleIcon}>🎫</span> {t("support.my_tickets_title")}</h1>'
);
tsx = tsx.replace(
  '<p className={styles.empty}>{t("support.no_tickets")}</p>',
  '<div className={styles.emptyState}><span className={styles.emptyIcon}>💬</span><p className={styles.emptyText}>{t("support.no_tickets")}</p></div>'
);

fs.writeFileSync('apps/web/src/app/[locale]/support/page.tsx', tsx);

const css = `
.wrap {
  max-width: 800px;
  margin: 0 auto;
  padding: 4rem 2rem;
}

.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.title {
  font-size: 32px;
  font-weight: 800;
  margin: 0;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
}

.titleIcon {
  font-size: 40px;
  filter: drop-shadow(0 4px 12px rgba(56, 189, 248, 0.4));
}

.card {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  padding: 32px;
  margin-bottom: 24px;
  background: var(--nz-bg-1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 0;
}
.emptyIcon {
  font-size: 48px;
  opacity: 0.5;
}
.emptyText {
  color: var(--nz-text-2);
  font-size: 16px;
  margin: 0;
}

.ticketRow {
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 16px;
  text-decoration: none;
  background: var(--nz-bg-1);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.ticketRow:hover {
  transform: translateY(-3px) scale(1.01);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
  border-color: rgba(56, 189, 248, 0.3);
  background: linear-gradient(135deg, var(--nz-bg-1), rgba(56, 189, 248, 0.03));
}

.ticketRowTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.ticketSubject {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.ticketMeta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px;
  color: var(--nz-text-2);
}

.pill {
  padding: 6px 12px;
  border-radius: var(--nz-radius-pill);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.open { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.closed { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
.resolved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
`;

fs.writeFileSync('apps/web/src/app/[locale]/support/support.module.css', css);
