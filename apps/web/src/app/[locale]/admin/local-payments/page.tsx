"use client";

/**
 * Vodafone Cash / InstaPay Operator Console (db/migrations/0062).
 * Designed for dual-phone operation (2 phones, 4 SIMs: 3 Vodafone Cash + 1 InstaPay).
 * Features:
 * - Real-time auto-polling every 4 seconds
 * - Web Audio synthesized chime + mobile vibration on new withdrawal requests
 * - 1-click copy for customer phone numbers and EGP amounts
 * - 1-tap USSD Quick Dial (*9*7*PHONE*AMOUNT#) for Vodafone Cash
 * - 1-tap wallet toggle (Active / Daily limit reached) for the 4 SIMs
 * - Streamlined deposit confirmation and manual payout workflows
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { Button } from "@/components/Button";
import { get, post, del } from "@/lib/api";
import { adminErrorMessage } from "@/lib/admin-errors";
import styles from "@/components/admin/AdminPageLayout.module.css";
import opStyles from "./local-payments.module.css";

type LocalNumber = {
  id: string;
  network: "VODAFONE_CASH" | "INSTAPAY";
  phoneNumber: string;
  label: string | null;
  enabled: boolean;
};

type LocalRate = {
  egpPerUsd: number;
  usdRateX1e8: string;
  effectiveAt: string;
} | null;

type LocalDepositIntent = {
  id: string;
  playerId: string;
  network: "VODAFONE_CASH" | "INSTAPAY";
  receivingNumberId: string;
  senderName: string;
  senderPhone: string;
  amountEgpMinor: string;
  status: string;
  creditedAmountUsdtMinor: string | null;
  createdAt: string;
  expiresAt: string;
};

type LocalDevice = {
  id: string;
  label: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  lastSeenAt: string | null;
};

type UnmatchedTransfer = {
  id: string;
  network: string;
  receivedNumberId: string;
  rawSenderName: string | null;
  rawSenderPhone: string | null;
  amountEgpMinor: string;
  rawMessage: string;
  observedAt: string;
};

type LocalWithdrawal = {
  id: string;
  playerId: string;
  network: "VODAFONE_CASH" | "INSTAPAY";
  destination: string;
  amountMinor: string;
  feeMinor: string;
  status: string;
  requestedAt: string;
  amountUsdt?: string;
  amountEgp?: string;
  amountEgpRound?: number;
  cleanPhone?: string;
  ussdCode?: string | null;
  egpPerUsd?: number;
};

function egp(minor: string): string {
  return (Number(minor) / 100).toFixed(2);
}

function usdt(minor: string | null): string {
  return minor ? (Number(minor) / 1_000_000).toFixed(2) : "0.00";
}

/**
 * Pleasant dual-tone alert chime synthesized via Web Audio API.
 * Guaranteed to work without external asset loads or CORS restrictions.
 */
function playWithdrawalAlert() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // First tone (pleasant notification chime 587.33 Hz - D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.005, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone (higher chime 880 Hz - A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.14);
    gain2.gain.setValueAtTime(0.3, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.005, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.55);

    // Mobile vibration pattern (if supported)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 250]);
    }
  } catch {
    // Ignore audio permission or playback errors
  }
}

export default function AdminLocalPaymentsPage() {
  const [numbers, setNumbers] = useState<LocalNumber[]>([]);
  const [rate, setRate] = useState<LocalRate>(null);
  const [deposits, setDeposits] = useState<LocalDepositIntent[]>([]);
  const [withdrawals, setWithdrawals] = useState<LocalWithdrawal[]>([]);
  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedTransfer[]>([]);
  const [newDeviceLabel, setNewDeviceLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newRate, setNewRate] = useState("");
  const [newNumberNetwork, setNewNumberNetwork] = useState<"VODAFONE_CASH" | "INSTAPAY">("VODAFONE_CASH");
  const [newNumberPhone, setNewNumberPhone] = useState("");
  const [newNumberLabel, setNewNumberLabel] = useState("");

  // Sound alert & auto-refresh tracking
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const prevWithdrawalsCount = useRef<number | null>(null);

  // Initialize sound preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nizalo_operator_sound");
      if (stored !== null) setSoundEnabled(stored === "true");
    } catch {
      // Ignore localStorage issues
    }
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("nizalo_operator_sound", String(next));
      } catch {
        // Ignore
      }
      if (next) {
        playWithdrawalAlert();
      }
      return next;
    });
  };

  const copyToClipboard = (key: string, text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [n, d, w, devs, unm] = await Promise.all([
        get<{ numbers: LocalNumber[]; rate: LocalRate }>("/v1/admin/payments/local/numbers"),
        get<{ intents: LocalDepositIntent[] }>("/v1/admin/payments/local/deposits?status=PENDING"),
        get<{ withdrawals: LocalWithdrawal[] }>("/v1/admin/payments/local/withdrawals"),
        get<{ devices: LocalDevice[] }>("/v1/admin/payments/local/devices"),
        get<{ transfers: UnmatchedTransfer[] }>("/v1/admin/payments/local/transfers/unmatched"),
      ]);

      const fetchedWithdrawals = w.withdrawals ?? [];
      setNumbers(n.numbers ?? []);
      setRate(n.rate ?? null);
      setDeposits(d.intents ?? []);
      setWithdrawals(fetchedWithdrawals);
      setDevices(devs.devices ?? []);
      setUnmatched(unm.transfers ?? []);
      setLoadError(null);

      // Trigger alert chime when new withdrawal requests arrive
      if (prevWithdrawalsCount.current !== null && fetchedWithdrawals.length > prevWithdrawalsCount.current) {
        if (soundEnabled) {
          playWithdrawalAlert();
        }
      }
      prevWithdrawalsCount.current = fetchedWithdrawals.length;
    } catch (e) {
      if (!isSilent) {
        setLoadError(adminErrorMessage(e, "تعذّر تحميل بيانات فودافون كاش / إنستاباي."));
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [soundEnabled]);

  // Initial load + real-time polling every 4 seconds
  useEffect(() => {
    void load(false);
    const interval = setInterval(() => {
      void load(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  }

  async function handleSetRate() {
    const parsed = parseFloat(newRate);
    if (isNaN(parsed) || parsed <= 0) {
      setLoadError("أدخل سعر صرف صحيح بالجنيه المصري لكل دولار.");
      return;
    }
    const reason = window.prompt("سبب تحديث سعر الصرف (يُحفظ في سجل العمليات):", "تحديث سعر السوق اليومي");
    if (reason === null) return;
    try {
      await post("/v1/admin/payments/local/rate", { egpPerUsd: parsed, reason });
      setNewRate("");
      flash(`تم تحديث سعر الصرف: 1 دولار = ${parsed} جنيه مصري.`);
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تحديث سعر الصرف."));
    }
  }

  async function handleAddNumber() {
    if (!newNumberPhone.trim()) {
      setLoadError("أدخل رقم الهاتف.");
      return;
    }
    try {
      await post("/v1/admin/payments/local/numbers", {
        network: newNumberNetwork,
        phoneNumber: newNumberPhone.trim(),
        label: newNumberLabel.trim() || undefined,
      });
      setNewNumberPhone("");
      setNewNumberLabel("");
      flash("تمت إضافة الرقم بنجاح.");
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر إضافة الرقم."));
    }
  }

  async function handleToggleNumber(n: LocalNumber) {
    try {
      await post(`/v1/admin/payments/local/numbers/${n.id}/status`, { enabled: !n.enabled });
      flash(`تم ${n.enabled ? "إيقاف مؤقت للرقم (ممتلئ)" : "تفعيل الرقم لاستقبال الإيداعات"}: ${n.phoneNumber}`);
      void load(true);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تغيير حالة الرقم."));
    }
  }

  async function handleDeleteNumber(n: LocalNumber) {
    if (!window.confirm(`هل أنت متأكد من حذف الرقم ${n.phoneNumber}؟`)) return;
    try {
      await del(`/v1/admin/payments/local/numbers/${n.id}`);
      flash(`تم حذف الرقم ${n.phoneNumber}.`);
      void load(false);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "IN_USE") {
        setLoadError("لا يمكن حذف هذا الرقم لوجود عمليات مسجلة عليه. يمكنك إيقافه مؤقتاً بدلاً من ذلك.");
      } else {
        setLoadError(adminErrorMessage(e, "تعذّر حذف الرقم."));
      }
    }
  }

  async function handleCredit(intent: LocalDepositIntent) {
    const amountStr = window.prompt(
      `المبلغ المستلم على هاتفك من ${intent.senderName} (${intent.senderPhone}):\nالمبلغ المصرح به: ${egp(intent.amountEgpMinor)} جنيه`,
      egp(intent.amountEgpMinor)
    );
    if (amountStr === null) return;
    const amountEgp = parseFloat(amountStr);
    if (isNaN(amountEgp) || amountEgp <= 0) {
      setLoadError("أدخل مبلغاً صحيحاً.");
      return;
    }
    const note = window.prompt("ملاحظة اختيارية (مثال: رقم رسالة فودافون كاش أو إشعار إنستاباي):", "") ?? "";
    try {
      await post(`/v1/admin/payments/local/deposits/${intent.id}/credit-solo`, {
        senderName: intent.senderName,
        senderPhone: intent.senderPhone,
        amountEgpMinor: Math.round(amountEgp * 100),
        note: note || undefined,
      });
      flash(`تم تأكيد الإيداع وإضافة الرصيد للعميل بنجاح (${intent.id}).`);
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تأكيد الإيداع."));
    }
  }

  async function handleReject(intent: LocalDepositIntent) {
    const reason = window.prompt(`سبب رفض طلب الإيداع للعميل ${intent.senderName}:`, "لم يصل أي تحويل مطابق على الهاتف");
    if (reason === null) return;
    try {
      await post(`/v1/admin/payments/local/deposits/${intent.id}/reject`, { reason });
      flash(`تم رفض طلب الإيداع (${intent.id}).`);
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر رفض طلب الإيداع."));
    }
  }

  async function handleCompleteWithdrawal(w: LocalWithdrawal) {
    const autoRef = `TX-${Date.now().toString().slice(-6)}`;
    const reference = window.prompt(
      `أنت على وشك تأكيد إرسال ${w.amountEgp ?? egp(w.amountMinor)} جنيه (${usdt(w.amountMinor)} USDT) إلى ${w.destination} عبر ${w.network === "VODAFONE_CASH" ? "فودافون كاش" : "إنستاباي"}.\n\nأدخل رقم العملية أو المرجع (أو اضغط موافق لاستخدام المرجع التلقائي):`,
      autoRef
    );
    if (reference === null) return;
    const finalRef = reference.trim() || autoRef;
    try {
      await post(`/v1/admin/payments/local/withdrawals/${w.id}/complete-solo`, { reference: finalRef });
      flash(`تم إتمام عملية السحب للعميل ${w.destination} بنجاح.`);
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر إتمام عملية السحب."));
    }
  }

  async function handleAddDevice() {
    if (!newDeviceLabel.trim()) {
      setLoadError("أدخل اسم الجهاز (مثال: موبايل المشغل 1).");
      return;
    }
    try {
      const res = await post<{ ok: boolean; device: { id: string; label: string; apiKey: string } }>(
        "/v1/admin/payments/local/devices",
        { label: newDeviceLabel.trim() }
      );
      setNewDeviceLabel("");
      flash("تمت إضافة الجهاز بنجاح.");
      window.prompt("مفتاح API الخاص بالجهاز (انسخه الآن، لن يظهر مرة أخرى):", res.device.apiKey);
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر إضافة الجهاز."));
    }
  }

  async function handleToggleDevice(d: LocalDevice) {
    try {
      await post(`/v1/admin/payments/local/devices/${d.id}/status`, { enabled: !d.enabled });
      flash(`تم ${d.enabled ? "تعطيل" : "تفعيل"} الجهاز ${d.label}.`);
      void load(true);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر تغيير حالة الجهاز."));
    }
  }

  async function handleDeleteDevice(d: LocalDevice) {
    if (!window.confirm(`هل أنت متأكد من حذف الجهاز ${d.label}؟`)) return;
    try {
      await del(`/v1/admin/payments/local/devices/${d.id}`);
      flash(`تم حذف الجهاز ${d.label}.`);
      void load(false);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === "IN_USE") {
        setLoadError("لا يمكن حذف الجهاز لوجود عمليات مسجلة عليه. يمكنك تعطيله بدلاً من ذلك.");
      } else {
        setLoadError(adminErrorMessage(e, "تعذّر حذف الجهاز."));
      }
    }
  }

  async function handleMatchTransfer(transfer: UnmatchedTransfer) {
    const intentId = window.prompt("أدخل معرف طلب الإيداع (Intent ID) لربطه بهذا التحويل:", "");
    if (!intentId) return;
    try {
      await post(`/v1/admin/payments/local/deposits/${intentId.trim()}/match/${transfer.id}`, {});
      flash(`تم ربط التحويل بطلب الإيداع بنجاح.`);
      void load(false);
    } catch (e) {
      setLoadError(adminErrorMessage(e, "تعذّر ربط التحويل."));
    }
  }

  return (
    <AdminPageLayout
      title="كنسول المشغّل: فودافون كاش وإنستاباي"
      subtitle="إدارة عمليات السحب الفوري، الإيداعات، والتحكم بالخطوط الأربعة عبر هاتفي العمل."
      breadcrumb={["الرئيسية", "لوحة التحكم", "المدفوعات المحلية"]}
      stats={[
        { label: "سعر الصرف", value: rate ? `${rate.egpPerUsd} ج.م` : "غير محدد", trend: "لكل 1 دولار" },
        { label: "طلبات السحب المعلقة", value: `${withdrawals.length}`, trend: withdrawals.length > 0 ? "⚠️ بانتظار التحويل" : "مكتملة" },
        { label: "إيداعات بانتظار التأكيد", value: `${deposits.length}`, trend: deposits.length > 0 ? "بانتظار المراجعة" : "لا يوجد" },
        { label: "المحافظ النشطة", value: `${numbers.filter((n) => n.enabled).length}`, trend: `من أصل ${numbers.length} خطوط` },
      ]}
    >
      <div className={opStyles.operatorWrap}>
        {/* Live Status & Audio Alert Bar */}
        <div className={opStyles.alertBar}>
          <div className={opStyles.alertLeft}>
            <span className={opStyles.pulseDotRed} />
            <span>
              {withdrawals.length > 0
                ? `🚨 يوجد ${withdrawals.length} طلب سحب معلق بانتظار الإرسال الفوري!`
                : "النظام متصل وبانتظار طلبات السحب والإيداع الجديدة..."}
            </span>
          </div>

          <div className={opStyles.alertActions}>
            <button
              type="button"
              className={`${opStyles.audioToggleBtn} ${soundEnabled ? opStyles.audioToggleBtnActive : ""}`}
              onClick={toggleSound}
              title="تفعيل/كتم صوت الإشعارات عند وصول طلب سحب جديد"
            >
              <span>{soundEnabled ? "🔔 تنبيه صوتي: مفعّل" : "🔕 تنبيه صوتي: مكتوم"}</span>
            </button>

            <button
              type="button"
              className={opStyles.audioToggleBtn}
              onClick={() => playWithdrawalAlert()}
              title="تجربة صوت الرنين على هاتفك للتأكد من مستوى الصوت"
            >
              <span>🔊 تجربة الصوت</span>
            </button>

            <span className={opStyles.autoRefreshTag}>
              🔄 تحديث لحظي (4 ثوانٍ)
            </span>
          </div>
        </div>

        {/* Notice & Error Banners */}
        {notice && (
          <div style={{ padding: "10px 16px", background: "rgba(34, 197, 94, 0.12)", border: "1px solid #22c55e", borderRadius: "8px", color: "#22c55e", fontSize: "13.5px", fontWeight: 700 }}>
            ✓ {notice}
          </div>
        )}
        {loadError && (
          <div style={{ padding: "10px 16px", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "8px", color: "#fca5a5", fontSize: "13.5px", fontWeight: 700 }}>
            ⚠️ {loadError}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 1: WITHDRAWALS AWAITING PAYOUT (SMART CARDS FOR OPERATOR PHONES) */}
        {/* ========================================================================= */}
        <div className={opStyles.sectionHeader}>
          <h2 className={opStyles.sectionTitle}>
            <span>طلبات السحب المعلقة (تحويل فوري للعميل)</span>
            {withdrawals.length > 0 && <span className={opStyles.badgeCount}>{withdrawals.length}</span>}
          </h2>
          {loading && <span style={{ fontSize: "12px", color: "#94a3b8" }}>جارٍ التحديث...</span>}
        </div>

        {withdrawals.length === 0 ? (
          <div className={opStyles.emptyStateCard}>
            <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎉</div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "16px", marginBottom: "4px" }}>
              لا توجد طلبات سحب معلقة حالياً
            </div>
            <div style={{ color: "#94a3b8", fontSize: "13px" }}>
              أنت متصل بالكامل. عندما يطلب أي لاعب سحب أرباحه عبر فودافون كاش أو إنستاباي، سيظهر الكرت مع رنين التنبيه فوراً.
            </div>
          </div>
        ) : (
          <div className={opStyles.withdrawalGrid}>
            {withdrawals.map((w) => {
              const phoneKey = `phone-${w.id}`;
              const amountKey = `amount-${w.id}`;
              const isVodafone = w.network === "VODAFONE_CASH";
              const cleanPhone = w.cleanPhone || w.destination.replace(/[^0-9]/g, "");
              const egpVal = w.amountEgp ?? (Number(w.amountMinor) / 1000000 * (rate?.egpPerUsd ?? 50)).toFixed(2);
              const egpRound = w.amountEgpRound ?? Math.round(Number(egpVal));
              const ussdDialCode = isVodafone && cleanPhone ? `*9*7*${cleanPhone}*${egpRound}#` : null;

              return (
                <div
                  key={w.id}
                  className={`${opStyles.withdrawalCard} ${!isVodafone ? opStyles.withdrawalCardInstapay : ""}`}
                >
                  <div className={opStyles.cardHead}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className={isVodafone ? opStyles.networkPillVodafone : opStyles.networkPillInstapay}>
                        {isVodafone ? "🔴 فودافون كاش" : "⚡ إنستاباي"}
                      </span>
                      <span className={opStyles.playerTag}>لاعب: {w.playerId.slice(0, 10)}</span>
                    </div>
                    <span className={opStyles.timeTag}>
                      {new Date(w.requestedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Customer Phone / IPA Box with 1-Click Copy */}
                  <div className={opStyles.dataBox}>
                    <span className={opStyles.dataLabel}>
                      {isVodafone ? "رقم محفظة العميل المحول إليها" : "حساب / هاتف إنستاباي المستلم"}
                    </span>
                    <div className={opStyles.dataRow}>
                      <span className={opStyles.destinationValue}>{w.destination}</span>
                      <button
                        type="button"
                        className={`${opStyles.copyBtn} ${copiedKey === phoneKey ? opStyles.copyBtnCopied : ""}`}
                        onClick={() => copyToClipboard(phoneKey, w.destination)}
                        title="نسخ الرقم للحافظة بضغطة واحدة"
                      >
                        {copiedKey === phoneKey ? "✓ تم النسخ!" : "📋 نسخ الرقم"}
                      </button>
                    </div>
                  </div>

                  {/* EGP Amount Box with 1-Click Copy */}
                  <div className={opStyles.dataBox}>
                    <span className={opStyles.dataLabel}>المبلغ المطلوب تحويله بالجنيه المصري</span>
                    <div className={opStyles.dataRow}>
                      <div>
                        <span className={opStyles.amountEgpValue}>{egpVal} ج.م</span>
                        <span className={opStyles.amountUsdSub}>(${usdt(w.amountMinor)} USDT)</span>
                      </div>
                      <button
                        type="button"
                        className={`${opStyles.copyBtn} ${copiedKey === amountKey ? opStyles.copyBtnCopied : ""}`}
                        onClick={() => copyToClipboard(amountKey, String(egpRound))}
                        title="نسخ المبلغ فقط لبرنامج الدفع"
                      >
                        {copiedKey === amountKey ? "✓ تم النسخ!" : "📋 نسخ المبلغ"}
                      </button>
                    </div>
                  </div>

                  {/* Vodafone Cash Magic USSD Quick Dial Button */}
                  {isVodafone && ussdDialCode && (
                    <a
                      href={`tel:${ussdDialCode.replace(/#/g, "%23")}`}
                      className={opStyles.ussdDialBtn}
                      title="فتح لوحة الاتصال بالكود جاهزاً على الهاتف"
                    >
                      <span>📞 طلب كود التحويل المباشر ({ussdDialCode})</span>
                    </a>
                  )}

                  {/* Action Buttons */}
                  <div className={opStyles.cardActions}>
                    <button
                      type="button"
                      className={opStyles.completeBtn}
                      onClick={() => void handleCompleteWithdrawal(w)}
                    >
                      <span>✅ تم التحويل بنجاح</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 2: SIMS & WALLETS MANAGEMENT (THE 4 OPERATOR LINES)              */}
        {/* ========================================================================= */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.tableTitle}>إدارة محافظ التحويل والخطوط الأربعة ({numbers.length})</h2>
              <p style={{ fontSize: "12.5px", color: "var(--nz-text-3)", marginTop: "4px" }}>
                لديك 4 خطوط موزعة على هاتفين (3 فودافون كاش + 1 إنستاباي). يمكنك إيقاف أي محفظة فوراً إذا اقتربت من الحد اليومي (60 ألف) أو الشهري (200 ألف).
              </p>
            </div>
          </div>

          <div style={{ padding: "16px" }}>
            <div className={opStyles.simsGrid}>
              {numbers.map((n) => {
                const isVodafone = n.network === "VODAFONE_CASH";
                return (
                  <div
                    key={n.id}
                    className={`${opStyles.simCard} ${!n.enabled ? opStyles.simCardDisabled : ""}`}
                  >
                    <div className={opStyles.simCardTop}>
                      <span className={isVodafone ? opStyles.networkPillVodafone : opStyles.networkPillInstapay}>
                        {isVodafone ? "فودافون كاش" : "إنستاباي"}
                      </span>
                      <span className={opStyles.simLabel}>{n.label || "بدون تسمية"}</span>
                    </div>

                    <div className={opStyles.simPhone}>{n.phoneNumber}</div>

                    <div className={opStyles.simActions}>
                      <button
                        type="button"
                        className={`${opStyles.toggleSwitchBtn} ${n.enabled ? opStyles.toggleActive : opStyles.toggleDisabled}`}
                        onClick={() => void handleToggleNumber(n)}
                        title="تبديل حالة الخط: تفعيل لاستقبال الإيداعات أو إيقاف مؤقت عند الوصول للحد الأقصى"
                      >
                        {n.enabled ? "🟢 متاح ويستقبل إيداعات" : "🔴 ممتلئ (موقوف مؤقتاً)"}
                      </button>

                      <Button variant="ghost" onClick={() => void handleDeleteNumber(n)}>
                        حذف
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Add Line Form */}
            <div style={{ padding: "14px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>إضافة خط جديد:</span>
              <select
                value={newNumberNetwork}
                onChange={(e) => setNewNumberNetwork(e.target.value as "VODAFONE_CASH" | "INSTAPAY")}
                style={{ padding: "7px 12px", borderRadius: "8px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: "13px" }}
              >
                <option value="VODAFONE_CASH">فودافون كاش</option>
                <option value="INSTAPAY">إنستاباي</option>
              </select>
              <input
                value={newNumberPhone}
                onChange={(e) => setNewNumberPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                style={{ padding: "7px 12px", borderRadius: "8px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: "13px", width: "150px" }}
              />
              <input
                value={newNumberLabel}
                onChange={(e) => setNewNumberLabel(e.target.value)}
                placeholder="التسمية (مثال: موبايل 1 - شريحة 1)"
                style={{ padding: "7px 12px", borderRadius: "8px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: "13px", flex: 1, minWidth: "180px" }}
              />
              <Button variant="secondary" onClick={() => void handleAddNumber()}>
                + إضافة الخط
              </Button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: EXCHANGE RATE (سعر الصرف)                                      */}
        {/* ========================================================================= */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>سعر صرف الدولار مقابل الجنيه المصري</h2>
          </div>
          <div style={{ padding: "14px 18px", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", color: "var(--nz-text-3)" }}>
              السعر المعتمد حالياً: <strong style={{ color: "#4ade80", fontSize: "16px" }}>{rate ? `1 USD = ${rate.egpPerUsd} EGP` : "غير محدد بعد"}</strong>
            </span>
            <div style={{ display: "flex", gap: "8px", marginLeft: "auto", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>1 دولار =</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                placeholder="50.00"
                style={{ width: "90px", padding: "7px 10px", borderRadius: "8px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: "14px", fontWeight: 700 }}
              />
              <span style={{ fontSize: "13px", color: "#94a3b8" }}>جنيه مصري</span>
              <Button variant="primary" onClick={() => void handleSetRate()}>
                تحديث السعر
              </Button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: DEPOSITS AWAITING CONFIRMATION (الإيداعات بانتظار التأكيد)      */}
        {/* ========================================================================= */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>
              طلبات الإيداع بانتظار التأكيد ({deposits.length}) {loading ? "— جارٍ التحديث..." : ""}
            </h2>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>اللاعب</th>
                  <th>صاحب المحفظة المحول منها</th>
                  <th>المبلغ المحول</th>
                  <th>الشبكة</th>
                  <th>الصلاحية</th>
                  <th className={styles.alignRight}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      لا توجد طلبات إيداع معلقة حالياً
                    </td>
                  </tr>
                ) : (
                  deposits.map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.playerId.slice(0, 10)}</strong></td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{d.senderName}</div>
                        <div style={{ color: "#38bdf8", fontSize: "12px", fontFamily: "var(--nz-font-num)" }}>
                          {d.senderPhone}
                        </div>
                      </td>
                      <td className="nz-num" style={{ fontWeight: 800, color: "#4ade80", fontSize: "15px" }}>
                        {egp(d.amountEgpMinor)} ج.م
                      </td>
                      <td>
                        <span className={`${styles.badge} ${d.network === "VODAFONE_CASH" ? styles.badgeDanger : styles.badgeNeutral}`}>
                          {d.network === "VODAFONE_CASH" ? "فودافون كاش" : "إنستاباي"}
                        </span>
                      </td>
                      <td className="nz-num">
                        {new Date(d.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className={styles.alignRight}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <Button variant="primary" onClick={() => void handleCredit(d)}>
                            ✅ وصل التحويل (تأكيد)
                          </Button>
                          <Button variant="ghost" onClick={() => void handleReject(d)}>
                            رفض
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 5: UNMATCHED TRANSFERS (تحويلات واردة تلقائياً عبر هواتف الأندرويد) */}
        {/* ========================================================================= */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.tableTitle}>التحويلات الواردة غير المربوطة ({unmatched.length})</h2>
              <p style={{ fontSize: "12px", color: "var(--nz-text-3)", marginTop: "2px" }}>
                تظهر هنا الرسائل الواردة من تطبيق قراءة الرسائل التلقائي على أندرويد والتي لم تجد طلب إيداع مطابق تلقائياً.
              </p>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>معرف التحويل</th>
                  <th>المرسل</th>
                  <th>المبلغ</th>
                  <th>الشبكة</th>
                  <th>وقت الوصول</th>
                  <th className={styles.alignRight}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      لا توجد تحويلات واردة غير مربوطة
                    </td>
                  </tr>
                ) : (
                  unmatched.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id.slice(0, 10)}</td>
                      <td>
                        {u.rawSenderName || "--"}<br />
                        <span style={{ color: "var(--nz-text-3)", fontSize: "12px" }}>{u.rawSenderPhone || "--"}</span>
                      </td>
                      <td className="nz-num" style={{ fontWeight: 700, color: "#4ade80" }}>
                        {egp(u.amountEgpMinor)} ج.م
                      </td>
                      <td><span className={`${styles.badge} ${styles.badgeNeutral}`}>{u.network}</span></td>
                      <td className="nz-num">{new Date(u.observedAt).toLocaleTimeString()}</td>
                      <td className={styles.alignRight}>
                        <Button variant="primary" onClick={() => void handleMatchTransfer(u)}>
                          ربط بطلب إيداع
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 6: ANDROID RECEIVER DEVICES (أجهزة قراءة الرسائل التلقائية)       */}
        {/* ========================================================================= */}
        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <h2 className={styles.tableTitle}>أجهزة المشغل المسجلة للربط التلقائي ({devices.length})</h2>
              <p style={{ fontSize: "12px", color: "var(--nz-text-3)", marginTop: "2px" }}>
                ربط هواتف الأندرويد التي تستقبل رسائل SMS لتحويل الإيداعات تلقائياً للرصيد فور وصول الرسالة.
              </p>
            </div>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>اسم الجهاز</th>
                  <th>الحالة</th>
                  <th>آخر ظهور</th>
                  <th className={styles.alignRight}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.id}>
                    <td><strong>{d.label}</strong></td>
                    <td>
                      <span className={`${styles.badge} ${d.enabled ? styles.badgeSuccess : styles.badgeDanger}`}>
                        {d.enabled ? "نشط" : "معطل"}
                      </span>
                    </td>
                    <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("ar-EG") : "لم يتصل بعد"}</td>
                    <td className={styles.alignRight}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <Button variant="ghost" onClick={() => void handleToggleDevice(d)}>
                          {d.enabled ? "تعطيل" : "تفعيل"}
                        </Button>
                        <Button variant="ghost" onClick={() => void handleDeleteDevice(d)}>
                          حذف
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "12px 16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              value={newDeviceLabel}
              onChange={(e) => setNewDeviceLabel(e.target.value)}
              placeholder="اسم الجهاز (مثال: موبايل سامسونج خط 1 و 2)"
              style={{ padding: "7px 12px", borderRadius: "8px", background: "var(--nz-bg-2, #0e121a)", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: "13px", minWidth: "220px" }}
            />
            <Button variant="secondary" onClick={() => void handleAddDevice()}>
              + إضافة جهاز واستخراج API Key
            </Button>
          </div>
        </div>
      </div>
    </AdminPageLayout>
  );
}
