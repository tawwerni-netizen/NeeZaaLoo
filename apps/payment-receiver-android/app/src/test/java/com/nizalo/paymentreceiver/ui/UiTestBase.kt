package com.nizalo.paymentreceiver.ui

import androidx.compose.ui.test.SemanticsNodeInteractionsProvider
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.ComposeContentTestRule

/** Waits for work that runs off the main thread (Room, the mock backend) to show up on screen. */
fun ComposeContentTestRule.waitForText(text: String, substring: Boolean = true, timeoutMs: Long = 15_000) {
    waitUntil(timeoutMs) { onAllNodes(hasText(text, substring = substring)).fetchSemanticsNodes().isNotEmpty() }
}

fun ComposeContentTestRule.waitForTag(tag: String, timeoutMs: Long = 15_000) {
    waitUntil(timeoutMs) { onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty() }
}

fun SemanticsNodeInteractionsProvider.exists(text: String): Boolean =
    onAllNodes(hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty()
