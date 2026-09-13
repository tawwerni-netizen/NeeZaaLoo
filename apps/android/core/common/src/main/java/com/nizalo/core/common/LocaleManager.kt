package com.nizalo.core.common

import java.util.Locale

enum class SupportedLocale(val code: String, val displayName: String, val isRtl: Boolean) {
    ENGLISH("en", "English", false),
    CHINESE("zh", "简体中文", false),
    HINDI("hi", "हिन्दी", false),
    SPANISH("es", "Español", false),
    ARABIC("ar", "العربية", true),
    FRENCH("fr", "Français", false);

    companion object {
        fun fromCode(code: String): SupportedLocale {
            val prefix = code.split("-", "_").firstOrNull()?.lowercase() ?: "en"
            return entries.find { it.code == prefix } ?: ENGLISH
        }
    }
}

object LocaleManager {
    fun getSupportedLocale(languageCode: String): SupportedLocale {
        return SupportedLocale.fromCode(languageCode)
    }

    fun isRtl(languageCode: String): Boolean {
        return getSupportedLocale(languageCode).isRtl
    }
}
