package com.nizalo.paymentreceiver.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class Settings(
    val baseUrl: String = "",
    val vodafoneEnabled: Boolean = true,
    val instapayEnabled: Boolean = true,
    val wifiOnly: Boolean = false,
    val detailedLogging: Boolean = false,
    val autoSync: Boolean = true,
    val notifyWithdrawals: Boolean = true,
    val notifyPayments: Boolean = true,
    /** Backend `local_payment_number.id`s this phone receives on, per provider. */
    val vodafoneNumberIds: Set<String> = emptySet(),
    val instapayNumberIds: Set<String> = emptySet(),
    /** Dev builds only; ignored everywhere else. */
    val useMockBackend: Boolean = false,
    val lastInboxScanAt: Long = 0L,
)

/** Non-secret settings. The connection token is NOT here -- see SecureStore. */
class SettingsRepository(private val store: DataStore<Preferences>) {
    private object K {
        val baseUrl = stringPreferencesKey("base_url")
        val vodafone = booleanPreferencesKey("vodafone_enabled")
        val instapay = booleanPreferencesKey("instapay_enabled")
        val wifiOnly = booleanPreferencesKey("wifi_only")
        val detailed = booleanPreferencesKey("detailed_logging")
        val autoSync = booleanPreferencesKey("auto_sync")
        val notifyW = booleanPreferencesKey("notify_withdrawals")
        val notifyP = booleanPreferencesKey("notify_payments")
        val vfNumbers = stringSetPreferencesKey("vodafone_number_ids")
        val ipnNumbers = stringSetPreferencesKey("instapay_number_ids")
        val mock = booleanPreferencesKey("use_mock_backend")
        val inboxScan = longPreferencesKey("last_inbox_scan_at")
    }

    val settings: Flow<Settings> = store.data.map { p ->
        Settings(
            baseUrl = p[K.baseUrl] ?: "",
            vodafoneEnabled = p[K.vodafone] ?: true,
            instapayEnabled = p[K.instapay] ?: true,
            wifiOnly = p[K.wifiOnly] ?: false,
            detailedLogging = p[K.detailed] ?: false,
            autoSync = p[K.autoSync] ?: true,
            notifyWithdrawals = p[K.notifyW] ?: true,
            notifyPayments = p[K.notifyP] ?: true,
            vodafoneNumberIds = p[K.vfNumbers] ?: emptySet(),
            instapayNumberIds = p[K.ipnNumbers] ?: emptySet(),
            useMockBackend = p[K.mock] ?: false,
            lastInboxScanAt = p[K.inboxScan] ?: 0L,
        )
    }

    suspend fun current(): Settings = settings.first()

    suspend fun save(s: Settings) {
        store.edit { p ->
            p[K.baseUrl] = s.baseUrl
            p[K.vodafone] = s.vodafoneEnabled
            p[K.instapay] = s.instapayEnabled
            p[K.wifiOnly] = s.wifiOnly
            p[K.detailed] = s.detailedLogging
            p[K.autoSync] = s.autoSync
            p[K.notifyW] = s.notifyWithdrawals
            p[K.notifyP] = s.notifyPayments
            p[K.vfNumbers] = s.vodafoneNumberIds
            p[K.ipnNumbers] = s.instapayNumberIds
            p[K.mock] = s.useMockBackend
        }
    }

    suspend fun setLastInboxScanAt(at: Long) {
        store.edit { it[K.inboxScan] = at }
    }

    companion object {
        /** https only, except plain http where the build allows it (dev: local servers). */
        fun validateBaseUrl(raw: String, allowCleartext: Boolean): String? {
            val url = raw.trim()
            if (url.isEmpty()) return "required"
            val parsed = runCatching { java.net.URI(url) }.getOrNull() ?: return "invalid"
            val scheme = parsed.scheme?.lowercase()
            if (parsed.host.isNullOrBlank()) return "invalid"
            if (parsed.userInfo != null || parsed.rawQuery != null || parsed.rawFragment != null) return "invalid"
            return when (scheme) {
                "https" -> null
                "http" -> if (allowCleartext) null else "https_required"
                else -> "invalid"
            }
        }

        fun normalizeBaseUrl(raw: String): String = raw.trim().trimEnd('/')
    }
}
