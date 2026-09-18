package com.nizalo.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.model.DailyChallenge
import com.nizalo.core.model.GlobalSkillScore
import com.nizalo.core.model.Player
import com.nizalo.core.model.StreakInfo
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.security.KeyStoreManager
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class ProfileState {
    data object Loading : ProfileState()
    data class Success(
        val player: Player,
        val gss: GlobalSkillScore,
        val streakInfo: StreakInfo,
        val challenges: List<DailyChallenge>,
        val antiPhishingPhrase: String
    ) : ProfileState()
    data class Error(val message: String) : ProfileState()
}

class ProfileViewModel(
    private val apiService: NizaloApiService,
    private val keyStoreManager: KeyStoreManager
) : ViewModel() {

    private val _state = MutableStateFlow<ProfileState>(ProfileState.Loading)
    val state: StateFlow<ProfileState> = _state.asStateFlow()

    init {
        loadProfileData()
    }

    fun loadProfileData() {
        viewModelScope.launch {
            _state.value = ProfileState.Loading
            try {
                // Fetch concurrently
                val playerDeferred = async { apiService.getCurrentPlayer() }
                val gssDeferred = async { apiService.getProgression() }
                val streakDeferred = async { apiService.getStreakInfo() }
                val challengesDeferred = async { apiService.getDailyChallenges() }

                val playerResponse = playerDeferred.await()
                val gssResponse = gssDeferred.await()
                val streakResponse = streakDeferred.await()
                val challengesResponse = challengesDeferred.await()

                if (playerResponse.isSuccessful && playerResponse.body() != null &&
                    gssResponse.isSuccessful && gssResponse.body() != null &&
                    streakResponse.isSuccessful && streakResponse.body() != null &&
                    challengesResponse.isSuccessful && challengesResponse.body() != null
                ) {
                    val player = playerResponse.body()!!.data as Player
                    val gss = gssResponse.body()!!.data as GlobalSkillScore
                    val streakInfo = streakResponse.body()!!.data as StreakInfo
                    val challenges = challengesResponse.body()!!.data as List<DailyChallenge>
                    val phrase = keyStoreManager.getAntiPhishingCode() ?: "Not Set"

                    _state.value = ProfileState.Success(
                        player = player,
                        gss = gss,
                        streakInfo = streakInfo,
                        challenges = challenges,
                        antiPhishingPhrase = phrase
                    )
                } else {
                    _state.value = ProfileState.Error("Failed to load profile data")
                }
            } catch (e: Exception) {
                _state.value = ProfileState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun claimChallenge(challengeId: String) {
        viewModelScope.launch {
            try {
                val response = apiService.claimChallenge(challengeId)
                if (response.isSuccessful) {
                    // Refresh challenges or entire profile
                    loadProfileData()
                }
            } catch (e: Exception) {
                // Ignore or show a toast
            }
        }
    }

    fun setAntiPhishingPhrase(phrase: String) {
        keyStoreManager.saveAntiPhishingCode(phrase)
        val currentState = _state.value
        if (currentState is ProfileState.Success) {
            _state.value = currentState.copy(antiPhishingPhrase = phrase)
        }
    }
}
