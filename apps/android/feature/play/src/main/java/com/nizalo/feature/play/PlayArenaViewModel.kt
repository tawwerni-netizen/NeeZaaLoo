package com.nizalo.feature.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.realtime.ConnectionState
import com.nizalo.core.realtime.RealtimeWebSocketClient
import com.nizalo.core.realtime.DuelStateSyncPayload
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.put

sealed class PlayArenaState {
    object Connecting : PlayArenaState()
    data class Active(val syncPayload: DuelStateSyncPayload) : PlayArenaState()
    data class Error(val message: String) : PlayArenaState()
}

class PlayArenaViewModel(
    private val wsClient: RealtimeWebSocketClient,
    private val duelId: String
) : ViewModel() {

    private val _state = MutableStateFlow<PlayArenaState>(PlayArenaState.Connecting)
    val state: StateFlow<PlayArenaState> = _state.asStateFlow()

    init {
        // Connect to WebSocket if not already connected
        wsClient.connect()

        viewModelScope.launch {
            wsClient.connectionState.collect { connState ->
                if (connState == ConnectionState.AUTHENTICATED) {
                    wsClient.subscribeDuel(duelId)
                }
            }
        }

        viewModelScope.launch {
            wsClient.duelUpdates.collect { payload ->
                if (payload.duel.id == duelId) {
                    _state.value = PlayArenaState.Active(payload)
                }
            }
        }
    }

    fun sendMove(actionType: String, movePayload: Map<String, Any?>) {
        val currentState = _state.value
        if (currentState is PlayArenaState.Active) {
            val jsonPayload = kotlinx.serialization.json.buildJsonObject {
                movePayload.forEach { (k, v) ->
                    put(k, kotlinx.serialization.json.JsonPrimitive(v.toString()))
                }
            }
            wsClient.sendMove(
                duelId = duelId,
                moveNumber = currentState.syncPayload.duel.moveCount + 1,
                actionType = actionType,
                movePayload = jsonPayload
            )
        }
    }

    fun disconnect() {
        // We do not disconnect the singleton here, as we might be navigating to home or other places
        // The singleton manages its own lifecycle or we can close it in AppNavGraph if we log out.
    }
}
