package com.nizalo.paymentreceiver.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.nizalo.paymentreceiver.ReceiverApp
import com.nizalo.paymentreceiver.data.repo.RefreshResult
import java.util.concurrent.TimeUnit

/** Sends queued receipts. Reschedules itself for the next due retry. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as ReceiverApp).containerOrNull ?: return Result.retry()
        val report = c.transactions.syncPending(dueOnly = true)
        c.transactions.refreshReviewStatuses()
        if (report.sent > 0) c.notifier.paymentsProcessed(report.sent)
        // Retry timing is the queue's (RetryPolicy via scheduleNextRetry), not
        // WorkManager's: every outcome is a completed run of this worker.
        c.scheduler.scheduleNextRetry()
        return Result.success()
    }
}

/** Pulls pending payouts and announces new ones. */
class WithdrawalRefreshWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as ReceiverApp).containerOrNull ?: return Result.retry()
        return when (val r = c.withdrawals.refresh()) {
            is RefreshResult.Ok -> {
                val fresh = r.newlyArrived.filter { it.actionable && !it.notified }
                if (fresh.isNotEmpty() && c.settings.current().notifyWithdrawals) {
                    c.notifier.newWithdrawals(fresh)
                }
                c.withdrawals.markNotified(fresh.map { it.id })
                Result.success()
            }
            is RefreshResult.Failed -> if (r.error.transient) Result.retry() else Result.success()
        }
    }
}

/** Also runs the inbox scan, catching receipts delivered while the app could not receive them. */
class MaintenanceWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as ReceiverApp).containerOrNull ?: return Result.retry()
        runCatching { c.inboxScanner.scan() }
        c.transactions.recoverInterruptedSends()
        c.scheduler.scheduleNextRetry()
        return Result.success()
    }
}

class WorkScheduler(private val context: Context, private val wifiOnly: suspend () -> Boolean, private val nextDueAt: suspend () -> Long?) {
    private val wm get() = WorkManager.getInstance(context)

    private suspend fun networkConstraints() = Constraints.Builder()
        .setRequiredNetworkType(if (wifiOnly()) NetworkType.UNMETERED else NetworkType.CONNECTED)
        .build()

    /** Send now (or as soon as the network constraint allows). */
    suspend fun syncSoon() {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(networkConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        wm.enqueueUniqueWork(SYNC_NOW, ExistingWorkPolicy.REPLACE, req)
    }

    /** Wake up when the earliest queued receipt is due again. */
    suspend fun scheduleNextRetry() {
        val due = nextDueAt() ?: return
        val delay = (due - System.currentTimeMillis()).coerceAtLeast(0)
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(networkConstraints())
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build()
        wm.enqueueUniqueWork(SYNC_RETRY, ExistingWorkPolicy.REPLACE, req)
    }

    suspend fun schedulePeriodic() {
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        wm.enqueueUniquePeriodicWork(
            WITHDRAWALS, ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<WithdrawalRefreshWorker>(15, TimeUnit.MINUTES).setConstraints(net).build(),
        )
        wm.enqueueUniquePeriodicWork(
            MAINTENANCE, ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<MaintenanceWorker>(1, TimeUnit.HOURS).build(),
        )
        wm.enqueueUniquePeriodicWork(
            SYNC_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(networkConstraints()).build(),
        )
    }

    fun refreshWithdrawalsNow() {
        wm.enqueueUniqueWork(WITHDRAWALS_NOW, ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<WithdrawalRefreshWorker>().build())
    }

    companion object {
        const val SYNC_NOW = "sync_now"
        const val SYNC_RETRY = "sync_retry"
        const val SYNC_PERIODIC = "sync_periodic"
        const val WITHDRAWALS = "withdrawals_periodic"
        const val WITHDRAWALS_NOW = "withdrawals_now"
        const val MAINTENANCE = "maintenance"
    }
}
