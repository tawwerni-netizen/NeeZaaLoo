package com.nizalo.paymentreceiver.api

import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

@Serializable
data class TransferReportRequest(
    val network: String,
    val receivingNumberId: String,
    val rawSenderName: String?,
    val rawSenderPhone: String?,
    val amountEgpMinor: Long,
    val rawMessage: String,
    val observedAt: String
)

@Serializable
data class TransferReportResponse(
    val ok: Boolean,
    val status: String?, // MATCHED, UNMATCHED
    val intentId: String?,
    val transferId: String?
)

@Serializable
data class PendingWithdrawalsResponse(
    val ok: Boolean,
    val withdrawals: List<Withdrawal>
) {
    @Serializable
    data class Withdrawal(
        val id: String,
        val network: String,
        val destination: String,
        val amountMinor: String
    )
}

interface PaymentApi {
    @POST("v1/payment-receiver/transfers")
    suspend fun reportTransfer(
        @Header("x-device-api-key") apiKey: String,
        @Body request: TransferReportRequest
    ): Response<TransferReportResponse>

    @retrofit2.http.GET("v1/payment-receiver/withdrawals")
    suspend fun getPendingWithdrawals(
        @Header("x-device-api-key") apiKey: String
    ): Response<PendingWithdrawalsResponse>
}
