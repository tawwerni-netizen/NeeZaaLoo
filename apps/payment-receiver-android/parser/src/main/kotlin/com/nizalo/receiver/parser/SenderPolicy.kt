package com.nizalo.receiver.parser

/**
 * Whether an SMS sender could plausibly be a payment provider.
 *
 * Providers send from alphanumeric sender IDs ("VF-Cash", "CIB") or short
 * codes. A receipt from an ordinary mobile number is what a fake one looks
 * like: anyone who knows the operator's number can type "تم استلام مبلغ ..."
 * and send it. The server applies the same rule
 * (packages/payments/src/local-payments.mjs, isPersonalNumberSender) and
 * never auto-credits such a report, whatever the phone decided.
 */
object SenderPolicy {
    private const val MIN_PERSONAL_NUMBER_DIGITS = 8

    fun isPersonalNumber(address: String?): Boolean {
        if (address.isNullOrBlank()) return false
        val compact = address.replace(Regex("[\\s()-]"), "")
        if (!Regex("^\\+?\\d+$").matches(compact)) return false
        return compact.count { it.isDigit() } >= MIN_PERSONAL_NUMBER_DIGITS
    }
}
