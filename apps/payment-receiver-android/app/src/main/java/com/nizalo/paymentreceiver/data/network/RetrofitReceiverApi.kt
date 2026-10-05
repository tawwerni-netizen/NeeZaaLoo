package com.nizalo.paymentreceiver.data.network

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException

/** The raw Retrofit contract; only [RetrofitReceiverApi] uses it. */
interface PaymentApiService {
    @GET("v1/payment-receiver/health") suspend fun health(): Response<HealthDto>
    @GET("v1/payment-receiver/statistics") suspend fun statistics(): Response<StatisticsEnvelope>
    @POST("v1/payment-receiver/transactions") suspend fun report(@Body body: ReportRequest): Response<ReportResponse>
    @GET("v1/payment-receiver/transactions") suspend fun statuses(@Query("ids") ids: String): Response<TransferStatusesEnvelope>
    @GET("v1/payment-receiver/withdrawals") suspend fun withdrawals(): Response<WithdrawalsEnvelope>
    @GET("v1/payment-receiver/withdrawals/{id}") suspend fun withdrawal(@Path("id") id: String): Response<WithdrawalEnvelope>
    @POST("v1/payment-receiver/withdrawals/{id}/confirm")
    suspend fun confirm(@Path("id") id: String, @Body body: ConfirmRequest): Response<ConfirmResponse>
    @GET("v1/payments/local-rails") suspend fun localRails(): Response<LocalRailsDto>
}

class RetrofitReceiverApi(
    baseUrl: String,
    tokenProvider: () -> String?,
    private val isOnline: () -> Boolean,
    private val now: () -> Long = System::currentTimeMillis,
    clientBuilder: OkHttpClient.Builder = OkHttpClient.Builder(),
) : ReceiverApi {

    private val service: PaymentApiService

    init {
        // The token is read per request and never logged: there is no
        // logging interceptor in this client at all.
        val auth = Interceptor { chain ->
            val token = tokenProvider()
            val req = chain.request().newBuilder().apply {
                if (!token.isNullOrEmpty()) header(HEADER_DEVICE_KEY, token)
                header("Accept", "application/json")
            }.build()
            chain.proceed(req)
        }
        val client = clientBuilder
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false) // retries are the sync queue's decision, with the same idempotency key
            .addInterceptor(auth)
            .build()
        service = Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(PaymentApiService::class.java)
    }

    override suspend fun health() = call { service.health() }
    override suspend fun statistics() = call { service.statistics() }.map { it.statistics }
    override suspend fun report(request: ReportRequest) = call { service.report(request) }
    override suspend fun transferStatuses(backendIds: List<String>) =
        call { service.statuses(backendIds.joinToString(",")) }.map { it.transactions }
    override suspend fun withdrawals() = call { service.withdrawals() }.map { it.withdrawals }
    override suspend fun withdrawal(id: String) = call { service.withdrawal(id) }.map { it.withdrawal }
    override suspend fun confirmWithdrawal(id: String, request: ConfirmRequest) = call { service.confirm(id, request) }
    override suspend fun receivingNumbers() = call { service.localRails() }.map { it.numbers }

    private suspend fun <T> call(block: suspend () -> Response<T>): ApiResult<T> {
        val started = now()
        return try {
            val res = block()
            val latency = now() - started
            val body = res.body()
            if (res.isSuccessful && body != null) ApiResult.Ok(body, latency) else ApiResult.Err(classifyHttp(res))
        } catch (e: SocketTimeoutException) {
            ApiResult.Err(ApiError.Timeout)
        } catch (e: InterruptedIOException) {
            ApiResult.Err(ApiError.Timeout)
        } catch (e: SSLException) {
            ApiResult.Err(ApiError.SslError)
        } catch (e: UnknownHostException) {
            ApiResult.Err(if (isOnline()) ApiError.ServerUnavailable else ApiError.NoInternet)
        } catch (e: ConnectException) {
            ApiResult.Err(if (isOnline()) ApiError.ServerUnavailable else ApiError.NoInternet)
        } catch (e: IOException) {
            ApiResult.Err(if (isOnline()) ApiError.ServerUnavailable else ApiError.NoInternet)
        } catch (e: SerializationException) {
            ApiResult.Err(ApiError.InvalidResponse)
        } catch (e: IllegalArgumentException) {
            ApiResult.Err(ApiError.InvalidResponse)
        } catch (e: HttpException) {
            ApiResult.Err(ApiError.Server(e.code()))
        }
    }

    private fun <T> classifyHttp(res: Response<T>): ApiError {
        val code = res.code()
        val error = runCatching {
            res.errorBody()?.string()?.let { json.decodeFromString(ErrorEnvelope.serializer(), it).error }
        }.getOrNull()
        return when {
            code == 401 -> ApiError.Unauthorized
            code == 403 && error?.code == "DEVICE_DISABLED" -> ApiError.DeviceDisabled
            code == 403 -> ApiError.Unauthorized
            code == 404 && error?.code == "NOT_FOUND" && res.raw().request.url.encodedPath.contains("/withdrawals/") ->
                ApiError.Rejected(code, "NOT_FOUND", error.detail)
            code == 404 -> ApiError.EndpointMissing
            code == 429 -> ApiError.RateLimited
            code >= 500 -> ApiError.Server(code)
            code in 200..299 -> ApiError.InvalidResponse
            error != null -> ApiError.Rejected(code, error.code, error.detail)
            else -> ApiError.Server(code)
        }
    }

    companion object {
        const val HEADER_DEVICE_KEY = "x-device-api-key"
        val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    }
}
