package com.nizalo.core.security

class AntiPhishingGuard(private val secureStorage: SecureStorage) {

    fun getDisplayAntiPhishingCode(): String {
        return secureStorage.getAntiPhishingCode() ?: "UNSET"
    }

    fun isConfigured(): Boolean {
        return secureStorage.getAntiPhishingCode()?.isNotBlank() == true
    }

    fun setCode(code: String) {
        require(code.length in 4..20) { "Anti-phishing phrase must be 4-20 characters" }
        secureStorage.saveAntiPhishingCode(code.trim())
    }
}
