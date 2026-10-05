package com.nizalo.paymentreceiver.data.repo

import com.nizalo.paymentreceiver.data.db.AuditDao
import com.nizalo.paymentreceiver.data.db.AuditEventEntity
import com.nizalo.paymentreceiver.data.settings.SettingsRepository

enum class AuditType(val essential: Boolean) {
    PAYMENT_RECEIVED(true),
    PAYMENT_PARSED(false),
    PAYMENT_HELD_FOR_REVIEW(true),
    PAYMENT_REJECTED(true),
    PAYMENT_SYNCED(true),
    PAYMENT_SYNC_FAILED(true),
    SYNC_ATTEMPT(false),
    WITHDRAWAL_RECEIVED(true),
    WITHDRAWAL_VIEWED(false),
    WITHDRAWAL_CONFIRMED(true),
    WITHDRAWAL_CONFIRMATION_FAILED(true),
    SETTINGS_CHANGED(true),
    TOKEN_CHANGED(true),
    CONNECTION_TESTED(true),
    INTEGRITY_WARNING(true),
    LEGACY_IMPORT(true),
}

/**
 * The app's own audit trail. Callers pass human-readable facts only --
 * amounts, references, statuses, error codes -- never the token or any
 * credential; there is no API here that accepts one. With detailed logging
 * off, only essential events are kept.
 */
class AuditLog(
    private val dao: AuditDao,
    private val settings: SettingsRepository,
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun record(type: AuditType, message: String, error: Boolean = false) {
        if (!type.essential && !settings.current().detailedLogging) return
        dao.insert(AuditEventEntity(at = now(), type = type.name, level = if (error) "ERROR" else "INFO", message = message.take(500)))
        if (++writes % TRIM_EVERY == 0) dao.trim(KEEP)
    }

    fun recent(limit: Int = 200) = dao.recent(limit)
    fun errorsSince(since: Long) = dao.errorsSince(since)

    private var writes = 0

    private companion object {
        const val KEEP = 5_000
        const val TRIM_EVERY = 100
    }
}
