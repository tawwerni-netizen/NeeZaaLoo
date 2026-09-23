package com.nizalo.receiver.parser

/** Turns extracted fields into a confidence verdict. Never fills in a missing value. */
object TransactionValidator {
    /** 1,000,000 EGP: far above any real deposit, low enough to catch a misread balance or reference. */
    const val MAX_AMOUNT_PIASTRES = 100_000_000L

    fun validate(
        fields: TransactionExtractor.Fields,
        verifiedFormat: Boolean,
        senderAddress: String?,
    ): Pair<Confidence, Set<ParseIssue>> {
        val issues = mutableSetOf<ParseIssue>()
        val amount = fields.amountPiastres
        when {
            fields.amountMalformed -> issues += ParseIssue.INVALID_AMOUNT
            amount == null -> issues += ParseIssue.MISSING_AMOUNT
            amount <= 0L -> issues += ParseIssue.INVALID_AMOUNT
            amount > MAX_AMOUNT_PIASTRES -> issues += ParseIssue.AMOUNT_OUT_OF_RANGE
        }
        if (!verifiedFormat) issues += ParseIssue.UNVERIFIED_FORMAT
        if (SenderPolicy.isPersonalNumber(senderAddress)) issues += ParseIssue.UNTRUSTED_SENDER
        if (fields.reference == null) issues += ParseIssue.MISSING_REFERENCE
        if (fields.senderName == null && fields.senderPhone == null) issues += ParseIssue.MISSING_SENDER

        val confidence = if (issues.any { it.blocksAutoSend }) Confidence.NEEDS_REVIEW else Confidence.VALID
        return confidence to issues
    }
}
