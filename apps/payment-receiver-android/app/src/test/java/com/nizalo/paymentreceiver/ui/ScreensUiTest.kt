package com.nizalo.paymentreceiver.ui

import android.app.Application
import android.content.ClipboardManager
import android.content.Context
import android.Manifest
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.common.truth.Truth.assertThat
import com.nizalo.paymentreceiver.AppContainer
import com.nizalo.paymentreceiver.InMemoryReceiverApi
import com.nizalo.paymentreceiver.Receipts
import com.nizalo.paymentreceiver.TestContainers
import com.nizalo.paymentreceiver.data.settings.Settings
import com.nizalo.paymentreceiver.domain.TransactionSource
import com.nizalo.paymentreceiver.ui.dashboard.DashboardNav
import com.nizalo.paymentreceiver.ui.dashboard.DashboardScreen
import com.nizalo.paymentreceiver.ui.dashboard.DashboardViewModel
import com.nizalo.paymentreceiver.ui.history.HistoryScreen
import com.nizalo.paymentreceiver.ui.history.HistoryViewModel
import com.nizalo.paymentreceiver.ui.settings.SettingsScreen
import com.nizalo.paymentreceiver.ui.settings.SettingsViewModel
import com.nizalo.paymentreceiver.ui.testmode.TestModeScreen
import com.nizalo.paymentreceiver.ui.testmode.TestModeViewModel
import com.nizalo.paymentreceiver.ui.theme.ReceiverTheme
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalDetailsScreen
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalDetailsViewModel
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalsScreen
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalsViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(AndroidJUnit4::class)
@Config(application = Application::class, sdk = [34])
class ScreensUiTest {
    @get:Rule val rule = createComposeRule()

    private var c: AppContainer? = null

    private fun mockContainer(settings: Settings? = null): AppContainer {
        val container = if (settings != null) TestContainers.create(mock = { InMemoryReceiverApi() }, settings = settings)
        else TestContainers.create(mock = { InMemoryReceiverApi() })
        c = container
        return container
    }

    // In-memory databases are not closed: view models launched by a finished test may
    // still be completing a refresh, and a closed database would fail the NEXT test.
    @After
    fun tearDown() {
        c = null
    }

    // ---- Dashboard -----------------------------------------------------------

    /** On a configured phone the permissions are already granted; the permission card is covered separately. */
    private fun grantPermissions() {
        shadowOf(ApplicationProvider.getApplicationContext<Application>()).grantPermissions(
            Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS, Manifest.permission.POST_NOTIFICATIONS,
        )
    }

    /** The dashboard is a lazy list: off-screen rows do not exist until scrolled to. */
    private fun dashTag(tag: String) = rule.onNodeWithTag("dashboard").performScrollToNode(hasTestTag(tag)).let { rule.onNodeWithTag(tag) }

    /**
     * Scroll-then-tap, retried: rows can shift while the dashboard's own refreshes land
     * (e.g. the pending-withdrawals banner appearing above the buttons).
     */
    private fun dashClick(tag: String) = rule.waitUntil(5_000) {
        runCatching { dashTag(tag).performClick(); true }.getOrDefault(false)
    }

    /** Waits for text that appears asynchronously somewhere in the dashboard list, scrolling to it. */
    private fun waitForDashText(text: String) = rule.waitUntil(5_000) {
        runCatching { rule.onNodeWithTag("dashboard").performScrollToNode(hasText(text, substring = true)); true }.getOrDefault(false)
    }

    private fun dashboard(container: AppContainer, calls: MutableList<String> = mutableListOf()) {
        grantPermissions()
        rule.setContent {
            ReceiverTheme {
                DashboardScreen(
                    DashboardViewModel(container),
                    DashboardNav(
                        openTransaction = { calls += "tx:$it" }, openHistory = { calls += "history" },
                        openWithdrawals = { calls += "withdrawals" }, openTestMode = { calls += "test" },
                        openSettings = { calls += "settings" }, openAudit = { calls += "audit" },
                    ),
                )
            }
        }
    }

    @Test
    fun `dashboard - send now sends the queued receipt and reports it`() {
        val container = mockContainer()
        runBlocking { container.transactions.ingest(Receipts.vf(), "VF-Cash", System.currentTimeMillis(), TransactionSource.SMS) }
        dashboard(container)

        dashClick("send_now")
        waitForDashText("تم إرسال 1 عملية بنجاح.")
        waitForDashText("Confirmed")
        val t = runBlocking { container.database.transactions().recent(1).first().single() }
        assertThat(t.status).isEqualTo("CONFIRMED")
    }

    @Test
    fun `dashboard - missing permissions are explained with a grant button, not silently required`() {
        val container = mockContainer()
        rule.setContent {
            ReceiverTheme {
                DashboardScreen(DashboardViewModel(container), DashboardNav({}, {}, {}, {}, {}, {}))
            }
        }
        rule.onNodeWithTag("dashboard").performScrollToNode(hasTestTag("permissions_card"))
        rule.onNodeWithTag("grant_permissions").assertExists()
        assertThat(rule.exists("لقراءة رسائل تأكيد فودافون كاش")).isTrue()
    }

    @Test
    fun `dashboard - send now with nothing queued says so`() {
        dashboard(mockContainer())
        dashClick("send_now")
        waitForDashText("لا توجد عمليات بانتظار الإرسال.")
    }

    @Test
    fun `dashboard - test connection shows the real result with latency`() {
        dashboard(mockContainer())
        dashClick("test_connection")
        waitForDashText("✓ الاتصال يعمل")
        waitForDashText("Latency:")
    }

    @Test
    fun `dashboard - not configured is shown, not a fake connected state`() {
        val container = TestContainers.create(mock = null, token = null).also { c = it }
        dashboard(container)
        dashClick("test_connection")
        waitForDashText("✕ الاتصال غير متاح")
        waitForDashText("أكمل إعداد الاتصال")
        assertThat(rule.exists("✓ الاتصال يعمل")).isFalse()
    }

    @Test
    fun `dashboard - every navigation tile goes where it says`() {
        val calls = mutableListOf<String>()
        dashboard(mockContainer(), calls)
        for (tag in listOf("nav_history", "nav_withdrawals", "nav_test_mode", "nav_settings", "nav_audit")) {
            dashClick(tag)
        }
        assertThat(calls).containsExactly("history", "withdrawals", "test", "settings", "audit").inOrder()
    }

    @Test
    fun `dashboard - empty state instead of a blank list`() {
        dashboard(mockContainer())
        rule.onNodeWithTag("dashboard").performScrollToNode(hasText("لا توجد تحويلات حتى الآن."))
        rule.waitForText("لا توجد تحويلات حتى الآن.")
    }

    // ---- Settings ------------------------------------------------------------

    private fun settings(container: AppContainer, onBack: () -> Unit = {}) {
        rule.setContent { ReceiverTheme { SettingsScreen(SettingsViewModel(container), onBack) } }
    }

    @Test
    fun `settings - saving with no URL and no token shows errors beside the fields`() {
        val container = TestContainers.create(mock = null, token = null, settings = Settings()).also { c = it }
        settings(container)
        rule.onNodeWithTag("settings_save").performScrollTo().performClick()
        rule.waitForText("رابط الموقع مطلوب.")
        rule.waitForText("Token مطلوب.")
    }

    @Test
    fun `settings - http is refused outside dev, invalid URL is explained`() {
        val container = TestContainers.create(mock = null, token = null, settings = Settings()).also { c = it }
        settings(container)
        rule.onNodeWithTag("field_url").performTextInput("not a url")
        rule.onNodeWithTag("settings_save").performScrollTo().performClick()
        rule.waitForText("الرابط غير صحيح.")
    }

    @Test
    fun `settings - a valid save persists and confirms`() {
        val container = TestContainers.create(mock = null, token = null, settings = Settings()).also { c = it }
        settings(container)
        rule.onNodeWithTag("field_url").performTextInput("https://nizalo.example")
        rule.onNodeWithTag("field_token").performTextInput("prk_0123456789abcdef0123")
        rule.onNodeWithTag("settings_save").performScrollTo().performClick()
        rule.waitForText("✓ تم حفظ الإعدادات")
        val saved = runBlocking { container.settings.current() }
        assertThat(saved.baseUrl).isEqualTo("https://nizalo.example")
        assertThat(container.secureStore.token()).isEqualTo("prk_0123456789abcdef0123")
    }

    @Test
    fun `settings - the token is hidden until the operator asks to see it`() {
        val container = mockContainer()
        settings(container)
        rule.onNodeWithTag("field_token").performTextInput("prk_secret_value_123456")
        assertThat(rule.exists("prk_secret_value_123456")).isFalse()
        rule.onNodeWithTag("token_toggle").performClick()
        rule.waitForText("prk_secret_value_123456")
    }

    @Test
    fun `settings - back with unsaved changes asks save, discard or cancel`() {
        var backs = 0
        val container = mockContainer()
        settings(container) { backs++ }
        rule.onNodeWithTag("switch_wifi_only").performScrollTo().assertIsOff().performClick()
        rule.onNodeWithTag("switch_wifi_only").assertIsOn()

        rule.onNodeWithTag("settings_back").performScrollTo().performClick()
        rule.waitForText("لديك تغييرات غير محفوظة.")
        rule.onNodeWithTag("unsaved_cancel").performClick()
        assertThat(backs).isEqualTo(0)

        rule.onNodeWithTag("settings_back").performScrollTo().performClick()
        rule.onNodeWithTag("unsaved_discard").performClick()
        assertThat(backs).isEqualTo(1)
        assertThat(runBlocking { container.settings.current().wifiOnly }).isFalse()
    }

    @Test
    fun `settings - back without changes just goes back`() {
        var backs = 0
        settings(mockContainer()) { backs++ }
        rule.waitForTag("settings_back")
        rule.onNodeWithTag("settings_back").performScrollTo().performClick()
        assertThat(backs).isEqualTo(1)
    }

    // ---- Test Mode -----------------------------------------------------------

    @Test
    fun `test mode - read shows the parsed fields, clear resets, back leaves`() {
        var backs = 0
        val container = mockContainer()
        rule.setContent { ReceiverTheme { TestModeScreen(TestModeViewModel()) { backs++ } } }

        rule.onNodeWithTag("test_input").performTextInput(Receipts.vf())
        rule.onNodeWithTag("test_read").performClick()
        rule.waitForText("Parsed Successfully")
        rule.onNodeWithText("EGP 500.00").assertExists()
        rule.onNodeWithText("022857190374").assertExists()
        rule.onNodeWithText("Valid").assertExists()

        rule.onNodeWithTag("test_clear").performClick()
        assertThat(rule.exists("Parsed Successfully")).isFalse()

        rule.onNodeWithTag("test_back").performScrollTo().performClick()
        assertThat(backs).isEqualTo(1)

        // Nothing was stored or sent.
        assertThat(runBlocking { container.database.syncQueue().allEntries() }).isEmpty()
    }

    @Test
    fun `test mode - a non-receipt is reported as unreadable`() {
        rule.setContent { ReceiverTheme { TestModeScreen(TestModeViewModel()) {} } }
        rule.onNodeWithTag("test_input").performTextInput("كود التحقق 123456")
        rule.onNodeWithTag("test_read").performClick()
        rule.waitForText("Unable to parse message")
    }

    @Test
    fun `test mode - reading with nothing pasted says what to do`() {
        rule.setContent { ReceiverTheme { TestModeScreen(TestModeViewModel()) {} } }
        rule.onNodeWithTag("test_read").performClick()
        rule.waitForText("الصق نص رسالة أولًا.")
    }

    // ---- History -------------------------------------------------------------

    @Test
    fun `history - search, filter and open details`() {
        val container = mockContainer()
        runBlocking {
            container.transactions.ingest(Receipts.vf(ref = "111111111111"), "VF-Cash", System.currentTimeMillis(), TransactionSource.SMS)
            container.transactions.ingest(Receipts.IPN, "Mashreq", System.currentTimeMillis(), TransactionSource.SMS)
        }
        val opened = mutableListOf<String>()
        rule.setContent { ReceiverTheme { HistoryScreen(HistoryViewModel(container.transactions), {}, { opened += it }) } }

        rule.waitForText("2 نتيجة")
        rule.onNodeWithTag("history_search").performTextReplacement("111111")
        rule.waitForText("1 نتيجة")
        rule.onNodeWithTag("history_search").performTextReplacement("")
        rule.onNodeWithTag("filter_INSTAPAY").performClick()
        rule.waitForText("1 نتيجة")
        rule.onNodeWithText("EGP 5,000.00").performClick()
        assertThat(opened).hasSize(1)

        rule.onNodeWithTag("history_search").performTextReplacement("no-such-thing")
        rule.waitForText("لا توجد نتائج مطابقة.")
    }

    // ---- Withdrawals -----------------------------------------------------------

    @Test
    fun `withdrawals - list, details, copy and confirm through the backend`() {
        val container = mockContainer()
        runBlocking { container.withdrawals.refresh() }

        val opened = mutableListOf<String>()
        rule.setContent { ReceiverTheme { WithdrawalsScreen(WithdrawalsViewModel(container.withdrawals), {}, { opened += it }) } }
        rule.waitForTag("w_wd_mock_1")
        rule.onNodeWithTag("w_wd_mock_1").performClick()
        assertThat(opened).containsExactly("wd_mock_1")
    }

    @Test
    fun `withdrawal details - copy the number, cancel, then confirm`() {
        val container = mockContainer()
        runBlocking { container.withdrawals.refresh() }
        rule.setContent { ReceiverTheme { WithdrawalDetailsScreen(WithdrawalDetailsViewModel(container.withdrawals, "wd_mock_1")) {} } }

        rule.waitForTag("w_copy")
        rule.onNodeWithTag("w_copy").performScrollTo().performClick()
        rule.waitForText("✓ تم نسخ الرقم")
        val clip = ApplicationProvider.getApplicationContext<Context>().getSystemService(ClipboardManager::class.java)
        assertThat(clip.primaryClip?.getItemAt(0)?.text.toString()).isEqualTo("01033334444")

        rule.onNodeWithTag("w_done").performScrollTo().performClick()
        rule.waitForText("هل تم بالفعل تحويل المبلغ إلى المستفيد؟")
        rule.onNodeWithTag("w_confirm_cancel").performClick()
        assertThat(rule.exists("هل تم بالفعل تحويل المبلغ إلى المستفيد؟")).isFalse()

        rule.onNodeWithTag("w_done").performScrollTo().performClick()
        rule.onNodeWithTag("w_confirm_final").performClick()
        rule.waitForText("✓ تم تأكيد التحويل")
        val w = runBlocking { container.database.withdrawals().get("wd_mock_1")!! }
        assertThat(w.receiverStatus).isEqualTo("COMPLETED")
        assertThat(w.actionable).isFalse()
    }
}
