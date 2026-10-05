package com.nizalo.paymentreceiver.ui.audit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EventNote
import androidx.compose.material3.HorizontalDivider
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
import com.nizalo.paymentreceiver.data.db.AuditEventEntity
import com.nizalo.paymentreceiver.data.repo.AuditLog
import com.nizalo.paymentreceiver.ui.components.AppTopBar
import com.nizalo.paymentreceiver.ui.components.Chip
import com.nizalo.paymentreceiver.ui.components.EmptyState
import com.nizalo.paymentreceiver.ui.components.Tone
import com.nizalo.paymentreceiver.ui.theme.Numeric
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

class AuditViewModel(audit: AuditLog) : ViewModel() {
    val events: StateFlow<List<AuditEventEntity>> = audit.recent(300).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

@Composable
fun AuditScreen(vm: AuditViewModel, onBack: () -> Unit) {
    val events by vm.events.collectAsStateWithLifecycle()
    Scaffold(topBar = { AppTopBar(stringResource(R.string.audit_title), onBack) }) { padding ->
        if (events.isEmpty()) {
            EmptyState(Icons.Filled.EventNote, stringResource(R.string.audit_empty), modifier = Modifier.padding(padding))
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding).testTag("audit_list"), contentPadding = PaddingValues(16.dp)) {
            items(events, key = { it.id }) { e ->
                Column(Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Chip(e.type, if (e.level == "ERROR") Tone.DANGER else Tone.NEUTRAL)
                    Text(e.message, style = MaterialTheme.typography.bodyMedium.merge(Numeric))
                    Text(Formatters.dateTime(e.at), style = MaterialTheme.typography.bodySmall.merge(Numeric), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}
