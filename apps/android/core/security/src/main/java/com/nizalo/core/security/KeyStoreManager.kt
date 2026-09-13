package com.nizalo.core.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

interface SecureStorage {
    fun saveAccessToken(token: String)
    fun getAccessToken(): String?
    fun saveRefreshToken(token: String)
    fun getRefreshToken(): String?
    fun clearTokens()
    
    fun saveAntiPhishingCode(code: String)
    fun getAntiPhishingCode(): String?
    
    fun saveBiometricEnabled(enabled: Boolean)
    fun isBiometricEnabled(): Boolean
}

class KeyStoreManager(private val context: Context) : SecureStorage {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            "nz_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun saveAccessToken(token: String) {
        securePrefs.edit().putString(KEY_ACCESS_TOKEN, token).apply()
    }

    override fun getAccessToken(): String? {
        return securePrefs.getString(KEY_ACCESS_TOKEN, null)
    }

    override fun saveRefreshToken(token: String) {
        securePrefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    }

    override fun getRefreshToken(): String? {
        return securePrefs.getString(KEY_REFRESH_TOKEN, null)
    }

    override fun clearTokens() {
        securePrefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .apply()
    }

    override fun saveAntiPhishingCode(code: String) {
        securePrefs.edit().putString(KEY_ANTI_PHISHING, code).apply()
    }

    override fun getAntiPhishingCode(): String? {
        return securePrefs.getString(KEY_ANTI_PHISHING, null)
    }

    override fun saveBiometricEnabled(enabled: Boolean) {
        securePrefs.edit().putBoolean(KEY_BIOMETRIC_ENABLED, enabled).apply()
    }

    override fun isBiometricEnabled(): Boolean {
        return securePrefs.getBoolean(KEY_BIOMETRIC_ENABLED, false)
    }

    companion object {
        private const val KEY_ACCESS_TOKEN = "nz_access_token"
        private const val KEY_REFRESH_TOKEN = "nz_refresh_token"
        private const val KEY_ANTI_PHISHING = "nz_anti_phishing_code"
        private const val KEY_BIOMETRIC_ENABLED = "nz_biometric_enabled"
    }
}
