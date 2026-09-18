package com.nizalo.feature.ranking

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
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
fun RankingScreen(
    viewModel: RankingViewModel,
    myPlayerId: String? = null // Optional, to highlight the current user
) {
    val state by viewModel.state.collectAsState()
    val selectedGame by viewModel.selectedGame.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        Text("Global Skill Ranking", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Text("Top pure-skill players worldwide (GSS ELO)", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(16.dp))

        // Game Filter
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            item {
                FilterChip(
                    selected = selectedGame == null,
                    onClick = { viewModel.selectGame(null) },
                    label = { Text("Global") },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = GoldAccent,
                        selectedLabelColor = ObsidianBg
                    )
                )
            }
            items(GameId.entries) { game ->
                FilterChip(
                    selected = selectedGame == game,
                    onClick = { viewModel.selectGame(game) },
                    label = { Text(game.displayName) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = GoldAccent,
                        selectedLabelColor = ObsidianBg
                    )
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (val s = state) {
            is RankingState.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = GoldAccent)
                }
            }
            is RankingState.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(s.message, color = RubyRed)
                    Spacer(modifier = Modifier.height(16.dp))
                    NizaloPrimaryButton(text = "Retry", onClick = { viewModel.loadLeaderboard() })
                }
            }
            is RankingState.Success -> {
                val myRankEntry = s.leaderboard.find { it.player.id == myPlayerId }
                if (myRankEntry != null) {
                    NizaloCard {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("#${myRankEntry.rank}", fontSize = 18.sp, fontWeight = FontWeight.Black, color = GoldAccent)
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text("Your Ranking (${myRankEntry.player.displayName ?: myRankEntry.player.username})", fontWeight = FontWeight.Bold, color = TextPrimary)
                                    Text("Win Rate: ${(myRankEntry.winRate * 100).toInt()}% (${myRankEntry.matchesWon} wins)", color = TextSecondary, fontSize = 12.sp)
                                }
                            }
                            NizaloBadge(text = "${myRankEntry.score} GSS")
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                if (s.leaderboard.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No rankings available", color = TextSecondary)
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(s.leaderboard) { entry ->
                            val isMe = entry.player.id == myPlayerId
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(if (isMe) GoldAccent.copy(alpha = 0.1f) else SurfaceDark)
                                    .padding(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            text = when (entry.rank) {
                                                1 -> "🥇"
                                                2 -> "🥈"
                                                3 -> "🥉"
                                                else -> "#${entry.rank}"
                                            },
                                            fontSize = 16.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (entry.rank <= 3) GoldAccent else TextSecondary
                                        )
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column {
                                            Text(entry.player.displayName ?: entry.player.username, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                                            Text("Tier: ${entry.player.tier.name}", color = TextSecondary, fontSize = 11.sp)
                                        }
                                    }
                                    Text("${entry.score} GSS", fontWeight = FontWeight.Bold, color = GoldAccent, fontSize = 14.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
