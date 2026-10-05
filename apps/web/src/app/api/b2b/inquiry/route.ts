import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

// Target notification email requested by user
const NOTIFICATION_RECIPIENT = "HHifzy@gmail.com";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name, email, telegram, tier, message, company } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
    }

    const inquiryId = `b2b_${randomUUID()}`;
    const timestamp = new Date().toISOString();
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

    const emailSubject = `[Nizalo B2B] New License Inquiry: ${name || "Lead"} (${tier || "Turnkey"})`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #334155;">
        <h2 style="color: #f59e0b; margin-top: 0;">🚀 New B2B Enterprise Lead Received!</h2>
        <p style="color: #94a3b8; font-size: 14px;">An enterprise buyer has submitted a licensing inquiry on Nizalo B2B Demo portal.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #1e293b; border-radius: 8px; overflow: hidden;">
          <tr style="border-bottom: 1px solid #334155;">
            <td style="padding: 12px; color: #94a3b8; font-weight: bold; width: 140px;">Name / Company:</td>
            <td style="padding: 12px; color: #fff; font-weight: 600;">${name || "Not provided"} ${company ? `(${company})` : ""}</td>
          </tr>
          <tr style="border-bottom: 1px solid #334155;">
            <td style="padding: 12px; color: #94a3b8; font-weight: bold;">Business Email:</td>
            <td style="padding: 12px; color: #38bdf8; font-weight: 600;"><a href="mailto:${email}" style="color: #38bdf8;">${email}</a></td>
          </tr>
          <tr style="border-bottom: 1px solid #334155;">
            <td style="padding: 12px; color: #94a3b8; font-weight: bold;">Telegram / WhatsApp:</td>
            <td style="padding: 12px; color: #fff;">${telegram || "Not provided"}</td>
          </tr>
          <tr style="border-bottom: 1px solid #334155;">
            <td style="padding: 12px; color: #94a3b8; font-weight: bold;">Interested Package:</td>
            <td style="padding: 12px; color: #fbbf24; font-weight: bold;">${tier || "Cloud Turnkey"}</td>
          </tr>
          ${message ? `
          <tr>
            <td style="padding: 12px; color: #94a3b8; font-weight: bold;">Message:</td>
            <td style="padding: 12px; color: #e2e8f0; line-height: 1.5;">${message}</td>
          </tr>` : ""}
        </table>

        <div style="font-size: 12px; color: #64748b; border-top: 1px solid #334155; padding-top: 12px;">
          <span>Inquiry ID: ${inquiryId}</span> • <span>IP: ${ip}</span> • <span>Time: ${timestamp}</span>
        </div>
      </div>
    `;

    // 1. Try sending via Resend HTTP API if key is present
    let emailDelivered = false;
    if (process.env.RESEND_API_KEY) {
      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Nizalo B2B <info@nizalo.com>",
            to: [NOTIFICATION_RECIPIENT],
            reply_to: email,
            subject: emailSubject,
            html: emailHtml,
          }),
        });
        if (resendRes.ok) emailDelivered = true;
      } catch (err: any) {
        console.error("[B2B Inquiry] Resend delivery error:", err?.message || err);
      }
    }

    // 2. Try sending via SMTP (Hostinger or custom) if configured
    if (!emailDelivered && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 465,
          secure: process.env.SMTP_SECURE !== "false",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: `"Nizalo B2B" <${process.env.SMTP_USER}>`,
          to: NOTIFICATION_RECIPIENT,
          replyTo: email,
          subject: emailSubject,
          html: emailHtml,
        });
        emailDelivered = true;
      } catch (err: any) {
        console.error("[B2B Inquiry] SMTP delivery error:", err?.message || err);
      }
    }

    // 3. Fallback: Save lead safely to Postgres database table `b2b_inquiry`
    try {
      const pgModule = await import("pg");
      const PoolClass = pgModule.default?.Pool || (pgModule as any).Pool;
      const connStr = process.env.DATABASE_URL;
      if (!connStr) {
        console.warn("[B2B Inquiry] DATABASE_URL not configured, skipping DB persist.");
        return NextResponse.json({ ok: true, inquiryId, delivered: emailDelivered });
      }

      const pool = new PoolClass({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      await pool.query(`
        CREATE TABLE IF NOT EXISTS b2b_inquiry (
          id text PRIMARY KEY,
          name text,
          email text NOT NULL,
          telegram text,
          tier text,
          message text,
          ip text,
          delivered_email boolean DEFAULT false,
          created_at timestamptz DEFAULT now()
        );
      `);

      await pool.query(
        `INSERT INTO b2b_inquiry (id, name, email, telegram, tier, message, ip, delivered_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [inquiryId, name || null, email, telegram || null, tier || null, message || null, ip, emailDelivered]
      );

      await pool.end();
    } catch (dbErr: any) {
      console.warn("[B2B Inquiry] Database save error:", dbErr?.message || dbErr);
    }

    console.log(`[B2B Inquiry] Recorded lead from ${email} (${name}). Delivered to ${NOTIFICATION_RECIPIENT}: ${emailDelivered}`);

    return NextResponse.json({
      ok: true,
      inquiryId,
      delivered: emailDelivered,
      recipient: NOTIFICATION_RECIPIENT,
    });
  } catch (error: any) {
    console.error("[B2B Inquiry Exception]", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
