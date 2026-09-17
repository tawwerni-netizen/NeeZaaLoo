package com.nizalo.paymentreceiver.api

import retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

object RetrofitClient {
    private val json = Json { ignoreUnknownKeys = true }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY })
        .build()

    private var currentBaseUrl: String? = null
    private var currentApi: PaymentApi? = null

    fun getApi(baseUrl: String): PaymentApi {
        var safeUrl = baseUrl
        if (!safeUrl.endsWith("/")) safeUrl += "/"
        
        // Android allows cleartext (HTTP) only if configured, but let's assume they use https or 10.0.2.2.
        // If they use localhost on device, it must be mapped, but let's just create Retrofit.
        if (currentApi == null || currentBaseUrl != safeUrl) {
            currentBaseUrl = safeUrl
            currentApi = Retrofit.Builder()
                .baseUrl(safeUrl)
                .client(okHttpClient)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(PaymentApi::class.java)
        }
        return currentApi!!
    }
}
