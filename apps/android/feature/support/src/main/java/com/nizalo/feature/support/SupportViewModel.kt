package com.nizalo.feature.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.model.SupportCategory
import com.nizalo.core.model.SupportTicket
import com.nizalo.core.network.dto.CreateTicketRequest
import com.nizalo.core.network.NizaloApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class SupportState {
    data object Loading : SupportState()
    data class Success(val tickets: List<SupportTicket>) : SupportState()
    data class Error(val message: String) : SupportState()
}

class SupportViewModel(
    private val apiService: NizaloApiService
) : ViewModel() {

    private val _state = MutableStateFlow<SupportState>(SupportState.Loading)
    val state: StateFlow<SupportState> = _state.asStateFlow()

    init {
        loadTickets()
    }

    fun loadTickets() {
        viewModelScope.launch {
            _state.value = SupportState.Loading
            try {
                val response = apiService.getTickets()
                if (response.isSuccessful && response.body() != null) {
                    val tickets = response.body()!!.data as List<SupportTicket>
                    _state.value = SupportState.Success(tickets)
                } else {
                    _state.value = SupportState.Error("Failed to load tickets")
                }
            } catch (e: Exception) {
                _state.value = SupportState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun createTicket(category: SupportCategory, subject: String, message: String) {
        viewModelScope.launch {
            try {
                val response = apiService.createTicket(
                    CreateTicketRequest(
                        category = category.name,
                        subject = subject,
                        message = message
                    )
                )
                if (response.isSuccessful) {
                    loadTickets() // Refresh the list
                }
            } catch (e: Exception) {
                // Ignore or show a toast
            }
        }
    }
}
