package com.nizalo.paymentreceiver.sms

import java.math.BigDecimal
import java.util.regex.Pattern

/**
 * Parsers for the payment SMS formats actually sent by Vodafone Cash and by
 * banks over InstaPay.
 *
 * Ported from tawwerni.com's `sms-parsers.ts`, which was built from real
 * captured messages rather than guesses — this file exists so the platform
 * doesn't ship a second, untested guess at the same problem. The one change
 * from that version: amounts here resolve straight to EGP minor units
 * (piastres) as a Long, because Nizalo's ledger needs sub-pound precision
 * that a course-purchase gate never did.
 *
 * Detection is content-based, not sender-based, on purpose: an InstaPay
 * receipt arrives from whichever bank the sender used (CIB, NBE, QNB, ...),
 * never from a literal "InstaPay" address, so gating on the SMS sender ID
 * would silently drop every real transfer.
 */
object SmsParser {
    data class ParsedTransfer(
        val amountEgpMinor: Long,
        val senderPhone: String?,
        val senderName: String?,
        val transactionRef: String?
    )

    private val EG_MOBILE = Pattern.compile("(?:\\+?20)?(01\\d{9})")

    private fun normalizeMobile(raw: String?): String? {
        if (raw.isNullOrEmpty()) return null
        val m = EG_MOBILE.matcher(raw)
        return if (m.find()) m.group(1) else null
    }

    /** "5,000.00" -> 500000 piastres. String-based so float rounding never touches money. */
    private fun toMinorUnits(raw: String): Long? {
        val cleaned = raw.replace(",", "")
        return try {
            BigDecimal(cleaned).movePointRight(2).toBigIntegerExact().toLong()
        } catch (e: ArithmeticException) {
            // A sub-piastre fraction slipped in (shouldn't happen from a real SMS) — round instead of failing closed.
            BigDecimal(cleaned).movePointRight(2).toLong()
        } catch (e: NumberFormatException) {
            null
        }
    }

    private fun find(pattern: Pattern, text: String, group: Int = 1): String? {
        val m = pattern.matcher(text)
        return if (m.find()) m.group(group) else null
    }

    // ------------------------------------------------------------------
    // Vodafone Cash
    // ------------------------------------------------------------------

    private object VF {
        /** Only incoming transfers. "تم استلام" is the receipt wording. */
        val isReceipt: Pattern = Pattern.compile("تم\\s+استلام\\s+مبلغ")

        /** Anchored to the receipt phrase so "رصيدك الحالي: ..." can never be read as the amount. */
        val amount: Pattern = Pattern.compile("تم\\s+استلام\\s+مبلغ\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*جنيه")

        /** Both "من رقم 015…" and "من 010…؛" appear in the wild. */
        val sender: Pattern = Pattern.compile("من\\s+(?:رقم\\s+)?((?:\\+?20)?01\\d{9})")

        val senderName: Pattern = Pattern.compile("المسجل\\s+بإسم\\s+([^\\n؛.]+?)\\s*(?:على\\s+رقم|\\n|؛|$)")

        val reference: Pattern = Pattern.compile("رقم\\s+العملية:?\\s*(\\d+)")
    }

    fun parseVodafoneCash(message: String): ParsedTransfer? {
        val text = message.replace(' ', ' ')
        if (!VF.isReceipt.matcher(text).find()) return null

        val amountRaw = find(VF.amount, text) ?: return null
        val amountMinor = toMinorUnits(amountRaw) ?: return null
        if (amountMinor <= 0) return null

        return ParsedTransfer(
            amountEgpMinor = amountMinor,
            senderPhone = normalizeMobile(find(VF.sender, text)),
            senderName = find(VF.senderName, text)?.trim(),
            transactionRef = find(VF.reference, text)
        )
    }

    // ------------------------------------------------------------------
    // InstaPay (IPN)
    // ------------------------------------------------------------------

    private object IPN {
        val isReceipt: Pattern = Pattern.compile("استقبلت\\s+تحويل|تحويل\\s+لحظي")

        val amount: Pattern = Pattern.compile("بمبلغ\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:جم|جنيه|EGP)", Pattern.CASE_INSENSITIVE)

        /** IPN receipts identify the sender by NAME only — no phone number is ever included. */
        val senderName: Pattern = Pattern.compile("من\\s+([^\\n]+?)\\s+يوم\\s")

        val reference: Pattern = Pattern.compile("رقم\\s+المعامل[ةه]\\s*([0-9a-zA-Z]+)")
    }

    fun parseInstaPay(message: String): ParsedTransfer? {
        val text = message.replace(' ', ' ')
        if (!IPN.isReceipt.matcher(text).find()) return null

        val amountRaw = find(IPN.amount, text) ?: return null
        val amountMinor = toMinorUnits(amountRaw) ?: return null
        if (amountMinor <= 0) return null

        return ParsedTransfer(
            amountEgpMinor = amountMinor,
            senderPhone = null,
            senderName = find(IPN.senderName, text)?.trim(),
            transactionRef = find(IPN.reference, text)
        )
    }

    /** Cheap pre-filter so non-payment SMS/notifications never reach Room or the sync worker. */
    fun looksLikePayment(message: String): Boolean {
        return VF.isReceipt.matcher(message).find() || IPN.isReceipt.matcher(message).find()
    }

    /** Try both formats; returns null when the text is not a payment receipt at all. */
    fun parseAny(message: String): Pair<String, ParsedTransfer>? {
        parseVodafoneCash(message)?.let { return "VODAFONE_CASH" to it }
        parseInstaPay(message)?.let { return "INSTAPAY" to it }
        return null
    }
}
