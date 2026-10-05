package com.nizalo.paymentreceiver

import com.nizalo.paymentreceiver.data.network.ReceiverApi

/** Production builds contain no mock backend at all. */
object MockBackend {
    fun factory(): (() -> ReceiverApi)? = null
}
