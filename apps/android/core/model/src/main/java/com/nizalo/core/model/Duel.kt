package com.nizalo.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
enum class DuelStatus {
    MATCHMAKING,
    WAITING_FOR_PLAYERS,
    IN_PROGRESS,
    PAUSED,
    COMPLETED,
    ABANDONED,
    CANCELLED
}

@Serializable
enum class DuelOutcome {
    PLAYER_1_WON,
    PLAYER_2_WON,
    DRAW,
    ABANDONED,
    DISQUALIFIED
}

@Serializable
data class DuelParticipant(
    val player: Player,
    val seat: Int, // 1 or 2
    val isConnected: Boolean = true,
    val score: Double = 0.0,
    val timeRemainingMs: Long = 0
)

@Serializable
data class Duel(
    val id: String,
    val gameId: GameId,
    val mode: MatchMode,
    val difficulty: ComputerDifficulty? = null,
    val status: DuelStatus = DuelStatus.IN_PROGRESS,
    val stakeUsdt: Double = 0.0,
    val isCompetitive: Boolean = false,
    val player1: DuelParticipant,
    val player2: DuelParticipant,
    val currentTurnSeat: Int = 1,
    val moveCount: Int = 0,
    val clockState: ClockState? = null,
    val boardStateJson: String? = null,
    val outcome: DuelOutcome? = null,
    val winnerSeat: Int? = null,
    val winReason: String? = null,
    val spectatorCount: Int = 0,
    val tournamentId: String? = null,
    val createdAtMs: Long = System.currentTimeMillis()
)
