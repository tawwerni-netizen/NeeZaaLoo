package com.nizalo.paymentreceiver.ui.withdrawals

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.WithdrawalEntity
import com.nizalo.paymentreceiver.data.repo.ConfirmResult
import com.nizalo.paymentreceiver.domain.ConfirmState
import com.nizalo.paymentreceiver.ui.components.ActionButton
import com.nizalo.paymentreceiver.ui.components.AppTopBar
import com.nizalo.paymentreceiver.ui.components.Banner
import com.nizalo.paymentreceiver.ui.components.EmptyState
import com.nizalo.paymentreceiver.ui.components.LabeledValue
import com.nizalo.paymentreceiver.ui.components.ResultCard
import com.nizalo.paymentreceiver.ui.components.SectionCard
import com.nizalo.paymentreceiver.ui.components.Tone
import com.nizalo.paymentreceiver.ui.components.WithdrawalStatusChip
import com.nizalo.paymentreceiver.ui.components.apiErrorText
import com.nizalo.paymentreceiver.ui.components.providerText
import com.nizalo.paymentreceiver.ui.theme.Numeric

@Composable
private fun amountToSend(w: WithdrawalEntity): String =
    w.amountEgpToSend?.let { Formatters.egpWhole(it) } ?: Formatters.usdt(w.amountUsdtMinor)

@Composable
fun WithdrawalsScreen(vm: WithdrawalsViewModel, onBack: () -> Unit, onOpen: (String) -> Unit) {
    val items by vm.items.collectAsStateWithLifecycle()
    val refresh by vm.refresh.collectAsStateWithLifecycle()

    Scaffold(topBar = {
        AppTopBar(stringResource(R.string.w_title), onBack) {
            IconButton(onClick = vm::refresh, enabled = refresh !is RefreshState.Refreshing, modifier = Modifier.testTag("w_refresh")) {
                Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.w_refresh))
            }
        }
    }) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).testTag("withdrawals"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            when (val r = refresh) {
                RefreshState.Refreshing -> item { Text(stringResource(R.string.w_refreshing), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                is RefreshState.Failed -> item {
                    Banner(Tone.DANGER, stringResource(R.string.w_refresh_failed, apiErrorText(r.error)),
                        if (items.isNotEmpty()) stringResource(R.string.w_offline_copy) else null, stringResource(R.string.retry), vm::refresh)
                }
                RefreshState.Idle -> Unit
            }
            val actionable = items.filter { it.actionable }
            if (actionable.isEmpty()) {
                item { EmptyState(Icons.Filled.CheckCircle, stringResource(R.string.w_empty)) }
            }
            items(items, key = { it.id }) { w -> WithdrawalCard(w) { onOpen(w.id) } }
        }
    }
}

@Composable
private fun WithdrawalCard(w: WithdrawalEntity, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick).testTag("w_${w.id}"),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(amountToSend(w), style = MaterialTheme.typography.titleLarge.merge(Numeric), modifier = Modifier.weight(1f))
                WithdrawalStatusChip(w.receiverStatus)
            }
            Text("${w.playerHandle} · ${w.destination}", style = MaterialTheme.typography.bodyMedium.merge(Numeric), modifier = Modifier.padding(top = 4.dp))
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(providerText(w.network), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(Formatters.dateTime(w.requestedAt), style = MaterialTheme.typography.bodySmall.merge(Numeric), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun WithdrawalDetailsScreen(vm: WithdrawalDetailsViewModel, onBack: () -> Unit) {
    val w by vm.withdrawal.collectAsStateWithLifecycle()
    val confirm by vm.confirm.collectAsStateWithLifecycle()
    var showDialog by remember { mutableStateOf(false) }
    var reference by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current

    Scaffold(topBar = { AppTopBar(stringResource(R.string.w_details_title), onBack) }) { padding ->
        val item = w
        if (item == null) {
            EmptyState(Icons.Filled.SearchOff, stringResource(R.string.not_found), modifier = Modifier.padding(padding))
            return@Scaffold
        }

        if (showDialog) {
            AlertDialog(
                onDismissRequest = { showDialog = false },
                title = { Text(stringResource(R.string.w_confirm_title)) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(stringResource(R.string.w_confirm_amount, amountToSend(item)), style = MaterialTheme.typography.bodyLarge.merge(Numeric))
                        Text(stringResource(R.string.w_confirm_destination, item.destination), style = MaterialTheme.typography.bodyLarge.merge(Numeric))
                        Text(stringResource(R.string.w_confirm_request, item.id), style = MaterialTheme.typography.bodySmall.merge(Numeric))
                        OutlinedTextField(
                            value = reference,
                            onValueChange = { reference = it.take(64) },
                            placeholder = { Text(stringResource(R.string.w_confirm_reference_hint)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("w_reference"),
                        )
                    }
                },
                confirmButton = {
                    Button(onClick = { showDialog = false; vm.confirm(reference) }, modifier = Modifier.testTag("w_confirm_final")) {
                        Text(stringResource(R.string.w_confirm_button))
                    }
                },
                dismissButton = { TextButton(onClick = { showDialog = false }, modifier = Modifier.testTag("w_confirm_cancel")) { Text(stringResource(R.string.cancel)) } },
            )
        }

        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp).testTag("withdrawal_details"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionCard {
                WithdrawalStatusChip(item.receiverStatus)
                Text(stringResource(R.string.w_amount_to_send), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                Text(amountToSend(item), style = MaterialTheme.typography.headlineSmall.merge(Numeric))
                LabeledValue(stringResource(R.string.w_player), item.playerHandle)
                LabeledValue(stringResource(R.string.w_amount_usdt), Formatters.usdt(item.amountUsdtMinor))
                LabeledValue(stringResource(R.string.w_method), providerText(item.network))
                LabeledValue(stringResource(R.string.w_destination), item.destination)
                LabeledValue(stringResource(R.string.w_request_id), item.id, copyable = true)
                LabeledValue(stringResource(R.string.w_requested_at), Formatters.dateTime(item.requestedAt))
                if (item.completedAt != null) LabeledValue(stringResource(R.string.w_completed_at), Formatters.dateTime(item.completedAt))
                if (item.reference != null) LabeledValue(stringResource(R.string.w_reference), item.reference)
            }

            ActionButton(
                text = stringResource(R.string.w_copy_number), busyText = stringResource(R.string.w_copy_number), busy = false,
                onClick = { clipboard.setText(AnnotatedString(item.destination)); copied = true },
                primary = false, icon = Icons.Filled.ContentCopy, modifier = Modifier.fillMaxWidth().testTag("w_copy"),
            )
            if (copied) ResultCard(Tone.SUCCESS, stringResource(R.string.w_number_copied), emptyList(), onDismiss = { copied = false })

            if (item.actionable) {
                ActionButton(
                    text = stringResource(R.string.w_done), busyText = stringResource(R.string.w_confirming),
                    busy = confirm is ConfirmUiState.Confirming || item.confirmState == ConfirmState.SENDING.name,
                    onClick = { vm.dismissResult(); showDialog = true },
                    modifier = Modifier.fillMaxWidth().testTag("w_done"),
                )
            }

            when (val c = confirm) {
                is ConfirmUiState.Finished -> when (val r = c.result) {
                    is ConfirmResult.Completed -> ResultCard(Tone.SUCCESS, stringResource(R.string.w_confirmed), emptyList())
                    is ConfirmResult.AlreadyProcessed -> ResultCard(Tone.INFO, stringResource(R.string.w_already_processed), emptyList())
                    is ConfirmResult.Failed -> ResultCard(
                        Tone.DANGER, stringResource(R.string.w_confirm_failed),
                        listOf(apiErrorText(r.error), stringResource(R.string.w_confirm_failed_hint)),
                    )
                    ConfirmResult.NotActionable -> ResultCard(Tone.WARNING, stringResource(R.string.w_not_actionable), emptyList())
                }
                else -> if (item.confirmState == ConfirmState.FAILED.name && item.confirmError != null) {
                    ResultCard(Tone.DANGER, stringResource(R.string.w_confirm_failed), listOf(item.confirmError, stringResource(R.string.w_confirm_failed_hint)))
                }
            }
        }
    }
}
