const fs = require('fs');

const newCSS = `
/* --- FILTERS --- */
.filtersWrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-bottom: 32px;
  background: var(--nz-bg-1);
  padding: 16px;
  border-radius: var(--nz-radius-xl);
  border: 1px solid var(--nz-line);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

.filter, .filterActive {
  padding: 10px 20px;
  border-radius: var(--nz-radius-pill);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid transparent;
}

.filter {
  background: var(--nz-surface);
  color: var(--nz-text-2);
  border-color: var(--nz-line);
}

.filter:hover {
  background: var(--nz-surface-hover);
  color: var(--nz-text);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.filterActive {
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  color: #fff;
  border-color: #38bdf8;
  box-shadow: 0 4px 16px rgba(56, 189, 248, 0.4);
}

.emptyCard {
  text-align: center;
  padding: 40px;
  background: var(--nz-surface);
  border-radius: var(--nz-radius-lg);
  margin-top: 20px;
}
.emptyIcon {
  font-size: 40px;
}
.playNowBtn {
  display: inline-block;
  margin-top: 20px;
  padding: 12px 24px;
  background: var(--nz-primary);
  color: white;
  border-radius: 8px;
  text-decoration: none;
  font-weight: bold;
}
.loadingCard {
  text-align: center;
  padding: 40px;
}
.spinner {
  width: 32px;
  height: 32px;
  border: 4px solid var(--nz-line);
  border-top-color: var(--nz-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
`;

fs.appendFileSync('apps/web/src/app/[locale]/rank/rank.module.css', newCSS);
