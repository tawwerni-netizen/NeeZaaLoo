package com.nizalo.paymentreceiver.data.repo

import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.WithdrawalDao
import com.nizalo.paymentreceiver.data.db.WithdrawalEntity
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.network.ApiResult
import com.nizalo.paymentreceiver.data.network.ConfirmRequest
import com.nizalo.paymentreceiver.data.network.WithdrawalDto
import com.nizalo.paymentreceiver.domain.ConfirmState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import java.util.UUID

sealed interface RefreshResult {
    data class Ok(val newlyArrived: List<WithdrawalEntity>) : RefreshResult
    data class Failed(val error: ApiError) : RefreshResult
}

sealed interface ConfirmResult {
    /** This confirmation completed the payout; the backend posted the debit. */
    data class Completed(val withdrawal: WithdrawalEntity) : ConfirmResult
    /** The payout was already complete; nothing was debited by this confirmation. */
    data class AlreadyProcessed(val withdrawal: WithdrawalEntity) : ConfirmResult
    data class Failed(val error: ApiError) : ConfirmResult
    data object NotActionable : ConfirmResult
}

class WithdrawalRepository(
    private val dao: WithdrawalDao,
    private val apiProvider: ApiProvider,
    private val audit: AuditLog,
    private val now: () -> Long = System::currentTimeMillis,
    private val newKey: () -> String = { UUID.randomUUID().toString() },
) {
    private val confirmMutex = Mutex()

    fun all(): Flow<List<WithdrawalEntity>> = dao.all()
    fun observe(id: String): Flow<WithdrawalEntity?> = dao.observe(id)
    fun actionableCount(): Flow<Int> = dao.countActionable()

    /**
     * Pulls the pending payouts. Anything the phone still shows as actionable
     * but the backend no longer lists (completed elsewhere, rejected) is
     * re-read individually so it does not linger as "pending".
     */
    suspend fun refresh(): RefreshResult {
        val api = apiProvider.api()
        val r = api.withdrawals()
        if (r !is ApiResult.Ok) return RefreshResult.Failed((r as ApiResult.Err).error)

        val fetchedAt = now()
        val arrived = mutableListOf<WithdrawalEntity>()
        val listed = r.value.map { it.id }.toSet()
        for (dto in r.value) {
            val existing = dao.get(dto.id)
            val merged = merge(existing, dto, fetchedAt)
            dao.upsert(merged)
            if (existing == null) {
                arrived += merged
                audit.record(AuditType.WITHDRAWAL_RECEIVED, "${dto.id}: ${Formatters.usdt(dto.amountMinor)} -> ${dto.destination.takeLast(4).padStart(dto.destination.length, '•')}")
            }
        }
        for (stale in dao.actionable().filter { it.id !in listed }) refreshOne(stale.id)
        dao.pruneFinal(before = fetchedAt - PRUNE_AFTER_MS)
        return RefreshResult.Ok(arrived)
    }

    suspend fun refreshOne(id: String): ApiResult<WithdrawalEntity> {
        val r = apiProvider.api().withdrawal(id)
        return when (r) {
            is ApiResult.Ok -> {
                val merged = merge(dao.get(id), r.value, now())
                dao.upsert(merged)
                ApiResult.Ok(merged, r.latencyMs)
            }
            is ApiResult.Err -> r
        }
    }

    suspend fun markNotified(ids: Collection<String>) {
        for (id in ids) dao.get(id)?.let { dao.update(it.copy(notified = true)) }
    }

    /**
     * Tells the backend the operator sent this payout by hand. The backend
     * validates state and posts the debit; the phone never changes the
     * status on its own. The idempotency key is stored BEFORE the request
     * goes out and reused until the backend answers, so a double tap, a
     * crash or a lost response can never debit twice.
     */
    suspend fun confirm(id: String, reference: String?): ConfirmResult = confirmMutex.withLock {
        val w = dao.get(id) ?: return ConfirmResult.NotActionable
        if (!w.actionable) return ConfirmResult.NotActionable

        val key = w.pendingConfirmKey ?: newKey()
        dao.update(w.copy(pendingConfirmKey = key, confirmState = ConfirmState.SENDING.name, confirmError = null))

        val r = apiProvider.api().confirmWithdrawal(id, ConfirmRequest(idempotencyKey = key, reference = reference?.trim()?.ifEmpty { null }))
        when (r) {
            is ApiResult.Ok -> {
                val dto = r.value.withdrawal
                val updated = (if (dto != null) merge(dao.get(id), dto, now()) else dao.get(id)!!)
                    .copy(pendingConfirmKey = null, confirmState = ConfirmState.IDLE.name, confirmError = null)
                dao.upsert(updated)
                val completedNow = r.value.outcome == "COMPLETED"
                audit.record(
                    AuditType.WITHDRAWAL_CONFIRMED,
                    "$id ${Formatters.egpWhole(updated.amountEgpToSend)} -> ${if (completedNow) "COMPLETED" else "ALREADY_PROCESSED"}",
                )
                if (completedNow) ConfirmResult.Completed(updated) else ConfirmResult.AlreadyProcessed(updated)
            }
            is ApiResult.Err -> {
                val code = TransactionRepository.errorCode(r.error)
                val keyStillValid = !(r.error is ApiError.Rejected && r.error.code == "INVALID_IDEMPOTENCY_KEY")
                dao.update(
                    dao.get(id)!!.copy(
                        confirmState = ConfirmState.FAILED.name,
                        confirmError = code,
                        pendingConfirmKey = if (keyStillValid) key else null,
                    )
                )
                audit.record(AuditType.WITHDRAWAL_CONFIRMATION_FAILED, "$id: $code", error = true)
                if (r.error is ApiError.Rejected) refreshOne(id)
                ConfirmResult.Failed(r.error)
            }
        }
    }

    suspend fun recordViewed(id: String) {
        audit.record(AuditType.WITHDRAWAL_VIEWED, id)
    }

    private fun merge(existing: WithdrawalEntity?, dto: WithdrawalDto, fetchedAt: Long) = WithdrawalEntity(
        id = dto.id,
        playerHandle = dto.playerHandle ?: existing?.playerHandle ?: "—",
        network = dto.network,
        destination = dto.destination,
        amountUsdtMinor = dto.amountMinor,
        amountEgpMinor = dto.amountEgpMinor,
        amountEgpToSend = dto.amountEgpToSend,
        backendStatus = dto.status,
        receiverStatus = dto.receiverStatus ?: existing?.receiverStatus ?: "AWAITING_APPROVAL",
        actionable = dto.actionable,
        requestedAt = dto.requestedAt?.let { parseInstant(it) } ?: existing?.requestedAt ?: fetchedAt,
        completedAt = dto.completedAt?.let { parseInstant(it) },
        reference = dto.reference,
        lastFetchedAt = fetchedAt,
        notified = existing?.notified ?: false,
        pendingConfirmKey = if (dto.actionable) existing?.pendingConfirmKey else null,
        confirmState = if (dto.actionable) existing?.confirmState ?: ConfirmState.IDLE.name else ConfirmState.IDLE.name,
        confirmError = if (dto.actionable) existing?.confirmError else null,
    )

    private fun parseInstant(s: String): Long? = runCatching { Instant.parse(s).toEpochMilli() }.getOrNull()

    private companion object {
        const val PRUNE_AFTER_MS = 7L * 24 * 60 * 60 * 1000
    }
}
