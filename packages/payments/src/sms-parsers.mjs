/**
 * Parsers for the payment SMS formats actually sent by Vodafone Cash and by
 * banks over InstaPay -- the server-side twin of the Android app's
 * `SmsParser.kt` (apps/payment-receiver-android), both ported from
 * tawwerni.com's `sms-parsers.ts`, which was built from real captured
 * messages rather than guesses.
 *
 * `reportDeviceTransfer()` in local-payments.mjs re-parses the device's
 * `rawMessage` with this module and lets the server's reading win over
 * whatever the device itself extracted. That is the whole point of keeping
 * a second copy here: a message-format change ships as a backend deploy,
 * not as a new APK on every phone already sitting in a drawer somewhere
 * running this as a payment receiver.
 */

export const LOCAL_SMS_NETWORKS = { VODAFONE_CASH: "VODAFONE_CASH", INSTAPAY: "INSTAPAY" };

/** Any Egyptian mobile notation -> "01XXXXXXXXX", or null. Same rule as the Android parser's normalizeMobile. */
function normalizeMobile(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("20") && digits.length === 12) digits = "0" + digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = "0" + digits;
  return /^01\d{9}$/.test(digits) ? digits : null;
}

/**
 * What the patterns below run on: Arabic-Indic digits as ASCII, invisible
 * bidi marks dropped, exotic spaces as plain spaces. Line breaks are kept --
 * some patterns end a field at one. Mirrors TextNormalizer.forParsing in the
 * Android app.
 */
export function prepareReceiptText(text) {
  return String(text)
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[   -   　]/g, " ");
}

/** "5,000.00" -> 500000n piastres. String-based so float rounding never touches money. */
function toMinorUnits(raw) {
  const cleaned = raw.replace(/,/g, "");
  const [whole, frac = ""] = cleaned.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  try {
    return BigInt(whole || "0") * 100n + BigInt(fracPadded);
  } catch {
    return null;
  }
}

const VF = {
  /** Only incoming transfers. "تم استلام" is the receipt wording. */
  isReceipt: /تم\s+استلام\s+مبلغ/,
  /** Anchored to the receipt phrase so "رصيدك الحالي: ..." can never be read as the amount. */
  amount: /تم\s+استلام\s+مبلغ\s*([\d,]+(?:\.\d{1,2})?)\s*جنيه/,
  /** Both "من رقم 015…" and "من 010…؛" appear in the wild; also accepts international "+201…" / "00201…". */
  sender: /من\s+(?:رقم\s+)?((?:(?:\+|00)?20)?0?1\d{9})/,
  senderName: /المسجل\s+بإسم\s+([^\n؛.]+?)\s*(?:على\s+رقم|\n|؛|$)/,
  reference: /رقم\s+العملية:?\s*(\d+)/,
};

function parseVodafoneCash(sms) {
  const text = prepareReceiptText(sms);
  if (!VF.isReceipt.test(text)) return null;

  const amountMatch = text.match(VF.amount);
  if (!amountMatch) return null;
  const amountEgpMinor = toMinorUnits(amountMatch[1]);
  if (amountEgpMinor == null || amountEgpMinor <= 0n) return null;

  return {
    network: LOCAL_SMS_NETWORKS.VODAFONE_CASH,
    amountEgpMinor,
    senderPhone: normalizeMobile(text.match(VF.sender)?.[1]),
    senderName: text.match(VF.senderName)?.[1]?.trim() ?? null,
    transactionRef: text.match(VF.reference)?.[1] ?? null,
  };
}

const IPN = {
  isReceipt: /استقبلت\s+تحويل|تحويل\s+لحظي/,
  amount: /بمبلغ\s*([\d,]+(?:\.\d{1,2})?)\s*(?:جم|جنيه|EGP)/i,
  /** IPN receipts identify the sender by NAME only -- no phone number is ever included. */
  senderName: /من\s+([^\n]+?)\s+يوم\s/,
  reference: /رقم\s+المعامل[ةه]\s*([0-9a-zA-Z]+)/,
};

function parseInstaPay(sms) {
  const text = prepareReceiptText(sms);
  if (!IPN.isReceipt.test(text)) return null;

  const amountMatch = text.match(IPN.amount);
  if (!amountMatch) return null;
  const amountEgpMinor = toMinorUnits(amountMatch[1]);
  if (amountEgpMinor == null || amountEgpMinor <= 0n) return null;

  return {
    network: LOCAL_SMS_NETWORKS.INSTAPAY,
    amountEgpMinor,
    senderPhone: null,
    senderName: text.match(IPN.senderName)?.[1]?.trim() ?? null,
    transactionRef: text.match(IPN.reference)?.[1] ?? null,
  };
}

/** Try both formats; returns null when the text is not a payment receipt this server recognizes. */
export function parseLocalPaymentSms(sms) {
  if (typeof sms !== "string" || !sms.trim()) return null;
  return parseVodafoneCash(sms) ?? parseInstaPay(sms);
}
