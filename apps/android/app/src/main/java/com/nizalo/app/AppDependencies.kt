package com.nizalo.app

import android.content.Context
import com.nizalo.core.network.NetworkModule
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.realtime.RealtimeWebSocketClient
import com.nizalo.core.security.KeyStoreManager
import com.nizalo.core.common.ClockSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

object AppDependencies {
    private var _apiService: NizaloApiService? = null
    private var _wsClient: RealtimeWebSocketClient? = null

    fun getApiService(context: Context): NizaloApiService {
        if (_apiService == null) {
            val secureStorage = KeyStoreManager(context.applicationContext)
            val okHttpClient = NetworkModule.provideOkHttpClient(secureStorage) { null }
            _apiService = NetworkModule.provideNizaloApiService(okHttpClient)
        }
        return _apiService!!
    }

    fun getWsClient(context: Context): RealtimeWebSocketClient {
        if (_wsClient == null) {
            val secureStorage = KeyStoreManager(context.applicationContext)
            _wsClient = RealtimeWebSocketClient(
                wsUrl = "wss://nizalo.com/v1/realtime",
                secureStorage = secureStorage,
                clockSync = ClockSync(),
                coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
            )
        }
        return _wsClient!!
    }
}
