package com.nizalo.paymentreceiver.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory

/**
 * Encrypted with SQLCipher: receipts hold senders' names, phone numbers and
 * amounts. Version bumps must add a real Migration -- never destructive
 * fallback, which would silently drop receipts that have not been sent yet.
 */
@Database(
    entities = [TransactionEntity::class, SyncQueueEntity::class, WithdrawalEntity::class, AuditEventEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class ReceiverDatabase : RoomDatabase() {
    abstract fun transactions(): TransactionDao
    abstract fun syncQueue(): SyncQueueDao
    abstract fun withdrawals(): WithdrawalDao
    abstract fun audit(): AuditDao

    companion object {
        const val NAME = "nizalo_receiver.db"

        fun encrypted(context: Context, passphrase: ByteArray): ReceiverDatabase {
            System.loadLibrary("sqlcipher")
            return Room.databaseBuilder(context, ReceiverDatabase::class.java, NAME)
                .openHelperFactory(SupportOpenHelperFactory(passphrase))
                .build()
        }
    }
}
