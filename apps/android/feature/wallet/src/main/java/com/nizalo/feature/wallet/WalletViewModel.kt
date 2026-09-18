package com.nizalo.feature.wallet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.model.CryptoNetwork
import com.nizalo.core.model.WalletBalance
import com.nizalo.core.model.WalletTransaction
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.network.dto.CreateDepositIntentRequest
import com.nizalo.core.network.dto.CreateWithdrawalRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class WalletState {
    object Loading : WalletState()
    data class Success(
        val balance: WalletBalance,
        val transactions: List<WalletTransaction>
    ) : WalletState()
    data class Error(val message: String) : WalletState()
}

class WalletViewModel(
    private val apiService: NizaloApiService,
    private val playerId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow<WalletState>(WalletState.Loading)
    val uiState: StateFlow<WalletState> = _uiState.asStateFlow()

    init {
        loadWallet()
    }

    fun loadWallet() {
        viewModelScope.launch {
            _uiState.value = WalletState.Loading
            try {
                // To do: parallel fetch
                val balanceResponse = apiService.getWalletBalance(playerId)
                val txResponse = apiService.getTransactions(playerId)

                if (balanceResponse.isSuccessful && txResponse.isSuccessful) {
                    val balance = balanceResponse.body() ?: WalletBalance()
                    val transactions = txResponse.body() ?: emptyList()
                    _uiState.value = WalletState.Success(balance, transactions)
                } else {
                    _uiState.value = WalletState.Error("Failed to load wallet data")
                }
            } catch (e: Exception) {
                _uiState.value = WalletState.Error(e.localizedMessage ?: "Unknown error")
            }
        }
    }

    fun requestDeposit(network: CryptoNetwork) {
        viewModelScope.launch {
            try {
                apiService.createDepositIntent(playerId, CreateDepositIntentRequest(network = network.name))
                // Refresh list or navigate to deposit screen
                loadWallet()
            } catch (e: Exception) {
                // handle error
            }
        }
    }

    fun requestWithdrawal(amountUsdt: Double, address: String, network: CryptoNetwork, totp: String) {
        viewModelScope.launch {
            try {
                val req = CreateWithdrawalRequest(amountUsdt, address, network.name, totp)
                apiService.createWithdrawal(playerId, req)
                // Assuming Step-up interceptor handles the 401 transparently and retries
                // Or if it succeeds directly
                loadWallet()
            } catch (e: Exception) {
                // handle error
            }
        }
    }
}
