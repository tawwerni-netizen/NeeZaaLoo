package com.nizalo.paymentreceiver

import com.google.common.truth.Truth.assertThat
import com.nizalo.paymentreceiver.core.Formatters
import com.nizalo.paymentreceiver.data.db.TransactionEntity
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.sync.RetryPolicy
import com.nizalo.paymentreceiver.ui.history.HistoryViewModel
import org.junit.Test

class UnitRulesTest {
    @Test
    fun `backend URL must be https in staging and production`() {
        assertThat(SettingsRepository.validateBaseUrl("https://nizalo.com", allowCleartext = false)).isNull()
        assertThat(SettingsRepository.validateBaseUrl("http://nizalo.com", allowCleartext = false)).isEqualTo("https_required")
        assertThat(SettingsRepository.validateBaseUrl("http://10.0.2.2:4000", allowCleartext = true)).isNull()
        assertThat(SettingsRepository.validateBaseUrl("", allowCleartext = true)).isEqualTo("required")
        assertThat(SettingsRepository.validateBaseUrl("nizalo.com", allowCleartext = false)).isEqualTo("invalid")
        assertThat(SettingsRepository.validateBaseUrl("ftp://nizalo.com", allowCleartext = false)).isEqualTo("invalid")
        assertThat(SettingsRepository.validateBaseUrl("https://user:pw@nizalo.com", allowCleartext = false)).isEqualTo("invalid")
    }

    @Test
    fun `retry schedule grows and is capped, never gives up`() {
        assertThat(RetryPolicy.delayAfter(1)).isEqualTo(30_000L)
        assertThat(RetryPolicy.delayAfter(2)).isEqualTo(60_000L)
        assertThat(RetryPolicy.delayAfter(5)).isEqualTo(10 * 60_000L)
        assertThat(RetryPolicy.delayAfter(10)).isEqualTo(6 * 60 * 60_000L)
        assertThat(RetryPolicy.delayAfter(1000)).isEqualTo(6 * 60 * 60_000L)
    }

    @Test
    fun `amounts format in EGP with two decimals and western digits`() {
        assertThat(Formatters.egp(50_000L)).isEqualTo("EGP 500.00")
        assertThat(Formatters.egp(123_456_78L)).isEqualTo("EGP 123,456.78")
        assertThat(Formatters.egp(null as Long?)).isEqualTo("—")
        assertThat(Formatters.usdt("10000000")).isEqualTo("10.00 USDT")
    }

    private fun tx(ref: String? = "022857190374", phone: String? = "01515339319", name: String? = "أمنيه محمد", amount: Long? = 50_000) = TransactionEntity(
        id = "id-1", provider = "VODAFONE_CASH", amountPiastres = amount, senderName = name, senderPhone = phone, reference = ref,
        smsSender = "VF-Cash", rawMessage = "", fingerprint = "f", receivedAt = 0, parsedAt = 0, confidence = "VALID", parseIssues = "",
        status = "PENDING", syncStatus = "PENDING", source = "SMS", receivingNumberIds = "vf_1",
    )

    @Test
    fun `history search matches reference, phone, name and amount`() {
        val t = tx()
        assertThat(HistoryViewModel.matchesQuery(t, "")).isTrue()
        assertThat(HistoryViewModel.matchesQuery(t, "190374")).isTrue()
        assertThat(HistoryViewModel.matchesQuery(t, "01515")).isTrue()
        assertThat(HistoryViewModel.matchesQuery(t, "أمنيه")).isTrue()
        assertThat(HistoryViewModel.matchesQuery(t, "500")).isTrue()
        assertThat(HistoryViewModel.matchesQuery(t, "500.00")).isTrue()
        assertThat(HistoryViewModel.matchesQuery(t, "501")).isFalse()
        assertThat(HistoryViewModel.matchesQuery(t, "nobody")).isFalse()
    }
}
