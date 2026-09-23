package com.nizalo.receiver.parser

/**
 * Decides which provider an INCOMING receipt came from, by content.
 *
 * Content, not SMS sender ID: an InstaPay receipt arrives from whichever bank
 * the payer used (CIB, NBE, QNB, ...), never from a literal "InstaPay"
 * address. Whether the sender itself is trustworthy is a separate question,
 * answered by [SenderPolicy].
 *
 * Outgoing transfers, balance enquiries, OTPs and promotions all mention the
 * same providers and amounts; each receipt pattern is anchored to wording
 * only an incoming transfer uses.
 */
object ProviderDetector {
    internal val vodafoneArabic = Regex("تم\\s+استلام\\s+مبلغ")
    internal val instapayArabic = Regex("استقبلت\\s+تحويل|تحويل\\s+لحظي")

    // English-language receipts: recognized so they are not silently dropped,
    // but held for review (see ParseIssue.UNVERIFIED_FORMAT).
    internal val vodafoneEnglish = Regex(
        "(?i)\\b(?:you\\s+have\\s+)?received\\b.{0,40}?\\b(?:EGP|LE|pounds?)\\b.*?\\b(?:vodafone\\s*cash|vf\\s*cash|wallet)\\b|" +
            "(?i)\\bvodafone\\s*cash\\b.*?\\breceived\\b",
        RegexOption.DOT_MATCHES_ALL,
    )
    internal val instapayEnglish = Regex("(?i)\\binstapay\\b.*?\\b(?:received|incoming)\\b|(?i)\\b(?:received|incoming)\\b.*?\\binstapay\\b|(?i)\\bIPN\\b.*?\\breceived\\b",
        RegexOption.DOT_MATCHES_ALL)

    data class Detection(val provider: Provider, val verifiedFormat: Boolean)

    fun detect(normalizedText: String): Detection? = when {
        vodafoneArabic.containsMatchIn(normalizedText) -> Detection(Provider.VODAFONE_CASH, verifiedFormat = true)
        instapayArabic.containsMatchIn(normalizedText) -> Detection(Provider.INSTAPAY, verifiedFormat = true)
        instapayEnglish.containsMatchIn(normalizedText) -> Detection(Provider.INSTAPAY, verifiedFormat = false)
        vodafoneEnglish.containsMatchIn(normalizedText) -> Detection(Provider.VODAFONE_CASH, verifiedFormat = false)
        else -> null
    }
}
