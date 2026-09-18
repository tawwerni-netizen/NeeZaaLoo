package com.nizalo.feature.settings

import androidx.lifecycle.ViewModel
import com.nizalo.core.security.KeyStoreManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SettingsViewModel(
    private val keyStoreManager: KeyStoreManager
) : ViewModel() {

    private val _isBiometricEnabled = MutableStateFlow(false)
    val isBiometricEnabled: StateFlow<Boolean> = _isBiometricEnabled.asStateFlow()

    private val _isAmlVerified = MutableStateFlow(false) // In a real app, fetched from backend
    val isAmlVerified: StateFlow<Boolean> = _isAmlVerified.asStateFlow()

    init {
        // Load initial values from secure storage / backend
        _isBiometricEnabled.value = keyStoreManager.getAccessToken() != null // Mock check
        _isAmlVerified.value = true // Mock check
    }

    fun setBiometricEnabled(enabled: Boolean) {
        _isBiometricEnabled.value = enabled
        // In a real app, interface with BiometricPrompt
    }
}
