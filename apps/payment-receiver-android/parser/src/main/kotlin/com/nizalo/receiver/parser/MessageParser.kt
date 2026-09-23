package com.nizalo.receiver.parser

/**
 * The one entry point: the SMS receiver, the inbox catch-up scan and Test
 * Mode all call [parse], so Test Mode shows exactly what production does.
 */
object MessageParser {
    /**
     * @param senderAddress the SMS originating address, or null when there is
     *   none (Test Mode). Null is never treated as trusted by the server; here
     *   it only means "not checked".
     */
    fun parse(rawText: String, senderAddress: String? = null): ParsedReceipt {
        if (rawText.isBlank()) return ParsedReceipt.notAReceipt()
        val text = TextNormalizer.forParsing(rawText)
        val detection = ProviderDetector.detect(text) ?: return ParsedReceipt.notAReceipt()
        val fields = TransactionExtractor.extract(detection.provider, text, detection.verifiedFormat)
        val (confidence, issues) = TransactionValidator.validate(fields, detection.verifiedFormat, senderAddress)
        return ParsedReceipt(
            provider = detection.provider,
            amountPiastres = fields.amountPiastres,
            senderName = fields.senderName,
            senderPhone = fields.senderPhone,
            reference = fields.reference,
            confidence = confidence,
            issues = issues,
        )
    }
}
