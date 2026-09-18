package com.nizalo.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import org.json.JSONObject

class StepUpInterceptor(
    private val stepUpManager: StepUpManager
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()
        var response = chain.proceed(request)

        if (response.code == 401) {
            val responseBody = response.peekBody(Long.MAX_VALUE).string()
            try {
                val json = JSONObject(responseBody)
                val errorObj = json.optJSONObject("error")
                if (errorObj != null && errorObj.optString("code") == "STEP_UP_REQUIRED") {
                    val action = errorObj.optString("detail")
                    if (action.isNotEmpty()) {
                        // Close the failed response
                        response.close()

                        // Ask UI for step-up token
                        val token = runBlocking {
                            stepUpManager.requestStepUp(action)
                        }

                        if (!token.isNullOrBlank()) {
                            // Retry request with step-up token
                            val retryRequest = request.newBuilder()
                                .header("x-step-up-token", token)
                                .build()
                            return chain.proceed(retryRequest)
                        }
                    }
                }
            } catch (e: Exception) {
                // Not a valid JSON or not the expected format, ignore and return the original response
            }
        }

        return response
    }
}
