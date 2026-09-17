package com.nizalo.paymentreceiver.service

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.nizalo.paymentreceiver.api.RetrofitClient
import com.nizalo.paymentreceiver.api.TransferReportRequest
import com.nizalo.paymentreceiver.db.AppDatabase
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

class TransferSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("nizalo_prefs", Context.MODE_PRIVATE)
        val apiKey = prefs.getString("device_api_key", null)
        
        if (apiKey.isNullOrEmpty()) {
            return Result.failure()
        }

        val db = AppDatabase.getDatabase(applicationContext)
        val dao = db.localTransferDao()
        val pending = dao.getPendingTransfers()

        if (pending.isEmpty()) return Result.success()

        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")

        var allSuccess = true

        for (transfer in pending) {
            val req = TransferReportRequest(
                network = transfer.network,
                receivingNumberId = transfer.receivingNumberId,
                rawSenderName = transfer.rawSenderName,
                rawSenderPhone = transfer.rawSenderPhone,
                amountEgpMinor = transfer.amountEgpMinor,
                rawMessage = transfer.rawMessage,
                observedAt = sdf.format(Date(transfer.observedAt))
            )

            try {
                val res = RetrofitClient.api.reportTransfer(apiKey, req)
                if (res.isSuccessful && res.body()?.ok == true) {
                    dao.update(transfer.copy(status = "SYNCED", errorMessage = null))
                } else {
                    dao.update(transfer.copy(status = "FAILED", errorMessage = "HTTP ${res.code()} - ${res.errorBody()?.string()}"))
                    allSuccess = false
                }
            } catch (e: Exception) {
                dao.update(transfer.copy(status = "FAILED", errorMessage = e.message))
                allSuccess = false
            }
        }

        return if (allSuccess) Result.success() else Result.retry()
    }
}
