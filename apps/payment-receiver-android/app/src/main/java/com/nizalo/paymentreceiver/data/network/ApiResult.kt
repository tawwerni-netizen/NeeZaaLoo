package com.nizalo.paymentreceiver.data.network

/** Every backend call ends in exactly one of these; nothing is thrown past the network layer. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T, val latencyMs: Long) : ApiResult<T>
    data class Err(val error: ApiError) : ApiResult<Nothing>
}

sealed interface ApiError {
    /** Retrying later can succeed without anyone changing anything. */
    val transient: Boolean

    data object NotConfigured : ApiError { override val transient = false }
    data object NoInternet : ApiError { override val transient = true }
    /** "Send over Wi-Fi only" is on and the phone is not on Wi-Fi. */
    data object WifiRequired : ApiError { override val transient = true }
    data object Timeout : ApiError { override val transient = true }
    data object ServerUnavailable : ApiError { override val transient = true }
    data object SslError : ApiError { override val transient = false }
    data object Unauthorized : ApiError { override val transient = false }
    data object DeviceDisabled : ApiError { override val transient = false }
    data object RateLimited : ApiError { override val transient = true }
    /** The backend does not have this route: it predates this app version. */
    data object EndpointMissing : ApiError { override val transient = false }
    data object InvalidResponse : ApiError { override val transient = true }
    data class Server(val httpCode: Int) : ApiError { override val transient = true }
    /** The backend refused this request as-is (4xx with an error code); sending it again will not help. */
    data class Rejected(val httpCode: Int, val code: String, val detail: String?) : ApiError { override val transient = false }
}

inline fun <T, R> ApiResult<T>.map(f: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Ok -> ApiResult.Ok(f(value), latencyMs)
    is ApiResult.Err -> this
}
