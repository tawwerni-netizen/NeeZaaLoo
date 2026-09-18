package com.nizalo.core.network

import android.content.Context
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.nizalo.core.security.SecureStorage
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

object NetworkModule {
    private const val BASE_URL = "https://nizalo.com/"

    val stepUpManager: StepUpManager by lazy { StepUpManagerImpl() }

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    fun provideOkHttpClient(secureStorage: SecureStorage, refreshHandler: suspend () -> String?): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        return OkHttpClient.Builder()
            .addInterceptor(IdempotencyInterceptor())
            .addInterceptor(StepUpInterceptor(stepUpManager))
            .addInterceptor(AuthInterceptor(secureStorage, refreshHandler))
            .addInterceptor(loggingInterceptor)
            .build()
    }

    fun provideNizaloApiService(okHttpClient: OkHttpClient): NizaloApiService {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
            .create(NizaloApiService::class.java)
    }
}