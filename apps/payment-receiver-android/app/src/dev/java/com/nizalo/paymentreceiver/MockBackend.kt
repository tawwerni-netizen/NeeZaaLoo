package com.nizalo.paymentreceiver

import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.network.ApiResult
import com.nizalo.paymentreceiver.data.network.ConfirmRequest
import com.nizalo.paymentreceiver.data.network.ConfirmResponse
import com.nizalo.paymentreceiver.data.network.DeviceDto
import com.nizalo.paymentreceiver.data.network.HealthDto
import com.nizalo.paymentreceiver.data.network.Outcome
import com.nizalo.paymentreceiver.data.network.ReceivingNumberDto
import com.nizalo.paymentreceiver.data.network.ReceiverApi
import com.nizalo.paymentreceiver.data.network.ReportRequest
import com.nizalo.paymentreceiver.data.network.ReportResponse
import com.nizalo.paymentreceiver.data.network.StatisticsDto
import com.nizalo.paymentreceiver.data.network.TransferDto
import com.nizalo.paymentreceiver.data.network.WithdrawalDto
import com.nizalo.receiver.parser.Confidence
import com.nizalo.receiver.parser.MessageParser
import com.nizalo.receiver.parser.ParseIssue
import com.nizalo.receiver.parser.Provider
import com.nizalo.receiver.parser.TextNormalizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.UUID

/** Dev builds only: an in-memory stand-in for the backend, clearly labelled as such in the UI. */
object MockBackend {
    fun factory(): (() -> ReceiverApi)? = { InMemoryReceiverApi() }
}

/**
 * Follows the real backend's rules closely enough to exercise the app:
 * idempotency by client key, duplicates by receipt fingerprint, no credit
 * for untrusted senders or unreadable receipts, idempotent confirmations.
 */
class InMemoryReceiverApi : ReceiverApi {
    private val byKey = mutableMapOf<String, TransferDto>()
    private val byFingerprint = mutableMapOf<String, TransferDto>()
    private val withdrawals = mutableMapOf(
        "wd_mock_1" to mockWithdrawal("wd_mock_1", "ahmed_99", "01033334444", "10000000", "50000", "500"),
        "wd_mock_2" to mockWithdrawal("wd_mock_2", "sara_k", "01122223333", "25000000", "125000", "1250"),
    )
    private val confirmations = mutableMapOf<String, String>()

    // Like a real call, the work happens off the main thread.
    private suspend fun <T> ok(v: T): ApiResult<T> = withContext(Dispatchers.IO) {
        delay(120)
        ApiResult.Ok(v, 120)
    }

    override suspend fun health() = ok(HealthDto(ok = true, server = "ONLINE", serverTime = Instant.now().toString(), device = DeviceDto("prd_mock", "Mock device")))

    override suspend fun statistics() = ok(
        StatisticsDto(
            received = byKey.size, credited = byKey.values.count { it.credited },
            needsReview = byKey.values.count { !it.credited }, pendingWithdrawals = withdrawals.values.count { it.actionable },
        )
    )

    @Synchronized
    private fun ingest(request: ReportRequest): ReportResponse {
        byKey[request.clientTransactionId]?.let { return ReportResponse(true, Outcome.ALREADY_PROCESSED, it) }
        val provider = Provider.valueOf(request.network)
        val fp = TextNormalizer.fingerprint(provider, request.rawMessage)
        byFingerprint[fp]?.let { return ReportResponse(true, Outcome.DUPLICATE, it) }

        val parsed = MessageParser.parse(request.rawMessage, request.smsSender.takeIf { it != "unknown" })
        val untrusted = request.smsSender == "unknown" || ParseIssue.UNTRUSTED_SENDER in parsed.issues
        val credited = parsed.confidence == Confidence.VALID && parsed.provider == provider && !untrusted
        val dto = TransferDto(
            id = "lto_${UUID.randomUUID()}",
            status = if (credited) "MATCHED" else "UNMATCHED",
            credited = credited,
            reviewReason = when {
                credited -> null
                untrusted -> "UNTRUSTED_SENDER"
                parsed.provider != provider -> "NETWORK_MISMATCH"
                else -> "UNPARSEABLE"
            },
            playerHandle = if (credited) "mock_player" else null,
            amountEgpMinor = (parsed.amountPiastres ?: request.amountEgpMinor)?.toString(),
            transactionRef = parsed.reference,
        )
        byKey[request.clientTransactionId] = dto
        byFingerprint[fp] = dto
        return ReportResponse(true, if (credited) Outcome.SUCCESS else Outcome.NEEDS_REVIEW, dto)
    }

    override suspend fun report(request: ReportRequest) = withContext(Dispatchers.IO) { ok(ingest(request)) }

    override suspend fun transferStatuses(backendIds: List<String>) = ok(byKey.values.filter { it.id in backendIds })

    override suspend fun withdrawals() = ok(withdrawals.values.filter { it.actionable })

    override suspend fun withdrawal(id: String): ApiResult<WithdrawalDto> =
        withdrawals[id]?.let { ok(it) } ?: ApiResult.Err(ApiError.Rejected(404, "NOT_FOUND", null))

    @Synchronized
    private fun confirmNow(id: String, request: ConfirmRequest): ApiResult<ConfirmResponse> {
        val w = withdrawals[id] ?: return ApiResult.Err(ApiError.Rejected(404, "NOT_FOUND", null))
        confirmations[request.idempotencyKey]?.let { forId ->
            if (forId != id) return ApiResult.Err(ApiError.Rejected(400, "INVALID_IDEMPOTENCY_KEY", null))
            return ApiResult.Ok(ConfirmResponse(true, "ALREADY_PROCESSED", w), 0)
        }
        if (w.status == "COMPLETED") return ApiResult.Ok(ConfirmResponse(true, "ALREADY_PROCESSED", w), 0)
        val done = w.copy(
            status = "COMPLETED", receiverStatus = "COMPLETED", actionable = false,
            completedAt = Instant.now().toString(), reference = request.reference ?: "PRD-$id",
        )
        withdrawals[id] = done
        confirmations[request.idempotencyKey] = id
        return ApiResult.Ok(ConfirmResponse(true, "COMPLETED", done), 0)
    }

    override suspend fun confirmWithdrawal(id: String, request: ConfirmRequest): ApiResult<ConfirmResponse> = withContext(Dispatchers.IO) {
        delay(300)
        confirmNow(id, request)
    }

    override suspend fun receivingNumbers() = ok(
        listOf(
            ReceivingNumberDto("vf_mock_1", "VODAFONE_CASH", "01069999557", "Mock VF line"),
            ReceivingNumberDto("instapay_mock_1", "INSTAPAY", "mock@instapay", "Mock InstaPay"),
        )
    )

    private companion object {
        fun mockWithdrawal(id: String, handle: String, dest: String, usdt: String, egpMinor: String, egpSend: String) = WithdrawalDto(
            id = id, playerHandle = handle, network = "VODAFONE_CASH", destination = dest, amountMinor = usdt,
            amountEgpMinor = egpMinor, amountEgpToSend = egpSend, status = "APPROVED", receiverStatus = "PENDING",
            actionable = true, requestedAt = Instant.now().minusSeconds(900).toString(),
        )
    }
}
