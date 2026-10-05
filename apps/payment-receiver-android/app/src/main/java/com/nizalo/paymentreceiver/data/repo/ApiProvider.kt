package com.nizalo.paymentreceiver.data.repo

import com.nizalo.paymentreceiver.core.Environment
import com.nizalo.paymentreceiver.data.network.ReceiverApi
import com.nizalo.paymentreceiver.data.network.RetrofitReceiverApi
import com.nizalo.paymentreceiver.data.network.UnconfiguredApi
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.security.SecureStore

/**
 * Hands out the API for the CURRENT settings, rebuilding the client when
 * the backend address changes. With no address or no token, every call
 * answers NotConfigured instead of attempting a connection.
 */
class ApiProvider(
    private val settings: SettingsRepository,
    private val secureStore: SecureStore,
    private val isOnline: () -> Boolean,
    private val mockFactory: (() -> ReceiverApi)?,
) {
    private var cachedUrl: String? = null
    private var cached: ReceiverApi? = null
    private val mock: ReceiverApi? by lazy { mockFactory?.invoke() }

    @Synchronized
    private fun forUrl(url: String): ReceiverApi {
        if (cached == null || cachedUrl != url) {
            cachedUrl = url
            cached = RetrofitReceiverApi(url, tokenProvider = { secureStore.token() }, isOnline = isOnline)
        }
        return cached!!
    }

    suspend fun api(): ReceiverApi {
        val s = settings.current()
        if (s.useMockBackend && Environment.current.mockAvailable) mock?.let { return it }
        if (s.baseUrl.isBlank() || !secureStore.hasToken()) return UnconfiguredApi
        return forUrl(s.baseUrl)
    }

    suspend fun isMock(): Boolean {
        val s = settings.current()
        return s.useMockBackend && Environment.current.mockAvailable && mock != null
    }
}
