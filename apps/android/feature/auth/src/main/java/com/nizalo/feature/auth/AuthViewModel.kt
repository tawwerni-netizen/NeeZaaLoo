package com.nizalo.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.core.network.NizaloApiService
import com.nizalo.core.network.dto.LoginRequest
import com.nizalo.core.network.dto.RegisterRequest
import com.nizalo.core.security.SecureStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.Response

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class Success(val playerId: String) : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(
    private val apiService: NizaloApiService,
    private val secureStorage: SecureStorage
) : ViewModel() {

    private val _loginState = MutableStateFlow<AuthState>(AuthState.Idle)
    val loginState: StateFlow<AuthState> = _loginState.asStateFlow()

    private val _registerState = MutableStateFlow<AuthState>(AuthState.Idle)
    val registerState: StateFlow<AuthState> = _registerState.asStateFlow()

    fun login(identifier: String, password: String, totpCode: String? = null) {
        viewModelScope.launch {
            _loginState.value = AuthState.Loading
            try {
                val response = apiService.login(LoginRequest(identifier = identifier, password = password, totpCode = totpCode))
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null) {
                        val token = body.accessToken
                        val refresh = body.refreshToken
                        if (token != null && refresh != null) {
                            secureStorage.saveAccessToken(token)
                            secureStorage.saveRefreshToken(refresh)
                            _loginState.value = AuthState.Success(body.playerId)
                        } else {
                            _loginState.value = AuthState.Error("Login failed")
                        }
                    } else {
                        _loginState.value = AuthState.Error("Login failed")
                    }
                } else {
                    _loginState.value = AuthState.Error("Login failed: ${response.code()}")
                }
            } catch (e: Exception) {
                _loginState.value = AuthState.Error(e.localizedMessage ?: "Unknown error")
            }
        }
    }

    fun register(handle: String, email: String, password: String, referralCode: String? = null) {
        viewModelScope.launch {
            _registerState.value = AuthState.Loading
            try {
                val response = apiService.register(
                    RegisterRequest(
                        handle = handle,
                        email = email,
                        password = password,
                        referralCode = referralCode,
                        termsAccepted = true
                    )
                )
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null) {
                        _registerState.value = AuthState.Success(body.playerId)
                    } else {
                        _registerState.value = AuthState.Error("Registration failed")
                    }
                } else {
                    _registerState.value = AuthState.Error("Registration failed: ${response.code()}")
                }
            } catch (e: Exception) {
                _registerState.value = AuthState.Error(e.localizedMessage ?: "Unknown error")
            }
        }
    }

    fun stepUp(action: String, password: String, totpCode: String? = null, stepUpManager: com.nizalo.core.network.StepUpManager) {
        viewModelScope.launch {
            try {
                val response = apiService.stepUp(
                    com.nizalo.core.network.dto.StepUpRequest(action, password, totpCode)
                )
                if (response.isSuccessful) {
                    val body = response.body()
                    if (body != null) {
                        stepUpManager.onStepUpResolved(body.stepUpToken)
                        return@launch
                    }
                }
            } catch (e: Exception) {
                // handle error appropriately
            }
            stepUpManager.onStepUpResolved(null) // Unblock on failure
        }
    }
}
