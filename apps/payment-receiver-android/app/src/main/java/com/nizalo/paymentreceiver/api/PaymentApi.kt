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
data class EgpRate(val egpPerUsd: Double)

@Serializable
data class PendingDepositsResponse(
    val ok: Boolean,
    val deposits: List<Deposit>
) {
    @Serializable
    data class Deposit(
        val id: String,
        val network: String,
        val receivingNumberId: String,
        val senderName: String,
        val senderPhone: String,
        // EGP piastres (2 decimals) -- unlike a withdrawal's amountMinor,
        // this one really is EGP: it is what the PLAYER declared they are
        // sending, before any USDT conversion happens.
        val amountEgpMinor: String,
        val status: String
    )
}

@Serializable
data class PendingWithdrawalsResponse(
    val ok: Boolean,
    val withdrawals: List<Withdrawal>,
    // Null only if no admin has ever set an EGP/USD rate -- see SettingsTab,
    // which is exactly where that rate gets set for deposits too.
    val rate: EgpRate? = null
) {
    @Serializable
    data class Withdrawal(
        val id: String,
        val network: String,
        val destination: String,
        // Always USDT minor units (6 decimals) -- withdrawal.asset is never
        // anything else -- NOT EGP piastres, however this rail pays out.
        val amountMinor: String
    )
}

@Serializable
data class CompleteWithdrawalRequest(val reference: String)

@Serializable
data class CompleteWithdrawalResponse(val ok: Boolean)

interface PaymentApi {
    @POST("v1/payment-receiver/transfers")
    suspend fun reportTransfer(
        @Header("x-device-api-key") apiKey: String,
        @Body request: TransferReportRequest
    ): Response<TransferReportResponse>

    @retrofit2.http.GET("v1/payment-receiver/deposits")
    suspend fun getPendingDeposits(
        @Header("x-device-api-key") apiKey: String
    ): Response<PendingDepositsResponse>

    @retrofit2.http.GET("v1/payment-receiver/withdrawals")
    suspend fun getPendingWithdrawals(
        @Header("x-device-api-key") apiKey: String
    ): Response<PendingWithdrawalsResponse>

    @POST("v1/payment-receiver/withdrawals/{id}/complete")
    suspend fun completeWithdrawal(
        @Header("x-device-api-key") apiKey: String,
        @retrofit2.http.Path("id") withdrawalId: String,
        @Body request: CompleteWithdrawalRequest
    ): Response<CompleteWithdrawalResponse>
}
