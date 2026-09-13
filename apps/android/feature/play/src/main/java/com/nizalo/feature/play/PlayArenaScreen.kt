package com.nizalo.feature.play

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*
import com.nizalo.game.engines.NizaloGameBoard

@Composable
fun PlayArenaScreen(
    duel: Duel,
    isSpectator: Boolean = false,
    mySeat: Int = 1,
    onSendMove: (actionType: String, payload: Map<String, Any?>) -> Unit,
    onLeaveMatch: () -> Unit,
    onShareMatch: (Duel) -> Unit
) {
    var showChatDrawer by remember { mutableStateOf(false) }
    val isMyTurn = !isSpectator && (duel.currentTurnSeat == mySeat) && (duel.status == DuelStatus.IN_PROGRESS)
    val opponentSeat = if (mySeat == 1) 2 else 1
    val opponentParticipant = if (opponentSeat == 1) duel.player1 else duel.player2
    val myParticipant = if (mySeat == 1) duel.player1 else duel.player2

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBg)
            .padding(16.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        // TOP: Opponent Status Bar
        NizaloCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text(
                            text = opponentParticipant.player.displayName ?: opponentParticipant.player.username,
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "GSS ${opponentParticipant.player.globalSkillScore}",
                            color = TextSecondary,
                            fontSize = 12.sp
                        )
                    }
                }

                if (isSpectator) {
                    NizaloBadge(text = "LIVE SPECTATOR (${duel.spectatorCount})", color = RubyRed, textColor = TextPrimary)
                } else {
                    NizaloClockDisplay(
                        remainingMs = opponentParticipant.timeRemainingMs,
                        isActive = duel.currentTurnSeat == opponentSeat
                    )
                }
            }
        }

        // MIDDLE: Interactive 3D / 2.5D Game Board
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center
        ) {
            NizaloGameBoard(
                gameId = duel.gameId,
                boardStateJson = duel.boardStateJson,
                isMyTurn = isMyTurn,
                mySeat = mySeat,
                onMoveAttempt = { actionType, payload ->
                    onSendMove(actionType, payload)
                }
            )
        }

        // BOTTOM: My Status Bar & Actions
        NizaloCard {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = if (isSpectator) myParticipant.player.displayName ?: myParticipant.player.username else "You",
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Text(
                        text = if (isMyTurn) "YOUR TURN" else "WAITING...",
                        color = if (isMyTurn) GoldAccent else TextSecondary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    NizaloClockDisplay(
                        remainingMs = myParticipant.timeRemainingMs,
                        isActive = duel.currentTurnSeat == mySeat
                    )

                    IconButton(
                        onClick = { showChatDrawer = !showChatDrawer },
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(SurfaceElevated)
                    ) {
                        Icon(Icons.Default.Chat, contentDescription = "Chat", tint = GoldAccent)
                    }
                }
            }
        }
    }

    // Match Over Dialog
    if (duel.status == DuelStatus.COMPLETED) {
        val isWinner = duel.winnerSeat == mySeat
        val isDraw = duel.outcome == DuelOutcome.DRAW

        AlertDialog(
            onDismissRequest = onLeaveMatch,
            title = {
                Text(
                    text = if (isDraw) "MATCH DRAW" else if (isWinner) "VICTORY! 🏆" else "DEFEAT",
                    color = if (isWinner) GoldAccent else if (isDraw) AzureBlue else RubyRed,
                    fontWeight = FontWeight.Black,
                    fontSize = 22.sp
                )
            },
            text = {
                Column {
                    Text("Game: ${duel.gameId.displayName}", color = TextPrimary)
                    Text("Stake: $${duel.stakeUsdt} USDT", color = TextSecondary)
                    if (duel.winReason != null) {
                        Text("Reason: ${duel.winReason}", color = TextSecondary, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = { onShareMatch(duel) },
                    colors = ButtonDefaults.buttonColors(containerColor = GoldAccent, contentColor = ObsidianBg)
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share Result Card", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = onLeaveMatch) {
                    Text("Back to Lobby", color = TextSecondary)
                }
            },
            containerColor = SurfaceDark,
            shape = RoundedCornerShape(16.dp)
        )
    }
}
