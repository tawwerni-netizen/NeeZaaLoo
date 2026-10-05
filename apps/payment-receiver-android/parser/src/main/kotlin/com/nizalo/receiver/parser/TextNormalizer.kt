package com.nizalo.receiver.parser

import java.security.MessageDigest
import java.text.Normalizer

/**
 * Two levels of normalization, both mirrored on the server in
 * packages/payments/src/local-payments.mjs and sms-parsers.mjs:
 *
 * - [forParsing]: what the extraction patterns run on. Arabic-Indic digits
 *   become ASCII, invisible bidi marks are dropped, exotic spaces become a
 *   plain space. Line breaks are KEPT: some patterns end a field at one.
 * - [normalize]: [forParsing] plus every whitespace run collapsed to one
 *   space. Only used for [fingerprint], which must hash identically on the
 *   phone and on the server; `TextNormalizerTest` pins both to the same hex.
 */
object TextNormalizer {
    private val bidiAndZeroWidth = Regex("[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]")
    private val horizontalSpaces = Regex("[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]")
    private val whitespace = Regex("(?U)\\s+")

    fun forParsing(text: String): String {
        val nfkc = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val sb = StringBuilder(nfkc.length)
        for (ch in nfkc) {
            sb.append(
                when (ch) {
                    in '٠'..'٩' -> '0' + (ch - '٠')
                    in '۰'..'۹' -> '0' + (ch - '۰')
                    else -> ch
                }
            )
        }
        return sb.toString()
            .replace(bidiAndZeroWidth, "")
            .replace(horizontalSpaces, " ")
    }

    fun normalize(text: String): String = forParsing(text).replace(whitespace, " ").trim()

    fun fingerprint(provider: Provider, text: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("${provider.wireName}\n${normalize(text)}".toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
