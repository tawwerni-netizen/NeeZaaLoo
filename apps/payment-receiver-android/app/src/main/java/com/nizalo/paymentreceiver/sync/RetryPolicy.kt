package com.nizalo.paymentreceiver.sync

/**
 * When to try a failed send again. It never gives up on its own: a receipt
 * is real money someone sent, so it stays queued (at most six hours apart)
 * until the backend answers for it.
 */
object RetryPolicy {
    private val delaysMs = longArrayOf(
        30_000L,            // after 1st failure
        60_000L,            // 2nd
        2 * 60_000L,
        5 * 60_000L,        // 4th
        10 * 60_000L,       // 5th
        30 * 60_000L,
        60 * 60_000L,
        2 * 60 * 60_000L,
        6 * 60 * 60_000L,   // 9th and every later one
    )

    fun delayAfter(failedAttempts: Int): Long = delaysMs[(failedAttempts - 1).coerceIn(0, delaysMs.lastIndex)]
}
