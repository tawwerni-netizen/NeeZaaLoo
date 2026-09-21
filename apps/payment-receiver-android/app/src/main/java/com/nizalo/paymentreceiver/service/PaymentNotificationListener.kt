package com.nizalo.paymentreceiver.service

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.nizalo.paymentreceiver.db.AppDatabase
import com.nizalo.paymentreceiver.db.LocalTransfer
import com.nizalo.paymentreceiver.sms.SmsParser
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class PaymentNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        sbn ?: return

        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        
        val fullMessage = "$title: $text"

        // Same content-based detection as SmsReceiver: a bank's own app shows its
        // own package name and its own notification title, never "InstaPay", so
        // matching on those would drop every real transfer. The message body is
        // the only reliable signal.
        val (network, parsed) = SmsParser.parseAny(fullMessage) ?: return
        saveAndSync(network, parsed, fullMessage, sbn.postTime)
    }

    private fun saveAndSync(network: String, parsed: SmsParser.ParsedTransfer, body: String, postTime: Long) {
        val prefs = getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE)
        val receivingNumberId = prefs.getString("receiving_number_id", "default_num") ?: "default_num"

        val transfer = LocalTransfer(
            network = network,
            receivingNumberId = receivingNumberId,
            rawSenderName = parsed.senderName,
            rawSenderPhone = parsed.senderPhone,
            amountEgpMinor = parsed.amountEgpMinor,
            rawMessage = body,
            transactionRef = parsed.transactionRef,
            observedAt = postTime
        )

        CoroutineScope(Dispatchers.IO).launch {
            AppDatabase.getDatabase(applicationContext).localTransferDao().insert(transfer)
            val workRequest = OneTimeWorkRequestBuilder<TransferSyncWorker>().build()
            WorkManager.getInstance(applicationContext).enqueue(workRequest)
        }
    }
}
