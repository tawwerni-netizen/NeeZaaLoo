package com.nizalo.feature.games

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*

@Composable
fun GameSelectionScreen(
    onStartMatch: (gameId: GameId, mode: MatchMode, difficulty: ComputerDifficulty?, stakeUsdt: Double) -> Unit
) {
    var selectedGameForMode by remember { mutableStateOf<GameId?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp)
    ) {
        Text("Game Hub", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        Text("Select a pure-skill game to play", fontSize = 13.sp, color = TextSecondary)

        Spacer(modifier = Modifier.height(16.dp))

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(GameId.entries) { game ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .shadow(8.dp, RoundedCornerShape(12.dp))
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { selectedGameForMode = game },
                    contentAlignment = Alignment.BottomStart
                ) {
                    coil.compose.AsyncImage(
                        model = "https://nizalo.com/images/games/${game.slug}-hero.jpg",
                        contentDescription = game.displayName,
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    // Gradient overlay for text readability
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                Brush.verticalGradient(
                                    colors = listOf(androidx.compose.ui.graphics.Color.Transparent, ObsidianBg.copy(alpha = 0.8f))
                                )
                            )
                    )
                    Column(modifier = Modifier.padding(12.dp)) {
                        NizaloBadge(
                            text = when (game.presentationType) {
                                PresentationType.FULL_3D -> "FULL 3D"
                                PresentationType.HYBRID_2_5D -> "2.5D"
                                PresentationType.SPATIAL_EFFECTS -> "SPATIAL"
                            },
                            color = if (game.presentationType == PresentationType.FULL_3D) GoldAccent else AzureBlue,
                            textColor = ObsidianBg
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = game.displayName,
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                    }
                }
            }
        }
    }

    if (selectedGameForMode != null) {
        ModeSelectionDialog(
            game = selectedGameForMode!!,
            onDismiss = { selectedGameForMode = null },
            onConfirm = { mode, diff, stake ->
                val game = selectedGameForMode!!
                selectedGameForMode = null
                onStartMatch(game, mode, diff, stake)
            }
        )
    }
}

@Composable
fun ModeSelectionDialog(
    game: GameId,
    onDismiss: () -> Unit,
    onConfirm: (MatchMode, ComputerDifficulty?, Double) -> Unit
) {
    var selectedMode by remember { mutableStateOf(MatchMode.VS_COMPUTER) }
    var selectedDifficulty by remember { mutableStateOf(ComputerDifficulty.MEDIUM) }
    var selectedStake by remember { mutableStateOf(0.0) } // Free default

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Play ${game.displayName}", color = GoldAccent, fontWeight = FontWeight.Bold)
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text("Select Match Mode:", color = TextSecondary, fontSize = 12.sp)
                Spacer(modifier = Modifier.height(8.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { selectedMode = MatchMode.VS_COMPUTER },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (selectedMode == MatchMode.VS_COMPUTER) GoldAccent else SurfaceElevated,
                            contentColor = if (selectedMode == MatchMode.VS_COMPUTER) ObsidianBg else TextPrimary
                        ),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("AI", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { selectedMode = MatchMode.RANDOM },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (selectedMode == MatchMode.RANDOM) GoldAccent else SurfaceElevated,
                            contentColor = if (selectedMode == MatchMode.RANDOM) ObsidianBg else TextPrimary
                        ),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Random", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { selectedMode = MatchMode.FRIEND },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (selectedMode == MatchMode.FRIEND) GoldAccent else SurfaceElevated,
                            contentColor = if (selectedMode == MatchMode.FRIEND) ObsidianBg else TextPrimary
                        ),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Friend", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (selectedMode == MatchMode.VS_COMPUTER) {
                    Text("AI Difficulty (Free Only):", color = TextSecondary, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        ComputerDifficulty.entries.forEach { diff ->
                            Button(
                                onClick = { selectedDifficulty = diff },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (selectedDifficulty == diff) AzureBlue else SurfaceElevated,
                                    contentColor = TextPrimary
                                ),
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(6.dp),
                                contentPadding = PaddingValues(horizontal = 2.dp, vertical = 6.dp)
                            ) {
                                Text(diff.name.take(3), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                } else {
                    Text("Select Stake (USDT):", color = TextSecondary, fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(0.0, 1.0, 5.0, 10.0, 25.0).forEach { stake ->
                            Button(
                                onClick = { selectedStake = stake },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (selectedStake == stake) EmeraldGreen else SurfaceElevated,
                                    contentColor = TextPrimary
                                ),
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(6.dp),
                                contentPadding = PaddingValues(horizontal = 2.dp, vertical = 6.dp)
                            ) {
                                Text(if (stake == 0.0) "Free" else "$${stake.toInt()}", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onConfirm(
                        selectedMode,
                        if (selectedMode == MatchMode.VS_COMPUTER) selectedDifficulty else null,
                        if (selectedMode == MatchMode.VS_COMPUTER) 0.0 else selectedStake
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
            ) {
                Text("Start Game", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = TextSecondary)
            }
        },
        containerColor = SurfaceDark,
        shape = RoundedCornerShape(16.dp)
    )
}
