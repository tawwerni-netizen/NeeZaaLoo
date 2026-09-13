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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nizalo.core.designsystem.*

@Composable
fun ConnectFourBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    // 7 Columns, 6 Rows
    val gridColor = Color(0xFF0D47A1)
    val emptySlotColor = Color(0xFF0D1117)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(7f / 6f)
            .shadow(16.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(gridColor)
            .border(4.dp, GoldAccent, RoundedCornerShape(16.dp))
            .padding(8.dp)
    ) {
        for (r in 0..5) {
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                for (c in 0..6) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(4.dp)
                            .clip(CircleShape)
                            .background(emptySlotColor)
                            .border(1.dp, Color(0xFF1E88E5), CircleShape)
                            .clickable(enabled = isMyTurn) {
                                onMoveAttempt("DROP_DISC", mapOf("column" to c))
                            }
                    )
                }
            }
        }
    }
}

@Composable
fun SeegaBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    // 5x5 Ancient Egyptian Board with Central Refuge Square (2,2)
    val sandColor = Color(0xFFC2B280)
    val centerSquareColor = Color(0xFF8B4513)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .shadow(12.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF3D2314))
            .border(4.dp, GoldAccent, RoundedCornerShape(12.dp))
            .padding(6.dp)
    ) {
        for (r in 0..4) {
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                for (c in 0..4) {
                    val isCenter = (r == 2 && c == 2)
                    val bg = if (isCenter) centerSquareColor else sandColor

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(2.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(bg)
                            .clickable(enabled = isMyTurn) {
                                onMoveAttempt("TAP_CELL", mapOf("row" to r, "col" to c))
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isCenter) {
                            Text("☥", color = GoldAccent, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
