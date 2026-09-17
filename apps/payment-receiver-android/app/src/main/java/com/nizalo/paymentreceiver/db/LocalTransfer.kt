package com.nizalo.paymentreceiver.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "local_transfers")
data class LocalTransfer(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val network: String,
    val receivingNumberId: String,
    val rawSenderName: String?,
    val rawSenderPhone: String?,
    val amountEgpMinor: Long,
    val rawMessage: String,
    val observedAt: Long,
    val status: String = "QUEUED", // QUEUED, SYNCED, FAILED
    val errorMessage: String? = null
)
