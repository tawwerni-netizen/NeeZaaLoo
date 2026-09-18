package com.nizalo.paymentreceiver.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.nizalo.paymentreceiver.db.AppDatabase
import com.nizalo.paymentreceiver.db.LocalTransfer
import com.nizalo.paymentreceiver.service.TransferSyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
            for (sms in messages) {
                val body = sms.messageBody ?: ""

                // Detection is by message content, not by sender ID: Vodafone Cash sends
                // from a fixed shortcode, but an InstaPay receipt arrives from whichever
                // bank the sender used (CIB, NBE, QNB, ...), never from a literal
                // "InstaPay" address. Gating on the sender here would silently drop
                // every real transfer.
                val (network, parsed) = SmsParser.parseAny(body) ?: continue
                saveAndSync(context, network, parsed, body)
            }
        }
    }

    private fun saveAndSync(context: Context, network: String, parsed: SmsParser.ParsedTransfer, body: String) {
        val prefs = context.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE)
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
            AppDatabase.getDatabase(context).localTransferDao().insert(transfer)
            val workRequest = OneTimeWorkRequestBuilder<TransferSyncWorker>().build()
            WorkManager.getInstance(context).enqueue(workRequest)
        }
    }
}
