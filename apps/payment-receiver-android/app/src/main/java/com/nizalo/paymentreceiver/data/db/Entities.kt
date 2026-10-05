package com.nizalo.paymentreceiver.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * One payment receipt the phone received. `id` doubles as the idempotency
 * key sent to the backend (`clientTransactionId`), so however many times
 * this row is sent, the backend treats it as one report.
 */
@Entity(
    tableName = "transactions",
    indices = [
        Index(value = ["fingerprint"], unique = true),
        Index(value = ["receivedAt"]),
        Index(value = ["status"]),
    ],
)
data class TransactionEntity(
    @PrimaryKey val id: String,
    val provider: String,
    val amountPiastres: Long?,
    val senderName: String?,
    val senderPhone: String?,
    val reference: String?,
    val smsSender: String?,
    val rawMessage: String,
    val fingerprint: String,
    val receivedAt: Long,
    val parsedAt: Long,
    val confidence: String,
    val parseIssues: String,
    val status: String,
    val syncStatus: String,
    val source: String,
    /** Candidate receiving-number ids at the moment the receipt arrived. */
    val receivingNumberIds: String,
    val backendId: String? = null,
    val backendOutcome: String? = null,
    val backendReviewReason: String? = null,
    val playerHandle: String? = null,
    val creditedUsdtMinor: String? = null,
    val syncAttempts: Int = 0,
    val lastError: String? = null,
    val processedAt: Long? = null,
)

/** Receipts waiting to be sent. A row leaves this table only when the backend has answered for it. */
@Entity(tableName = "sync_queue", indices = [Index(value = ["nextAttemptAt"])])
data class SyncQueueEntity(
    @PrimaryKey val transactionId: String,
    val attemptCount: Int = 0,
    val enqueuedAt: Long,
    val lastAttemptAt: Long? = null,
    val nextAttemptAt: Long,
    val lastError: String? = null,
)

/** Local copy of a payout request, so the list works offline and a confirmation survives a crash. */
@Entity(tableName = "withdrawal_requests", indices = [Index(value = ["receiverStatus"])])
data class WithdrawalEntity(
    @PrimaryKey val id: String,
    val playerHandle: String,
    val network: String,
    val destination: String,
    val amountUsdtMinor: String,
    val amountEgpMinor: String?,
    val amountEgpToSend: String?,
    val backendStatus: String,
    val receiverStatus: String,
    val actionable: Boolean,
    val requestedAt: Long,
    val completedAt: Long?,
    val reference: String?,
    val lastFetchedAt: Long,
    val notified: Boolean = false,
    /** Created BEFORE the confirmation is sent and reused on every retry of it. */
    val pendingConfirmKey: String? = null,
    val confirmState: String = "IDLE",
    val confirmError: String? = null,
)

@Entity(tableName = "audit_events", indices = [Index(value = ["at"])])
data class AuditEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val at: Long,
    val type: String,
    val level: String,
    val message: String,
)
