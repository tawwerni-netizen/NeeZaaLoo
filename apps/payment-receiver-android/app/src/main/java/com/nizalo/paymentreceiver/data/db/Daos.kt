package com.nizalo.paymentreceiver.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TransactionDao {
    /** IGNORE on the unique fingerprint: the same receipt twice is one row. Returns -1 when it already existed. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertIgnoringDuplicate(entity: TransactionEntity): Long

    @Update
    suspend fun update(entity: TransactionEntity)

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun get(id: String): TransactionEntity?

    @Query("SELECT * FROM transactions WHERE id = :id")
    fun observe(id: String): Flow<TransactionEntity?>

    @Query("SELECT * FROM transactions WHERE fingerprint = :fingerprint")
    suspend fun byFingerprint(fingerprint: String): TransactionEntity?

    @Query("SELECT * FROM transactions ORDER BY receivedAt DESC LIMIT :limit")
    fun recent(limit: Int): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions ORDER BY receivedAt DESC")
    fun all(): Flow<List<TransactionEntity>>

    @Query("SELECT COUNT(*) FROM transactions WHERE receivedAt >= :since")
    fun countReceivedSince(since: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM transactions WHERE receivedAt >= :since AND status = 'CONFIRMED'")
    fun countConfirmedSince(since: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM transactions WHERE status IN ('PENDING','PROCESSING','NEEDS_REVIEW')")
    fun countPending(): Flow<Int>

    @Query("SELECT COUNT(*) FROM transactions WHERE status = 'FAILED'")
    fun countFailed(): Flow<Int>

    /** Sent and still awaiting a human on the backend: worth re-reading its status. */
    @Query("SELECT backendId FROM transactions WHERE backendId IS NOT NULL AND status = 'NEEDS_REVIEW' ORDER BY receivedAt DESC LIMIT 100")
    suspend fun backendIdsAwaitingReview(): List<String>

    @Query("SELECT * FROM transactions WHERE backendId = :backendId")
    suspend fun byBackendId(backendId: String): TransactionEntity?

    @Query("UPDATE transactions SET status = 'PENDING', syncStatus = 'PENDING' WHERE status = 'PROCESSING'")
    suspend fun resetInterruptedSends(): Int
}

@Dao
interface SyncQueueDao {
    @Upsert
    suspend fun upsert(entry: SyncQueueEntity)

    @Query("SELECT * FROM sync_queue WHERE transactionId = :id")
    suspend fun get(id: String): SyncQueueEntity?

    @Query("SELECT * FROM sync_queue WHERE nextAttemptAt <= :now ORDER BY enqueuedAt ASC LIMIT :limit")
    suspend fun due(now: Long, limit: Int): List<SyncQueueEntity>

    @Query("SELECT * FROM sync_queue ORDER BY enqueuedAt ASC")
    suspend fun allEntries(): List<SyncQueueEntity>

    @Query("SELECT MIN(nextAttemptAt) FROM sync_queue")
    suspend fun nextDueAt(): Long?

    @Query("SELECT COUNT(*) FROM sync_queue")
    fun count(): Flow<Int>

    @Query("DELETE FROM sync_queue WHERE transactionId = :id")
    suspend fun remove(id: String)
}

@Dao
interface WithdrawalDao {
    @Query("SELECT * FROM withdrawal_requests ORDER BY CASE WHEN actionable THEN 0 ELSE 1 END, requestedAt ASC")
    fun all(): Flow<List<WithdrawalEntity>>

    @Query("SELECT * FROM withdrawal_requests WHERE id = :id")
    fun observe(id: String): Flow<WithdrawalEntity?>

    @Query("SELECT * FROM withdrawal_requests WHERE id = :id")
    suspend fun get(id: String): WithdrawalEntity?

    @Query("SELECT * FROM withdrawal_requests WHERE actionable = 1")
    suspend fun actionable(): List<WithdrawalEntity>

    @Query("SELECT COUNT(*) FROM withdrawal_requests WHERE actionable = 1")
    fun countActionable(): Flow<Int>

    @Upsert
    suspend fun upsert(entity: WithdrawalEntity)

    @Update
    suspend fun update(entity: WithdrawalEntity)

    /** Final payouts older than [before] are pruned; the backend keeps the record. */
    @Query("DELETE FROM withdrawal_requests WHERE actionable = 0 AND lastFetchedAt < :before")
    suspend fun pruneFinal(before: Long)
}

@Dao
interface AuditDao {
    @Insert
    suspend fun insert(event: AuditEventEntity)

    @Query("SELECT * FROM audit_events ORDER BY at DESC LIMIT :limit")
    fun recent(limit: Int): Flow<List<AuditEventEntity>>

    @Query("SELECT COUNT(*) FROM audit_events WHERE level = 'ERROR' AND at >= :since")
    fun errorsSince(since: Long): Flow<Int>

    @Query("DELETE FROM audit_events WHERE id NOT IN (SELECT id FROM audit_events ORDER BY at DESC LIMIT :keep)")
    suspend fun trim(keep: Int)
}
