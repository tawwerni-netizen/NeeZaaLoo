package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class ChatChannelType {
    GLOBAL,
    DUEL,
    TOURNAMENT,
    DIRECT
}

@Serializable
data class ChatMessage(
    val id: String,
    val channelType: ChatChannelType,
    val channelId: String,
    val senderId: String,
    val senderUsername: String,
    val senderAvatarUrl: String? = null,
    val senderTier: PlayerTier = PlayerTier.BRONZE,
    val content: String,
    val timestampMs: Long = System.currentTimeMillis(),
    val isSystemMessage: Boolean = false,
    val isSpectator: Boolean = false
)
