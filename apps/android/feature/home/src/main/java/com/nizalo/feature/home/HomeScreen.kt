package com.nizalo.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*

@Composable
fun HomeScreen(
    player: Player?,
    streakInfo: StreakInfo?,
    onSelectGame: (GameId) -> Unit,
    onNavigateToTournaments: () -> Unit,
    onNavigateToWallet: () -> Unit,
    onWatchLiveMatch: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Player Header Card
        NizaloCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = player?.displayName ?: player?.username ?: "Player",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        NizaloBadge(text = "${player?.tier?.name ?: "BRONZE"}")
                        Text("GSS ${player?.globalSkillScore ?: 1200}", color = GoldAccent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }

                // Win Streak Badge
                Column(horizontalAlignment = Alignment.End) {
                    Text("🔥 ${streakInfo?.currentWinStreak ?: 0} Win Streak", color = Color(0xFFFF8C00), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text("Shields: ${streakInfo?.streakShieldsRemaining ?: 1} 🛡️", color = TextSecondary, fontSize = 11.sp)
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // Quick Play All 10 Games Horizontal Reel
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Featured Games", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Text("All 10 Games", fontSize = 13.sp, color = GoldAccent, fontWeight = FontWeight.SemiBold)
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(GameId.entries) { game ->
                Box(
                    modifier = Modifier
                        .size(width = 140.dp, height = 160.dp)
                        .shadow(8.dp, RoundedCornerShape(12.dp))
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            Brush.verticalGradient(
                                listOf(SurfaceElevated, SurfaceDark)
                            )
                        )
                        .clickable { onSelectGame(game) }
                        .padding(12.dp),
                    contentAlignment = Alignment.BottomStart
                ) {
                    Column {
                        NizaloBadge(
                            text = when (game.presentationType) {
                                PresentationType.FULL_3D -> "FULL 3D"
                                PresentationType.HYBRID_2_5D -> "2.5D"
                                PresentationType.SPATIAL_EFFECTS -> "SPATIAL"
                            },
                            color = if (game.presentationType == PresentationType.FULL_3D) GoldAccent else AzureBlue,
                            textColor = ObsidianBg
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = game.displayName,
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "Play Now",
                            color = GoldAccent,
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Live Arena Spectator Strip
        NizaloCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(RubyRed)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("LIVE ARENA", fontWeight = FontWeight.Black, color = RubyRed, fontSize = 13.sp)
                }
                Text("1,420 Spectators", color = TextSecondary, fontSize = 11.sp)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                "Grandmaster Duel: Chess (Stake: $50 USDT)",
                color = TextPrimary,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )
            Text("Alexandre (2420 GSS) vs MagnusK (2510 GSS)", color = TextSecondary, fontSize = 12.sp)

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = { onWatchLiveMatch("live-gm-duel-1") },
                colors = ButtonDefaults.buttonColors(containerColor = SurfaceElevated, contentColor = GoldAccent),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Spectate Live", fontWeight = FontWeight.Bold)
            }
        }
    }
}
