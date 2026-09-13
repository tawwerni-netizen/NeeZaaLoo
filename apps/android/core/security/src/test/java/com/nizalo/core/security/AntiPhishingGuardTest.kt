package com.nizalo.core.security

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class FakeSecureStorage : SecureStorage {
    private var accessToken: String? = null
    private var refreshToken: String? = null
    private var antiPhishingCode: String? = null
    private var biometricEnabled: Boolean = false

    override fun saveAccessToken(token: String) { accessToken = token }
    override fun getAccessToken(): String? = accessToken
    override fun saveRefreshToken(token: String) { refreshToken = token }
    override fun getRefreshToken(): String? = refreshToken
    override fun clearTokens() { accessToken = null; refreshToken = null }
    override fun saveAntiPhishingCode(code: String) { antiPhishingCode = code }
    override fun getAntiPhishingCode(): String? = antiPhishingCode
    override fun saveBiometricEnabled(enabled: Boolean) { biometricEnabled = enabled }
    override fun isBiometricEnabled(): Boolean = biometricEnabled
}

class AntiPhishingGuardTest {

    @Test
    fun `test anti phishing code lifecycle and validation`() {
        val storage = FakeSecureStorage()
        val guard = AntiPhishingGuard(storage)

        assertFalse(guard.isConfigured())
        assertEquals("UNSET", guard.getDisplayAntiPhishingCode())

        guard.setCode("SHIELD-NZ-2026")
        assertTrue(guard.isConfigured())
        assertEquals("SHIELD-NZ-2026", guard.getDisplayAntiPhishingCode())

        // Test invalid short length throws exception
        assertThrows(IllegalArgumentException::class.java) {
            guard.setCode("AB")
        }
    }
}
