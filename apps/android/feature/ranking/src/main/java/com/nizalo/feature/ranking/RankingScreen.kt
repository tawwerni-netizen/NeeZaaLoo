package com.nizalo.feature.ranking

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*

@Composable
fun RankingScreen(
    leaderboard: List<LeaderboardEntry>,
    myRankEntry: LeaderboardEntry?
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        Text("Global Skill Ranking", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Text("Top pure-skill players worldwide (GSS ELO)", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(16.dp))

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

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(leaderboard) { entry ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(SurfaceDark)
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
