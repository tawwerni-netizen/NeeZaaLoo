package com.nizalo.game.engines.boards

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
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
fun XoBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    // 3x3 Holographic Grid
    Column(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .shadow(16.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceDark)
            .border(3.dp, PurpleNeon, RoundedCornerShape(16.dp))
            .padding(8.dp)
    ) {
        for (r in 0..2) {
            Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                for (c in 0..2) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(SurfaceElevated)
                            .border(1.dp, SurfaceBorder, RoundedCornerShape(8.dp))
                            .clickable(enabled = isMyTurn) {
                                onMoveAttempt("PLACE_MARK", mapOf("row" to r, "col" to c))
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        // Mark display
                    }
                }
            }
        }
    }
}

@Composable
fun SpeedMathBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    var currentInput by remember { mutableStateOf("") }
    val equation = "48 × 7 + 19 = ?"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceDark)
            .border(2.dp, AzureBlue, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Spatial 3D Equation Display
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(100.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SurfaceElevated)
                .border(2.dp, GoldAccent, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = equation,
                color = TextPrimary,
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Answer Display Bar
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(ObsidianBg)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(8.dp))
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Text(
                text = if (currentInput.isEmpty()) "Enter answer..." else currentInput,
                color = if (currentInput.isEmpty()) TextMuted else GoldAccent,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // High-speed Numeric Keypad
        val keys = listOf("7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "↵")
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(keys) { key ->
                Button(
                    onClick = {
                        when (key) {
                            "C" -> currentInput = ""
                            "↵" -> {
                                if (currentInput.isNotEmpty()) {
                                    onMoveAttempt("SUBMIT_ANSWER", mapOf("answer" to currentInput.toIntOrNull()))
                                    currentInput = ""
                                }
                            }
                            else -> if (currentInput.length < 6) currentInput += key
                        }
                    },
                    modifier = Modifier.height(48.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (key == "↵") EmeraldGreen else if (key == "C") RubyRed else SurfaceElevated,
                        contentColor = TextPrimary
                    )
                ) {
                    Text(key, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
