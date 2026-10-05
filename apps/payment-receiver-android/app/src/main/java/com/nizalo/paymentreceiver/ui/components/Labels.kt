package com.nizalo.paymentreceiver.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.domain.SyncStatus
import com.nizalo.paymentreceiver.domain.TransactionStatus
import com.nizalo.paymentreceiver.domain.WithdrawalStatus

@Composable
fun StatusChip(status: String) {
    val s = runCatching { TransactionStatus.valueOf(status) }.getOrDefault(TransactionStatus.PENDING)
    val (label, tone) = when (s) {
        TransactionStatus.PENDING -> R.string.status_pending to Tone.INFO
        TransactionStatus.PROCESSING -> R.string.status_processing to Tone.INFO
        TransactionStatus.CONFIRMED -> R.string.status_confirmed to Tone.SUCCESS
        TransactionStatus.NEEDS_REVIEW -> R.string.status_needs_review to Tone.WARNING
        TransactionStatus.DUPLICATE -> R.string.status_duplicate to Tone.NEUTRAL
        TransactionStatus.REJECTED -> R.string.status_rejected to Tone.DANGER
        TransactionStatus.FAILED -> R.string.status_failed to Tone.DANGER
    }
    Chip(stringResource(label), tone)
}

@Composable
fun syncStatusText(status: String): String = stringResource(
    when (runCatching { SyncStatus.valueOf(status) }.getOrDefault(SyncStatus.PENDING)) {
        SyncStatus.NOT_SENT -> R.string.sync_not_sent
        SyncStatus.PENDING -> R.string.sync_pending
        SyncStatus.SYNCING -> R.string.sync_syncing
        SyncStatus.SYNCED -> R.string.sync_synced
        SyncStatus.FAILED -> R.string.sync_failed
    }
)

@Composable
fun providerText(provider: String): String =
    stringResource(if (provider == "INSTAPAY") R.string.provider_instapay else R.string.provider_vodafone)

@Composable
fun WithdrawalStatusChip(receiverStatus: String) {
    val s = WithdrawalStatus.from(receiverStatus)
    val (label, tone) = when (s) {
        WithdrawalStatus.PENDING -> R.string.w_status_PENDING to Tone.WARNING
        WithdrawalStatus.PROCESSING -> R.string.w_status_PROCESSING to Tone.INFO
        WithdrawalStatus.COMPLETED -> R.string.w_status_COMPLETED to Tone.SUCCESS
        WithdrawalStatus.REJECTED -> R.string.w_status_REJECTED to Tone.DANGER
        WithdrawalStatus.AWAITING_APPROVAL -> R.string.w_status_AWAITING_APPROVAL to Tone.NEUTRAL
    }
    Chip(stringResource(label), tone)
}

/** A string resource named `<prefix><code>`, or the raw code when there is none. */
@Composable
fun codeText(prefix: String, code: String): String {
    val ctx = LocalContext.current
    val id = ctx.resources.getIdentifier(prefix + code, "string", ctx.packageName)
    return if (id != 0) ctx.getString(id) else code
}
