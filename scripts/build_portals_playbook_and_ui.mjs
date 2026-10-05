import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const portals = JSON.parse(fs.readFileSync(path.join(rootDir, 'deliverables', '100_b2b_web_portals.json'), 'utf8'));

// 1. Build Markdown Playbook
let md = `# 🌐 100 Tier-1 Global B2B Web Portals & Custom Pitch Playbook — Nizalo

This master playbook provides direct web submission URLs and tailored acquisition pitches for **100 Top Global iGaming Aggregators, Game Studios, MENA Giants, Crypto Casinos, and Real-Money Skill Gaming Platforms**.

---

## ⚡ Why B2B Web Portals Are 100% Guaranteed:
1. **Zero Bounce / Zero Block:** Submissions bypass external email firewalls (Microsoft DBEB, Google Workspace filters) and land directly in the company's CRM (HubSpot, Salesforce) as qualified inbound business leads.
2. **Reviewed by Commercial Teams:** Portals route directly to Business Development Managers and M&A Directors.
3. **No Risk to Domain:** No outbound SMTP traffic, zero risk of spam flags or domain blacklisting.

---

## 📋 The 100 Master B2B Portals Directory

`;

portals.forEach(p => {
    md += `### ${p.id}. ${p.company} (${p.category})
* **Region:** ${p.region}
* **Key Executive:** ${p.exec}
* **Official B2B Portal URL:** [${p.portal}](${p.portal})
* **Subject:** \`${p.subject}\`
* **Tailored Form Message (Copy & Paste):**
\`\`\`text
${p.message}
\`\`\`

---

`;
});

fs.writeFileSync(path.join(rootDir, 'deliverables', '100_b2b_web_portals_master_playbook.md'), md, 'utf8');
console.log('✅ Generated deliverables/100_b2b_web_portals_master_playbook.md successfully!');

// 2. Build Interactive HTML Dashboard
const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nizalo M&A — لوحة الـ 100 بوابة شراكة رسمية (Zero-Bounce B2B Portals)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --gold: #f59e0b;
      --gold-glow: rgba(245, 158, 11, 0.25);
      --green: #10b981;
      --blue: #3b82f6;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(245, 158, 11, 0.06) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.06) 0%, transparent 40%);
      color: var(--text);
      font-family: 'IBM Plex Sans Arabic', sans-serif;
      min-height: 100vh;
      padding: 30px 20px 80px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    header { margin-bottom: 30px; text-align: center; }
    .badge-top {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      border-radius: 9999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--green);
      font-size: 13.5px;
      font-weight: 600;
      margin-bottom: 14px;
    }
    h1 { font-size: 32px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    .subtitle { color: var(--text-muted); font-size: 15.5px; max-width: 700px; margin: 0 auto; line-height: 1.6; }
    
    /* Stats Bar */
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 30px;
      backdrop-filter: blur(12px);
    }
    .stat-item { text-align: center; padding: 10px; border-left: 1px solid rgba(255, 255, 255, 0.05); }
    .stat-item:last-child { border-left: none; }
    .stat-num { font-size: 32px; font-weight: 700; font-family: 'IBM Plex Mono', monospace; color: var(--gold); }
    .stat-label { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .progress-track { height: 10px; background: rgba(255, 255, 255, 0.08); border-radius: 999px; overflow: hidden; margin-top: 10px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, var(--gold), #10b981); width: 0%; transition: width 0.3s ease; }

    /* Filters */
    .filters-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 24px;
      align-items: center;
    }
    .filter-btn {
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-muted);
      cursor: pointer;
      font-size: 13.5px;
      font-family: inherit;
      transition: all 0.2s ease;
    }
    .filter-btn:hover, .filter-btn.active {
      background: var(--gold);
      color: #000;
      border-color: var(--gold);
      font-weight: 600;
    }

    /* Cards Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 20px;
    }
    .portal-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      backdrop-filter: blur(12px);
      transition: all 0.2s ease;
      position: relative;
    }
    .portal-card:hover {
      border-color: rgba(245, 158, 11, 0.3);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }
    .portal-card.submitted {
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(16, 185, 129, 0.04);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .card-id {
      font-size: 12px;
      font-family: 'IBM Plex Mono', monospace;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-dim);
    }
    .card-category {
      font-size: 11.5px;
      padding: 3px 10px;
      border-radius: 9999px;
      background: rgba(59, 130, 246, 0.12);
      color: var(--blue);
      border: 1px solid rgba(59, 130, 246, 0.25);
    }
    .company-title {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .exec-info {
      font-size: 13.5px;
      color: var(--text-muted);
      margin-bottom: 14px;
    }
    .exec-info span { color: var(--gold); }
    .specific-box {
      background: rgba(0, 0, 0, 0.25);
      border-right: 3px solid var(--gold);
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      color: #cbd5e1;
      margin-bottom: 18px;
      line-height: 1.5;
    }
    .card-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }
    .btn-copy {
      padding: 10px;
      border-radius: 8px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--gold);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-copy:hover {
      background: var(--gold);
      color: #000;
    }
    .btn-open {
      padding: 10px;
      border-radius: 8px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--green);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
    }
    .btn-open:hover {
      background: var(--green);
      color: #000;
    }
    .check-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 13px;
      color: var(--text-muted);
      cursor: pointer;
    }
    .check-wrap input {
      accent-color: var(--green);
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #000;
      padding: 12px 24px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
      transition: all 0.3s ease;
      opacity: 0;
      z-index: 9999;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
  </style>
</head>
<body>

<div class="container">
  <header>
    <div class="badge-top">🛡️ نسبة تسليم 100% • تجاوز تام لفلاتر البريد والسبام</div>
    <h1>لوحة الـ 100 بوابة شراكة واستحواذ رسمية (B2B Web Portals)</h1>
    <p class="subtitle">تجاوز أسوار الإيميلات وجدران الحماية بالتقديم المباشر في نماذج الشراكة الرسمية لكبرى شركات الألعاب، حيث تدخل رسالتك مباشرة في نظام CRM لمدير الاستحواذ!</p>
  </header>

  <div class="stats-bar">
    <div class="stat-item">
      <div class="stat-num">100</div>
      <div class="stat-label">إجمالي البوابات المعتمدة</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="submittedCount">0</div>
      <div class="stat-label">تم التقديم بنجاح</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="remainingCount">100</div>
      <div class="stat-label">المتبقي في القائمة</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="percentageDone">0%</div>
      <div class="stat-label">نسبة الإنجاز</div>
    </div>
    <div style="grid-column: 1 / -1;">
      <div class="progress-track">
        <div class="progress-fill" id="progressFill"></div>
      </div>
    </div>
  </div>

  <div class="filters-wrap">
    <button class="filter-btn active" onclick="filterCategory('All')">جميع البوابات (100)</button>
    <button class="filter-btn" onclick="filterCategory('iGaming Aggregators & B2B')">مجمعات الـ iGaming (30)</button>
    <button class="filter-btn" onclick="filterCategory('Game Studios & Content')">استوديوهات الألعاب (20)</button>
    <button class="filter-btn" onclick="filterCategory('MENA & GCC Conglomerates')">عمالقة الخليج والشرق الأوسط (15)</button>
    <button class="filter-btn" onclick="filterCategory('Crypto & Web3 Gaming')">كازينوهات الكريبتو (15)</button>
    <button class="filter-btn" onclick="filterCategory('Real-Money Skill Gaming')">ألعاب المهارة والنقود (10)</button>
    <button class="filter-btn" onclick="filterCategory('Tier-1 Regulated Operators')">المشغلون الكبار و M&A (10)</button>
  </div>

  <div class="grid" id="portalsGrid"></div>
</div>

<div class="toast" id="toast">✅ تم نسخ نص العرض المخصص ورابط الواتساب للحافظة!</div>

<script>
  const PORTALS = ${JSON.stringify(portals)};
  const STORAGE_KEY = 'nizalo_b2b_portals_submitted_v1';
  let submittedSet = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  let currentCategory = 'All';

  function saveSubmitted() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(submittedSet)));
    updateStats();
  }

  function toggleSubmitted(id) {
    if (submittedSet.has(id)) {
      submittedSet.delete(id);
    } else {
      submittedSet.add(id);
    }
    saveSubmitted();
    render();
  }

  function updateStats() {
    const total = PORTALS.length;
    const submitted = submittedSet.size;
    const remaining = total - submitted;
    const pct = Math.round((submitted / total) * 100);

    document.getElementById('submittedCount').innerText = submitted;
    document.getElementById('remainingCount').innerText = remaining;
    document.getElementById('percentageDone').innerText = pct + '%';
    document.getElementById('progressFill').style.width = pct + '%';
  }

  function copyPitch(id) {
    const item = PORTALS.find(p => p.id === id);
    if (!item) return;

    navigator.clipboard.writeText(item.message).then(() => {
      showToast('✅ تم نسخ رسالة ' + item.company + ' ورابط الواتساب بنجاح!');
    });
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => {
      if (b.innerText.includes(cat) || (cat === 'All' && b.innerText.includes('جميع'))) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    render();
  }

  function render() {
    const grid = document.getElementById('portalsGrid');
    const filtered = currentCategory === 'All' ? PORTALS : PORTALS.filter(p => p.category.includes(currentCategory));

    grid.innerHTML = filtered.map(p => {
      const isSub = submittedSet.has(p.id);
      return \`
        <div class="portal-card \${isSub ? 'submitted' : ''}">
          <div>
            <div class="card-header">
              <span class="card-id">#\${p.id}</span>
              <span class="card-category">\${p.category}</span>
            </div>
            <div class="company-title">\${p.company}</div>
            <div class="exec-info">الهدف: <span>\${p.exec}</span> • \${p.region}</div>
            <div class="specific-box">
              <strong>زاوية الشراكة:</strong> \${p.specificValue}
            </div>
          </div>
          <div>
            <div class="card-actions">
              <button class="btn-copy" onclick="copyPitch(\${p.id})">📋 نسخ العرض المخصص</button>
              <a href="\${p.portal}" target="_blank" class="btn-open">🌐 فتح بوابة \${p.company}</a>
            </div>
            <label class="check-wrap">
              <input type="checkbox" \${isSub ? 'checked' : ''} onchange="toggleSubmitted(\${p.id})">
              <span>\${isSub ? '✅ تم التقديم في البوابة' : 'وضع علامة تم التقديم'}</span>
            </label>
          </div>
        </div>
      \`;
    }).join('');
  }

  updateStats();
  render();
</script>

</body>
</html>`;

fs.writeFileSync(path.join(rootDir, 'deliverables', 'b2b_portals_dashboard.html'), htmlContent, 'utf8');
fs.writeFileSync(path.join(rootDir, 'apps', 'web', 'public', 'b2b-portals.html'), htmlContent, 'utf8');
console.log('✅ Generated deliverables/b2b_portals_dashboard.html & apps/web/public/b2b-portals.html successfully!');
