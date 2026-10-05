package com.nizalo.paymentreceiver.ui.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.TransactionEntity
import com.nizalo.paymentreceiver.data.repo.TransactionRepository
import com.nizalo.paymentreceiver.domain.SyncStatus
import com.nizalo.paymentreceiver.domain.TransactionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import java.time.DayOfWeek
import java.time.Instant
import java.time.temporal.TemporalAdjusters

enum class HistoryFilter { ALL, VODAFONE, INSTAPAY, PENDING, SYNCED, FAILED, DUPLICATE, REJECTED, TODAY, WEEK, MONTH }

class HistoryViewModel(repo: TransactionRepository, private val now: () -> Long = System::currentTimeMillis) : ViewModel() {
    val query = MutableStateFlow("")
    val filter = MutableStateFlow(HistoryFilter.ALL)

    val results: StateFlow<List<TransactionEntity>> = combine(repo.all(), query, filter) { all, q, f ->
        all.filter { matchesFilter(it, f) && matchesQuery(it, q) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private fun matchesFilter(t: TransactionEntity, f: HistoryFilter): Boolean = when (f) {
        HistoryFilter.ALL -> true
        HistoryFilter.VODAFONE -> t.provider == "VODAFONE_CASH"
        HistoryFilter.INSTAPAY -> t.provider == "INSTAPAY"
        HistoryFilter.PENDING -> t.status in setOf(TransactionStatus.PENDING.name, TransactionStatus.PROCESSING.name, TransactionStatus.NEEDS_REVIEW.name)
        HistoryFilter.SYNCED -> t.syncStatus == SyncStatus.SYNCED.name
        HistoryFilter.FAILED -> t.status == TransactionStatus.FAILED.name || t.syncStatus == SyncStatus.FAILED.name
        HistoryFilter.DUPLICATE -> t.status == TransactionStatus.DUPLICATE.name
        HistoryFilter.REJECTED -> t.status == TransactionStatus.REJECTED.name
        HistoryFilter.TODAY -> t.receivedAt >= Formatters.startOfTodayCairo(now())
        HistoryFilter.WEEK -> t.receivedAt >= startOf { it.with(TemporalAdjusters.previousOrSame(DayOfWeek.SATURDAY)) }
        HistoryFilter.MONTH -> t.receivedAt >= startOf { it.withDayOfMonth(1) }
    }

    private fun startOf(adjust: (java.time.LocalDate) -> java.time.LocalDate): Long {
        val today = Instant.ofEpochMilli(now()).atZone(Formatters.cairo).toLocalDate()
        return adjust(today).atStartOfDay(Formatters.cairo).toInstant().toEpochMilli()
    }

    companion object {
        /**
         * Reference, phone, sender name, backend id or amount. Amounts match on
         * the pounds typed ("500", "500.00", "1,250").
         */
        fun matchesQuery(t: TransactionEntity, raw: String): Boolean {
            val q = raw.trim()
            if (q.isEmpty()) return true
            val lower = q.lowercase()
            val digits = q.filter { it.isDigit() }
            if (t.reference?.lowercase()?.contains(lower) == true) return true
            if (t.id.lowercase().contains(lower) || t.backendId?.lowercase()?.contains(lower) == true) return true
            if (t.senderName?.lowercase()?.contains(lower) == true) return true
            if (digits.length >= 4 && t.senderPhone?.contains(digits) == true) return true
            val amount = t.amountPiastres ?: return false
            val typed = q.replace(",", "").toBigDecimalOrNull() ?: return false
            return runCatching { typed.movePointRight(2).longValueExact() == amount }.getOrDefault(false)
        }
    }
}
