package com.nizalo.paymentreceiver

import android.app.Application
import com.nizalo.paymentreceiver.data.repo.AuditType
import com.nizalo.paymentreceiver.security.DeviceIntegrity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface InitState {
    data object Starting : InitState
    data object Ready : InitState
    /** Shown to the operator instead of a blank screen; see InitErrorScreen. */
    data class Failed(val reason: String) : InitState
}

class ReceiverApp : Application() {
    private var _container: AppContainer? = null
    val container: AppContainer get() = _container ?: error("App not initialized")
    val containerOrNull: AppContainer? get() = _container

    private val _init = MutableStateFlow<InitState>(InitState.Starting)
    val initState: StateFlow<InitState> = _init.asStateFlow()

    override fun onCreate() {
        super.onCreate()
        initialize()
    }

    fun initialize() {
        if (_container != null) return
        val c = try {
            AppContainer.production(this)
        } catch (t: Throwable) {
            // Keystore or encrypted-database failure. Never include the
            // exception message verbatim in anything shared: it is shown to
            // the operator on this device only.
            _init.value = InitState.Failed(t::class.java.simpleName + (t.message?.let { ": $it" } ?: ""))
            return
        }
        _container = c
        c.notifier.createChannels()
        c.appScope.launch {
            runCatching { c.legacyImporter.runOnce() }
            runCatching { c.transactions.recoverInterruptedSends() }
            val integrity = DeviceIntegrity.check()
            if (integrity.suspicious) c.audit.record(AuditType.INTEGRITY_WARNING, integrity.reasons.joinToString(), error = true)
            runCatching { c.scheduler.schedulePeriodic() }
            runCatching { c.scheduler.scheduleNextRetry() }
            _init.value = InitState.Ready
        }
    }
}
