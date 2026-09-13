package com.nizalo.game.engines

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.nizalo.core.model.GameId
import com.nizalo.game.engines.boards.*

interface GameBoardRenderer {
    @Composable
    fun Render(
        boardStateJson: String?,
        isMyTurn: Boolean,
        mySeat: Int,
        onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
        modifier: Modifier
    )
}

@Composable
fun NizaloGameBoard(
    gameId: GameId,
    boardStateJson: String?,
    isMyTurn: Boolean,
    mySeat: Int,
    onMoveAttempt: (actionType: String, payload: Map<String, Any?>) -> Unit,
    modifier: Modifier = Modifier
) {
    when (gameId) {
        GameId.CHESS -> ChessBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.CHECKERS -> CheckersBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.DOMINOES -> DominoesBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.BACKGAMMON -> BackgammonBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.CONNECT_FOUR -> ConnectFourBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.SEEGA -> SeegaBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.XO -> XoBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.SPEED_MATH -> SpeedMathBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.REVERSI -> ReversiBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
        GameId.GOMOKU -> GomokuBoardView(boardStateJson, isMyTurn, mySeat, onMoveAttempt, modifier)
    }
}
