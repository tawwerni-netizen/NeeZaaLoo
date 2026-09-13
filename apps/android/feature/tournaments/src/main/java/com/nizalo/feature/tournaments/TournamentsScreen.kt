package com.nizalo.feature.tournaments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*

@Composable
fun TournamentsScreen(
    tournaments: List<Tournament>,
    onRegisterTournament: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        Text("Tournaments", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Text("Swiss System & Elimination Tournaments", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(16.dp))

        if (tournaments.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No active tournaments at the moment", color = TextSecondary)
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(tournaments) { tourney ->
                    NizaloCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(tourney.title, fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 16.sp)
                            NizaloBadge(
                                text = tourney.format.name,
                                color = AzureBlue,
                                textColor = ObsidianBg
                            )
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text("Game: ${tourney.gameId.displayName}", color = TextSecondary, fontSize = 13.sp)
                        Text("Prize Pool: $${tourney.prizePoolUsdt} USDT", color = GoldAccent, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("Entry Fee: $${tourney.entryFeeUsdt} USDT", color = TextSecondary, fontSize = 12.sp)
                        Text("Participants: ${tourney.currentParticipantsCount}/${tourney.maxParticipants}", color = TextSecondary, fontSize = 12.sp)

                        Spacer(modifier = Modifier.height(12.dp))

                        Button(
                            onClick = { onRegisterTournament(tourney.id) },
                            enabled = !tourney.isRegistered && tourney.status == TournamentStatus.REGISTRATION_OPEN,
                            colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(if (tourney.isRegistered) "Registered ✓" else "Register Tournament", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
