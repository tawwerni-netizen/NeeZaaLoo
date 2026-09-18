package com.nizalo.feature.play

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*

@Composable
fun MatchmakingOverlay(
    state: MatchmakingState,
    onCancel: () -> Unit
) {
    if (state is MatchmakingState.Idle || state is MatchmakingState.Matched) return

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg.copy(alpha = 0.9f)),
        contentAlignment = Alignment.Center
    ) {
        NizaloCard(
            modifier = Modifier.padding(24.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Matchmaking",
                    color = GoldAccent,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(16.dp))

                when (state) {
                    is MatchmakingState.Requesting -> {
                        CircularProgressIndicator(color = GoldAccent)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Joining queue...", color = TextSecondary)
                    }
                    is MatchmakingState.Queued -> {
                        CircularProgressIndicator(color = GoldAccent)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Searching for opponent...", color = TextSecondary)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Game: ${state.ticket.gameId}", color = TextSecondary, fontSize = 12.sp)
                        Text("Mode: ${state.ticket.mode}", color = TextSecondary, fontSize = 12.sp)
                    }
                    is MatchmakingState.Error -> {
                        Text(state.message, color = RubyRed)
                    }
                    else -> Unit
                }

                Spacer(modifier = Modifier.height(24.dp))
                TextButton(onClick = onCancel) {
                    Text(text = if (state is MatchmakingState.Error) "Close" else "Cancel", color = TextSecondary)
                }
            }
        }
    }
}
