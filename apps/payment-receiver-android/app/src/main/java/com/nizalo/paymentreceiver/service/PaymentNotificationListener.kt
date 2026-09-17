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

        val packageName = sbn.packageName
        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        
        val fullMessage = "$title: $text"
        
        // Example logic for banking apps or e-wallets
        // We look for Vodafone Cash or InstaPay patterns in notifications
        
        if (packageName.contains("vodafone") || title.contains("Vodafone", ignoreCase = true) || title.contains("VF-Cash", ignoreCase = true)) {
            val parsed = SmsParser.parseVodafoneCash(fullMessage)
            if (parsed != null) {
                saveAndSync("VODAFONE_CASH", parsed, fullMessage)
            }
        } else if (packageName.contains("instapay") || title.contains("InstaPay", ignoreCase = true)) {
            val parsed = SmsParser.parseInstaPay(fullMessage)
            if (parsed != null) {
                saveAndSync("INSTAPAY", parsed, fullMessage)
            }
        }
    }

    private fun saveAndSync(network: String, parsed: SmsParser.ParsedTransfer, body: String) {
        val prefs = getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE)
        val receivingNumberId = prefs.getString("receiving_number_id", "default_num") ?: "default_num"

        val transfer = LocalTransfer(
            network = network,
            receivingNumberId = receivingNumberId,
            rawSenderName = parsed.senderName,
            rawSenderPhone = parsed.senderPhone,
            amountEgpMinor = parsed.amountEgpMinor,
            rawMessage = body,
            observedAt = System.currentTimeMillis()
        )

        CoroutineScope(Dispatchers.IO).launch {
            AppDatabase.getDatabase(applicationContext).localTransferDao().insert(transfer)
            val workRequest = OneTimeWorkRequestBuilder<TransferSyncWorker>().build()
            WorkManager.getInstance(applicationContext).enqueue(workRequest)
        }
    }
}
