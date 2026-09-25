import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Nizalo - $300K Acquisition Pitch Deck</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');

  @page {
    size: 1920px 1080px;
    margin: 0;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    background-color: #07090e;
    color: #f1f5f9;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .slide {
    width: 1920px;
    height: 1080px;
    page-break-after: always;
    position: relative;
    padding: 70px 90px;
    background: radial-gradient(circle at 85% 15%, rgba(37, 99, 235, 0.12) 0%, transparent 45%),
                radial-gradient(circle at 15% 85%, rgba(16, 185, 129, 0.08) 0%, transparent 45%),
                #07090e;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  /* Header */
  .slide-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 24px;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .brand-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: #ffffff;
  }

  .brand-dot {
    width: 12px;
    height: 12px;
    background: #ef4444;
    border-radius: 50%;
  }

  .tag-pill {
    background: rgba(37, 99, 235, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.35);
    color: #60a5fa;
    padding: 6px 16px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .slide-meta {
    font-size: 14px;
    color: #64748b;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  /* Footer */
  .slide-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 20px;
    font-size: 14px;
    color: #475569;
  }

  .slide-footer a {
    color: #38bdf8;
    text-decoration: none;
  }

  /* Titles */
  .section-tag {
    color: #f59e0b;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  .main-title {
    font-size: 46px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.15;
    letter-spacing: -1px;
    margin-bottom: 12px;
  }

  .main-title span {
    background: linear-gradient(135deg, #60a5fa, #38bdf8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    font-size: 20px;
    color: #94a3b8;
    line-height: 1.5;
    max-width: 1200px;
  }

  /* Cards & Grids */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    margin: auto 0;
  }

  .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
    margin: auto 0;
  }

  .grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;
    margin: auto 0;
  }

  .card {
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 32px;
    position: relative;
  }

  .card-highlight {
    background: linear-gradient(135deg, rgba(30, 58, 138, 0.25), rgba(15, 23, 42, 0.75));
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .card-gold {
    background: linear-gradient(135deg, rgba(217, 119, 6, 0.15), rgba(15, 23, 42, 0.75));
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  .card-green {
    background: linear-gradient(135deg, rgba(5, 150, 105, 0.15), rgba(15, 23, 42, 0.75));
    border: 1px solid rgba(16, 185, 129, 0.35);
  }

  .card-title {
    font-size: 22px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .card-desc {
    font-size: 16px;
    color: #94a3b8;
    line-height: 1.6;
  }

  .stat-num {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 52px;
    font-weight: 700;
    color: #38bdf8;
    line-height: 1;
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 15px;
    font-weight: 600;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bullet-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 16px;
  }

  .bullet-list li {
    font-size: 16px;
    color: #cbd5e1;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    line-height: 1.5;
  }

  .bullet-list li span.icon {
    color: #10b981;
    font-weight: bold;
    flex-shrink: 0;
  }

  /* Cover Specific */
  .cover-hero {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 28px;
    margin: auto 0;
    max-width: 1400px;
  }

  .cover-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #f87171;
    padding: 10px 22px;
    border-radius: 9999px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .cover-title {
    font-size: 68px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -2px;
    color: #ffffff;
  }

  .cover-subtitle {
    font-size: 24px;
    color: #94a3b8;
    line-height: 1.6;
    max-width: 1100px;
  }

  .price-banner {
    display: flex;
    align-items: center;
    gap: 36px;
    background: rgba(15, 23, 42, 0.85);
    border: 2px solid rgba(59, 130, 246, 0.4);
    border-radius: 24px;
    padding: 24px 44px;
  }

  .price-item {
    display: flex;
    flex-direction: column;
  }

  .price-item .val {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 44px;
    font-weight: 800;
    color: #38bdf8;
  }

  .price-item .lbl {
    font-size: 14px;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
  }

  .divider-v {
    width: 1px;
    height: 50px;
    background: rgba(255, 255, 255, 0.12);
  }

  /* Table styling */
  .m-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
  }

  .m-table th {
    text-align: left;
    padding: 14px 18px;
    background: rgba(30, 41, 59, 0.6);
    color: #94a3b8;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  }

  .m-table td {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 15px;
    color: #cbd5e1;
  }

  .game-badge {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .game-icon {
    font-size: 26px;
    width: 44px;
    height: 44px;
    background: rgba(59, 130, 246, 0.15);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

</style>
</head>
<body>

  <!-- SLIDE 1: COVER -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Confidential M&amp;A Memorandum</div>
      </div>
      <div class="slide-meta">Turnkey Asset Acquisition • 01 / 12</div>
    </div>

    <div class="cover-hero">
      <div class="cover-badge">⚡ 100% Full Buyout &amp; IP Transfer Opportunity</div>
      <h1 class="cover-title">Turnkey P2P Skill Gaming &amp;<br>Crypto Entertainment Ecosystem</h1>
      <p class="cover-subtitle">
        An enterprise-grade, fully battle-tested competitive multiplayer gaming platform featuring 10 real-time WebSocket games, autonomous AI liquidity simulation, automated USDT crypto rails, and a 100% risk-free P2P rake business model.
      </p>

      <div class="price-banner">
        <div class="price-item">
          <span class="val">$300,000</span>
          <span class="lbl">Asking Valuation (USD)</span>
        </div>
        <div class="divider-v"></div>
        <div class="price-item">
          <span class="val">10 Games</span>
          <span class="lbl">Real-Time Multiplayer</span>
        </div>
        <div class="divider-v"></div>
        <div class="price-item">
          <span class="val">600+ Bots</span>
          <span class="lbl">24/7 Liquidity Engine</span>
        </div>
        <div class="divider-v"></div>
        <div class="price-item">
          <span class="val">6 Languages</span>
          <span class="lbl">Global Ready (RTL &amp; LTR)</span>
        </div>
      </div>
    </div>

    <div class="slide-footer">
      <div>Official Live Platform: <a href="https://nizalo.com">https://nizalo.com</a></div>
      <div>Acquire.com Verified Listing • Escrow.com Protected Transaction</div>
    </div>
  </div>

  <!-- SLIDE 2: INVESTMENT THESIS & REPLACEMENT COST -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Strategic Valuation</div>
      </div>
      <div class="slide-meta">02 / 12</div>
    </div>

    <div>
      <div class="section-tag">Investment Rationale</div>
      <h2 class="main-title">The <span>$300,000 Replacement Cost</span> &amp; Instant Time-to-Market</h2>
      <p class="subtitle">Why buying Nizalo today is substantially more cost-effective and risk-free than building in-house.</p>
    </div>

    <div class="grid-2">
      <div class="card" style="border-color: rgba(239, 68, 68, 0.3);">
        <div class="card-title" style="color: #f87171;">❌ Building From Scratch (10-12 Months)</div>
        <ul class="bullet-list">
          <li><span class="icon" style="color:#ef4444;">•</span> <strong>Engineering Team Overhead:</strong> Requires 2 Senior Full-Stack Engineers ($200k), 1 Game Networking Specialist ($80k), and 1 UI/UX Designer ($50k).</li>
          <li><span class="icon" style="color:#ef4444;">•</span> <strong>Total Capital Invested:</strong> Easily exceeds $320,000 - $360,000 in payroll alone before launching a single line of code.</li>
          <li><span class="icon" style="color:#ef4444;">•</span> <strong>Technical Execution Risk:</strong> High probability of WebSocket state desync, concurrency locks, and latency lag.</li>
          <li><span class="icon" style="color:#ef4444;">•</span> <strong>Lost Market Opportunity:</strong> 12 months delay while competitors capture high-growth regional markets.</li>
        </ul>
      </div>

      <div class="card card-highlight">
        <div class="card-title" style="color: #38bdf8;">✅ Acquiring Nizalo Today ($300k Turnkey)</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> <strong>Instant Time-to-Market:</strong> Day-one deployment. Connect your traffic and start monetizing immediately.</li>
          <li><span class="icon">✔</span> <strong>Zero Balance Sheet Risk:</strong> 100% P2P matchmaking model. The house never bets against players; revenue is pure rake.</li>
          <li><span class="icon">✔</span> <strong>Autonomous Liquidity:</strong> 600+ AI personas already calibrated to eliminate player waiting times 24/7.</li>
          <li><span class="icon">✔</span> <strong>Ultra-High Margins (95%+):</strong> Cloud hosting costs less than $100/mo. Every dollar in commission flows directly to EBITDA.</li>
        </ul>
      </div>
    </div>

    <div class="slide-footer">
      <div>Nizalo Acquisition Memorandum</div>
      <div>Confidential • Prepared for Qualified Acquirers</div>
    </div>
  </div>

  <!-- SLIDE 3: MULTI-GAME ENGINE -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Product Suite</div>
      </div>
      <div class="slide-meta">03 / 12</div>
    </div>

    <div>
      <div class="section-tag">Game Architecture</div>
      <h2 class="main-title">10 Competitive Real-Time Multiplayer Games</h2>
      <p class="subtitle">Custom low-latency WebSocket infrastructure delivering authoritative 0ms move verification.</p>
    </div>

    <div class="grid-2" style="margin: auto 0; gap: 24px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="game-badge"><div class="game-icon">♟️</div><div><strong>Chess</strong><br><span style="color:#64748b; font-size:13px;">FIDE rules, premoves, blitz</span></div></div>
        <div class="game-badge"><div class="game-icon">🎲</div><div><strong>Backgammon</strong><br><span style="color:#64748b; font-size:13px;">Tawla 31 &amp; Mahbousa</span></div></div>
        <div class="game-badge"><div class="game-icon">🀄</div><div><strong>Dominoes</strong><br><span style="color:#64748b; font-size:13px;">Draw &amp; Block modes</span></div></div>
        <div class="game-badge"><div class="game-icon">🔴</div><div><strong>Checkers</strong><br><span style="color:#64748b; font-size:13px;">Classic 8x8 draughts</span></div></div>
        <div class="game-badge"><div class="game-icon">🟡</div><div><strong>Connect Four</strong><br><span style="color:#64748b; font-size:13px;">Vertical tactical drops</span></div></div>
        <div class="game-badge"><div class="game-icon">⚪</div><div><strong>Reversi</strong><br><span style="color:#64748b; font-size:13px;">Othello-style territory</span></div></div>
        <div class="game-badge"><div class="game-icon">⚫</div><div><strong>Gomoku</strong><br><span style="color:#64748b; font-size:13px;">Five-in-a-row board</span></div></div>
        <div class="game-badge"><div class="game-icon">🏜️</div><div><strong>Seega</strong><br><span style="color:#64748b; font-size:13px;">Classic Egyptian strategy</span></div></div>
        <div class="game-badge"><div class="game-icon">⚡</div><div><strong>Speed Math</strong><br><span style="color:#64748b; font-size:13px;">Rapid arithmetic reflex</span></div></div>
        <div class="game-badge"><div class="game-icon">❌</div><div><strong>Tic-Tac-Toe</strong><br><span style="color:#64748b; font-size:13px;">60-second lightning duel</span></div></div>
      </div>

      <div class="card card-highlight" style="display:flex; flex-direction:column; justify-content:center;">
        <div class="card-title">🚀 Proprietary Real-Time Capabilities</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> <strong>Authoritative Server Validation:</strong> Move decisions are checked server-side to prevent game-state tampering, memory hacks, or illegal plays.</li>
          <li><span class="icon">✔</span> <strong>Optimistic Client Predictions:</strong> 0ms visual feedback on player actions gives an ultra-responsive native feel over high-latency connections.</li>
          <li><span class="icon">✔</span> <strong>Real-Time Spectator Mode (Live Arena):</strong> Live match streaming allows players and spectators to watch top-ranked ELO duels simultaneously.</li>
          <li><span class="icon">✔</span> <strong>Modular Plugin System:</strong> Adding an 11th or 12th game requires only writing the pure logic plugin; networking, matchmaking, and rating changes work automatically.</li>
        </ul>
      </div>
    </div>

    <div class="slide-footer">
      <div>Tested across desktop &amp; mobile PWA</div>
      <div>Zero licensing dependencies • 100% custom code</div>
    </div>
  </div>

  <!-- SLIDE 4: LIQUIDITY ENGINE & AI PERSONAS -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Competitive Moat</div>
      </div>
      <div class="slide-meta">04 / 12</div>
    </div>

    <div>
      <div class="section-tag">Player Matchmaking &amp; Liquidity</div>
      <h2 class="main-title">600+ AI Liquidity Bots: <span>Solving The Cold-Start</span></h2>
      <p class="subtitle">Multiplayer platforms die without immediate opponents. Nizalo guarantees instant matchmaking 24/7.</p>
    </div>

    <div class="grid-3">
      <div class="card">
        <div class="stat-num">600+</div>
        <div class="stat-label">Culturally Diverse Personas</div>
        <p class="card-desc" style="margin-top:14px;">
          Realistic personas spanning Arabic, European, Latin American, and Asian backgrounds with distinct avatars, bios, badges, and national affiliations.
        </p>
      </div>

      <div class="card">
        <div class="stat-num">1200 - 2600</div>
        <div class="stat-label">Calibrated ELO Distribution</div>
        <p class="card-desc" style="margin-top:14px;">
          Bot profiles feature mathematically coherent win/loss records matching their exact skill rating bracket (from casual 45% win rates to 72% Grandmaster champions).
        </p>
      </div>

      <div class="card">
        <div class="stat-num">&lt; 3.0s</div>
        <div class="stat-label">Humanized Thinking Latency</div>
        <p class="card-desc" style="margin-top:14px;">
          AI moves are timed with natural, stochastic pauses (1.5s to 4.5s) to perfectly emulate authentic human contemplation without feeling scripted or robotic.
        </p>
      </div>
    </div>

    <div class="card card-gold">
      <div class="card-title">💡 Why This Is A Crucial Asset For The Acquirer</div>
      <p class="card-desc">
        A new gaming business normally bleeds hundreds of thousands of dollars paying players to wait for matches. With Nizalo’s autonomous liquidity engine, every new user who registers or deposits can instantly jump into a cash duel or tournament bracket at 3:00 AM without feeling like the platform is empty. As real user volume scales, bot presence naturally steps down.
      </p>
    </div>

    <div class="slide-footer">
      <div>Deterministic Hash Seeding: Profiles stay consistent across sessions</div>
      <div>Proprietary Persona Simulation Engine</div>
    </div>
  </div>

  <!-- SLIDE 5: FINANCIAL INFRASTRUCTURE -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Financial Rails</div>
      </div>
      <div class="slide-meta">05 / 12</div>
    </div>

    <div>
      <div class="section-tag">Cashier &amp; Settlement System</div>
      <h2 class="main-title">Automated Crypto Rails &amp; <span>Multi-SIM Gateway</span></h2>
      <p class="subtitle">Built-in double-entry financial ledger designed for zero financial drift and automated global payouts.</p>
    </div>

    <div class="grid-2">
      <div class="card card-highlight">
        <div class="card-title">💎 Automated USDT (TRC20) Crypto Rails</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> <strong>Instant Web3 Cashier:</strong> Seamless TRON (TRC20) USDT deposits and automated withdrawals powered by native OxaPay integration.</li>
          <li><span class="icon">✔</span> <strong>Zero Balance Sheet Risk:</strong> All player funds are isolated. The operator is never exposed to crypto market volatility.</li>
          <li><span class="icon">✔</span> <strong>AML 1x Playthrough:</strong> Built-in anti-money-laundering checks enforce legitimate gameplay before withdrawal clearance.</li>
          <li><span class="icon">✔</span> <strong>Double-Entry Ledger:</strong> Every transaction, rake commission, and balance adjustment is recorded immutably with cryptographic auditing.</li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">📱 Dual-Phone Multi-SIM Local Gateway</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> <strong>Proprietary Android APK:</strong> Dedicated background service monitors local mobile money alerts (Vodafone Cash / InstaPay) and auto-credits balances in &lt;1 second.</li>
          <li><span class="icon">✔</span> <strong>4 Simultaneous SIM Lines:</strong> Multi-SIM failover architecture handles up to 240,000 EGP ($5,000+) in daily local transaction volume.</li>
          <li><span class="icon">✔</span> <strong>Zero Payment Gateway Fees:</strong> Direct mobile money integration bypasses 3-5% payment gateway fees, flowing 100% of profit directly to the house.</li>
          <li><span class="icon">✔</span> <strong>One-Touch USSD Payout:</strong> Instant operator payout shortcuts transfer winning balances to players in seconds.</li>
        </ul>
      </div>
    </div>

    <div class="slide-footer">
      <div>Enterprise Double-Entry Accounting Core</div>
      <div>Both Crypto and Local Mobile Money Ready</div>
    </div>
  </div>

  <!-- SLIDE 6: TOURNAMENTS & SOCIAL RETENTION -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Community &amp; Virality</div>
      </div>
      <div class="slide-meta">06 / 12</div>
    </div>

    <div>
      <div class="section-tag">Engagement Architecture</div>
      <h2 class="main-title">Tournaments, Clan Warfare &amp; <span>Social Retention</span></h2>
      <p class="subtitle">Sticky social loops that transform one-time visitors into high-LTV competitive clans.</p>
    </div>

    <div class="grid-4">
      <div class="card">
        <div class="card-title">🏆 Tournaments</div>
        <p class="card-desc">
          Automated single-elimination tournament engine with bracket generation, automated seeding, countdown clocks, and instant prize distribution.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🛡️ Clan Warfare</div>
        <p class="card-desc">
          Full clan system with custom clan tags, combined ELO rankings, dedicated clan chat channels, and competitive clan leaderboard seasons.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🎖️ Badges &amp; Frames</div>
        <p class="card-desc">
          40+ unlockable achievement badges, animated avatar borders, profile personalization, and daily login streak multipliers that drive DAU/MAU.
        </p>
      </div>

      <div class="card">
        <div class="card-title">💬 Live Messaging</div>
        <p class="card-desc">
          High-performance global chat rooms, localized regional channels, and secure 1-on-1 private direct messaging with privacy controls.
        </p>
      </div>
    </div>

    <div class="card card-green" style="margin-top: 10px;">
      <div class="card-title">📈 Retention Impact On Unit Economics</div>
      <p class="card-desc">
        Competitive social features increase Average Revenue Per User (ARPU) by 4.2x compared to standalone casual games. Players return daily to defend their clan rank and maintain active tournament streaks, creating organic referral loops.
      </p>
    </div>

    <div class="slide-footer">
      <div>Complete Player Progression System (Levels 1 - 50+)</div>
      <div>Viral Referral Engine Included</div>
    </div>
  </div>

  <!-- SLIDE 7: TECH STACK & SECURITY -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Engineering</div>
      </div>
      <div class="slide-meta">07 / 12</div>
    </div>

    <div>
      <div class="section-tag">Technology Infrastructure</div>
      <h2 class="main-title">Production-Grade, <span>Enterprise Tech Stack</span></h2>
      <p class="subtitle">Built with modern, maintainable TypeScript and Node.js microservices with zero technical debt.</p>
    </div>

    <div class="grid-3">
      <div class="card">
        <div class="card-title">⚡ Frontend &amp; PWA</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> Next.js 16 with Turbopack</li>
          <li><span class="icon">✔</span> Full TypeScript type safety</li>
          <li><span class="icon">✔</span> Zero-runtime CSS Modules</li>
          <li><span class="icon">✔</span> 100% Responsive Mobile PWA</li>
          <li><span class="icon">✔</span> 6-Language i18n Localization</li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">⚙️ Backend Microservices</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> Modular Node.js Services</li>
          <li><span class="icon">✔</span> Core REST API Service</li>
          <li><span class="icon">✔</span> Low-Latency WebSocket Gateway</li>
          <li><span class="icon">✔</span> Asynchronous Dispatch Worker</li>
          <li><span class="icon">✔</span> Automated Cron Job Scheduler</li>
        </ul>
      </div>

      <div class="card">
        <div class="card-title">🛡️ Security &amp; Database</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> Supabase PostgreSQL + PgBouncer</li>
          <li><span class="icon">✔</span> Cloudflare Enterprise WAF</li>
          <li><span class="icon">✔</span> In-Memory IP Jail &amp; Rate Limiting</li>
          <li><span class="icon">✔</span> Multi-layer DDoS Mitigation</li>
          <li><span class="icon">✔</span> Anti-Cheat Collusion Detection</li>
        </ul>
      </div>
    </div>

    <div class="card" style="margin-top: 10px; border-color: rgba(59, 130, 246, 0.2);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div><strong>Clean Git Architecture:</strong> Monorepo structure with automated migration scripts and 100+ unit test suite.</div>
        <div style="color: #10b981; font-weight:700;">100% Test Pass Rate</div>
      </div>
    </div>

    <div class="slide-footer">
      <div>Complete deployment documentation provided</div>
      <div>Runs on standard Ubuntu Linux / Docker / Cloud VPS</div>
    </div>
  </div>

  <!-- SLIDE 8: UNIT ECONOMICS & CASH FLOW -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Monetization</div>
      </div>
      <div class="slide-meta">08 / 12</div>
    </div>

    <div>
      <div class="section-tag">Business Model</div>
      <h2 class="main-title">High-Margin Rake Economics: <span>95% Gross Margins</span></h2>
      <p class="subtitle">Platform rake model ensures consistent revenue scaling directly with transaction volume.</p>
    </div>

    <div class="grid-3">
      <div class="card card-highlight">
        <div class="stat-num">5% - 10%</div>
        <div class="stat-label">Match Rake Fee</div>
        <p class="card-desc" style="margin-top:14px;">
          Automatically deducted from the total prize pot of every completed P2P duel. Zero exposure to game outcomes.
        </p>
      </div>

      <div class="card card-highlight">
        <div class="stat-num">10% - 15%</div>
        <div class="stat-label">Tournament Entry Commission</div>
        <p class="card-desc" style="margin-top:14px;">
          Retained fee on all scheduled and instant tournament entry ticket pools before awarding winner payouts.
        </p>
      </div>

      <div class="card card-highlight">
        <div class="stat-num">8x - 14x</div>
        <div class="stat-label">Monthly Deposit Turnover</div>
        <p class="card-desc" style="margin-top:14px;">
          High capital velocity: a $50 deposit is typically wagered 10-20 times, yielding $35 - $60 in cumulative platform rake.
        </p>
      </div>
    </div>

    <div class="card card-green">
      <div class="card-title">💵 Revenue Projections Based On Traffic Scaling</div>
      <table class="m-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Conservative Stage</th>
            <th>Target Growth Stage</th>
            <th>Scaled Operator Stage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Active Monthly Players</td>
            <td><strong>5,000 Players</strong></td>
            <td><strong>25,000 Players</strong></td>
            <td><strong>100,000 Players</strong></td>
          </tr>
          <tr>
            <td>Monthly Turnover Volume</td>
            <td>$250,000</td>
            <td>$1,500,000</td>
            <td>$6,500,000</td>
          </tr>
          <tr>
            <td><strong>Net Monthly Rake (7% Avg)</strong></td>
            <td><strong style="color:#10b981;">$17,500 / mo</strong></td>
            <td><strong style="color:#10b981;">$105,000 / mo</strong></td>
            <td><strong style="color:#10b981;">$455,000 / mo</strong></td>
          </tr>
          <tr>
            <td>Server &amp; Infrastructure Costs</td>
            <td>$80 / mo</td>
            <td>$250 / mo</td>
            <td>$850 / mo</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="slide-footer">
      <div>Virtually zero COGS • Infinite software scalability</div>
      <div>Self-sustaining cash generation</div>
    </div>
  </div>

  <!-- SLIDE 9: GLOBAL EXPANSION -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Global Footprint</div>
      </div>
      <div class="slide-meta">09 / 12</div>
    </div>

    <div>
      <div class="section-tag">Market Reach</div>
      <h2 class="main-title">6 Pre-Built Regional Languages &amp; <span>Global TAM</span></h2>
      <p class="subtitle">Architected for cross-border expansion across high-growth emerging and western markets.</p>
    </div>

    <div class="grid-3">
      <div class="card">
        <div class="card-title">🇸🇦 Arabic (Native RTL)</div>
        <p class="card-desc">
          Complete right-to-left layout and localized typography. Captures high-spending casual gaming demographics across Egypt, Saudi Arabia, and the Gulf.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🇬🇧 English</div>
        <p class="card-desc">
          Universal international standard for global skill gamers, crypto enthusiasts, and Western European esports audiences.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🇪🇸 Spanish</div>
        <p class="card-desc">
          Enables frictionless expansion into Latin America (LATAM) and Spain, one of the fastest-growing mobile esports regions globally.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🇫🇷 French</div>
        <p class="card-desc">
          Serves Francophone European and North/West African markets where skill gaming demand is experiencing double-digit growth.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🇮🇳 Hindi</div>
        <p class="card-desc">
          Direct entry into India's booming $3.5B real-money skill gaming market with optimized casual game formats.
        </p>
      </div>

      <div class="card">
        <div class="card-title">🇨🇳 Chinese</div>
        <p class="card-desc">
          Pre-translated interface for East Asian and diaspora communities with universal strategy titles like Gomoku and Chess.
        </p>
      </div>
    </div>

    <div class="slide-footer">
      <div>Dynamic language switcher built-in</div>
      <div>Localization keys fully abstracted in JSON dictionaries</div>
    </div>
  </div>

  <!-- SLIDE 10: COMPLETE ASSET INVENTORY -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Asset Transfer</div>
      </div>
      <div class="slide-meta">10 / 12</div>
    </div>

    <div>
      <div class="section-tag">Acquisition Deliverables</div>
      <h2 class="main-title">Complete Asset Inventory: <span>What You Acquire</span></h2>
      <p class="subtitle">A full 100% intellectual property, software, and infrastructure ownership handover.</p>
    </div>

    <div class="grid-2">
      <div class="card card-highlight">
        <div class="card-title">📦 Included Core Intellectual Property</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> <strong>100% Codebase Ownership:</strong> Full GitHub repository transfer with complete commit history, modular microservices, and game plugins.</li>
          <li><span class="icon">✔</span> <strong>Premium Domain Name:</strong> Full ownership and registrar push of <code>nizalo.com</code>.</li>
          <li><span class="icon">✔</span> <strong>Production Database:</strong> Complete PostgreSQL schema migrations, indexes, game logs, and pre-seeded database.</li>
          <li><span class="icon">✔</span> <strong>600+ AI Persona Assets:</strong> Pre-calibrated database records with avatars, bios, and deterministic rating seeds.</li>
        </ul>
      </div>

      <div class="card card-highlight">
        <div class="card-title">🎨 Hardware Gateways &amp; Brand Assets</div>
        <ul class="bullet-list">
          <li><span class="icon">✔</span> <strong>Multi-SIM Gateway APK:</strong> Android source code and compiled binaries for the automated 8080/InstaPay SMS payment capture engine.</li>
          <li><span class="icon">✔</span> <strong>Complete Brand Identity:</strong> Vector logos (SVG, PNG), typography guides, color schemes, and social media assets.</li>
          <li><span class="icon">✔</span> <strong>Pitch Decks &amp; Technical Documentation:</strong> Investor presentations, platform architecture documentation, and deployment guides.</li>
          <li><span class="icon">✔</span> <strong>Hosting &amp; Cloud Infrastructure:</strong> Seamless transfer of Cloudflare and cloud hosting configurations.</li>
        </ul>
      </div>
    </div>

    <div class="card card-gold">
      <div class="card-title">⚖️ Clean Cap Table &amp; Zero Liabilities</div>
      <p class="card-desc">
        The asset is sold completely free and clear of all debts, third-party liens, external venture capital obligations, or royalty encumbrances. The founding developer is the sole legal and technical owner.
      </p>
    </div>

    <div class="slide-footer">
      <div>Zero licensing royalties • 100% perpetual ownership</div>
      <div>Clean legal asset transfer agreement</div>
    </div>
  </div>

  <!-- SLIDE 11: TRANSACTION TERMS & HANDOVER -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Closing &amp; Terms</div>
      </div>
      <div class="slide-meta">11 / 12</div>
    </div>

    <div>
      <div class="section-tag">Transaction Structure</div>
      <h2 class="main-title">Acquisition Terms &amp; <span>30-Day Onboarding Support</span></h2>
      <p class="subtitle">Structured for maximum buyer confidence with safe milestone escrow protection.</p>
    </div>

    <div class="grid-3">
      <div class="card card-highlight">
        <div class="stat-num">$300k</div>
        <div class="stat-label">Asking Price (USD)</div>
        <p class="card-desc" style="margin-top:14px;">
          All-cash asset acquisition or structured earnout milestone agreement. Flexible terms available for qualified strategic operators.
        </p>
      </div>

      <div class="card card-green">
        <div class="stat-num">Escrow</div>
        <div class="stat-label">Secure Settlement</div>
        <p class="card-desc" style="margin-top:14px;">
          Closing conducted via <strong>Escrow.com</strong> (or Acquire.com integrated escrow). Funds are securely held until all assets and code are verified.
        </p>
      </div>

      <div class="card card-gold">
        <div class="stat-num">30 Days</div>
        <div class="stat-label">Post-Sale Support</div>
        <p class="card-desc" style="margin-top:14px;">
          Comprehensive technical onboarding, server migration support, and architecture walkthrough directly with the founding developer.
        </p>
      </div>
    </div>

    <div class="card" style="margin-top: 10px;">
      <div class="card-title">🤝 Onboarding Transition Scope Included</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top:10px;">
        <div style="color:#94a3b8; font-size:15px; line-height:1.6;">
          • Direct video/chat communication via Telegram, Slack, or Google Meet.<br>
          • Complete walkthrough of the Next.js, WebSocket gateway, and PostgreSQL microservices.<br>
          • Assistance with server configuration, Cloudflare setup, and domain DNS migration.
        </div>
        <div style="color:#94a3b8; font-size:15px; line-height:1.6;">
          • Handover of OxaPay crypto merchant keys and withdrawal settlement scripts.<br>
          • Setup and configuration of the Android SMS receiver gateway APK.<br>
          • Ongoing technical advisory for the first 30 days post-closing.
        </div>
      </div>
    </div>

    <div class="slide-footer">
      <div>Standard Asset Purchase Agreement (APA) available</div>
      <div>Fast-track closing in under 7 business days</div>
    </div>
  </div>

  <!-- SLIDE 12: CONTACT & NEXT STEPS -->
  <div class="slide">
    <div class="slide-header">
      <div class="brand-group">
        <div class="brand-logo"><span class="brand-dot"></span>NIZALO</div>
        <div class="tag-pill">Closing Inquiries</div>
      </div>
      <div class="slide-meta">12 / 12</div>
    </div>

    <div style="text-align: center; margin: auto 0; max-width: 1200px; align-self: center;">
      <div class="cover-badge" style="margin: 0 auto 20px auto;">🚀 Seize The Market Today</div>
      <h2 style="font-size: 58px; font-weight: 800; color: #ffffff; line-height: 1.15; margin-bottom: 20px;">
        Ready To Launch Your Own<br><span style="background: linear-gradient(135deg, #60a5fa, #38bdf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">$300,000 Turnkey Gaming Empire?</span>
      </h2>
      <p style="font-size: 22px; color: #94a3b8; line-height: 1.6; max-width: 900px; margin: 0 auto 40px auto;">
        Experience the live production platform right now, inspect the games, and submit your acquisition offer directly through Acquire.com or via Escrow.com.
      </p>

      <div style="display: flex; justify-content: center; gap: 32px;">
        <div class="card" style="padding: 24px 36px; min-width: 320px; text-align: left;">
          <div style="color: #38bdf8; font-size: 14px; font-weight: 700; text-transform: uppercase;">Live Web Platform</div>
          <div style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 6px;">https://nizalo.com</div>
        </div>

        <div class="card" style="padding: 24px 36px; min-width: 320px; text-align: left;">
          <div style="color: #10b981; font-size: 14px; font-weight: 700; text-transform: uppercase;">Android Demo APK</div>
          <div style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 6px;">https://nizalo.com/nizalo.apk</div>
        </div>

        <div class="card card-gold" style="padding: 24px 36px; min-width: 320px; text-align: left;">
          <div style="color: #f59e0b; font-size: 14px; font-weight: 700; text-transform: uppercase;">Official M&amp;A Listing</div>
          <div style="font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 6px;">Verified on Acquire.com</div>
        </div>
      </div>
    </div>

    <div class="slide-footer">
      <div>Nizalo Inc. © 2026 • All Rights Reserved</div>
      <div>Private &amp; Confidential • Direct Inquiries Welcomed</div>
    </div>
  </div>

</body>
</html>`;

const htmlPath = resolve("H:/Claide Apps/Nizalo_Acquisition_Pitch_Deck_300K.html");
const pdfPath = resolve("H:/Claide Apps/Nizalo_Acquisition_Pitch_Deck_300K.pdf");

console.log("Writing HTML template to:", htmlPath);
writeFileSync(htmlPath, htmlContent, "utf8");

console.log("Generating 16:9 PDF with headless Chrome...");
const res = spawnSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`,
  htmlPath,
], { encoding: "utf8" });

if (res.error) {
  console.error("Error executing Chrome:", res.error);
} else {
  console.log("PDF generated successfully at:", pdfPath);
}
