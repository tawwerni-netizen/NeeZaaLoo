package com.nizalo.paymentreceiver.sms

import android.Manifest
import android.content.ContentResolver
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.nizalo.paymentreceiver.data.repo.IngestResult
import com.nizalo.paymentreceiver.data.repo.TransactionRepository
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.domain.TransactionSource

/**
 * Safety net for receipts the live receiver missed (the app was force-stopped,
 * updated, or the phone was restarting). Re-reads recent inbox messages
 * through the normal ingest path; the fingerprint makes re-reading a receipt
 * that is already on file a no-op.
 */
class InboxScanner(
    private val context: Context,
    private val transactions: TransactionRepository,
    private val settings: SettingsRepository,
    private val now: () -> Long = System::currentTimeMillis,
) {
    data class ScanResult(val scanned: Int, val newReceipts: Int)

    fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

    suspend fun scan(): ScanResult? {
        if (!hasPermission()) return null
        val since = maxOf(settings.current().lastInboxScanAt - OVERLAP_MS, now() - LOOKBACK_MS)
        val startedAt = now()
        var scanned = 0
        var stored = 0
        query(context.contentResolver, since) { sender, body, date ->
            scanned++
            if (transactions.ingest(body, sender, date, TransactionSource.INBOX_SCAN) is IngestResult.Stored) stored++
        }
        settings.setLastInboxScanAt(startedAt)
        return ScanResult(scanned, stored)
    }

    private suspend fun query(resolver: ContentResolver, since: Long, onMessage: suspend (String?, String, Long) -> Unit) {
        val projection = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
        val rows = mutableListOf<Triple<String?, String, Long>>()
        resolver.query(
            Telephony.Sms.Inbox.CONTENT_URI, projection,
            "${Telephony.Sms.DATE} >= ?", arrayOf(since.toString()),
            "${Telephony.Sms.DATE} ASC",
        )?.use { c ->
            val a = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val b = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val d = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
            while (c.moveToNext() && rows.size < MAX_ROWS) {
                val body = c.getString(b) ?: continue
                rows += Triple(c.getString(a), body, c.getLong(d))
            }
        }
        for ((sender, body, date) in rows) onMessage(sender, body, date)
    }

    private companion object {
        const val LOOKBACK_MS = 48L * 60 * 60 * 1000
        const val OVERLAP_MS = 10L * 60 * 1000
        const val MAX_ROWS = 2_000
    }
}
