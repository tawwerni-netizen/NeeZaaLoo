package com.nizalo.feature.ranking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.model.GameId
import com.nizalo.core.model.LeaderboardEntry
import com.nizalo.core.network.NizaloApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class RankingState {
    data object Loading : RankingState()
    data class Success(val leaderboard: List<LeaderboardEntry>) : RankingState()
    data class Error(val message: String) : RankingState()
}

class RankingViewModel(
    private val apiService: NizaloApiService
) : ViewModel() {

    private val _state = MutableStateFlow<RankingState>(RankingState.Loading)
    val state: StateFlow<RankingState> = _state.asStateFlow()

    private val _selectedGame = MutableStateFlow<GameId?>(null)
    val selectedGame: StateFlow<GameId?> = _selectedGame.asStateFlow()

    init {
        loadLeaderboard()
    }

    fun selectGame(gameId: GameId?) {
        _selectedGame.value = gameId
        loadLeaderboard()
    }

    fun loadLeaderboard() {
        viewModelScope.launch {
            _state.value = RankingState.Loading
            try {
                val gameIdFilter = _selectedGame.value?.name
                val response = apiService.getLeaderboard(gameIdFilter)
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body()?.data
                    if (data != null) {
                        _state.value = RankingState.Success(data as List<LeaderboardEntry>)
                    } else {
                        _state.value = RankingState.Error("Failed to parse response")
                    }
                } else {
                    _state.value = RankingState.Error("Failed to load leaderboard: ${response.code()}")
                }
            } catch (e: Exception) {
                _state.value = RankingState.Error(e.message ?: "Unknown error")
            }
        }
    }
}
