package com.nizalo.paymentreceiver.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.nizalo.paymentreceiver.ReceiverApp
import com.nizalo.paymentreceiver.domain.TransactionSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receives every incoming SMS, reassembles multi-part messages, and hands
 * each one to the same ingest path the inbox scan and Test Mode use.
 * Non-payment messages are discarded without being stored.
 *
 * Registered with android.permission.BROADCAST_SMS, so only the system can
 * deliver to it; a receipt's trustworthiness is still judged by its sender
 * address (see SenderPolicy), not by the fact that it arrived here.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = runCatching { Telephony.Sms.Intents.getMessagesFromIntent(intent) }.getOrNull() ?: return
        if (parts.isEmpty()) return

        // One broadcast can carry several PDUs: the parts of one long message,
        // or several messages. Group by sender; concatenate in arrival order.
        val messages = parts.filterNotNull().groupBy { it.originatingAddress ?: "" }.map { (sender, pdus) ->
            Triple(sender, pdus.joinToString("") { it.messageBody ?: "" }, pdus.minOf { it.timestampMillis })
        }

        val app = context.applicationContext as ReceiverApp
        app.initialize()
        // Encrypted storage unavailable: nothing can be recorded now. The
        // receipt stays in the SMS inbox, and the 48-hour inbox scan picks it
        // up once the app starts cleanly.
        val container = app.containerOrNull ?: return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            try {
                for ((sender, body, ts) in messages) {
                    runCatching {
                        container.transactions.ingest(body, sender.ifBlank { null }, ts, TransactionSource.SMS)
                    }
                }
            } finally {
                pending.finish()
            }
        }
    }
}
