package com.nizalo.paymentreceiver.sms

import java.util.regex.Pattern

object SmsParser {
    data class ParsedTransfer(
        val amountEgpMinor: Long,
        val senderPhone: String?,
        val senderName: String?
    )

    fun parseVodafoneCash(message: String): ParsedTransfer? {
        // "تم استلام 1500.00 جنيه من 01099999999 ..."
        // "You have received 1500.00 EGP from 01099999999 ..."
        // Simplified matching:
        val amountPattern = Pattern.compile("(?i)(?:استلام|received)\\s*([0-9]+\\.?[0-9]*)\\s*(?:جنيه|egp)")
        val phonePattern = Pattern.compile("(?:من|from)\\s*(01[0-9]{9})")
        
        val amountMatcher = amountPattern.matcher(message)
        if (!amountMatcher.find()) return null
        
        val amountDouble = amountMatcher.group(1)?.toDoubleOrNull() ?: return null
        val amountMinor = (amountDouble * 100).toLong()

        val phoneMatcher = phonePattern.matcher(message)
        val phone = if (phoneMatcher.find()) phoneMatcher.group(1) else null

        return ParsedTransfer(amountMinor, phone, null)
    }

    fun parseInstaPay(message: String): ParsedTransfer? {
        // "You received EGP 1500.00 from John Doe ..."
        // "تم استلام 1500.00 جنيه من John Doe ..."
        val amountPattern = Pattern.compile("(?i)(?:استلام|received)\\s*(?:egp\\s*)?([0-9]+\\.?[0-9]*)\\s*(?:جنيه|egp)?")
        val namePattern = Pattern.compile("(?i)(?:من|from)\\s+([A-Za-z\\s]+?)(?:\\s*\\.|\\s*on\\s|$)")

        val amountMatcher = amountPattern.matcher(message)
        if (!amountMatcher.find()) return null

        val amountDouble = amountMatcher.group(1)?.toDoubleOrNull() ?: return null
        val amountMinor = (amountDouble * 100).toLong()

        val nameMatcher = namePattern.matcher(message)
        val name = if (nameMatcher.find()) nameMatcher.group(1)?.trim() else null

        return ParsedTransfer(amountMinor, null, name)
    }
}
