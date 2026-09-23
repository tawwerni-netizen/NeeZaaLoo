package com.nizalo.paymentreceiver.ui.testmode

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.receiver.parser.Confidence
import com.nizalo.receiver.parser.MessageParser
import com.nizalo.receiver.parser.ParsedReceipt
import com.nizalo.paymentreceiver.ui.components.ActionButton
import com.nizalo.paymentreceiver.ui.components.AppTopBar
import com.nizalo.paymentreceiver.ui.components.Chip
import com.nizalo.paymentreceiver.ui.components.LabeledValue
import com.nizalo.paymentreceiver.ui.components.ResultCard
import com.nizalo.paymentreceiver.ui.components.SectionCard
import com.nizalo.paymentreceiver.ui.components.Tone
import com.nizalo.paymentreceiver.ui.components.codeText
import com.nizalo.paymentreceiver.ui.components.providerText
import kotlinx.coroutines.flow.MutableStateFlow

sealed interface TestResult {
    data object None : TestResult
    data object EmptyInput : TestResult
    data class Parsed(val receipt: ParsedReceipt) : TestResult
}

/**
 * Runs the production parser on pasted text. Deliberately has no access to
 * the database, the send queue or the API: nothing here can be saved or sent.
 */
class TestModeViewModel : ViewModel() {
    val text = MutableStateFlow("")
    val sender = MutableStateFlow("")
    val result = MutableStateFlow<TestResult>(TestResult.None)

    fun read() {
        val t = text.value
        result.value = if (t.isBlank()) TestResult.EmptyInput
        else TestResult.Parsed(MessageParser.parse(t, sender.value.trim().ifEmpty { null }))
    }

    fun clear() {
        text.value = ""
        sender.value = ""
        result.value = TestResult.None
    }
}

@Composable
fun TestModeScreen(vm: TestModeViewModel, onBack: () -> Unit) {
    val text by vm.text.collectAsStateWithLifecycle()
    val sender by vm.sender.collectAsStateWithLifecycle()
    val result by vm.result.collectAsStateWithLifecycle()

    Scaffold(topBar = { AppTopBar(stringResource(R.string.test_title), onBack) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.test_heading), style = MaterialTheme.typography.titleLarge)
            Text(stringResource(R.string.test_note), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = text,
                onValueChange = { vm.text.value = it },
                placeholder = { Text(stringResource(R.string.test_hint)) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 180.dp).testTag("test_input"),
            )
            OutlinedTextField(
                value = sender,
                onValueChange = { vm.sender.value = it },
                placeholder = { Text(stringResource(R.string.test_sender_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("test_sender"),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionButton(stringResource(R.string.test_read), stringResource(R.string.test_read), false, vm::read,
                    Modifier.weight(1f).testTag("test_read"))
                ActionButton(stringResource(R.string.test_clear), stringResource(R.string.test_clear), false, vm::clear,
                    Modifier.weight(1f).testTag("test_clear"), primary = false)
            }
            ActionButton(stringResource(R.string.back), stringResource(R.string.back), false, onBack,
                Modifier.fillMaxWidth().testTag("test_back"), primary = false)

            when (val r = result) {
                TestResult.None -> Unit
                TestResult.EmptyInput -> ResultCard(Tone.WARNING, stringResource(R.string.test_empty), emptyList())
                is TestResult.Parsed -> ParsedView(r.receipt)
            }
        }
    }
}

@Composable
private fun ParsedView(p: ParsedReceipt) {
    val ok = p.confidence != Confidence.INVALID
    ResultCard(
        if (p.confidence == Confidence.VALID) Tone.SUCCESS else if (ok) Tone.WARNING else Tone.DANGER,
        stringResource(if (ok) R.string.test_parsed_ok else R.string.test_parse_failed),
        emptyList(),
    )
    if (!ok) return
    SectionCard(Modifier.testTag("test_result")) {
        LabeledValue("Provider", p.provider?.let { providerText(it.wireName) })
        LabeledValue("Amount", Formatters.egp(p.amountPiastres))
        LabeledValue("Sender", p.senderName)
        LabeledValue("Phone", p.senderPhone)
        LabeledValue("Transaction Reference", p.reference)
        LabeledValue(
            "Confidence",
            stringResource(
                when (p.confidence) {
                    Confidence.VALID -> R.string.test_confidence_valid
                    Confidence.NEEDS_REVIEW -> R.string.test_confidence_review
                    Confidence.INVALID -> R.string.test_confidence_invalid
                }
            ),
        )
        if (p.issues.isNotEmpty()) {
            Text(stringResource(R.string.test_issues), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
            for (i in p.issues) {
                Chip(codeText("pi_", i.name), if (i.blocksAutoSend) Tone.WARNING else Tone.NEUTRAL, Modifier.padding(top = 4.dp))
            }
        }
    }
}
