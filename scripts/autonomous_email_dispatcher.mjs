import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// File paths
const DATABASE_PATH = path.join(rootDir, 'deliverables', 'institutional_buyers_database.json');
const LOG_PATH = path.join(rootDir, 'deliverables', 'outreach_dispatch_log.json');

import { loadEnv } from './load-env.mjs';
loadEnv();

// SMTP Credentials
const SMTP_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: true,
    auth: {
        user: process.env.SMTP_USER || 'info@nizalo.com',
        pass: process.env.SMTP_PASS
    }
};

const SENDER = '"Hifzy Hifzy | Nizalo" <info@nizalo.com>';
const USER_PHONE = '+201069999557';
const USER_WHATSAPP_BASE = 'https://wa.me/201069999557';

// Load or initialize dispatch log
function loadLog() {
    if (fs.existsSync(LOG_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
        } catch (e) {
            console.warn('⚠️ Warning reading log file, initializing new log:', e.message);
        }
    }
    return { sent: {}, failed: {}, stats: { totalSent: 0, totalFailed: 0 } };
}

function saveLog(log) {
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
}

// Generate customized email copy
function generateEmail(buyer) {
    const firstName = (buyer.name && buyer.name.trim()) ? buyer.name.split(' ')[0] : 'Team';
    const waText = encodeURIComponent(`Hi Hifzy, regarding Nizalo acquisition inquiry for ${buyer.company}`);
    const whatsappUrl = `${USER_WHATSAPP_BASE}?text=${waText}`;

    const subject = `Strategic Inquiry: Turnkey P2P Skill Gaming Infrastructure (${buyer.company} Expansion)`;

    const textBody = `Hi ${firstName},

I am reaching out regarding a potential strategic software acquisition or licensing opportunity for ${buyer.company}.

We have engineered Nizalo (https://nizalo.com) — an institutional-grade, turnkey P2P skill gaming infrastructure built specifically for competitive mind sports (Chess Blitz, Backgammon/Tawla, Dominoes, Checkers, Speed Math, Connect Four, and 5 casual strategy duels).

Why Nizalo is strategic for ${buyer.company}:
• 11 In-House Game Engines: 100% proprietary code with zero third-party revenue shares.
• Zero House Edge: Players compete strictly against each other (P2P); operators generate an automated, risk-free 5%–12% rake without house bankroll exposure or gambling volatility.
• Tailored Synergies: ${buyer.angle}
• Production Microservices: Next.js 16, Node.js, WebSockets, crypto/fiat cashier (USDT, BTC, ETH) with sub-60s payouts, and 6-language white-label localization.

Deal Structures Available:
1. Full Source Code & Worldwide IP Buyout ($500,000)
2. Turnkey White-Label Licensing ($25,000 – $75,000 setup + recurring royalty)

Interactive B2B Sandbox: https://demo.nizalo.com/b2b
Technical Pitch Deck: https://demo.nizalo.com/pitch-deck.html

If this aligns with your product roadmap, let's connect directly via WhatsApp:
👉 WhatsApp: ${whatsappUrl} (${USER_PHONE})
Or reply directly to this email.

Best regards,
Hifzy Hifzy
Founder & Systems Architect | Nizalo
WhatsApp: +201069999557
Email: info@nizalo.com`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
  .card { max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
  .badge { display: inline-block; padding: 4px 12px; background: #fef3c7; color: #b45309; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; }
  h2 { font-size: 20px; color: #0f172a; margin-top: 0; margin-bottom: 16px; }
  p { margin-bottom: 14px; font-size: 15px; color: #334155; }
  .highlight-box { background: #f1f5f9; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 6px; margin: 18px 0; }
  .highlight-box ul { margin: 6px 0 0; padding-left: 20px; }
  .highlight-box li { margin-bottom: 6px; font-size: 14px; color: #334155; }
  .wa-btn { display: inline-block; background: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 16px 0; }
  .links-box { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13.5px; color: #64748b; }
  .links-box a { color: #2563eb; text-decoration: none; }
  .footer { margin-top: 24px; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; }
</style>
</head>
<body>
<div class="card">
  <div class="badge">Institutional M&A & Licensing</div>
  <h2>Turnkey P2P Skill Gaming Infrastructure</h2>
  <p>Hi <strong>${firstName}</strong>,</p>
  <p>I am reaching out regarding a potential strategic software acquisition or licensing opportunity for <strong>${buyer.company}</strong>.</p>
  <p>We have engineered <strong>Nizalo</strong> (<a href="https://nizalo.com" style="color: #2563eb;">nizalo.com</a>) — an institutional-grade, real-money P2P skill gaming and tournament infrastructure built specifically for competitive mind sports (Chess Blitz, Backgammon, Dominoes, Checkers, Speed Math, Connect Four, and 5 casual strategy duels).</p>
  
  <div class="highlight-box">
    <strong>Strategic Synergies for ${buyer.company}:</strong>
    <ul>
      <li><strong>11 In-House Proprietary Engines:</strong> 100% proprietary code with zero third-party revenue shares.</li>
      <li><strong>Risk-Free Player Retention:</strong> Pure player-vs-player (P2P); operators generate an automated 5%–12% rake without house bankroll exposure or gambling volatility.</li>
      <li><strong>Tailored Integration:</strong> ${buyer.angle}</li>
      <li><strong>Modern Microservices:</strong> Next.js 16, Node.js, WebSockets, crypto/fiat cashier (USDT, BTC, ETH) with sub-60s payouts, and 6-language white-label localization.</li>
    </ul>
  </div>

  <p><strong>Available Transaction Structures:</strong><br/>
  1. Full Source Code & Worldwide IP Buyout (<strong>$500,000</strong>)<br/>
  2. Turnkey White-Label Licensing (<strong>$25,000 – $75,000</strong> setup + recurring royalty)</p>

  <div style="text-align: center; margin: 24px 0;">
    <a href="${whatsappUrl}" class="wa-btn">💬 Chat Directly on WhatsApp (${USER_PHONE})</a>
  </div>

  <div class="links-box">
    <strong>Explore Live Assets:</strong><br/>
    • Interactive B2B Sandbox: <a href="https://demo.nizalo.com/b2b">demo.nizalo.com/b2b</a><br/>
    • Technical Pitch Deck: <a href="https://demo.nizalo.com/pitch-deck.html">demo.nizalo.com/pitch-deck.html</a>
  </div>

  <div class="footer">
    <strong>Hifzy Hifzy</strong> • Founder & Systems Architect | Nizalo<br/>
    WhatsApp: <a href="${whatsappUrl}" style="color: #25D366; text-decoration: none;">${USER_PHONE}</a> • Direct Email: info@nizalo.com
  </div>
</div>
</body>
</html>`;

    return { subject, text: textBody, html: htmlBody };
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main Runner
async function run() {
    const args = process.argv.slice(2);
    const isTest = args.includes('--test');
    const isStatus = args.includes('--status');
    const isDryRun = args.includes('--dry-run');
    const batchArgIdx = args.indexOf('--batch');
    const batchSize = batchArgIdx !== -1 ? parseInt(args[batchArgIdx + 1], 10) : (isTest ? 1 : 20);

    // 1. Verify Database
    if (!fs.existsSync(DATABASE_PATH)) {
        console.error('❌ Database not found at:', DATABASE_PATH);
        process.exit(1);
    }
    const buyers = JSON.parse(fs.readFileSync(DATABASE_PATH, 'utf8'));
    const log = loadLog();

    // 2. Status Mode
    if (isStatus) {
        const sentCount = Object.keys(log.sent).length;
        const failedCount = Object.keys(log.failed).length;
        const remaining = buyers.length - sentCount;
        console.log('==============================================');
        console.log('📊 Nizalo Autonomous Outreach Engine Status:');
        console.log(`• Total Institutional Leads: ${buyers.length}`);
        console.log(`• Successfully Dispatched:   ${sentCount} (${Math.round((sentCount / buyers.length) * 100)}%)`);
        console.log(`• Remaining Queue:           ${remaining}`);
        console.log(`• Failed / Bounced Attempts: ${failedCount}`);
        console.log('==============================================');
        process.exit(0);
    }

    // 3. Setup Transporter
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    if (!isDryRun) {
        console.log('Connecting to Hostinger SMTP (info@nizalo.com)...');
        await transporter.verify();
        console.log('✅ SMTP Connection Authenticated Successfully!\n');
    }

    // 4. Test Mode
    if (isTest) {
        console.log('🧪 SENDING TEST EMAIL TO HHifzy@gmail.com...');
        const sampleBuyer = buyers[0]; // EveryMatrix
        const emailContent = generateEmail(sampleBuyer);
        
        const mailOptions = {
            from: SENDER,
            to: 'HHifzy@gmail.com',
            subject: `[TEST SAMPLE] ${emailContent.subject}`,
            text: emailContent.text,
            html: emailContent.html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Test email sent to HHifzy@gmail.com successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        process.exit(0);
    }

    // 5. Batch Dispatch Queue
    const pendingBuyers = buyers.filter(b => !log.sent[b.email] && !log.sent[b.id]);
    console.log(`Found ${pendingBuyers.length} buyers pending in queue.`);
    console.log(`Preparing to dispatch a safe batch of ${Math.min(batchSize, pendingBuyers.length)} emails...\n`);

    let count = 0;
    for (const buyer of pendingBuyers) {
        if (count >= batchSize) {
            console.log(`\n🏁 Batch limit of ${batchSize} reached. Stopping safely.`);
            break;
        }

        const emailContent = generateEmail(buyer);
        console.log(`[${count + 1}/${batchSize}] Preparing email for #${buyer.id}: ${buyer.name} (${buyer.company} - ${buyer.email})...`);

        if (isDryRun) {
            console.log(`   [DRY RUN] Would send to: ${buyer.email} | Subject: ${emailContent.subject}`);
            count++;
            continue;
        }

        try {
            const mailOptions = {
                from: SENDER,
                to: buyer.email,
                bcc: 'info@nizalo.com',
                subject: emailContent.subject,
                text: emailContent.text,
                html: emailContent.html
            };

            const info = await transporter.sendMail(mailOptions);
            console.log(`   ✅ Sent! Message ID: ${info.messageId}`);
            
            // Record success in log
            log.sent[buyer.email] = {
                id: buyer.id,
                name: buyer.name,
                company: buyer.company,
                sentAt: new Date().toISOString(),
                messageId: info.messageId
            };
            log.stats.totalSent = Object.keys(log.sent).length;
            saveLog(log);
            count++;

            // Intelligent safety delay between sends (45 to 70 seconds)
            if (count < batchSize) {
                const delaySeconds = Math.floor(Math.random() * (70 - 45 + 1)) + 45;
                console.log(`   ⏳ Safety pause: waiting ${delaySeconds}s before next dispatch (protecting domain reputation)...\n`);
                await sleep(delaySeconds * 1000);
            }
        } catch (err) {
            console.error(`   ❌ Failed sending to ${buyer.email}:`, err.message);
            log.failed[buyer.email] = {
                id: buyer.id,
                name: buyer.name,
                company: buyer.company,
                error: err.message,
                failedAt: new Date().toISOString()
            };
            log.stats.totalFailed = Object.keys(log.failed).length;
            saveLog(log);
            // Small pause on error
            await sleep(5000);
        }
    }

    console.log('\n==============================================');
    console.log(`🎉 Batch execution completed. Total sent in this run: ${count}`);
    console.log(`Overall progress: ${Object.keys(log.sent).length} / ${buyers.length} sent.`);
    console.log('==============================================');
}

run().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
