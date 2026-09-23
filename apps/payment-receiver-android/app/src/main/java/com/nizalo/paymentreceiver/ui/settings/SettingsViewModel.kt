package com.nizalo.paymentreceiver.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.nizalo.paymentreceiver.AppContainer
import com.nizalo.paymentreceiver.core.Environment
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.network.ApiResult
import com.nizalo.paymentreceiver.data.network.ReceivingNumberDto
import com.nizalo.paymentreceiver.data.network.RetrofitReceiverApi
import com.nizalo.paymentreceiver.data.repo.AuditType
import com.nizalo.paymentreceiver.data.settings.Settings
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class FieldError { URL_REQUIRED, URL_INVALID, URL_HTTPS, TOKEN_REQUIRED, TOKEN_SHORT }

data class SettingsForm(
    val settings: Settings = Settings(),
    /** A newly typed token; empty means "keep the saved one". Never pre-filled with the saved value. */
    val tokenInput: String = "",
    val tokenVisible: Boolean = false,
    val hasSavedToken: Boolean = false,
    val urlError: FieldError? = null,
    val tokenError: FieldError? = null,
)

sealed interface NumbersState {
    data object Idle : NumbersState
    data object Loading : NumbersState
    data class Loaded(val numbers: List<ReceivingNumberDto>) : NumbersState
    data class Failed(val error: ApiError) : NumbersState
}

sealed interface SaveState {
    data object Idle : SaveState
    data object Saving : SaveState
    data object Saved : SaveState
    data object Invalid : SaveState
}

class SettingsViewModel(private val c: AppContainer) : ViewModel() {
    private val _form = MutableStateFlow(SettingsForm())
    val form: StateFlow<SettingsForm> = _form.asStateFlow()
    private var original = Settings()

    val numbers = MutableStateFlow<NumbersState>(NumbersState.Idle)
    val save = MutableStateFlow<SaveState>(SaveState.Idle)
    val mockAvailable = Environment.current.mockAvailable
    val environmentName = Environment.current.name

    init {
        viewModelScope.launch {
            original = c.settings.current()
            _form.value = SettingsForm(settings = original, hasSavedToken = c.secureStore.hasToken())
        }
    }

    val isDirty: Boolean get() = _form.value.settings != original || _form.value.tokenInput.isNotEmpty()

    fun edit(transform: (Settings) -> Settings) {
        _form.update { it.copy(settings = transform(it.settings), urlError = null) }
        save.value = SaveState.Idle
    }

    fun setToken(value: String) {
        // Whitespace is never part of a token; pasting often brings a trailing newline.
        _form.update { it.copy(tokenInput = value.filterNot { ch -> ch.isWhitespace() }, tokenError = null) }
        save.value = SaveState.Idle
    }

    fun toggleTokenVisible() = _form.update { it.copy(tokenVisible = !it.tokenVisible) }

    fun toggleNumber(network: String, id: String) = edit { s ->
        if (network == "INSTAPAY") s.copy(instapayNumberIds = s.instapayNumberIds.toggle(id))
        else s.copy(vodafoneNumberIds = s.vodafoneNumberIds.toggle(id))
    }

    private fun Set<String>.toggle(id: String) = if (id in this) this - id else this + id

    private fun validate(f: SettingsForm): SettingsForm {
        val mock = f.settings.useMockBackend && mockAvailable
        val urlError = if (mock && f.settings.baseUrl.isBlank()) null else
            when (SettingsRepository.validateBaseUrl(f.settings.baseUrl, Environment.allowCleartext)) {
                null -> null
                "required" -> FieldError.URL_REQUIRED
                "https_required" -> FieldError.URL_HTTPS
                else -> FieldError.URL_INVALID
            }
        val tokenError = when {
            mock -> null
            f.tokenInput.isEmpty() && !f.hasSavedToken -> FieldError.TOKEN_REQUIRED
            f.tokenInput.isNotEmpty() && f.tokenInput.length < 16 -> FieldError.TOKEN_SHORT
            else -> null
        }
        return f.copy(urlError = urlError, tokenError = tokenError)
    }

    /** Loads the receiving numbers using the address and token currently in the form, before saving. */
    fun loadNumbers() {
        val f = validate(_form.value)
        viewModelScope.launch {
            numbers.value = NumbersState.Loading
            val api = when {
                f.settings.useMockBackend && mockAvailable -> c.apiProvider.api()
                f.urlError != null -> { _form.value = f; numbers.value = NumbersState.Idle; return@launch }
                else -> RetrofitReceiverApi(
                    SettingsRepository.normalizeBaseUrl(f.settings.baseUrl),
                    tokenProvider = { f.tokenInput.ifEmpty { c.secureStore.token() } },
                    isOnline = c.network::isOnline,
                )
            }
            numbers.value = when (val r = api.receivingNumbers()) {
                is ApiResult.Ok -> {
                    autoSelectSingleNumbers(r.value)
                    NumbersState.Loaded(r.value)
                }
                is ApiResult.Err -> NumbersState.Failed(r.error)
            }
        }
    }

    /** A provider with exactly one active number and nothing chosen yet: that number is the obvious choice. */
    private fun autoSelectSingleNumbers(list: List<ReceivingNumberDto>) {
        val vf = list.filter { it.network == "VODAFONE_CASH" }
        val ipn = list.filter { it.network == "INSTAPAY" }
        edit { s ->
            s.copy(
                vodafoneNumberIds = if (s.vodafoneNumberIds.isEmpty() && vf.size == 1) setOf(vf[0].id) else s.vodafoneNumberIds,
                instapayNumberIds = if (s.instapayNumberIds.isEmpty() && ipn.size == 1) setOf(ipn[0].id) else s.instapayNumberIds,
            )
        }
    }

    fun save(onSaved: () -> Unit = {}) {
        if (save.value is SaveState.Saving) return
        val f = validate(_form.value)
        _form.value = f
        if (f.urlError != null || f.tokenError != null) {
            save.value = SaveState.Invalid
            return
        }
        save.value = SaveState.Saving
        viewModelScope.launch {
            val toSave = f.settings.copy(baseUrl = SettingsRepository.normalizeBaseUrl(f.settings.baseUrl))
            c.settings.save(toSave)
            if (f.tokenInput.isNotEmpty()) {
                c.secureStore.setToken(f.tokenInput)
                c.audit.record(AuditType.TOKEN_CHANGED, "connection token replaced")
            }
            c.audit.record(AuditType.SETTINGS_CHANGED, describeChanges(original, toSave))
            original = toSave
            _form.value = SettingsForm(settings = toSave, hasSavedToken = c.secureStore.hasToken())
            save.value = SaveState.Saved
            runCatching { c.scheduler.syncSoon() }
            runCatching { c.scheduler.schedulePeriodic() }
            c.connection.check()
            onSaved()
        }
    }

    fun discard() {
        _form.value = SettingsForm(settings = original, hasSavedToken = c.secureStore.hasToken())
        save.value = SaveState.Idle
    }

    private fun describeChanges(a: Settings, b: Settings): String = buildList {
        if (a.baseUrl != b.baseUrl) add("url=${b.baseUrl}")
        if (a.vodafoneEnabled != b.vodafoneEnabled) add("vodafone=${b.vodafoneEnabled}")
        if (a.instapayEnabled != b.instapayEnabled) add("instapay=${b.instapayEnabled}")
        if (a.wifiOnly != b.wifiOnly) add("wifiOnly=${b.wifiOnly}")
        if (a.autoSync != b.autoSync) add("autoSync=${b.autoSync}")
        if (a.detailedLogging != b.detailedLogging) add("detailedLog=${b.detailedLogging}")
        if (a.vodafoneNumberIds != b.vodafoneNumberIds) add("vfNumbers=${b.vodafoneNumberIds.sorted()}")
        if (a.instapayNumberIds != b.instapayNumberIds) add("ipnNumbers=${b.instapayNumberIds.sorted()}")
        if (a.notifyWithdrawals != b.notifyWithdrawals || a.notifyPayments != b.notifyPayments) add("notifications")
        if (a.useMockBackend != b.useMockBackend) add("mock=${b.useMockBackend}")
    }.joinToString(", ").ifEmpty { "no field changes" }
}
