package com.nizalo.core.network

import com.nizalo.core.security.SecureStorage
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID

class AuthInterceptor(
    private val secureStorage: SecureStorage,
    private val refreshHandler: suspend () -> String?
) : Interceptor {
    private val refreshMutex = Mutex()

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = secureStorage.getAccessToken()

        val requestWithAuth = if (!token.isNullOrBlank()) {
            originalRequest.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            originalRequest
        }

        val response = chain.proceed(requestWithAuth)

        if (response.code == 401 && !originalRequest.url.encodedPath.contains("/auth/")) {
            response.close()

            val newToken = runBlocking {
                refreshMutex.withLock {
                    val currentToken = secureStorage.getAccessToken()
                    // If token changed while waiting for lock, use the updated one
                    if (currentToken != token && !currentToken.isNullOrBlank()) {
                        currentToken
                    } else {
                        refreshHandler()
                    }
                }
            }

            if (!newToken.isNullOrBlank()) {
                val retryRequest = originalRequest.newBuilder()
                    .header("Authorization", "Bearer $newToken")
                    .build()
                return chain.proceed(retryRequest)
            }
        }

        return response
    }
}

class IdempotencyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val isMutation = request.method in listOf("POST", "PUT", "PATCH", "DELETE")
        val hasIdempotencyKey = request.header("x-idempotency-key") != null

        val newRequest = if (isMutation && !hasIdempotencyKey) {
            request.newBuilder()
                .header("x-idempotency-key", UUID.randomUUID().toString())
                .build()
        } else {
            request
        }

        return chain.proceed(newRequest)
    }
}
