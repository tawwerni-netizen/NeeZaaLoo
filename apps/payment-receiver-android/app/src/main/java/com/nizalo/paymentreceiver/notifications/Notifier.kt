package com.nizalo.paymentreceiver.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.nizalo.paymentreceiver.MainActivity
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.WithdrawalEntity
import com.nizalo.paymentreceiver.data.settings.SettingsRepository

class Notifier(private val context: Context, private val settings: SettingsRepository) {

    fun createChannels() {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_WITHDRAWALS, context.getString(R.string.channel_withdrawals), NotificationManager.IMPORTANCE_HIGH)
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_PAYMENTS, context.getString(R.string.channel_payments), NotificationManager.IMPORTANCE_DEFAULT)
        )
    }

    fun canNotify(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun newWithdrawals(items: List<WithdrawalEntity>) {
        if (!canNotify()) return
        for (w in items) {
            val open = PendingIntent.getActivity(
                context, w.id.hashCode(),
                Intent(context, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_WITHDRAWAL_ID, w.id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val amount = w.amountEgpToSend?.let { Formatters.egpWhole(it) } ?: Formatters.usdt(w.amountUsdtMinor)
            val n = NotificationCompat.Builder(context, CH_WITHDRAWALS)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(R.string.notif_new_withdrawal_title))
                .setContentText(context.getString(R.string.notif_new_withdrawal_text, amount))
                .setContentIntent(open)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                // Player number and amount stay off the lock screen.
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .build()
            @Suppress("MissingPermission")
            NotificationManagerCompat.from(context).notify(NOTIF_WITHDRAWAL_BASE + (w.id.hashCode() and 0xFFFF), n)
        }
    }

    suspend fun paymentsProcessed(count: Int) {
        if (!canNotify() || !settings.current().notifyPayments) return
        val open = PendingIntent.getActivity(
            context, 1, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, CH_PAYMENTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.notif_payments_title))
            .setContentText(context.getString(R.string.notif_payments_text, count))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        @Suppress("MissingPermission")
        NotificationManagerCompat.from(context).notify(NOTIF_PAYMENTS, n)
    }

    companion object {
        const val CH_WITHDRAWALS = "withdrawals"
        const val CH_PAYMENTS = "payments"
        private const val NOTIF_PAYMENTS = 1001
        private const val NOTIF_WITHDRAWAL_BASE = 2000
    }
}
