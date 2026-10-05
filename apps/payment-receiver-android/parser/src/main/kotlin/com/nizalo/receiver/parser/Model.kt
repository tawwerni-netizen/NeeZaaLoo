package com.nizalo.receiver.parser

enum class Provider(val wireName: String) {
    VODAFONE_CASH("VODAFONE_CASH"),
    INSTAPAY("INSTAPAY"),
}

/**
 * How far a parsed receipt can be trusted:
 * - [VALID]: a verified receipt format with every field a credit needs. Sent automatically.
 * - [NEEDS_REVIEW]: recognizably a payment receipt, but something a credit
 *   depends on is missing or doubtful. Kept on the phone, never sent
 *   automatically -- the operator decides.
 * - [INVALID]: not an incoming payment receipt at all. Ignored.
 */
enum class Confidence { VALID, NEEDS_REVIEW, INVALID }

enum class ParseIssue(val blocksAutoSend: Boolean) {
    NOT_A_RECEIPT(true),
    MISSING_AMOUNT(true),
    INVALID_AMOUNT(true),
    AMOUNT_OUT_OF_RANGE(true),
    /** English-language receipt: recognized, but no real captured sample has verified the format. */
    UNVERIFIED_FORMAT(true),
    /** Came from a personal mobile number, which no provider sends receipts from. */
    UNTRUSTED_SENDER(true),
    MISSING_REFERENCE(false),
    MISSING_SENDER(false),
}

data class ParsedReceipt(
    val provider: Provider?,
    /** EGP piastres. Integer only: money never passes through floating point. */
    val amountPiastres: Long?,
    val senderName: String?,
    val senderPhone: String?,
    val reference: String?,
    val confidence: Confidence,
    val issues: Set<ParseIssue>,
) {
    val canAutoSend: Boolean get() = confidence == Confidence.VALID

    companion object {
        fun notAReceipt() = ParsedReceipt(
            provider = null, amountPiastres = null, senderName = null, senderPhone = null, reference = null,
            confidence = Confidence.INVALID, issues = setOf(ParseIssue.NOT_A_RECEIPT),
        )
    }
}
