import { loadEnv } from "./load-env.mjs";
loadEnv();

import fs from "fs";
import {
  createResendEmailProvider,
  createSmtpEmailProvider,
  OFFICIAL_SENDER,
} from "../packages/email/src/index.mjs";

// Load .env
if (fs.existsSync(".env")) {
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const targetEmail = process.argv[2];
if (!targetEmail) {
  console.log("Usage: node scripts/test-email.mjs <your-email@example.com>");
  process.exit(1);
}

console.log("=== Testing Nizalo Email Provider Delivery ===");
console.log(`Target Recipient: ${targetEmail}`);
console.log(`Official Sender:  ${OFFICIAL_SENDER}`);

let provider = null;
let providerType = "none";

if (process.env.RESEND_API_KEY) {
  console.log("Found RESEND_API_KEY. Using Resend HTTP API...");
  providerType = "Resend";
  provider = createResendEmailProvider({ apiKey: process.env.RESEND_API_KEY });
} else if (process.env.SMTP_HOST) {
  console.log(`Found SMTP_HOST (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465}). Using SMTP...`);
  providerType = "SMTP";
  provider = createSmtpEmailProvider({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== "false",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  console.error("❌ Neither RESEND_API_KEY nor SMTP_HOST found in .env!");
  console.log("Please configure either Resend or Hostinger SMTP in .env. See .env.production.example.");
  process.exit(1);
}

const res = await provider.send({
  to: targetEmail,
  subject: "⚔️ نيزالو | تجربة إرسال البريد الإلكتروني التشغيلي",
  text: `مرحباً بك في منصة نيزالو!\n\nهذه رسالة اختبار تشغيلية للتأكد من وصول رسائل التحقق وأكواد تسجيل الدخول بنجاح.\n\nمزود الإرسال: ${providerType}\nالتاريخ: ${new Date().toISOString()}`,
  html: `<div style="font-family:sans-serif;direction:rtl;padding:24px;background:#0d1117;color:#fff;border-radius:12px;">
    <h2 style="color:#ff6b00;">⚔️ نيزالو | Nizalo Arena</h2>
    <p>مرحباً بك في منصة نيزالو،</p>
    <p>هذه رسالة اختبار تشغيلية للتأكد من وصول رسائل التحقق وأكواد تسجيل الدخول وإشعارات البطولات بنجاح إلى صندوق الوارد.</p>
    <div style="background:#161b22;padding:12px 16px;border-radius:8px;margin:16px 0;font-family:monospace;color:#58a6ff;">
      نظام الإرسال: ${providerType}<br>
      الحالة: نجاح التوصيل ✓<br>
      الوقت: ${new Date().toLocaleString("ar-EG")}
    </div>
    <p style="color:#8b949e;font-size:12px;">إذا لم تطلب هذا البريد، يمكنك تجاهله بأمان.</p>
  </div>`,
  locale: "ar",
  template: "system_test",
});

if (res.ok) {
  console.log(`✅ Success! Email delivered via ${providerType}. Provider ID: ${res.providerMessageId}`);
} else {
  console.error(`❌ Delivery failed: ${res.reason}`);
}
