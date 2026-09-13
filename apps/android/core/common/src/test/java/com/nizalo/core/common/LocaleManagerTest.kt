package com.nizalo.core.common

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LocaleManagerTest {

    @Test
    fun `test all 6 supported languages are recognized`() {
        assertEquals(SupportedLocale.ENGLISH, LocaleManager.getSupportedLocale("en"))
        assertEquals(SupportedLocale.CHINESE, LocaleManager.getSupportedLocale("zh"))
        assertEquals(SupportedLocale.HINDI, LocaleManager.getSupportedLocale("hi"))
        assertEquals(SupportedLocale.SPANISH, LocaleManager.getSupportedLocale("es"))
        assertEquals(SupportedLocale.ARABIC, LocaleManager.getSupportedLocale("ar"))
        assertEquals(SupportedLocale.FRENCH, LocaleManager.getSupportedLocale("fr"))
    }

    @Test
    fun `test Arabic is flagged as RTL and others as LTR`() {
        assertTrue(LocaleManager.isRtl("ar"))
        assertTrue(SupportedLocale.ARABIC.isRtl)

        assertFalse(LocaleManager.isRtl("en"))
        assertFalse(LocaleManager.isRtl("zh"))
        assertFalse(LocaleManager.isRtl("hi"))
        assertFalse(LocaleManager.isRtl("es"))
        assertFalse(LocaleManager.isRtl("fr"))
    }
}
