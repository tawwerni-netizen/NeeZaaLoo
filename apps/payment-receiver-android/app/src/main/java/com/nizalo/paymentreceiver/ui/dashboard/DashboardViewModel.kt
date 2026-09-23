package com.nizalo.paymentreceiver.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.paymentreceiver.AppContainer
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.TransactionEntity
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.repo.ConnectionState
import com.nizalo.paymentreceiver.data.repo.SyncReport
import com.nizalo.paymentreceiver.security.DeviceIntegrity
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class DashboardStats(val receivedToday: Int = 0, val activatedToday: Int = 0, val pending: Int = 0, val withdrawals: Int = 0, val errorsToday: Int = 0)

data class SetupState(val configured: Boolean = true, val missingNumbers: Boolean = false, val wifiOnly: Boolean = false, val mock: Boolean = false)

sealed interface SendState {
    data object Idle : SendState
    data object Sending : SendState
    data class Done(val report: SyncReport) : SendState
}

sealed interface ConnTestState {
    data object Idle : ConnTestState
    data object Testing : ConnTestState
    data class Done(val result: ConnectionState) : ConnTestState
}

class DashboardViewModel(private val c: AppContainer) : ViewModel() {
    val connection: StateFlow<ConnectionState> = c.connection.state

    val stats: StateFlow<DashboardStats> = combine(
        c.transactions.receivedToday(),
        c.transactions.confirmedToday(),
        c.transactions.pendingCount(),
        c.withdrawals.actionableCount(),
        c.audit.errorsSince(Formatters.startOfTodayCairo(System.currentTimeMillis())),
    ) { r, a, p, w, e -> DashboardStats(r, a, p, w, e) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardStats())

    val recent: StateFlow<List<TransactionEntity>> = c.transactions.recent(10)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val setup: StateFlow<SetupState> = c.settings.settings.combine(connection) { s, _ ->
        SetupState(
            configured = (s.baseUrl.isNotBlank() && c.secureStore.hasToken()) || c.apiProvider.isMock(),
            missingNumbers = (s.vodafoneEnabled && s.vodafoneNumberIds.isEmpty()) || (s.instapayEnabled && s.instapayNumberIds.isEmpty()),
            wifiOnly = s.wifiOnly,
            mock = c.apiProvider.isMock(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SetupState())

    val integritySuspicious: Boolean = DeviceIntegrity.check().suspicious

    private val _send = MutableStateFlow<SendState>(SendState.Idle)
    val send: StateFlow<SendState> = _send.asStateFlow()

    private val _connTest = MutableStateFlow<ConnTestState>(ConnTestState.Idle)
    val connTest: StateFlow<ConnTestState> = _connTest.asStateFlow()

    private var monitor: Job? = null

    /** Health check now and every minute while the dashboard is visible. */
    fun startMonitoring() {
        if (monitor?.isActive == true) return
        monitor = viewModelScope.launch {
            while (isActive) {
                c.connection.check()
                delay(60_000)
            }
        }
        viewModelScope.launch { c.withdrawals.refresh() }
        viewModelScope.launch { runCatching { c.inboxScanner.scan() } }
    }

    fun stopMonitoring() {
        monitor?.cancel()
    }

    /**
     * "Send now": every queued receipt is made due and sent immediately,
     * then the backend's review decisions are re-read. The result card
     * reports exactly what happened.
     */
    fun sendNow() {
        if (_send.value is SendState.Sending) return
        _send.value = SendState.Sending
        viewModelScope.launch {
            val report = try {
                c.transactions.makeAllDue()
                c.transactions.syncPending(dueOnly = false, limit = 500)
            } catch (t: Throwable) {
                SyncReport(0, 0, 0, 0, ApiError.InvalidResponse, emptyList())
            }
            runCatching { c.transactions.refreshReviewStatuses() }
            runCatching { c.scheduler.scheduleNextRetry() }
            _send.value = SendState.Done(report)
        }
    }

    fun testConnection() {
        if (_connTest.value is ConnTestState.Testing) return
        _connTest.value = ConnTestState.Testing
        viewModelScope.launch {
            _connTest.value = ConnTestState.Done(c.connection.check(manual = true))
        }
    }

    fun dismissSendResult() = _send.update { SendState.Idle }
    fun dismissConnResult() = _connTest.update { ConnTestState.Idle }
}
