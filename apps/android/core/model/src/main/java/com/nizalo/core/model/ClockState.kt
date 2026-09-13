package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
data class ClockState(
    val player1TimeRemainingMs: Long,
    val player2TimeRemainingMs: Long,
    val activePlayerSeat: Int, // 1 or 2
    val incrementMs: Long = 0,
    val lastServerTimestampMs: Long = System.currentTimeMillis()
)
