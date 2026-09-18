package com.nizalo.feature.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.network.dto.MatchmakingTicketRequest
import com.nizalo.core.network.dto.MatchmakingTicket
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class MatchmakingState {
    object Idle : MatchmakingState()
    object Requesting : MatchmakingState()
    data class Queued(val ticket: MatchmakingTicket) : MatchmakingState()
    data class Matched(val duelId: String) : MatchmakingState()
    data class Error(val message: String) : MatchmakingState()
}

class MatchmakingViewModel(
    private val apiService: NizaloApiService
) : ViewModel() {

    private val _state = MutableStateFlow<MatchmakingState>(MatchmakingState.Idle)
    val state: StateFlow<MatchmakingState> = _state.asStateFlow()

    private var pollingJob: Job? = null
    private var activeTicketId: String? = null

    fun enqueue(gameId: String, mode: String, difficulty: String?, tier: String, stakeMinor: String? = null, asset: String? = null, timeProfile: String? = null) {
        if (_state.value is MatchmakingState.Requesting || _state.value is MatchmakingState.Queued) return

        viewModelScope.launch {
            _state.value = MatchmakingState.Requesting
            try {
                if (mode == "VS_COMPUTER") {
                    val req = com.nizalo.core.network.dto.VsComputerRequest(
                        gameId = gameId,
                        difficulty = difficulty ?: "medium",
                        timeProfile = timeProfile
                    )
                    val response = apiService.createVsComputerMatch(req)
                    if (response.isSuccessful && response.body() != null) {
                        _state.value = MatchmakingState.Matched(response.body()!!.duelId)
                    } else {
                        _state.value = MatchmakingState.Error("Failed to create match against computer")
                    }
                } else {
                    val req = MatchmakingTicketRequest(
                        gameId = gameId,
                        mode = mode,
                        tier = tier,
                        stakeMinor = stakeMinor,
                        asset = asset,
                        timeProfile = timeProfile
                    )
                    val response = apiService.createMatchmakingTicket(req)
                    if (response.isSuccessful && response.body() != null) {
                        val body = response.body()!!
                        activeTicketId = body.ticketId
                        val initialTicket = MatchmakingTicket(
                            id = body.ticketId,
                            gameId = gameId,
                            mode = mode,
                            tier = tier,
                            status = "ACTIVE",
                            enqueuedAt = "",
                            expiresAt = body.expiresAt
                        )
                        _state.value = MatchmakingState.Queued(initialTicket)
                        startPolling()
                    } else {
                        _state.value = MatchmakingState.Error("Matchmaking failed: ${response.code()}")
                    }
                }
            } catch (e: Exception) {
                _state.value = MatchmakingState.Error(e.localizedMessage ?: "Network error")
            }
        }
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (true) {
                val currentTicketId = activeTicketId ?: break
                try {
                    val response = apiService.getMatchmakingStatus(currentTicketId)
                    if (response.isSuccessful && response.body() != null) {
                        val ticket = response.body()?.ticket
                        if (ticket != null) {
                            val matchedDuelId = ticket.duelId
                            if (ticket.status == "MATCHED" && matchedDuelId != null) {
                                _state.value = MatchmakingState.Matched(matchedDuelId)
                                activeTicketId = null
                                break
                            } else if (ticket.status == "CANCELLED") {
                                _state.value = MatchmakingState.Idle
                                activeTicketId = null
                                break
                            } else {
                                _state.value = MatchmakingState.Queued(ticket)
                            }
                        }
                    }
                } catch (e: Exception) {
                    // Ignore transient polling errors
                }
                delay(2000) // poll every 2 seconds
            }
        }
    }

    fun cancel() {
        viewModelScope.launch {
            activeTicketId = null
            pollingJob?.cancel()
            _state.value = MatchmakingState.Idle
            try {
                apiService.cancelMatchmakingTicket()
            } catch (e: Exception) {
                // Best effort
            }
        }
    }

    fun reset() {
        activeTicketId = null
        pollingJob?.cancel()
        _state.value = MatchmakingState.Idle
    }
}
