package com.nizalo.paymentreceiver.data.network

import kotlinx.serialization.Serializable

// Wire shapes of the backend's /v1/payment-receiver/* routes
// (packages/api/src/server.mjs). Unknown fields are ignored so the backend
// can add to a response without breaking installed phones.

@Serializable
data class HealthDto(val ok: Boolean, val server: String? = null, val serverTime: String? = null, val device: DeviceDto? = null)

@Serializable
data class DeviceDto(val id: String, val label: String? = null)

@Serializable
data class StatisticsEnvelope(val ok: Boolean, val statistics: StatisticsDto)

@Serializable
data class StatisticsDto(
    val received: Int = 0,
    val credited: Int = 0,
    val needsReview: Int = 0,
    val pendingWithdrawals: Int = 0,
    val pendingDeposits: Int = 0,
)

@Serializable
data class ReportRequest(
    val clientTransactionId: String,
    val network: String,
    val receivingNumberId: String,
    val rawMessage: String,
    val observedAt: String,
    val smsSender: String,
    val amountEgpMinor: Long? = null,
    val senderName: String? = null,
    val senderPhone: String? = null,
    val transactionRef: String? = null,
)

/** Backend verdicts for one report. SUCCESS means credited to a player. */
object Outcome {
    const val SUCCESS = "SUCCESS"
    const val NEEDS_REVIEW = "NEEDS_REVIEW"
    const val DUPLICATE = "DUPLICATE"
    const val ALREADY_PROCESSED = "ALREADY_PROCESSED"
}

@Serializable
data class ReportResponse(val ok: Boolean, val outcome: String, val transaction: TransferDto? = null)

@Serializable
data class TransferDto(
    val id: String,
    val status: String,
    val credited: Boolean = false,
    val reviewReason: String? = null,
    val intentId: String? = null,
    val playerHandle: String? = null,
    val creditedAmountUsdtMinor: String? = null,
    val amountEgpMinor: String? = null,
    val transactionRef: String? = null,
)

@Serializable
data class TransferStatusesEnvelope(val ok: Boolean, val transactions: List<TransferDto> = emptyList())

@Serializable
data class WithdrawalsEnvelope(val ok: Boolean, val withdrawals: List<WithdrawalDto> = emptyList())

@Serializable
data class WithdrawalEnvelope(val ok: Boolean, val withdrawal: WithdrawalDto)

@Serializable
data class WithdrawalDto(
    val id: String,
    val playerHandle: String? = null,
    val network: String,
    val destination: String,
    val amountMinor: String,
    val amountEgpMinor: String? = null,
    val amountEgpToSend: String? = null,
    val status: String,
    val receiverStatus: String? = null,
    val actionable: Boolean = false,
    val requestedAt: String? = null,
    val completedAt: String? = null,
    val reference: String? = null,
)

@Serializable
data class ConfirmRequest(val idempotencyKey: String, val reference: String? = null)

@Serializable
data class ConfirmResponse(val ok: Boolean, val outcome: String, val withdrawal: WithdrawalDto? = null)

@Serializable
data class LocalRailsDto(val numbers: List<ReceivingNumberDto> = emptyList())

@Serializable
data class ReceivingNumberDto(val id: String, val network: String, val phoneNumber: String, val label: String? = null)

@Serializable
data class ErrorEnvelope(val error: ErrorDto? = null)

@Serializable
data class ErrorDto(val code: String, val detail: String? = null)
