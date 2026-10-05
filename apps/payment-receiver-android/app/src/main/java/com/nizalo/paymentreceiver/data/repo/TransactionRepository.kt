package com.nizalo.paymentreceiver.data.repo

import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.core.NetworkStatus
import com.nizalo.paymentreceiver.data.db.SyncQueueDao
import com.nizalo.paymentreceiver.data.db.SyncQueueEntity
import com.nizalo.paymentreceiver.data.db.TransactionDao
import com.nizalo.paymentreceiver.data.db.TransactionEntity
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.network.ApiResult
import com.nizalo.paymentreceiver.data.network.Outcome
import com.nizalo.paymentreceiver.data.network.ReportRequest
import com.nizalo.paymentreceiver.data.network.TransferDto
import com.nizalo.paymentreceiver.data.settings.Settings
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.domain.SyncStatus
import com.nizalo.paymentreceiver.domain.TransactionSource
import com.nizalo.paymentreceiver.domain.TransactionStatus
import com.nizalo.paymentreceiver.sync.RetryPolicy
import com.nizalo.receiver.parser.Confidence
import com.nizalo.receiver.parser.MessageParser
import com.nizalo.receiver.parser.ParseIssue
import com.nizalo.receiver.parser.Provider
import com.nizalo.receiver.parser.TextNormalizer
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.util.UUID

sealed interface IngestResult {
    data class Stored(val transaction: TransactionEntity) : IngestResult
    /** The same receipt is already on this phone (SMS delivered twice, or found again by the inbox scan). */
    data class AlreadyReceived(val existing: TransactionEntity?) : IngestResult
    data object NotAReceipt : IngestResult
    data object ProviderDisabled : IngestResult
}

data class SyncReport(
    val attempted: Int,
    val sent: Int,
    val failed: Int,
    val remaining: Int,
    /** Why sending stopped or what went wrong, most important first. Null when nothing failed. */
    val stopReason: ApiError?,
    val failureCodes: List<String>,
) {
    companion object {
        fun blocked(reason: ApiError, remaining: Int) = SyncReport(0, 0, 0, remaining, reason, emptyList())
    }
}


class TransactionRepository(
    private val transactions: TransactionDao,
    private val queue: SyncQueueDao,
    private val settings: SettingsRepository,
    private val apiProvider: ApiProvider,
    private val network: NetworkStatus,
    private val audit: AuditLog,
    private val scheduleSync: () -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    /** One send loop at a time, whether started by the worker or the "send now" button. */
    private val syncMutex = Mutex()

    fun recent(limit: Int = 20): Flow<List<TransactionEntity>> = transactions.recent(limit)
    fun all(): Flow<List<TransactionEntity>> = transactions.all()
    fun observe(id: String): Flow<TransactionEntity?> = transactions.observe(id)
    fun receivedToday(): Flow<Int> = transactions.countReceivedSince(Formatters.startOfTodayCairo(now()))
    fun confirmedToday(): Flow<Int> = transactions.countConfirmedSince(Formatters.startOfTodayCairo(now()))
    fun pendingCount(): Flow<Int> = transactions.countPending()
    fun failedCount(): Flow<Int> = transactions.countFailed()
    fun queueSize(): Flow<Int> = queue.count()

    /**
     * Records one receipt. Never sends anything itself; a stored receipt
     * that is safe to send is queued and the sync worker is scheduled.
     */
    suspend fun ingest(rawText: String, smsSender: String?, receivedAt: Long, source: TransactionSource): IngestResult {
        val parsed = MessageParser.parse(rawText, smsSender)
        val provider = parsed.provider
        if (parsed.confidence == Confidence.INVALID || provider == null) return IngestResult.NotAReceipt

        val s = settings.current()
        if (!s.providerEnabled(provider)) return IngestResult.ProviderDisabled

        val fingerprint = TextNormalizer.fingerprint(provider, rawText)
        val untrusted = ParseIssue.UNTRUSTED_SENDER in parsed.issues
        val (status, sync) = when {
            parsed.canAutoSend -> TransactionStatus.PENDING to SyncStatus.PENDING
            untrusted -> TransactionStatus.REJECTED to SyncStatus.NOT_SENT
            else -> TransactionStatus.NEEDS_REVIEW to SyncStatus.NOT_SENT
        }
        val entity = TransactionEntity(
            id = newId(),
            provider = provider.wireName,
            amountPiastres = parsed.amountPiastres,
            senderName = parsed.senderName,
            senderPhone = parsed.senderPhone,
            reference = parsed.reference,
            smsSender = smsSender,
            rawMessage = rawText,
            fingerprint = fingerprint,
            receivedAt = receivedAt,
            parsedAt = now(),
            confidence = parsed.confidence.name,
            parseIssues = parsed.issues.joinToString(",") { it.name },
            status = status.name,
            syncStatus = sync.name,
            source = source.name,
            receivingNumberIds = s.numberIdsFor(provider).sorted().joinToString(","),
            lastError = when {
                untrusted -> "UNTRUSTED_SENDER"
                !parsed.canAutoSend -> parsed.issues.filter { it.blocksAutoSend }.joinToString(",") { it.name }
                else -> null
            },
        )

        if (transactions.insertIgnoringDuplicate(entity) == -1L) {
            return IngestResult.AlreadyReceived(transactions.byFingerprint(fingerprint))
        }

        val summary = "${provider.wireName} ${Formatters.egp(parsed.amountPiastres)} ref=${parsed.reference ?: "-"}"
        audit.record(AuditType.PAYMENT_RECEIVED, "$summary (${source.name})")
        when (status) {
            TransactionStatus.PENDING -> {
                queue.upsert(SyncQueueEntity(transactionId = entity.id, enqueuedAt = now(), nextAttemptAt = now()))
                audit.record(AuditType.PAYMENT_PARSED, "$summary -> queued")
                if (s.autoSync) scheduleSync()
            }
            TransactionStatus.REJECTED -> audit.record(AuditType.PAYMENT_REJECTED, "$summary: untrusted sender", error = true)
            else -> audit.record(AuditType.PAYMENT_HELD_FOR_REVIEW, "$summary: ${entity.lastError}")
        }
        return IngestResult.Stored(entity)
    }

    /**
     * The operator decided a held receipt should go to the backend anyway.
     * The backend still re-reads it and never auto-credits a receipt it cannot
     * read or whose sender it cannot vouch for; it lands in admin review.
     */
    suspend fun sendForReview(id: String): Boolean {
        val t = transactions.get(id) ?: return false
        if (t.amountPiastres == null) return false
        if (t.syncStatus != SyncStatus.NOT_SENT.name && t.status != TransactionStatus.FAILED.name) return false
        transactions.update(t.copy(status = TransactionStatus.PENDING.name, syncStatus = SyncStatus.PENDING.name, lastError = null))
        queue.upsert(SyncQueueEntity(transactionId = id, enqueuedAt = now(), nextAttemptAt = now()))
        scheduleSync()
        return true
    }

    /** Puts every receipt still waiting to be sent in front of the queue. */
    suspend fun makeAllDue() {
        for (e in queue.allEntries()) queue.upsert(e.copy(nextAttemptAt = now()))
    }

    suspend fun recoverInterruptedSends() {
        transactions.resetInterruptedSends()
    }

    suspend fun nextDueAt(): Long? = queue.nextDueAt()

    /**
     * Sends due receipts, oldest first. Each one carries its row id as the
     * idempotency key, so a send whose answer was lost is harmless to repeat.
     * A receipt leaves the queue only once the backend has answered for it.
     */
    suspend fun syncPending(dueOnly: Boolean = true, limit: Int = 50): SyncReport = syncMutex.withLock {
        val s = settings.current()
        val api = apiProvider.api()
        val entries = if (dueOnly) queue.due(now(), limit) else queue.allEntries().take(limit)
        val remainingAtStart = queue.allEntries().size
        if (entries.isEmpty()) return SyncReport(0, 0, 0, remainingAtStart, null, emptyList())
        if (s.wifiOnly && !network.isUnmetered() && !apiProvider.isMock()) return SyncReport.blocked(ApiError.WifiRequired, remainingAtStart)
        if (!network.isOnline() && !apiProvider.isMock()) return SyncReport.blocked(ApiError.NoInternet, remainingAtStart)

        var attempted = 0
        var sent = 0
        var failed = 0
        var stop: ApiError? = null
        val codes = mutableListOf<String>()

        for (entry in entries) {
            val t = transactions.get(entry.transactionId)
            if (t == null || t.status != TransactionStatus.PENDING.name) {
                queue.remove(entry.transactionId)
                continue
            }
            val provider = Provider.valueOf(t.provider)
            val numbers = t.receivingNumberIds.ifBlank { s.numberIdsFor(provider).sorted().joinToString(",") }
            if (numbers.isBlank()) {
                failed++
                codes += "NO_RECEIVING_NUMBER"
                deferRetry(t, entry, "NO_RECEIVING_NUMBER")
                continue
            }

            attempted++
            transactions.update(t.copy(status = TransactionStatus.PROCESSING.name, syncStatus = SyncStatus.SYNCING.name, receivingNumberIds = numbers))
            val request = ReportRequest(
                clientTransactionId = t.id,
                network = t.provider,
                receivingNumberId = numbers,
                rawMessage = t.rawMessage,
                observedAt = Instant.ofEpochMilli(t.receivedAt).toString(),
                // "unknown" is never vouched for by the backend: such a receipt goes to review.
                smsSender = t.smsSender?.takeIf { it.isNotBlank() } ?: UNKNOWN_SENDER,
                amountEgpMinor = t.amountPiastres,
                senderName = t.senderName,
                senderPhone = t.senderPhone,
                transactionRef = t.reference,
            )
            when (val r = api.report(request)) {
                is ApiResult.Ok -> {
                    sent++
                    val updated = applyOutcome(transactions.get(t.id) ?: t, r.value.outcome, r.value.transaction)
                    transactions.update(updated.copy(syncAttempts = entry.attemptCount + 1))
                    queue.remove(t.id)
                    audit.record(AuditType.PAYMENT_SYNCED, "${Formatters.egp(t.amountPiastres)} ref=${t.reference ?: "-"} -> ${r.value.outcome}")
                }
                is ApiResult.Err -> {
                    failed++
                    val code = errorCode(r.error)
                    codes += code
                    if (r.error is ApiError.Rejected) {
                        // The backend refused this report as-is: sending it again unchanged cannot help.
                        transactions.update(
                            t.copy(
                                status = TransactionStatus.FAILED.name, syncStatus = SyncStatus.FAILED.name,
                                lastError = code, syncAttempts = entry.attemptCount + 1, processedAt = now(),
                            )
                        )
                        queue.remove(t.id)
                        audit.record(AuditType.PAYMENT_SYNC_FAILED, "${Formatters.egp(t.amountPiastres)} ref=${t.reference ?: "-"}: $code", error = true)
                    } else {
                        deferRetry(t, entry, code)
                        audit.record(AuditType.SYNC_ATTEMPT, "send failed ($code), will retry")
                        if (stopsTheLoop(r.error)) {
                            stop = r.error
                            break
                        }
                    }
                }
            }
        }
        SyncReport(attempted, sent, failed, queue.allEntries().size, stop, codes.distinct())
    }

    /**
     * A receipt the backend holds for review may since have been matched by an
     * admin. Re-reads those statuses so the phone shows what actually happened.
     */
    suspend fun refreshReviewStatuses(): Boolean {
        val ids = transactions.backendIdsAwaitingReview()
        if (ids.isEmpty()) return true
        val r = apiProvider.api().transferStatuses(ids)
        if (r !is ApiResult.Ok) return false
        for (dto in r.value) {
            val t = transactions.byBackendId(dto.id) ?: continue
            if (dto.credited && t.status != TransactionStatus.CONFIRMED.name) {
                transactions.update(
                    t.copy(
                        status = TransactionStatus.CONFIRMED.name, backendReviewReason = null,
                        playerHandle = dto.playerHandle, creditedUsdtMinor = dto.creditedAmountUsdtMinor, processedAt = now(),
                    )
                )
            }
        }
        return true
    }

    private suspend fun deferRetry(t: TransactionEntity, entry: SyncQueueEntity, code: String) {
        val attempts = entry.attemptCount + 1
        transactions.update(
            (transactions.get(t.id) ?: t).copy(
                status = TransactionStatus.PENDING.name, syncStatus = SyncStatus.PENDING.name,
                lastError = code, syncAttempts = attempts,
            )
        )
        queue.upsert(entry.copy(attemptCount = attempts, lastAttemptAt = now(), nextAttemptAt = now() + RetryPolicy.delayAfter(attempts), lastError = code))
    }

    private fun applyOutcome(t: TransactionEntity, outcome: String, dto: TransferDto?): TransactionEntity {
        val status = when (outcome) {
            Outcome.SUCCESS -> TransactionStatus.CONFIRMED
            Outcome.NEEDS_REVIEW -> TransactionStatus.NEEDS_REVIEW
            Outcome.DUPLICATE -> TransactionStatus.DUPLICATE
            Outcome.ALREADY_PROCESSED -> if (dto?.credited == true) TransactionStatus.CONFIRMED else TransactionStatus.NEEDS_REVIEW
            else -> TransactionStatus.NEEDS_REVIEW
        }
        return t.copy(
            status = status.name,
            syncStatus = SyncStatus.SYNCED.name,
            backendId = dto?.id,
            backendOutcome = outcome,
            backendReviewReason = dto?.reviewReason,
            playerHandle = dto?.playerHandle,
            creditedUsdtMinor = dto?.creditedAmountUsdtMinor,
            lastError = null,
            processedAt = now(),
        )
    }

    private fun stopsTheLoop(e: ApiError): Boolean = when (e) {
        ApiError.NoInternet, ApiError.Unauthorized, ApiError.DeviceDisabled, ApiError.NotConfigured,
        ApiError.EndpointMissing, ApiError.SslError, ApiError.RateLimited, ApiError.ServerUnavailable -> true
        else -> false
    }

    companion object {
        const val UNKNOWN_SENDER = "unknown"

        fun errorCode(e: ApiError): String = when (e) {
            is ApiError.Rejected -> e.code
            is ApiError.Server -> "HTTP_${e.httpCode}"
            else -> e::class.simpleName?.let { camelToUpper(it) } ?: "ERROR"
        }

        private fun camelToUpper(s: String) = s.replace(Regex("([a-z])([A-Z])"), "$1_$2").uppercase()
    }
}

fun Settings.providerEnabled(p: Provider): Boolean = when (p) {
    Provider.VODAFONE_CASH -> vodafoneEnabled
    Provider.INSTAPAY -> instapayEnabled
}

fun Settings.numberIdsFor(p: Provider): Set<String> = when (p) {
    Provider.VODAFONE_CASH -> vodafoneNumberIds
    Provider.INSTAPAY -> instapayNumberIds
}
