package com.nizalo.paymentreceiver.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nizalo.paymentreceiver.BuildConfig
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.data.network.ReceivingNumberDto
import com.nizalo.paymentreceiver.ui.components.ActionButton
import com.nizalo.paymentreceiver.ui.components.AppTopBar
import com.nizalo.paymentreceiver.ui.components.ResultCard
import com.nizalo.paymentreceiver.ui.components.SectionCard
import com.nizalo.paymentreceiver.ui.components.SectionTitle
import com.nizalo.paymentreceiver.ui.components.Tone
import com.nizalo.paymentreceiver.ui.components.apiErrorText

@Composable
private fun fieldErrorText(e: FieldError?): String? = when (e) {
    null -> null
    FieldError.URL_REQUIRED -> stringResource(R.string.v_url_required)
    FieldError.URL_INVALID -> stringResource(R.string.v_url_invalid)
    FieldError.URL_HTTPS -> stringResource(R.string.v_url_https)
    FieldError.TOKEN_REQUIRED -> stringResource(R.string.v_token_required)
    FieldError.TOKEN_SHORT -> stringResource(R.string.v_token_short)
}

@Composable
fun SettingsScreen(vm: SettingsViewModel, onBack: () -> Unit) {
    val form by vm.form.collectAsStateWithLifecycle()
    val numbers by vm.numbers.collectAsStateWithLifecycle()
    val save by vm.save.collectAsStateWithLifecycle()
    var confirmLeave by remember { mutableStateOf(false) }

    val tryBack = { if (vm.isDirty) confirmLeave = true else onBack() }
    BackHandler(onBack = tryBack)

    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text(stringResource(R.string.unsaved_title)) },
            confirmButton = {
                TextButton(onClick = { confirmLeave = false; vm.save(onSaved = onBack) }, modifier = Modifier.testTag("unsaved_save")) {
                    Text(stringResource(R.string.unsaved_save))
                }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = { confirmLeave = false }, modifier = Modifier.testTag("unsaved_cancel")) { Text(stringResource(R.string.cancel)) }
                    TextButton(onClick = { confirmLeave = false; vm.discard(); onBack() }, modifier = Modifier.testTag("unsaved_discard")) {
                        Text(stringResource(R.string.unsaved_discard))
                    }
                }
            },
        )
    }

    Scaffold(topBar = { AppTopBar(stringResource(R.string.settings_title), onBack = tryBack) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SectionCard {
                SectionTitle(stringResource(R.string.s_section_connection))
                OutlinedTextField(
                    value = form.settings.baseUrl,
                    onValueChange = { v -> vm.edit { it.copy(baseUrl = v) } },
                    label = { Text(stringResource(R.string.s_website)) },
                    placeholder = { Text(stringResource(R.string.s_website_hint)) },
                    singleLine = true,
                    isError = form.urlError != null,
                    supportingText = fieldErrorText(form.urlError)?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth().testTag("field_url"),
                )
                OutlinedTextField(
                    value = form.tokenInput,
                    onValueChange = vm::setToken,
                    label = { Text(stringResource(R.string.s_token)) },
                    placeholder = { Text(stringResource(if (form.hasSavedToken) R.string.s_token_saved else R.string.s_token_hint)) },
                    singleLine = true,
                    isError = form.tokenError != null,
                    supportingText = fieldErrorText(form.tokenError)?.let { { Text(it) } },
                    visualTransformation = if (form.tokenVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrect = false),
                    trailingIcon = {
                        TextButton(onClick = vm::toggleTokenVisible, modifier = Modifier.testTag("token_toggle")) {
                            Text(stringResource(if (form.tokenVisible) R.string.s_hide else R.string.s_show))
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("field_token"),
                )
            }

            SectionCard {
                SectionTitle(stringResource(R.string.s_section_receiving))
                SwitchRow(stringResource(R.string.s_vodafone), form.settings.vodafoneEnabled, "switch_vodafone") { v -> vm.edit { it.copy(vodafoneEnabled = v) } }
                SwitchRow(stringResource(R.string.s_instapay), form.settings.instapayEnabled, "switch_instapay") { v -> vm.edit { it.copy(instapayEnabled = v) } }

                ActionButton(
                    text = stringResource(R.string.s_numbers_load), busyText = stringResource(R.string.s_numbers_loading),
                    busy = numbers is NumbersState.Loading, onClick = vm::loadNumbers, primary = false,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("load_numbers"),
                )
                val loaded = (numbers as? NumbersState.Loaded)?.numbers
                (numbers as? NumbersState.Failed)?.let {
                    Text(stringResource(R.string.s_numbers_failed, apiErrorText(it.error)), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))
                }
                NumberGroup(
                    title = stringResource(R.string.s_numbers_vodafone),
                    network = "VODAFONE_CASH",
                    available = loaded?.filter { it.network == "VODAFONE_CASH" },
                    selected = form.settings.vodafoneNumberIds,
                    onToggle = vm::toggleNumber,
                )
                NumberGroup(
                    title = stringResource(R.string.s_numbers_instapay),
                    network = "INSTAPAY",
                    available = loaded?.filter { it.network == "INSTAPAY" },
                    selected = form.settings.instapayNumberIds,
                    onToggle = vm::toggleNumber,
                )
            }

            SectionCard {
                SectionTitle(stringResource(R.string.s_section_sync))
                SwitchRow(stringResource(R.string.s_auto_sync), form.settings.autoSync, "switch_auto_sync") { v -> vm.edit { it.copy(autoSync = v) } }
                SwitchRow(stringResource(R.string.s_wifi_only), form.settings.wifiOnly, "switch_wifi_only") { v -> vm.edit { it.copy(wifiOnly = v) } }
            }

            SectionCard {
                SectionTitle(stringResource(R.string.s_section_notifications))
                SwitchRow(stringResource(R.string.s_notify_withdrawals), form.settings.notifyWithdrawals, "switch_notify_w") { v -> vm.edit { it.copy(notifyWithdrawals = v) } }
                SwitchRow(stringResource(R.string.s_notify_payments), form.settings.notifyPayments, "switch_notify_p") { v -> vm.edit { it.copy(notifyPayments = v) } }
            }

            SectionCard {
                SectionTitle(stringResource(R.string.s_section_advanced))
                SwitchRow(stringResource(R.string.s_detailed_log), form.settings.detailedLogging, "switch_detailed_log") { v -> vm.edit { it.copy(detailedLogging = v) } }
                Text(stringResource(R.string.s_detailed_log_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (vm.mockAvailable) {
                    SwitchRow(stringResource(R.string.s_mock), form.settings.useMockBackend, "switch_mock") { v -> vm.edit { it.copy(useMockBackend = v) } }
                }
                Text(stringResource(R.string.s_environment, vm.environmentName), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
                Text(stringResource(R.string.s_version, BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall)
            }

            when (save) {
                SaveState.Saved -> ResultCard(Tone.SUCCESS, stringResource(R.string.settings_saved), emptyList())
                SaveState.Invalid -> ResultCard(Tone.DANGER, stringResource(R.string.settings_invalid), emptyList())
                SaveState.Failed -> ResultCard(Tone.DANGER, stringResource(R.string.settings_save_failed), emptyList())
                else -> Unit
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton(
                    text = stringResource(R.string.save), busyText = stringResource(R.string.saving),
                    busy = save is SaveState.Saving, onClick = { vm.save() },
                    modifier = Modifier.weight(1f).testTag("settings_save"),
                )
                ActionButton(
                    text = stringResource(R.string.back), busyText = stringResource(R.string.back), busy = false,
                    onClick = tryBack, primary = false, modifier = Modifier.weight(1f).testTag("settings_back"),
                )
            }
        }
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, tag: String, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange, modifier = Modifier.testTag(tag))
    }
}

@Composable
private fun NumberGroup(
    title: String,
    network: String,
    available: List<ReceivingNumberDto>?,
    selected: Set<String>,
    onToggle: (String, String) -> Unit,
) {
    Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
    val rows: List<Pair<String, String>> = available?.map { it.id to listOfNotNull(it.label, it.phoneNumber).joinToString(" — ") }
        ?: selected.sorted().map { it to it }
    if (available != null && available.isEmpty()) {
        Text(stringResource(R.string.s_numbers_none), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    for ((id, label) in rows) {
        Row(
            Modifier.fillMaxWidth().clickable { onToggle(network, id) }.testTag("number_$id"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = id in selected, onCheckedChange = { onToggle(network, id) })
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
