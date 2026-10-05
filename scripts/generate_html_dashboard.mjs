import fs from 'fs';

// Read the buyers array from generate_200_emails.mjs
const content = fs.readFileSync('scripts/generate_200_emails.mjs', 'utf8');
const startIndex = content.indexOf('const buyers = [');
const endIndex = content.indexOf('// Generate Markdown');
const buyersCode = content.slice(startIndex, endIndex);

// Evaluate buyers
const sandbox = new Function(`${buyersCode}; return buyers;`);
const buyers = sandbox();

console.log(`Loaded ${buyers.length} buyers for dashboard.`);

function generateHTML() {
  const buyersJson = JSON.stringify(buyers);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nizalo M&A — لوحة إرسال الإيميلات للمستثمرين (200 Institutional Leads)</title>
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
      --purple: #8b5cf6;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(245, 158, 11, 0.05) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.05) 0%, transparent 40%);
      color: var(--text);
      font-family: 'IBM Plex Sans Arabic', sans-serif;
      min-height: 100vh;
      padding: 30px 20px 80px;
    }
    .container { max-width: 1300px; margin: 0 auto; }
    header {
      margin-bottom: 30px;
      text-align: center;
      position: relative;
    }
    .badge-top {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: var(--gold);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 15px;
      max-width: 750px;
      margin: 0 auto 24px;
    }
    
    /* Stats & Progress Bar */
    .stats-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    .stat-item {
      text-align: center;
      padding: 10px;
      border-left: 1px solid rgba(255, 255, 255, 0.05);
    }
    .stat-item:last-child { border-left: none; }
    .stat-num {
      font-size: 28px;
      font-weight: 700;
      font-family: 'IBM Plex Mono', monospace;
      color: var(--gold);
    }
    .stat-label {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .progress-bar-wrap {
      grid-column: 1 / -1;
      margin-top: 8px;
    }
    .progress-track {
      height: 8px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--gold), #10b981);
      width: 0%;
      transition: width 0.3s ease;
    }

    /* Filters & Search */
    .controls-wrap {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }
    .search-box {
      width: 100%;
      position: relative;
    }
    .search-input {
      width: 100%;
      background: rgba(18, 24, 38, 0.95);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 44px 14px 16px;
      color: #fff;
      font-size: 15px;
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
    }
    .search-input:focus {
      border-color: var(--gold);
      box-shadow: 0 0 15px var(--gold-glow);
    }
    .search-icon {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      font-size: 18px;
      pointer-events: none;
    }
    .category-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 8px 16px;
      border-radius: 9999px;
      font-size: 13px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s ease;
    }
    .pill-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    .pill-btn.active {
      background: var(--gold);
      color: #000;
      border-color: var(--gold);
      font-weight: 600;
    }

    /* Lead Cards Grid */
    .leads-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 18px;
    }
    .lead-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.2s ease;
      position: relative;
    }
    .lead-card:hover {
      border-color: rgba(245, 158, 11, 0.4);
      transform: translateY(-2px);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.4);
    }
    .lead-card.sent {
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(16, 185, 129, 0.04);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 12px;
    }
    .lead-name {
      font-size: 17px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .lead-id {
      font-size: 12px;
      font-family: 'IBM Plex Mono', monospace;
      background: rgba(255, 255, 255, 0.08);
      padding: 2px 6px;
      border-radius: 6px;
      color: var(--text-dim);
    }
    .lead-title {
      font-size: 13px;
      color: var(--gold);
      margin-top: 2px;
    }
    .lead-company {
      font-size: 14px;
      font-weight: 600;
      color: #cbd5e1;
      margin-top: 4px;
    }
    .category-tag {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: #93c5fd;
      white-space: nowrap;
    }
    .card-body {
      margin: 12px 0 16px;
      flex-grow: 1;
    }
    .lead-email-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 8px 12px;
      margin-bottom: 10px;
    }
    .email-text {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 13px;
      color: #e2e8f0;
      direction: ltr;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .angle-text {
      font-size: 12.5px;
      color: var(--text-muted);
      line-height: 1.5;
      background: rgba(255, 255, 255, 0.02);
      border-left: 2px solid var(--gold);
      padding: 6px 10px;
      border-radius: 0 6px 6px 0;
    }
    
    /* Action Buttons */
    .card-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
    .btn-row-primary {
      display: flex;
      gap: 8px;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 9px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      border: none;
    }
    .btn-gmail {
      background: linear-gradient(135deg, #ea4335, #c5221f);
      color: #fff;
      flex: 1.2;
    }
    .btn-gmail:hover {
      box-shadow: 0 4px 12px rgba(234, 67, 53, 0.35);
      filter: brightness(1.1);
    }
    .btn-mail {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      flex: 1;
    }
    .btn-mail:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .btn-copy {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      font-size: 11.5px;
      padding: 6px 10px;
    }
    .btn-copy:hover {
      color: #fff;
      border-color: rgba(255, 255, 255, 0.25);
    }
    
    .status-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .checkbox-wrap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .checkbox-wrap input {
      accent-color: var(--green);
      cursor: pointer;
      width: 16px;
      height: 16px;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #10b981;
      color: #000;
      font-weight: 600;
      padding: 10px 24px;
      border-radius: 9999px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      transition: transform 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      z-index: 1000;
      font-size: 14px;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
    }
  </style>
</head>
<body>

<div class="container">
  <header>
    <div class="badge-top">🚀 NIZALO M&A OUTREACH ENGINE</div>
    <h1>لوحة إرسال الإيميلات للمستثمرين وأصحاب القرار</h1>
    <p class="subtitle">200 جهة ومشتري مؤسسي جاهز للتواصل بنقرة واحدة مباشرة من متصفحك عبر Gmail أو تطبيق الإيميل.</p>
  </header>

  <!-- Stats & Progress -->
  <div class="stats-card">
    <div class="stat-item">
      <div class="stat-num" id="total-count">200</div>
      <div class="stat-label">إجمالي المشترين المؤهلين</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="sent-count" style="color: #10b981;">0</div>
      <div class="stat-label">تم الإرسال لهم بنجاح</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="remaining-count" style="color: #3b82f6;">200</div>
      <div class="stat-label">المتبقي للإرسال</div>
    </div>
    <div class="stat-item">
      <div class="stat-num" id="today-goal">20</div>
      <div class="stat-label">الهدف اليومي الموصى به</div>
    </div>
    <div class="progress-bar-wrap">
      <div class="progress-track">
        <div class="progress-fill" id="progress-fill"></div>
      </div>
    </div>
  </div>

  <!-- Search & Category Filters -->
  <div class="controls-wrap">
    <div class="search-box">
      <input type="text" id="search-input" class="search-input" placeholder="ابحث بالاسم، اسم الشركة، المنصب، أو الإيميل...">
      <span class="search-icon">🔍</span>
    </div>

    <div class="category-pills">
      <button class="pill-btn active" data-cat="all">الكل (200)</button>
      <button class="pill-btn" data-cat="iGaming B2B">مجمعات iGaming B2B (45)</button>
      <button class="pill-btn" data-cat="Skill Gaming">ألعاب المهارة والكاش (40)</button>
      <button class="pill-btn" data-cat="Crypto">الكريبتو وWeb3 وتيليجرام (40)</button>
      <button class="pill-btn" data-cat="MENA">الشرق الأوسط والناشرون (30)</button>
      <button class="pill-btn" data-cat="Esports">منصات الرياضات والبطولات (25)</button>
      <button class="pill-btn" data-cat="M&A">وسطاء M&A والاستثمار (20)</button>
    </div>
  </div>

  <!-- Leads Cards Grid -->
  <div class="leads-grid" id="leads-container">
    <!-- Populated by JavaScript -->
  </div>
</div>

<div class="toast" id="toast">تم النسخ بنجاح! ✓</div>

<script>
  const buyersData = ${buyersJson};
  const STORAGE_KEY = "nizalo_outreach_sent_v1";

  let sentSet = new Set();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) sentSet = new Set(JSON.parse(saved));
  } catch(e) {}

  let activeCategory = "all";
  let searchQuery = "";

  function getSubject() {
    return "Strategic Acquisition: 11-Engine P2P Skill Gaming Infrastructure (Nizalo)";
  }

  function getBody(b) {
    const firstName = b.name.split(" ")[0];
    return \`Hi \${firstName},

I’ve been following \${b.company}’s leadership in competitive gaming and platform solutions.

I am reaching out to introduce Nizalo (https://nizalo.com) — an institutional-grade, real-money P2P skill gaming platform engineered to deliver sustainable player liquidity with 0% house risk.

Asset Highlights:
• 11 In-House Game Engines: Chess Blitz (FIDE rules, millisecond validation), Backgammon / Tawla, Dominoes, Checkers, Speed Math, Connect Four + 5 casual games. 100% proprietary code with zero third-party licensing royalties.
• Anti-Cheat & Determinism: Cryptographic server-side dice, deterministic move replay, and automated collusion detection.
• Automated Fintech Rails: Multi-currency crypto cashier (USDT, BTC, ETH) with sub-60-second automated payouts and zero-trust double-entry ledger.
• 6-Language Native White-Label: Ready for turnkey deployment in under 48 hours.

Review Assets:
👉 Interactive Sandbox: https://demo.nizalo.com/b2b
👉 12-Slide Pitch Deck: https://demo.nizalo.com/pitch-deck.html
👉 Executive Teaser: https://demo.nizalo.com/teaser.html

We are currently reviewing divestment options: either a Full Source Code & IP Buyout ($500K) or a Turnkey White-Label License ($35K–$75K).

Would you be open to a 10-minute introductory call or reviewing our data room this week?

Best regards,
Hifzy Hifzy
Founder & Systems Architect | Nizalo
WhatsApp: +201069999557 (https://wa.me/201069999557)
Email: HHifzy@gmail.com\`;
  }

  function updateStats() {
    const total = buyersData.length;
    const sent = sentSet.size;
    const remaining = total - sent;
    document.getElementById("sent-count").textContent = sent;
    document.getElementById("remaining-count").textContent = remaining;
    const pct = Math.round((sent / total) * 100);
    document.getElementById("progress-fill").style.width = pct + "%";
  }

  function toggleSent(id) {
    if (sentSet.has(id)) {
      sentSet.delete(id);
    } else {
      sentSet.add(id);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(sentSet)));
    updateStats();
    renderCards();
  }

  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2000);
  }

  function copyText(txt, label) {
    navigator.clipboard.writeText(txt).then(() => {
      showToast(\`تم نسخ \${label} بنجاح! ✓\`);
    });
  }

  function renderCards() {
    const container = document.getElementById("leads-container");
    container.innerHTML = "";

    const filtered = buyersData.filter(b => {
      // Category filter
      if (activeCategory === "iGaming B2B" && !b.category.includes("iGaming") && !b.category.includes("Aggregator") && !b.category.includes("Turnkey")) return false;
      if (activeCategory === "Skill Gaming" && !b.category.includes("Skill") && !b.category.includes("Casual") && !b.category.includes("Social")) return false;
      if (activeCategory === "Crypto" && !b.category.includes("Crypto") && !b.category.includes("Web3") && !b.category.includes("Telegram") && !b.category.includes("Blockchain")) return false;
      if (activeCategory === "MENA" && !b.category.includes("MENA") && !b.category.includes("Middle East") && !b.category.includes("Saudi") && !b.category.includes("Arabic") && !b.category.includes("African") && !b.category.includes("Latin") && !b.category.includes("LATAM")) return false;
      if (activeCategory === "Esports" && !b.category.includes("Esports") && !b.category.includes("Tournament") && !b.category.includes("Collegiate")) return false;
      if (activeCategory === "M&A" && !b.category.includes("M&A") && !b.category.includes("Broker") && !b.category.includes("Venture") && !b.category.includes("Acquirer") && !b.category.includes("Fund") && !b.category.includes("Advisory")) return false;

      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = 
          b.name.toLowerCase().includes(q) ||
          b.company.toLowerCase().includes(q) ||
          b.title.toLowerCase().includes(q) ||
          b.email.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = \`<div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: var(--text-dim);">لا توجد نتائج مطابقة لبحثك.</div>\`;
      return;
    }

    filtered.forEach(b => {
      const isSent = sentSet.has(b.id);
      const subject = getSubject();
      const body = getBody(b);
      const gmailUrl = \`https://mail.google.com/mail/u/2/?view=cm&fs=1&to=\${encodeURIComponent(b.email)}&su=\${encodeURIComponent(subject)}&body=\${encodeURIComponent(body)}\`;
      const mailtoUrl = \`mailto:\${b.email}?subject=\${encodeURIComponent(subject)}&body=\${encodeURIComponent(body)}\`;

      const card = document.createElement("div");
      card.className = \`lead-card \${isSent ? 'sent' : ''}\`;
      card.innerHTML = \`
        <div>
          <div class="card-header">
            <div>
              <div class="lead-name">
                <span class="lead-id">#\${b.id}</span>
                <span>\${b.name}</span>
              </div>
              <div class="lead-title">\${b.title}</div>
              <div class="lead-company">🏢 \${b.company}</div>
            </div>
            <span class="category-tag">\${b.category}</span>
          </div>

          <div class="card-body">
            <div class="lead-email-row">
              <span class="email-text">\${b.email}</span>
              <button class="btn-action btn-copy" onclick="copyText('\${b.email}', 'الإيميل')">نسخ</button>
            </div>
            <div class="angle-text">💡 <strong>زاوية الشراء:</strong> \${b.angle}</div>
          </div>
        </div>

        <div class="card-actions">
          <div class="btn-row-primary">
            <a href="\${gmailUrl}" target="_blank" rel="noopener noreferrer" class="btn-action btn-gmail" onclick="markSentAutomated(\${b.id})">
              🚀 فتح في Gmail
            </a>
            <a href="\${mailtoUrl}" class="btn-action btn-mail" onclick="markSentAutomated(\${b.id})">
              📧 تطبيق الإيميل
            </a>
          </div>

          <div class="btn-row-primary" style="margin-top: 4px;">
            <button class="btn-action btn-copy" style="flex: 1;" onclick="copyFullPitch(\${b.id})">
              📋 نسخ نص الرسالة بالكامل
            </button>
          </div>

          <div class="status-toggle">
            <label class="checkbox-wrap">
              <input type="checkbox" \${isSent ? 'checked' : ''} onchange="toggleSent(\${b.id})">
              <span>\${isSent ? 'تم الإرسال ✓' : 'وضع علامة تم الإرسال'}</span>
            </label>
            <a href="https://\${b.domain}" target="_blank" rel="noopener noreferrer" style="color: var(--text-dim); text-decoration: none; font-size: 11.5px;">
              🌐 \${b.domain} ↗
            </a>
          </div>
        </div>
      \`;
      container.appendChild(card);
    });
  }

  function markSentAutomated(id) {
    sentSet.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(sentSet)));
    updateStats();
    setTimeout(renderCards, 500);
  }

  function copyFullPitch(id) {
    const b = buyersData.find(x => x.id === id);
    if (!b) return;
    const body = getBody(b);
    copyText(body, \`رسالة \${b.name}\`);
  }

  // Event Listeners
  document.getElementById("search-input").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    renderCards();
  });

  document.querySelectorAll(".pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pill-btn").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.getAttribute("data-cat");
      renderCards();
    });
  });

  // Init
  updateStats();
  renderCards();
</script>
</body>
</html>`;
}

const html = generateHTML();
fs.writeFileSync('deliverables/outreach_dashboard.html', html);
console.log('Successfully generated deliverables/outreach_dashboard.html');
