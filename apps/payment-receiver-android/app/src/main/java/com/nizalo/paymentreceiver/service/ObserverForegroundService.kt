package com.nizalo.paymentreceiver.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import com.nizalo.paymentreceiver.api.RetrofitClient

class ObserverForegroundService : Service() {
    companion object {
        const val CHANNEL_ID = "PaymentObserverChannel"
        const val ALERT_CHANNEL_ID = "PaymentAlertChannel"
        const val NOTIFICATION_ID = 1
    }

    private val serviceJob = Job()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private var lastSeenWithdrawalIds = setOf<String>()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Payment Receiver Active")
            .setContentText("Listening for transfers & withdrawal requests...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        
        startPollingWithdrawals()
        return START_STICKY
    }

    private fun startPollingWithdrawals() {
        serviceScope.launch {
            while (isActive) {
                try {
                    val prefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                    val apiKey = prefs.getString("device_api_key", null)
                    
                    if (apiKey != null) {
                        val response = RetrofitClient.api.getPendingWithdrawals(apiKey)
                        if (response.isSuccessful) {
                            val withdrawals = response.body()?.withdrawals ?: emptyList()
                            val currentIds = withdrawals.map { it.id }.toSet()
                            
                            val newWithdrawals = withdrawals.filter { !lastSeenWithdrawalIds.contains(it.id) }
                            
                            // Only alert if we had already seen the list before (to avoid alerting on old pending ones at startup)
                            if (newWithdrawals.isNotEmpty() && lastSeenWithdrawalIds.isNotEmpty()) {
                                newWithdrawals.forEach { w ->
                                    val egp = (w.amountMinor.toLong() / 100.0).toString()
                                    showWithdrawalAlert("New Withdrawal Request!", "$egp EGP to ${w.destination} (${w.network})", w.id.hashCode())
                                }
                            }
                            
                            lastSeenWithdrawalIds = currentIds
                        }
                    }
                } catch (e: Exception) {
                    // Ignore network errors
                }
                delay(60_000)
            }
        }
    }

    private fun showWithdrawalAlert(title: String, text: String, id: Int) {
        val notification = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .build()
            
        val manager = getSystemService(NotificationManager::class.java)
        manager?.notify(id, notification)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Payment Observer Service",
                NotificationManager.IMPORTANCE_LOW
            )
            manager?.createNotificationChannel(serviceChannel)
            
            val alertChannel = NotificationChannel(
                ALERT_CHANNEL_ID,
                "Withdrawal Alerts",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager?.createNotificationChannel(alertChannel)
        }
    }
}
