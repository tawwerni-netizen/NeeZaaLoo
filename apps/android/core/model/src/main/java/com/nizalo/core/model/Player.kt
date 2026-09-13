package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
data class Player(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val countryCode: String? = null,
    val globalSkillScore: Int = 1200,
    val tier: PlayerTier = PlayerTier.BRONZE,
    val experiencePoints: Long = 0,
    val level: Int = 1,
    val referralCode: String? = null,
    val isGuest: Boolean = false,
    val is2faEnabled: Boolean = false
)

@Serializable
enum class PlayerTier {
    BRONZE,
    SILVER,
    GOLD,
    PLATINUM,
    DIAMOND,
    MASTER,
    GRANDMASTER;

    companion object {
        fun fromGss(gss: Int): PlayerTier = when {
            gss >= 2400 -> GRANDMASTER
            gss >= 2000 -> MASTER
            gss >= 1700 -> DIAMOND
            gss >= 1500 -> PLATINUM
            gss >= 1300 -> GOLD
            gss >= 1100 -> SILVER
            else -> BRONZE
        }
    }
}
