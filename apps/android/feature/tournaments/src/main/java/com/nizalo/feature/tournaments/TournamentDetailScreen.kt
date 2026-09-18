package com.nizalo.feature.tournaments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.Tournament
import com.nizalo.core.network.NizaloApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class TournamentDetailState {
    data object Loading : TournamentDetailState()
    data class Success(val tournament: Tournament) : TournamentDetailState()
    data class Error(val message: String) : TournamentDetailState()
}

class TournamentDetailViewModel(
    private val apiService: NizaloApiService,
    private val tournamentId: String
) : ViewModel() {

    private val _state = MutableStateFlow<TournamentDetailState>(TournamentDetailState.Loading)
    val state: StateFlow<TournamentDetailState> = _state.asStateFlow()

    init {
        loadTournament()
    }

    fun loadTournament() {
        viewModelScope.launch {
            _state.value = TournamentDetailState.Loading
            try {
                val response = apiService.getTournament(tournamentId)
                if (response.isSuccessful && response.body() != null) {
                    val data = response.body()?.data
                    if (data != null) {
                        _state.value = TournamentDetailState.Success(data as Tournament)
                    } else {
                        _state.value = TournamentDetailState.Error("Tournament not found")
                    }
                } else {
                    _state.value = TournamentDetailState.Error("Failed to load tournament")
                }
            } catch (e: Exception) {
                _state.value = TournamentDetailState.Error(e.message ?: "Unknown error")
            }
        }
    }
}

@Composable
fun TournamentDetailScreen(
    viewModel: TournamentDetailViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) {
                Text("< Back", color = GoldAccent)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text("Tournament Details", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (val s = state) {
            is TournamentDetailState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = GoldAccent)
                }
            }
            is TournamentDetailState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(s.message, color = RubyRed)
                    Spacer(modifier = Modifier.height(16.dp))
                    NizaloPrimaryButton(text = "Retry", onClick = { viewModel.loadTournament() })
                }
            }
            is TournamentDetailState.Success -> {
                val t = s.tournament
                coil.compose.AsyncImage(
                    model = "https://nizalo.com/images/games/${t.gameId.slug}-hero.jpg",
                    contentDescription = t.title,
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(t.title, fontSize = 24.sp, fontWeight = FontWeight.Black, color = TextPrimary)
                Text("Format: ${t.format.name} | Game: ${t.gameId.displayName}", color = TextSecondary)
                Spacer(modifier = Modifier.height(8.dp))
                NizaloCard {
                    Column(modifier = Modifier.padding(8.dp)) {
                        Text("Status: ${t.status.name}", color = AzureBlue)
                        Text("Prize Pool: $${t.prizePoolUsdt}", color = GoldAccent)
                        Text("Round: ${t.currentRound} / ${t.totalRounds}", color = TextPrimary)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))
                Text("Participants (${t.participants.size}/${t.maxParticipants})", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                Spacer(modifier = Modifier.height(8.dp))

                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(t.participants) { p ->
                        NizaloCard {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(p.username, color = TextPrimary)
                                Text("Score: ${p.score}", color = GoldAccent)
                            }
                        }
                    }
                }
            }
        }
    }
}
