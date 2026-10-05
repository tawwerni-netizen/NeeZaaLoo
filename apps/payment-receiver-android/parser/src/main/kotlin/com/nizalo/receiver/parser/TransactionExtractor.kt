package com.nizalo.receiver.parser

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Pulls fields out of a receipt whose provider is already known.
 *
 * The Arabic patterns are the same ones packages/payments/src/sms-parsers.mjs
 * uses on the server, built from real captured messages. The server re-reads
 * every receipt itself and its reading is the one credited; this copy exists
 * so the phone can decide what is worth sending, show the operator what it
 * saw, and work offline.
 */
object TransactionExtractor {
    data class Fields(
        val amountPiastres: Long?,
        val amountMalformed: Boolean,
        val senderName: String?,
        val senderPhone: String?,
        val reference: String?,
    )

    private object Vf {
        /** Anchored to the receipt phrase so "رصيدك الحالي: ..." can never be read as the amount. */
        val amount = Regex("تم\\s+استلام\\s+مبلغ\\s*([\\d,]+(?:\\.\\d+)?)\\s*جنيه")
        /** Local "01…", or international "+201…" / "00201…" (which drops the leading 0). */
        val sender = Regex("من\\s+(?:رقم\\s+)?((?:(?:\\+|00)?20)?0?1\\d{9})")
        val senderName = Regex("المسجل\\s+بإسم\\s+([^\\n؛.]+?)\\s*(?:على\\s+رقم|\\n|؛|$)")
        val reference = Regex("رقم\\s+العملية:?\\s*(\\d+)")

        val amountEn = Regex("(?i)received\\s+(?:EGP|LE)?\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:EGP|LE|pounds?)?")
        val senderEn = Regex("(?i)from\\s+(?:number\\s+)?((?:(?:\\+|00)?20)?0?1\\d{9})")
        val referenceEn = Regex("(?i)(?:transaction|trx|ref(?:erence)?)\\s*(?:id|no\\.?|number)?\\s*[:#]?\\s*([0-9A-Za-z]{6,})")
    }

    private object Ipn {
        val amount = Regex("(?i)بمبلغ\\s*([\\d,]+(?:\\.\\d+)?)\\s*(?:جم|جنيه|EGP)")
        /** IPN receipts identify the sender by NAME only -- no phone number is ever included. */
        val senderName = Regex("من\\s+([^\\n]+?)\\s+يوم\\s")
        val reference = Regex("رقم\\s+المعامل[ةه]\\s*([0-9a-zA-Z]+)")

        val amountEn = Regex("(?i)(?:amount\\s+(?:of\\s+)?)?(?:EGP|LE)\\s*([\\d,]+(?:\\.\\d+)?)|([\\d,]+(?:\\.\\d+)?)\\s*(?:EGP|LE)")
        val senderNameEn = Regex("(?i)from\\s+([A-Za-z][A-Za-z .'-]{1,60}?)\\s+(?:on|at|ref|via)\\b")
        val referenceEn = Regex("(?i)(?:ref(?:erence)?|transaction)\\s*(?:id|no\\.?|number)?\\s*[:#]?\\s*([0-9A-Za-z]{6,})")
    }

    fun extract(provider: Provider, normalizedText: String, verifiedFormat: Boolean): Fields {
        val text = normalizedText
        return when (provider) {
            Provider.VODAFONE_CASH -> {
                val amountRaw = (if (verifiedFormat) Vf.amount else Vf.amountEn).find(text)?.groupValues?.get(1)
                val (amount, malformed) = toPiastres(amountRaw)
                val phoneRaw = (if (verifiedFormat) Vf.sender else Vf.senderEn).find(text)?.groupValues?.get(1)
                Fields(
                    amountPiastres = amount,
                    amountMalformed = malformed,
                    senderName = if (verifiedFormat) Vf.senderName.find(text)?.groupValues?.get(1)?.trim()?.ifEmpty { null } else null,
                    senderPhone = normalizeMobile(phoneRaw),
                    reference = (if (verifiedFormat) Vf.reference else Vf.referenceEn).find(text)?.groupValues?.get(1),
                )
            }
            Provider.INSTAPAY -> {
                val match = (if (verifiedFormat) Ipn.amount else Ipn.amountEn).find(text)
                val amountRaw = match?.groupValues?.drop(1)?.firstOrNull { it.isNotEmpty() }
                val (amount, malformed) = toPiastres(amountRaw)
                Fields(
                    amountPiastres = amount,
                    amountMalformed = malformed,
                    senderName = (if (verifiedFormat) Ipn.senderName else Ipn.senderNameEn).find(text)?.groupValues?.get(1)?.trim()?.ifEmpty { null },
                    senderPhone = null,
                    reference = (if (verifiedFormat) Ipn.reference else Ipn.referenceEn).find(text)?.groupValues?.get(1),
                )
            }
        }
    }

    /** Any Egyptian mobile notation -> "01XXXXXXXXX", or null if it is not one. Same rule as the server's normalizeMobile. */
    fun normalizeMobile(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        var digits = raw.filter { it.isDigit() }
        if (digits.startsWith("00")) digits = digits.drop(2)
        if (digits.startsWith("20") && digits.length == 12) digits = "0" + digits.drop(2)
        if (digits.length == 10 && digits.startsWith("1")) digits = "0$digits"
        return if (Regex("^01\\d{9}$").matches(digits)) digits else null
    }

    /**
     * "5,000.00" -> 500000. Returns (null, true) for text that looks like an
     * amount but is not a valid one ("1,2,3", "5.001" sub-piastre), and
     * (null, false) when there was no amount at all -- the two are different
     * findings for the operator.
     */
    internal fun toPiastres(raw: String?): Pair<Long?, Boolean> {
        if (raw.isNullOrBlank()) return null to false
        if (!Regex("^\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?$|^\\d+(?:\\.\\d+)?$").matches(raw)) return null to true
        return try {
            val value = BigDecimal(raw.replace(",", ""))
            if (value.scale() > 2 && value.stripTrailingZeros().scale() > 2) return null to true
            value.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact() to false
        } catch (e: ArithmeticException) {
            null to true
        } catch (e: NumberFormatException) {
            null to true
        }
    }
}
