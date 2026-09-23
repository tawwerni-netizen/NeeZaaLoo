package com.nizalo.paymentreceiver.data.legacy

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.nizalo.paymentreceiver.data.repo.AuditLog
import com.nizalo.paymentreceiver.data.repo.AuditType
import com.nizalo.paymentreceiver.data.repo.TransactionRepository
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.domain.TransactionSource
import com.nizalo.paymentreceiver.security.SecureStore

/**
 * One-time upgrade from the 1.x app on the same install:
 * - receipts it had not managed to send are carried over (the backend's
 *   duplicate checks make carrying over an already-sent one harmless);
 * - its server address and device key move into the new settings and the
 *   encrypted store, and the plaintext copies are deleted.
 */
class LegacyImporter(
    private val context: Context,
    private val transactions: TransactionRepository,
    private val settings: SettingsRepository,
    private val secureStore: SecureStore,
    private val audit: AuditLog,
) {
    suspend fun runOnce() {
        importPrefs()
        importUnsentReceipts()
    }

    private suspend fun importPrefs() {
        val prefs = context.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)
        if (prefs.all.isEmpty()) return
        val url = prefs.getString("server_url", null)
        val key = prefs.getString("device_api_key", null)
        val numberIds = prefs.getString("receiving_number_id", null)
            ?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() && it != "default_num" }.orEmpty()

        val s = settings.current()
        settings.save(
            s.copy(
                baseUrl = s.baseUrl.ifBlank { url?.trim()?.trimEnd('/') ?: "" },
                vodafoneNumberIds = s.vodafoneNumberIds.ifEmpty { numberIds.filter { it.startsWith("vf") }.toSet() },
                instapayNumberIds = s.instapayNumberIds.ifEmpty { numberIds.filter { it.startsWith("instapay") }.toSet() },
            )
        )
        if (!key.isNullOrBlank() && !secureStore.hasToken()) secureStore.setToken(key.trim())
        prefs.edit().clear().commit()
        context.deleteSharedPreferences(LEGACY_PREFS)
        audit.record(AuditType.LEGACY_IMPORT, "settings imported from v1")
    }

    private suspend fun importUnsentReceipts() {
        val file = context.getDatabasePath(LEGACY_DB)
        if (!file.exists()) return
        var carried = 0
        runCatching {
            SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(
                    "SELECT rawMessage, observedAt FROM local_transfers WHERE status IN ('QUEUED','FAILED')", null
                ).use { c ->
                    while (c.moveToNext()) {
                        // v1 never stored the SMS sender: these go to the backend as
                        // "unknown" and land in review, never auto-credited.
                        transactions.ingest(c.getString(0), null, c.getLong(1), TransactionSource.LEGACY_IMPORT)
                        carried++
                    }
                }
            }
        }
        context.deleteDatabase(LEGACY_DB)
        audit.record(AuditType.LEGACY_IMPORT, "carried over $carried unsent receipt(s) from v1")
    }

    private companion object {
        const val LEGACY_PREFS = "nizalo_prefs"
        const val LEGACY_DB = "payment_receiver_db"
    }
}
