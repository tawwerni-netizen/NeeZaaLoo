package com.nizalo.game.engines.boards

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.nizalo.core.designsystem.*

@Composable
fun ReversiBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    val feltGreen = Color(0xFF1E6B37)
    val gridLine = Color(0xFF0F3B1E)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .shadow(12.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(feltGreen)
            .border(4.dp, GoldAccent, RoundedCornerShape(12.dp))
            .padding(4.dp)
    ) {
        for (r in 0..7) {
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                for (c in 0..7) {
                    val isCenterInitialBlack = (r == 3 && c == 4) || (r == 4 && c == 3)
                    val isCenterInitialWhite = (r == 3 && c == 3) || (r == 4 && c == 4)

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .border(0.5.dp, gridLine)
                            .clickable(enabled = isMyTurn) {
                                onMoveAttempt("PLACE_DISC", mapOf("row" to r, "col" to c))
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isCenterInitialBlack) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .shadow(2.dp, CircleShape)
                                    .clip(CircleShape)
                                    .background(ObsidianBg)
                                    .border(1.dp, Color.Gray, CircleShape)
                            )
                        } else if (isCenterInitialWhite) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .shadow(2.dp, CircleShape)
                                    .clip(CircleShape)
                                    .background(Color.White)
                                    .border(1.dp, Color.LightGray, CircleShape)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun GomokuBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    // 15x15 Wood Goban
    val gobanWood = Color(0xFFDCB35C)
    val gobanLine = Color(0xFF6B4E1A)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .shadow(12.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(gobanWood)
            .border(4.dp, Color(0xFF8B5A2B), RoundedCornerShape(12.dp))
            .padding(4.dp)
    ) {
        for (r in 0..14) {
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                for (c in 0..14) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .border(0.25.dp, gobanLine)
                            .clickable(enabled = isMyTurn) {
                                onMoveAttempt("PLACE_STONE", mapOf("row" to r, "col" to c))
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        // Tengen & Star Points on 15x15: (3,3), (3,11), (7,7), (11,3), (11,11)
                        if ((r == 3 || r == 7 || r == 11) && (c == 3 || c == 7 || c == 11)) {
                            Box(
                                modifier = Modifier
                                    .size(4.dp)
                                    .clip(CircleShape)
                                    .background(gobanLine)
                            )
                        }
                    }
                }
            }
        }
    }
}
