package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class TournamentFormat {
    SWISS,
    SINGLE_ELIMINATION,
    DOUBLE_ELIMINATION,
    ROUND_ROBIN
}

@Serializable
enum class TournamentStatus {
    UPCOMING,
    REGISTRATION_OPEN,
    IN_PROGRESS,
    COMPLETED,
    CANCELLED
}

@Serializable
data class TournamentParticipant(
    val playerId: String,
    val username: String,
    val avatarUrl: String? = null,
    val score: Double = 0.0,
    val tiebreakScore: Double = 0.0,
    val rank: Int = 0
)

@Serializable
data class Tournament(
    val id: String,
    val title: String,
    val gameId: GameId,
    val format: TournamentFormat = TournamentFormat.SWISS,
    val status: TournamentStatus = TournamentStatus.REGISTRATION_OPEN,
    val entryFeeUsdt: Double = 0.0,
    val prizePoolUsdt: Double = 0.0,
    val maxParticipants: Int = 64,
    val currentParticipantsCount: Int = 0,
    val currentRound: Int = 1,
    val totalRounds: Int = 5,
    val startTimestampMs: Long = 0,
    val participants: List<TournamentParticipant> = emptyList(),
    val isRegistered: Boolean = false
)
