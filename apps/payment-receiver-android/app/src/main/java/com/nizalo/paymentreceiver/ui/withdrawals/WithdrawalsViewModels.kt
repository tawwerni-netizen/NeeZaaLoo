package com.nizalo.paymentreceiver.ui.withdrawals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.paymentreceiver.data.db.WithdrawalEntity
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.repo.ConfirmResult
import com.nizalo.paymentreceiver.data.repo.RefreshResult
import com.nizalo.paymentreceiver.data.repo.WithdrawalRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface RefreshState {
    data object Idle : RefreshState
    data object Refreshing : RefreshState
    data class Failed(val error: ApiError) : RefreshState
}

class WithdrawalsViewModel(private val repo: WithdrawalRepository) : ViewModel() {
    val items: StateFlow<List<WithdrawalEntity>> = repo.all().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val refresh = MutableStateFlow<RefreshState>(RefreshState.Idle)

    init { refresh() }

    fun refresh() {
        if (refresh.value is RefreshState.Refreshing) return
        refresh.value = RefreshState.Refreshing
        viewModelScope.launch {
            refresh.value = when (val r = repo.refresh()) {
                is RefreshResult.Ok -> RefreshState.Idle
                is RefreshResult.Failed -> RefreshState.Failed(r.error)
            }
        }
    }
}

sealed interface ConfirmUiState {
    data object Idle : ConfirmUiState
    data object Confirming : ConfirmUiState
    data class Finished(val result: ConfirmResult) : ConfirmUiState
}

class WithdrawalDetailsViewModel(private val repo: WithdrawalRepository, private val id: String) : ViewModel() {
    val withdrawal: StateFlow<WithdrawalEntity?> = repo.observe(id).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val confirm = MutableStateFlow<ConfirmUiState>(ConfirmUiState.Idle)

    init {
        viewModelScope.launch {
            repo.recordViewed(id)
            repo.refreshOne(id)
        }
    }

    /**
     * Guarded twice against a double tap: this state check, and the
     * repository's own lock plus stored idempotency key -- so even two
     * requests reaching the backend debit the player once.
     */
    fun confirm(reference: String?) {
        if (confirm.value is ConfirmUiState.Confirming) return
        confirm.value = ConfirmUiState.Confirming
        viewModelScope.launch { confirm.value = ConfirmUiState.Finished(repo.confirm(id, reference)) }
    }

    fun dismissResult() {
        if (confirm.value is ConfirmUiState.Finished) confirm.value = ConfirmUiState.Idle
    }
}
