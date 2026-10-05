package com.nizalo.paymentreceiver.data.repo

import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.network.ApiResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed interface ConnectionState {
    data object Unknown : ConnectionState
    data object Checking : ConnectionState
    data class Online(val latencyMs: Long, val deviceLabel: String?, val mock: Boolean) : ConnectionState
    data class Offline(val error: ApiError) : ConnectionState
}

/**
 * "Connected" means the backend answered a device-authenticated health
 * check with this phone's own token -- not merely that the phone has
 * internet, and not merely that some server responded.
 */
class ConnectionRepository(
    private val apiProvider: ApiProvider,
    private val audit: AuditLog,
) {
    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Unknown)
    val state: StateFlow<ConnectionState> = _state.asStateFlow()

    suspend fun check(manual: Boolean = false): ConnectionState {
        _state.value = ConnectionState.Checking
        val result = when (val r = apiProvider.api().health()) {
            is ApiResult.Ok ->
                if (r.value.ok && r.value.server == "ONLINE") {
                    ConnectionState.Online(r.latencyMs, r.value.device?.label, apiProvider.isMock())
                } else {
                    ConnectionState.Offline(ApiError.InvalidResponse)
                }
            is ApiResult.Err -> ConnectionState.Offline(r.error)
        }
        _state.value = result
        if (manual) {
            val summary = when (result) {
                is ConnectionState.Online -> "online ${result.latencyMs}ms"
                is ConnectionState.Offline -> "offline ${TransactionRepository.errorCode(result.error)}"
                else -> "unknown"
            }
            audit.record(AuditType.CONNECTION_TESTED, summary, error = result is ConnectionState.Offline)
        }
        return result
    }
}
