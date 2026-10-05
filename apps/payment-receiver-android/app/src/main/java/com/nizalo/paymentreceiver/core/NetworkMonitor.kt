package com.nizalo.paymentreceiver.core

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

interface NetworkStatus {
    fun isOnline(): Boolean
    fun isUnmetered(): Boolean
}

class NetworkMonitor(context: Context) : NetworkStatus {
    private val cm = context.getSystemService(ConnectivityManager::class.java)

    private fun caps(): NetworkCapabilities? = cm?.activeNetwork?.let { cm.getNetworkCapabilities(it) }

    override fun isOnline(): Boolean = caps()?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

    /** Wi-Fi (or ethernet): what "send over Wi-Fi only" means to the operator. */
    override fun isUnmetered(): Boolean {
        val c = caps() ?: return false
        return c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }
}
