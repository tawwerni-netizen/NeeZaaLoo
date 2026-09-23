package com.nizalo.paymentreceiver.ui.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.NetworkCheck
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.data.repo.ConnectionState
import com.nizalo.paymentreceiver.data.repo.SyncReport
import com.nizalo.paymentreceiver.ui.components.ActionButton
import com.nizalo.paymentreceiver.ui.components.Banner
import com.nizalo.paymentreceiver.ui.components.BrandMark
import com.nizalo.paymentreceiver.ui.components.ConnectionPill
import com.nizalo.paymentreceiver.ui.components.EmptyState
import com.nizalo.paymentreceiver.ui.components.NavTile
import com.nizalo.paymentreceiver.ui.components.PermissionsCard
import com.nizalo.paymentreceiver.ui.components.ResultCard
import com.nizalo.paymentreceiver.ui.components.SectionTitle
import com.nizalo.paymentreceiver.ui.components.StatTile
import com.nizalo.paymentreceiver.ui.components.Tone
import com.nizalo.paymentreceiver.ui.components.TransactionCard
import com.nizalo.paymentreceiver.ui.components.apiErrorText
import com.nizalo.paymentreceiver.ui.components.errorCodeText
import com.nizalo.paymentreceiver.ui.theme.Brand

data class DashboardNav(
    val openTransaction: (String) -> Unit,
    val openHistory: () -> Unit,
    val openWithdrawals: () -> Unit,
    val openTestMode: () -> Unit,
    val openSettings: () -> Unit,
    val openAudit: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(vm: DashboardViewModel, nav: DashboardNav) {
    val connection by vm.connection.collectAsStateWithLifecycle()
    val stats by vm.stats.collectAsStateWithLifecycle()
    val recent by vm.recent.collectAsStateWithLifecycle()
    val setup by vm.setup.collectAsStateWithLifecycle()
    val send by vm.send.collectAsStateWithLifecycle()
    val connTest by vm.connTest.collectAsStateWithLifecycle()

    DisposableEffect(Unit) {
        vm.startMonitoring()
        onDispose { vm.stopMonitoring() }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BrandMark()
                        Spacer(Modifier.width(10.dp))
                        Text(stringResource(R.string.app_title), style = MaterialTheme.typography.titleMedium, maxLines = 1)
                    }
                },
                actions = { ConnectionPill(connection, Modifier.padding(end = 12.dp)) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Brand.Ink, titleContentColor = Brand.Paper),
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding).testTag("dashboard"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (setup.mock) item { Banner(Tone.INFO, stringResource(R.string.banner_mock), null) }
            if (!setup.configured) item {
                Banner(Tone.WARNING, stringResource(R.string.banner_setup_title), stringResource(R.string.banner_setup_body),
                    stringResource(R.string.banner_open_settings), nav.openSettings)
            }
            if (setup.configured && setup.missingNumbers) item {
                Banner(Tone.WARNING, stringResource(R.string.banner_numbers_title), stringResource(R.string.banner_numbers_body),
                    stringResource(R.string.banner_open_settings), nav.openSettings)
            }
            if (vm.integritySuspicious) item { Banner(Tone.DANGER, stringResource(R.string.banner_integrity), null) }
            if (setup.wifiOnly) item { Banner(Tone.NEUTRAL, stringResource(R.string.banner_wifi_only), null) }
            item { PermissionsCard() }

            item {
                Text(stringResource(R.string.today), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.padding(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatTile(stringResource(R.string.stat_received), stats.receivedToday, Modifier.weight(1f), "stat_received")
                    StatTile(stringResource(R.string.stat_activated), stats.activatedToday, Modifier.weight(1f), "stat_activated")
                    StatTile(stringResource(R.string.stat_pending), stats.pending, Modifier.weight(1f), "stat_pending")
                }
            }

            if (stats.withdrawals > 0) item {
                Banner(Tone.INFO, stringResource(R.string.withdrawals_waiting, stats.withdrawals), null,
                    stringResource(R.string.nav_withdrawals), nav.openWithdrawals)
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ActionButton(
                        text = stringResource(R.string.send_now), busyText = stringResource(R.string.sending),
                        busy = send is SendState.Sending, onClick = vm::sendNow, icon = Icons.Filled.Send,
                        modifier = Modifier.fillMaxWidth().testTag("send_now"),
                    )
                    ActionButton(
                        text = stringResource(R.string.test_connection), busyText = stringResource(R.string.testing_connection),
                        busy = connTest is ConnTestState.Testing, onClick = vm::testConnection, primary = false,
                        icon = Icons.Filled.NetworkCheck, modifier = Modifier.fillMaxWidth().testTag("test_connection"),
                    )
                }
            }

            (send as? SendState.Done)?.let { done -> item { SendResult(done.report, vm::dismissSendResult) } }
            (connTest as? ConnTestState.Done)?.let { done -> item { ConnResult(done.result, vm::dismissConnResult) } }

            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    NavTile(Icons.Filled.History, stringResource(R.string.nav_history), onClick = nav.openHistory, modifier = Modifier.weight(1f), tag = "nav_history")
                    NavTile(Icons.Filled.AccountBalanceWallet, stringResource(R.string.nav_withdrawals), badge = stats.withdrawals, onClick = nav.openWithdrawals, modifier = Modifier.weight(1f), tag = "nav_withdrawals")
                    NavTile(Icons.Filled.Science, stringResource(R.string.nav_test_mode), onClick = nav.openTestMode, modifier = Modifier.weight(1f), tag = "nav_test_mode")
                    NavTile(Icons.Filled.Settings, stringResource(R.string.nav_settings), onClick = nav.openSettings, modifier = Modifier.weight(1f), tag = "nav_settings")
                }
            }

            item {
                Row(
                    Modifier.fillMaxWidth().clickable(onClick = nav.openAudit).padding(vertical = 4.dp).testTag("nav_audit"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.nav_audit), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text(
                        if (stats.errorsToday > 0) stringResource(R.string.errors_today, stats.errorsToday) else stringResource(R.string.no_errors),
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (stats.errorsToday > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SectionTitle(stringResource(R.string.recent_transfers), Modifier.weight(1f))
                    if (recent.isNotEmpty()) TextButton(onClick = nav.openHistory) { Text(stringResource(R.string.view_all)) }
                }
            }
            if (recent.isEmpty()) {
                item { EmptyState(Icons.Filled.Inbox, stringResource(R.string.empty_transfers), stringResource(R.string.empty_transfers_hint)) }
            } else {
                items(recent, key = { it.id }) { t -> TransactionCard(t) { nav.openTransaction(t.id) } }
            }
            item { Spacer(Modifier.padding(8.dp)) }
        }
    }
}

@Composable
private fun SendResult(report: SyncReport, onDismiss: () -> Unit) {
    val lines = mutableListOf<String>()
    val stop = report.stopReason
    val tone: Tone
    val title: String
    when {
        report.attempted == 0 && report.failed == 0 && stop == null -> {
            tone = Tone.NEUTRAL
            title = stringResource(R.string.sync_result_nothing)
        }
        report.attempted == 0 && stop != null -> {
            tone = Tone.DANGER
            title = stringResource(R.string.sync_result_blocked)
            lines += stringResource(R.string.sync_result_reason, apiErrorText(stop))
        }
        else -> {
            tone = if (report.failed == 0) Tone.SUCCESS else if (report.sent > 0) Tone.WARNING else Tone.DANGER
            title = stringResource(R.string.sync_result_sent, report.sent)
            if (report.failed > 0) {
                lines += stringResource(R.string.sync_result_failed, report.failed)
                val reason = stop?.let { apiErrorText(it) }
                    ?: report.failureCodes.firstOrNull()?.let { code -> errorCodeText(code)?.let { stringResource(it) } ?: code }
                if (reason != null) lines += stringResource(R.string.sync_result_reason, reason)
            }
        }
    }
    if (report.remaining > 0) lines += stringResource(R.string.sync_result_remaining, report.remaining)
    ResultCard(tone, title, lines, onDismiss = onDismiss)
}

@Composable
private fun ConnResult(result: ConnectionState, onDismiss: () -> Unit) {
    when (result) {
        is ConnectionState.Online -> ResultCard(
            Tone.SUCCESS, stringResource(R.string.conn_ok_title),
            listOfNotNull(
                stringResource(R.string.conn_ok_server),
                stringResource(R.string.conn_ok_api),
                stringResource(R.string.conn_ok_latency, result.latencyMs.toInt()),
                result.deviceLabel?.let { stringResource(R.string.conn_ok_device, it) },
            ),
            onDismiss = onDismiss,
        )
        is ConnectionState.Offline -> ResultCard(Tone.DANGER, stringResource(R.string.conn_fail_title), listOf(apiErrorText(result.error)), onDismiss = onDismiss)
        else -> Unit
    }
}

