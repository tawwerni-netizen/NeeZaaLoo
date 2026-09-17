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
                val sender = sms.originatingAddress ?: ""
                val body = sms.messageBody ?: ""
                
                // VODAFONE_CASH check
                if (sender.equals("Vodafone", ignoreCase = true) || sender.equals("VF-Cash", ignoreCase = true)) {
                    val parsed = SmsParser.parseVodafoneCash(body)
                    if (parsed != null) {
                        saveAndSync(context, "VODAFONE_CASH", parsed, body)
                    }
                } 
                // INSTAPAY check
                else if (sender.equals("InstaPay", ignoreCase = true)) {
                    val parsed = SmsParser.parseInstaPay(body)
                    if (parsed != null) {
                        saveAndSync(context, "INSTAPAY", parsed, body)
                    }
                }
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
