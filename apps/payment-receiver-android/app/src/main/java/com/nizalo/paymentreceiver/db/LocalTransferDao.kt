package com.nizalo.paymentreceiver.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface LocalTransferDao {
    @Insert
    suspend fun insert(transfer: LocalTransfer)

    @Update
    suspend fun update(transfer: LocalTransfer)

    @Query("SELECT * FROM local_transfers ORDER BY observedAt DESC")
    fun getAllTransfers(): Flow<List<LocalTransfer>>

    @Query("SELECT * FROM local_transfers WHERE status = 'QUEUED' OR status = 'FAILED' ORDER BY observedAt ASC")
    suspend fun getPendingTransfers(): List<LocalTransfer>
}
