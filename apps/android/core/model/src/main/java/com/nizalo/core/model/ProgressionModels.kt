package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
data class DailyChallenge(
    val id: String,
    val title: String,
    val description: String,
    val gameId: GameId? = null,
    val currentProgress: Int = 0,
    val targetProgress: Int = 1,
    val expReward: Long = 100,
    val isClaimed: Boolean = false
)

@Serializable
data class StreakInfo(
    val currentWinStreak: Int = 0,
    val longestWinStreak: Int = 0,
    val dailyLoginStreak: Int = 1,
    val streakShieldsRemaining: Int = 1,
    val streakMultiplier: Double = 1.0
)

@Serializable
data class GameMastery(
    val gameId: GameId,
    val rating: Int = 1200,
    val matchesPlayed: Int = 0,
    val matchesWon: Int = 0,
    val winRate: Double = 0.0,
    val masteryLevel: Int = 1,
    val masteryExp: Long = 0
)

@Serializable
data class GlobalSkillScore(
    val gssScore: Int = 1200,
    val tier: PlayerTier = PlayerTier.BRONZE,
    val globalRank: Int = 1000,
    val totalPlayers: Int = 50000,
    val percentile: Double = 50.0,
    val perGameMastery: Map<String, GameMastery> = emptyMap()
)

@Serializable
data class LeaderboardEntry(
    val rank: Int,
    val player: Player,
    val score: Int,
    val winRate: Double,
    val matchesWon: Int
)
