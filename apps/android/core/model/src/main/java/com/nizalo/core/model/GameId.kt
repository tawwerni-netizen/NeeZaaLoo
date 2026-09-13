package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class GameId(
    val slug: String,
    val displayName: String,
    val presentationType: PresentationType,
    val minPlayers: Int = 2,
    val maxPlayers: Int = 2
) {
    CHESS("chess", "Chess", PresentationType.FULL_3D),
    CHECKERS("checkers", "Checkers", PresentationType.FULL_3D),
    DOMINOES("dominoes", "Dominoes", PresentationType.FULL_3D),
    BACKGAMMON("backgammon", "Backgammon", PresentationType.FULL_3D),
    CONNECT_FOUR("connect-four", "Connect Four", PresentationType.FULL_3D),
    SEEGA("seega", "Seega", PresentationType.HYBRID_2_5D),
    XO("xo", "XO (Tic-Tac-Toe)", PresentationType.HYBRID_2_5D),
    REVERSI("reversi", "Reversi", PresentationType.HYBRID_2_5D),
    GOMOKU("gomoku", "Gomoku", PresentationType.HYBRID_2_5D),
    SPEED_MATH("speed-math", "Speed Math", PresentationType.SPATIAL_EFFECTS);

    companion object {
        fun fromSlug(slug: String): GameId? = entries.find { it.slug.equals(slug, ignoreCase = true) }
    }
}

@Serializable
enum class PresentationType {
    FULL_3D,
    HYBRID_2_5D,
    SPATIAL_EFFECTS
}

@Serializable
enum class MatchMode {
    VS_COMPUTER,
    FRIEND,
    RANDOM,
    TOURNAMENT
}

@Serializable
enum class ComputerDifficulty {
    EASY,
    MEDIUM,
    HARD,
    EXPERT
}
