package com.nizalo.paymentreceiver.ui.history

import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.ui.components.AppTopBar
import com.nizalo.paymentreceiver.ui.components.EmptyState
import com.nizalo.paymentreceiver.ui.components.TransactionCard

private val filterLabels = listOf(
    HistoryFilter.ALL to R.string.filter_all,
    HistoryFilter.VODAFONE to R.string.filter_vodafone,
    HistoryFilter.INSTAPAY to R.string.filter_instapay,
    HistoryFilter.PENDING to R.string.filter_pending,
    HistoryFilter.SYNCED to R.string.filter_synced,
    HistoryFilter.FAILED to R.string.filter_failed,
    HistoryFilter.DUPLICATE to R.string.filter_duplicate,
    HistoryFilter.REJECTED to R.string.filter_rejected,
    HistoryFilter.TODAY to R.string.filter_today,
    HistoryFilter.WEEK to R.string.filter_week,
    HistoryFilter.MONTH to R.string.filter_month,
)

@Composable
fun HistoryScreen(vm: HistoryViewModel, onBack: () -> Unit, onOpen: (String) -> Unit) {
    val query by vm.query.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val results by vm.results.collectAsStateWithLifecycle()

    Scaffold(topBar = { AppTopBar(stringResource(R.string.history_title), onBack) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { vm.query.value = it },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    placeholder = { Text(stringResource(R.string.search_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("history_search"),
                )
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    for ((f, label) in filterLabels) {
                        FilterChip(
                            selected = filter == f,
                            onClick = { vm.filter.value = f },
                            label = { Text(stringResource(label)) },
                            modifier = Modifier.testTag("filter_${f.name}"),
                        )
                    }
                }
                Text(
                    stringResource(R.string.results_count, results.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            if (results.isEmpty()) {
                val filtered = query.isNotBlank() || filter != HistoryFilter.ALL
                EmptyState(
                    if (filtered) Icons.Filled.SearchOff else Icons.Filled.Inbox,
                    stringResource(if (filtered) R.string.history_empty_filtered else R.string.empty_transfers),
                )
            } else {
                LazyColumn(
                    Modifier.fillMaxSize().testTag("history_list"),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(results, key = { it.id }) { t -> TransactionCard(t) { onOpen(t.id) } }
                }
            }
        }
    }
}
