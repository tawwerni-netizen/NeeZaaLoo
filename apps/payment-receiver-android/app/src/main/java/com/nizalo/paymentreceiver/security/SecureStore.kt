package com.nizalo.paymentreceiver.security

import android.content.SharedPreferences
import java.security.SecureRandom

/**
 * The connection token and the database passphrase, both encrypted with
 * [SecretCipher] before they touch disk. Nothing here is ever logged; the
 * token has no toString path out of this class other than [token].
 */
class SecureStore(private val prefs: SharedPreferences, private val cipher: SecretCipher) {

    fun token(): String? = prefs.getString(KEY_TOKEN, null)?.let { decryptOrNull(it) }?.let { String(it, Charsets.UTF_8) }

    fun hasToken(): Boolean = !token().isNullOrEmpty()

    fun setToken(value: String?) {
        prefs.edit().apply {
            if (value.isNullOrEmpty()) remove(KEY_TOKEN) else putString(KEY_TOKEN, cipher.encrypt(value.toByteArray(Charsets.UTF_8)))
        }.apply()
    }

    /** 32 random bytes, created once, used as the SQLCipher key. */
    @Synchronized
    fun databasePassphrase(): ByteArray {
        prefs.getString(KEY_DB, null)?.let { stored -> decryptOrNull(stored)?.let { return it } }
        val fresh = ByteArray(32).also { SecureRandom().nextBytes(it) }
        // commit(), not apply(): if the process died before an async write
        // landed, the database would be encrypted under a key nobody kept.
        prefs.edit().putString(KEY_DB, cipher.encrypt(fresh)).commit()
        return fresh
    }

    private fun decryptOrNull(encoded: String): ByteArray? = runCatching { cipher.decrypt(encoded) }.getOrNull()

    private companion object {
        const val KEY_TOKEN = "connection_token"
        const val KEY_DB = "db_passphrase"
    }
}
