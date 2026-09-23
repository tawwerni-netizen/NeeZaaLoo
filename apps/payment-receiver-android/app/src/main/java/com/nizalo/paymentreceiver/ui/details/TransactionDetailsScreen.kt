package com.nizalo.paymentreceiver.ui.details

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.TransactionEntity
import com.nizalo.paymentreceiver.data.repo.TransactionRepository
import com.nizalo.paymentreceiver.domain.SyncStatus
import com.nizalo.paymentreceiver.domain.TransactionStatus
import com.nizalo.paymentreceiver.ui.components.ActionButton
import com.nizalo.paymentreceiver.ui.components.AppTopBar
import com.nizalo.paymentreceiver.ui.components.Banner
import com.nizalo.paymentreceiver.ui.components.Chip
import com.nizalo.paymentreceiver.ui.components.EmptyState
import com.nizalo.paymentreceiver.ui.components.LabeledValue
import com.nizalo.paymentreceiver.ui.components.ResultCard
import com.nizalo.paymentreceiver.ui.components.SectionCard
import com.nizalo.paymentreceiver.ui.components.SectionTitle
import com.nizalo.paymentreceiver.ui.components.StatusChip
import com.nizalo.paymentreceiver.ui.components.Tone
import com.nizalo.paymentreceiver.ui.components.codeText
import com.nizalo.paymentreceiver.ui.components.errorCodeText
import com.nizalo.paymentreceiver.ui.components.providerText
import com.nizalo.paymentreceiver.ui.components.syncStatusText
import com.nizalo.paymentreceiver.ui.theme.Numeric
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface ActionState {
    data object Idle : ActionState
    data object Busy : ActionState
    data class Done(val ok: Boolean) : ActionState
}

class TransactionDetailsViewModel(private val repo: TransactionRepository, private val id: String) : ViewModel() {
    val transaction: StateFlow<TransactionEntity?> = repo.observe(id).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val action = MutableStateFlow<ActionState>(ActionState.Idle)

    fun sendForReview() {
        if (action.value is ActionState.Busy) return
        action.value = ActionState.Busy
        viewModelScope.launch { action.value = ActionState.Done(repo.sendForReview(id)) }
    }
}

@Composable
fun TransactionDetailsScreen(vm: TransactionDetailsViewModel, onBack: () -> Unit) {
    val t by vm.transaction.collectAsStateWithLifecycle()
    val action by vm.action.collectAsStateWithLifecycle()

    Scaffold(topBar = { AppTopBar(stringResource(R.string.details_title), onBack) }) { padding ->
        val tx = t
        if (tx == null) {
            EmptyState(Icons.Filled.SearchOff, stringResource(R.string.not_found), modifier = Modifier.padding(padding))
            return@Scaffold
        }
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp).testTag("details"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ExplanationBanner(tx)

            SectionCard {
                StatusChip(tx.status)
                Text(Formatters.egp(tx.amountPiastres), style = MaterialTheme.typography.headlineSmall.merge(Numeric), modifier = Modifier.padding(top = 8.dp))
                LabeledValue(stringResource(R.string.f_provider), providerText(tx.provider))
                LabeledValue(stringResource(R.string.f_sender_name), tx.senderName)
                LabeledValue(stringResource(R.string.f_sender_phone), tx.senderPhone, copyable = true)
                LabeledValue(stringResource(R.string.f_reference), tx.reference, copyable = true)
                LabeledValue(stringResource(R.string.f_sms_sender), tx.smsSender)
                LabeledValue(stringResource(R.string.f_received_at), Formatters.dateTime(tx.receivedAt))
                LabeledValue(stringResource(R.string.f_processed_at), Formatters.dateTime(tx.processedAt))
            }

            SectionCard {
                SectionTitle(stringResource(R.string.f_backend_status))
                LabeledValue(stringResource(R.string.f_backend_status), tx.backendOutcome)
                if (tx.backendReviewReason != null) {
                    Text(codeText("rr_", tx.backendReviewReason), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                LabeledValue(stringResource(R.string.f_player), tx.playerHandle)
                LabeledValue(stringResource(R.string.f_credited), tx.creditedUsdtMinor?.let { Formatters.usdt(it) })
                LabeledValue(stringResource(R.string.f_backend_reference), tx.backendId, copyable = true)
                LabeledValue(stringResource(R.string.f_sync_status), syncStatusText(tx.syncStatus))
                LabeledValue(stringResource(R.string.f_sync_attempts), tx.syncAttempts.toString())
                LabeledValue(
                    stringResource(R.string.f_last_error),
                    tx.lastError?.let { code -> errorCodeText(code)?.let { stringResource(it) } ?: code },
                )
            }

            SectionCard {
                SectionTitle(stringResource(R.string.f_parsed_data))
                LabeledValue(stringResource(R.string.f_confidence), tx.confidence)
                LabeledValue(stringResource(R.string.f_source), tx.source)
                val issues = tx.parseIssues.split(",").filter { it.isNotBlank() }
                for (i in issues) Chip(codeText("pi_", i), Tone.NEUTRAL, Modifier.padding(top = 4.dp))
            }

            SectionCard {
                SectionTitle(stringResource(R.string.f_original_message))
                SelectionContainer {
                    Text(tx.rawMessage, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("raw_message"))
                }
            }

            val canSendForReview = tx.syncStatus == SyncStatus.NOT_SENT.name || tx.status == TransactionStatus.FAILED.name
            if (canSendForReview) {
                if (tx.amountPiastres == null) {
                    Text(stringResource(R.string.send_for_review_unavailable), color = MaterialTheme.colorScheme.error)
                } else {
                    ActionButton(
                        text = stringResource(if (tx.status == TransactionStatus.FAILED.name) R.string.retry_send else R.string.send_for_review),
                        busyText = stringResource(R.string.sending),
                        busy = action is ActionState.Busy,
                        onClick = vm::sendForReview,
                        primary = false,
                        modifier = Modifier.fillMaxWidth().testTag("send_for_review"),
                    )
                }
            }
            (action as? ActionState.Done)?.let {
                ResultCard(if (it.ok) Tone.SUCCESS else Tone.DANGER, stringResource(if (it.ok) R.string.send_for_review_done else R.string.send_for_review_unavailable), emptyList())
            }
        }
    }
}

@Composable
private fun ExplanationBanner(tx: TransactionEntity) {
    when (tx.status) {
        TransactionStatus.DUPLICATE.name -> Banner(Tone.NEUTRAL, stringResource(R.string.status_duplicate), stringResource(R.string.dup_explained))
        TransactionStatus.REJECTED.name -> Banner(Tone.DANGER, stringResource(R.string.status_rejected), stringResource(R.string.rejected_explained))
        TransactionStatus.NEEDS_REVIEW.name ->
            if (tx.syncStatus == SyncStatus.NOT_SENT.name) Banner(Tone.WARNING, stringResource(R.string.status_needs_review), stringResource(R.string.review_explained))
            else Banner(Tone.WARNING, stringResource(R.string.status_needs_review), stringResource(R.string.backend_review_explained))
        else -> Unit
    }
}
