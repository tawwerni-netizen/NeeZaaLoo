package com.nizalo.game.engines.boards

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
fun DominoesBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    val myHand = listOf(Pair(6, 6), Pair(6, 5), Pair(5, 4), Pair(3, 2), Pair(1, 0), Pair(4, 4), Pair(2, 2))

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceDark)
            .border(2.dp, SurfaceBorder, RoundedCornerShape(12.dp))
            .padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Domino Table Felt
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(260.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF0F381E))
                .border(2.dp, GoldAccent, RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text("Domino Chain Area", color = Color(0x66FFFFFF), fontSize = 14.sp)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Player's Hand / Bone rack
        Text("Your Tiles", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(8.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(myHand) { tile ->
                Box(
                    modifier = Modifier
                        .size(width = 44.dp, height = 76.dp)
                        .shadow(4.dp, RoundedCornerShape(6.dp))
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFFFFFDD0))
                        .border(1.5.dp, Color(0xFFC4BA92), RoundedCornerShape(6.dp))
                        .clickable(enabled = isMyTurn) {
                            onMoveAttempt("PLAY_TILE", mapOf("left" to tile.first, "right" to tile.second))
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.SpaceEvenly,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        Text("${tile.first}", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(Color.Gray))
                        Text("${tile.second}", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun BackgammonBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    val woodBorder = Color(0xFF5C3317)
    val feltBg = Color(0xFF2E1800)
    val pointDark = Color(0xFF8B0000)
    val pointLight = Color(0xFFD2B48C)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1.2f)
            .shadow(12.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(feltBg)
            .border(6.dp, woodBorder, RoundedCornerShape(12.dp))
            .padding(6.dp)
    ) {
        // Top 12 triangles / points
        Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
            for (i in 1..12) {
                val isDarkPoint = i % 2 == 0
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(if (isDarkPoint) pointDark else pointLight)
                        .border(0.5.dp, Color.Black)
                        .clickable(enabled = isMyTurn) {
                            onMoveAttempt("SELECT_POINT", mapOf("point" to i))
                        },
                    contentAlignment = Alignment.TopCenter
                ) {
                    Text("$i", fontSize = 9.sp, color = if (isDarkPoint) Color.White else Color.Black)
                }
            }
        }

        // Center Bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(24.dp)
                .background(woodBorder),
            contentAlignment = Alignment.Center
        ) {
            Text("BAR & DICE", color = GoldAccent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }

        // Bottom 12 triangles / points
        Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
            for (i in 24 downTo 13) {
                val isDarkPoint = i % 2 != 0
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(if (isDarkPoint) pointDark else pointLight)
                        .border(0.5.dp, Color.Black)
                        .clickable(enabled = isMyTurn) {
                            onMoveAttempt("SELECT_POINT", mapOf("point" to i))
                        },
                    contentAlignment = Alignment.BottomCenter
                ) {
                    Text("$i", fontSize = 9.sp, color = if (isDarkPoint) Color.White else Color.Black)
                }
            }
        }
    }
}
