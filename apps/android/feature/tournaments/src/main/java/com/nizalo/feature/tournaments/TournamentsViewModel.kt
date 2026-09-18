package com.nizalo.feature.tournaments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.model.Tournament
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.network.StepUpManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class TournamentsState {
    data object Loading : TournamentsState()
    data class Success(val tournaments: List<Tournament>) : TournamentsState()
    data class Error(val message: String) : TournamentsState()
}

class TournamentsViewModel(
    private val apiService: NizaloApiService
) : ViewModel() {

    private val _state = MutableStateFlow<TournamentsState>(TournamentsState.Loading)
    val state: StateFlow<TournamentsState> = _state.asStateFlow()

    private val _registrationLoading = MutableStateFlow<String?>(null)
    val registrationLoading: StateFlow<String?> = _registrationLoading.asStateFlow()

    init {
        loadTournaments()
    }

    fun loadTournaments() {
        viewModelScope.launch {
            _state.value = TournamentsState.Loading
            try {
                val response = apiService.getTournaments()
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body()?.data
                    if (data != null) {
                        _state.value = TournamentsState.Success(data as List<Tournament>)
                    } else {
                        _state.value = TournamentsState.Error("Failed to parse response")
                    }
                } else {
                    _state.value = TournamentsState.Error("Failed to load tournaments: ${response.code()}")
                }
            } catch (e: Exception) {
                _state.value = TournamentsState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun registerTournament(tournamentId: String) {
        viewModelScope.launch {
            _registrationLoading.value = tournamentId
            try {
                val response = apiService.registerTournament(tournamentId)
                if (response.isSuccessful) {
                    loadTournaments() // Refresh the list
                }
            } catch (e: Exception) {
                // Ignore or handle
            } finally {
                _registrationLoading.value = null
            }
        }
    }
}
