package com.nizalo.core.common

import android.os.SystemClock
import java.util.concurrent.atomic.AtomicLong

class ClockSync {
    private val offsetMs = AtomicLong(0L)

    /**
     * Updates time offset using NTP-like 3-point sample:
     * roundTrip = (clientReceive - clientSend)
     * estimatedServerTime = serverTimestamp + (roundTrip / 2)
     * offset = estimatedServerTime - clientReceive
     */
    fun updateOffset(clientSendMs: Long, serverTimestampMs: Long, clientReceiveMs: Long) {
        val roundTrip = (clientReceiveMs - clientSendMs).coerceAtLeast(0)
        val estimatedServerTime = serverTimestampMs + (roundTrip / 2)
        val offset = estimatedServerTime - clientReceiveMs
        offsetMs.set(offset)
    }

    fun getCurrentServerTimeMs(): Long {
        return System.currentTimeMillis() + offsetMs.get()
    }

    fun getRemainingTimeMs(
        serverBaseRemainingMs: Long,
        lastServerTimestampMs: Long,
        isActive: Boolean
    ): Long {
        if (!isActive) return serverBaseRemainingMs.coerceAtLeast(0)
        val currentServerTime = getCurrentServerTimeMs()
        val elapsed = (currentServerTime - lastServerTimestampMs).coerceAtLeast(0)
        return (serverBaseRemainingMs - elapsed).coerceAtLeast(0)
    }
}
