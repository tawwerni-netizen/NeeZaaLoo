package com.nizalo.paymentreceiver.data

import android.app.Application
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.common.truth.Truth.assertThat
import com.nizalo.paymentreceiver.AppContainer
import com.nizalo.paymentreceiver.TestContainers
import com.nizalo.paymentreceiver.data.network.ConfirmRequest
import com.nizalo.paymentreceiver.data.network.RetrofitReceiverApi
import com.nizalo.paymentreceiver.data.repo.ConfirmResult
import com.nizalo.paymentreceiver.data.repo.RefreshResult
import com.nizalo.paymentreceiver.domain.ConfirmState
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger

/**
 * Withdrawal -> confirm -> backend, over real HTTP. The fake server below
 * behaves like device_confirm_local_withdrawal(): one debit per payout,
 * ALREADY_PROCESSED for any repeat.
 */
@RunWith(AndroidJUnit4::class)
@Config(application = Application::class, sdk = [34])
class WithdrawalFlowTest {
    private lateinit var server: MockWebServer
    private lateinit var c: AppContainer
    private val debits = AtomicInteger(0)
    private val keysSeen = Collections.synchronizedList(mutableListOf<String>())
    @Volatile private var failNextConfirm = false
    @Volatile private var completed = false

    private val pending = """{"id":"wd_1","playerHandle":"alice","network":"VODAFONE_CASH","destination":"01033334444","amountMinor":"10000000","amountEgpMinor":"50000","amountEgpToSend":"500","status":"APPROVED","receiverStatus":"PENDING","actionable":true,"requestedAt":"2026-09-23T10:00:00Z"}"""
    private val done = """{"id":"wd_1","playerHandle":"alice","network":"VODAFONE_CASH","destination":"01033334444","amountMinor":"10000000","amountEgpMinor":"50000","amountEgpToSend":"500","status":"COMPLETED","receiverStatus":"COMPLETED","actionable":false,"requestedAt":"2026-09-23T10:00:00Z","completedAt":"2026-09-23T10:05:00Z","reference":"PRD-wd_1"}"""

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path ?: ""
                return when {
                    path == "/v1/payment-receiver/withdrawals" ->
                        json("""{"ok":true,"withdrawals":[${if (completed) "" else pending}]}""")
                    path == "/v1/payment-receiver/withdrawals/wd_1" ->
                        json("""{"ok":true,"withdrawal":${if (completed) done else pending}}""")
                    path == "/v1/payment-receiver/withdrawals/wd_1/confirm" -> synchronized(this) {
                        val req = RetrofitReceiverApi.json.decodeFromString(ConfirmRequest.serializer(), request.body.readUtf8())
                        keysSeen += req.idempotencyKey
                        if (failNextConfirm) {
                            failNextConfirm = false
                            // The backend committed the debit, but the response never arrived.
                            completed = true
                            debits.incrementAndGet()
                            return MockResponse().setResponseCode(504)
                        }
                        val outcome = if (completed) "ALREADY_PROCESSED" else { completed = true; debits.incrementAndGet(); "COMPLETED" }
                        json("""{"ok":true,"outcome":"$outcome","withdrawal":$done}""")
                    }
                    else -> MockResponse().setResponseCode(404).setBody("""{"error":{"code":"NOT_FOUND"}}""")
                }
            }
        }
        server.start()
        c = TestContainers.create(baseUrl = server.url("/").toString().trimEnd('/'))
    }

    @After
    fun tearDown() {
        server.shutdown()
        c.database.close()
    }

    private fun json(body: String) = MockResponse().setResponseCode(200).setHeader("content-type", "application/json").setBody(body)

    @Test
    fun `refresh lists new payouts once, with the amount to send in pounds`() = runBlocking {
        val first = c.withdrawals.refresh() as RefreshResult.Ok
        assertThat(first.newlyArrived.map { it.id }).containsExactly("wd_1")
        val w = c.database.withdrawals().get("wd_1")!!
        assertThat(w.amountEgpToSend).isEqualTo("500")
        assertThat(w.actionable).isTrue()

        val second = c.withdrawals.refresh() as RefreshResult.Ok
        assertThat(second.newlyArrived).isEmpty()
    }

    @Test
    fun `confirm completes the payout through the backend, never locally`() = runBlocking {
        c.withdrawals.refresh()
        val r = c.withdrawals.confirm("wd_1", reference = "VF-123")
        assertThat(r).isInstanceOf(ConfirmResult.Completed::class.java)
        val w = c.database.withdrawals().get("wd_1")!!
        assertThat(w.receiverStatus).isEqualTo("COMPLETED")
        assertThat(w.actionable).isFalse()
        assertThat(debits.get()).isEqualTo(1)
    }

    @Test
    fun `a double tap sends at most one debit`() = runBlocking {
        c.withdrawals.refresh()
        val results = (1..4).map { async { c.withdrawals.confirm("wd_1", null) } }.awaitAll()
        assertThat(debits.get()).isEqualTo(1)
        assertThat(results.count { it is ConfirmResult.Completed }).isEqualTo(1)
        // The repository serializes confirmations; once complete, the rest never reach the backend.
        assertThat(results.filterIsInstance<ConfirmResult.NotActionable>()).hasSize(3)
    }

    @Test
    fun `a lost response is retried with the same key and reported as already processed`() = runBlocking {
        c.withdrawals.refresh()
        failNextConfirm = true
        val first = c.withdrawals.confirm("wd_1", null)
        assertThat(first).isInstanceOf(ConfirmResult.Failed::class.java)
        val afterFailure = c.database.withdrawals().get("wd_1")!!
        assertThat(afterFailure.confirmState).isEqualTo(ConfirmState.FAILED.name)
        assertThat(afterFailure.pendingConfirmKey).isNotNull()
        assertThat(afterFailure.actionable).isTrue() // the phone does not guess; it still waits for the backend

        val retry = c.withdrawals.confirm("wd_1", null)
        assertThat(retry).isInstanceOf(ConfirmResult.AlreadyProcessed::class.java)
        assertThat(keysSeen.distinct()).hasSize(1)
        assertThat(debits.get()).isEqualTo(1)
    }

    @Test
    fun `a payout completed elsewhere drops out of the actionable list on refresh`() = runBlocking {
        c.withdrawals.refresh()
        completed = true
        c.withdrawals.refresh()
        val w = c.database.withdrawals().get("wd_1")!!
        assertThat(w.actionable).isFalse()
        assertThat(w.receiverStatus).isEqualTo("COMPLETED")
    }
}
