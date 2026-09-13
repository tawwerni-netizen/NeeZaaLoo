package com.nizalo.core.realtime

import com.nizalo.core.model.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

@Serializable
enum class FrameType {
    // Client -> Server
    AUTHENTICATE,
    SUBSCRIBE_DUEL,
    UNSUBSCRIBE_DUEL,
    SEND_MOVE,
    SUBSCRIBE_SPECTATOR,
    UNSUBSCRIBE_SPECTATOR,
    JOIN_CHAT_CHANNEL,
    LEAVE_CHAT_CHANNEL,
    SEND_CHAT_MESSAGE,
    RECONNECT_DUEL,
    HEARTBEAT_PING,

    // Server -> Client
    AUTHENTICATED,
    DUEL_STATE_SYNC,
    MOVE_APPLIED,
    MOVE_REJECTED,
    CLOCK_UPDATE,
    SPECTATOR_UPDATE,
    CHAT_MESSAGE_RECEIVED,
    DUEL_FINISHED,
    HEARTBEAT_PONG,
    ERROR
}

@Serializable
data class RealtimeFrame(
    val type: FrameType,
    val correlationId: String? = null,
    val payload: JsonElement? = null,
    val timestampMs: Long = System.currentTimeMillis()
)

@Serializable
data class AuthenticatePayload(
    val token: String
)

@Serializable
data class SubscribeDuelPayload(
    val duelId: String
)

@Serializable
data class SendMovePayload(
    val duelId: String,
    val moveNumber: Int,
    val actionType: String,
    val payload: JsonObject,
    val notation: String? = null
)

@Serializable
data class ReconnectDuelPayload(
    val duelId: String,
    val lastKnownMoveNumber: Int
)

@Serializable
data class SendChatMessagePayload(
    val channelType: ChatChannelType,
    val channelId: String,
    val content: String
)

@Serializable
data class DuelStateSyncPayload(
    val duel: Duel,
    val movesSinceLastKnown: List<GameMove> = emptyList()
)

@Serializable
data class ClockUpdatePayload(
    val duelId: String,
    val clockState: ClockState
)

@Serializable
data class SpectatorUpdatePayload(
    val duelId: String,
    val spectatorCount: Int
)

@Serializable
data class ErrorPayload(
    val code: String,
    val message: String
)
