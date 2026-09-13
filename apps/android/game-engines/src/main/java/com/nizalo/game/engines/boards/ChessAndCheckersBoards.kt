package com.nizalo.game.engines.boards

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
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
fun ChessBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedSquare by remember { mutableStateOf<String?>(null) }
    val lightSquare = Color(0xFFEEEED2)
    val darkSquare = Color(0xFF769656)
    val selectedColor = Color(0xFFBACA44)

    // Initial 8x8 setup representation or parse from FEN / boardStateJson
    val defaultPieces = mapOf(
        "a8" to "♜", "b8" to "♞", "c8" to "♝", "d8" to "♛", "e8" to "♚", "f8" to "♝", "g8" to "♞", "h8" to "♜",
        "a7" to "♟", "b7" to "♟", "c7" to "♟", "d7" to "♟", "e7" to "♟", "f7" to "♟", "g7" to "♟", "h7" to "♟",
        "a2" to "♙", "b2" to "♙", "c2" to "♙", "d2" to "♙", "e2" to "♙", "f2" to "♙", "g2" to "♙", "h2" to "♙",
        "a1" to "♖", "b1" to "♘", "c1" to "♗", "d1" to "♕", "e1" to "♔", "f1" to "♗", "g1" to "♘", "h1" to "♖"
    )

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .shadow(12.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceElevated)
            .border(4.dp, GoldAccent, RoundedCornerShape(12.dp))
            .padding(4.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            for (row in 8 downTo 1) {
                Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    for (col in 'a'..'h') {
                        val square = "$col$row"
                        val isLight = ((row + (col - 'a')) % 2 != 0)
                        val isSelected = selectedSquare == square
                        val squareColor = if (isSelected) selectedColor else if (isLight) lightSquare else darkSquare
                        val piece = defaultPieces[square] ?: ""

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(squareColor)
                                .clickable(enabled = isMyTurn) {
                                    if (selectedSquare == null) {
                                        if (piece.isNotEmpty()) selectedSquare = square
                                    } else {
                                        if (selectedSquare != square) {
                                            onMoveAttempt("MOVE", mapOf("from" to selectedSquare, "to" to square))
                                        }
                                        selectedSquare = null
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            if (piece.isNotEmpty()) {
                                Text(
                                    text = piece,
                                    fontSize = 32.sp,
                                    color = if (piece in "♜♞♝♛♚♟") Color.Black else Color.White
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CheckersBoardView(
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedSquare by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val darkWood = Color(0xFF4A2E18)
    val lightWood = Color(0xFFD2B48C)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .shadow(12.dp, RoundedCornerShape(12.dp))
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceElevated)
            .border(4.dp, GoldAccent, RoundedCornerShape(12.dp))
            .padding(4.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            for (row in 0..7) {
                Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    for (col in 0..7) {
                        val isDarkSquare = (row + col) % 2 != 0
                        val isSelected = selectedSquare == Pair(row, col)
                        val bg = if (isSelected) GoldGlow else if (isDarkSquare) darkWood else lightWood

                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxHeight()
                                .background(bg)
                                .clickable(enabled = isMyTurn && isDarkSquare) {
                                    if (selectedSquare == null) {
                                        selectedSquare = Pair(row, col)
                                    } else {
                                        val from = selectedSquare!!
                                        if (from != Pair(row, col)) {
                                            onMoveAttempt("MOVE", mapOf("fromRow" to from.first, "fromCol" to from.second, "toRow" to row, "toCol" to col))
                                        }
                                        selectedSquare = null
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            if (isDarkSquare) {
                                if (row < 3) {
                                    // Player 2 Red Piece
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .shadow(4.dp, RoundedCornerShape(14.dp))
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(RubyRed)
                                            .border(2.dp, Color.White, RoundedCornerShape(14.dp))
                                    )
                                } else if (row > 4) {
                                    // Player 1 White Piece
                                    Box(
                                        modifier = Modifier
                                            .size(28.dp)
                                            .shadow(4.dp, RoundedCornerShape(14.dp))
                                            .clip(RoundedCornerShape(14.dp))
                                            .background(Color.White)
                                            .border(2.dp, ObsidianBg, RoundedCornerShape(14.dp))
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
