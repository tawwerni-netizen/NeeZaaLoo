package com.nizalo.core.common

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ClockSyncTest {

    @Test
    fun `test clock offset calculation with round trip compensation`() {
        val clockSync = ClockSync()
        val clientSend = 1000L
        val serverTime = 1050L
        val clientReceive = 1100L // 100ms round trip -> 50ms latency -> estimated server time 1100L -> offset 0

        clockSync.updateOffset(clientSend, serverTime, clientReceive)
        val remaining = clockSync.getRemainingTimeMs(
            serverBaseRemainingMs = 60000L,
            lastServerTimestampMs = clockSync.getCurrentServerTimeMs(),
            isActive = false
        )
        assertEquals(60000L, remaining)
    }

    @Test
    fun `test inactive clock does not decrease remaining time`() {
        val clockSync = ClockSync()
        val remaining = clockSync.getRemainingTimeMs(
            serverBaseRemainingMs = 30000L,
            lastServerTimestampMs = 1000L,
            isActive = false
        )
        assertEquals(30000L, remaining)
    }
}
