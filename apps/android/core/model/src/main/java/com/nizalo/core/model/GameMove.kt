package com.nizalo.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class GameMove(
    val moveNumber: Int,
    val playerSeat: Int, // 1 or 2
    val actionType: String, // e.g. "MOVE", "DROP", "ROLL", "PASS", "ANSWER"
    val payload: JsonObject,
    val notation: String? = null,
    val clientTimestampMs: Long = System.currentTimeMillis(),
    val serverTimestampMs: Long? = null
)
