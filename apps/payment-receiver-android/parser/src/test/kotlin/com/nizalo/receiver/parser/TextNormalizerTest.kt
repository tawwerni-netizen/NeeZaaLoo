package com.nizalo.receiver.parser

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

class TextNormalizerTest {
    @Test
    fun `fingerprint matches the server's for the same receipt`() {
        assertEquals(Fixtures.VF_1_SERVER_FINGERPRINT, TextNormalizer.fingerprint(Provider.VODAFONE_CASH, Fixtures.VF_1))
    }

    @Test
    fun `a duplicate delivery hashes the same despite digits, CRLF and bidi marks`() {
        // The same variant the Node side hashes to VF_1_SERVER_FINGERPRINT.
        val variant = "‏" + Fixtures.VF_1.replace("500.00", "٥٠٠.٠٠").replace("\n", "\r\n  ") + " "
        assertEquals(Fixtures.VF_1_SERVER_FINGERPRINT, TextNormalizer.fingerprint(Provider.VODAFONE_CASH, variant))
    }

    @Test
    fun `a different receipt or provider hashes differently`() {
        val base = TextNormalizer.fingerprint(Provider.VODAFONE_CASH, Fixtures.VF_1)
        assertNotEquals(base, TextNormalizer.fingerprint(Provider.VODAFONE_CASH, Fixtures.VF_1.replace("500.00", "501.00")))
        assertNotEquals(base, TextNormalizer.fingerprint(Provider.INSTAPAY, Fixtures.VF_1))
    }

    @Test
    fun `parsing normalization keeps line breaks`() {
        assertEquals("a\nb 1", TextNormalizer.forParsing("a\nb ١"))
    }
}
