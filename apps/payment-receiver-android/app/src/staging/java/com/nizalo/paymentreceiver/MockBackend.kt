package com.nizalo.paymentreceiver

import com.nizalo.paymentreceiver.data.network.ReceiverApi

/** Staging talks to a real backend only. */
object MockBackend {
    fun factory(): (() -> ReceiverApi)? = null
}
