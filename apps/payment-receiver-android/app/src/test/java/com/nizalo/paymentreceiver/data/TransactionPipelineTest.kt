package com.nizalo.paymentreceiver.data

import android.app.Application
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.common.truth.Truth.assertThat
import com.nizalo.paymentreceiver.AppContainer
import com.nizalo.paymentreceiver.FakeNetwork
import com.nizalo.paymentreceiver.Receipts
import com.nizalo.paymentreceiver.TestContainers
import com.nizalo.paymentreceiver.data.network.ApiError
import com.nizalo.paymentreceiver.data.network.ReportRequest
import com.nizalo.paymentreceiver.data.network.RetrofitReceiverApi
import com.nizalo.paymentreceiver.data.repo.IngestResult
import com.nizalo.paymentreceiver.domain.SyncStatus
import com.nizalo.paymentreceiver.domain.TransactionSource
import com.nizalo.paymentreceiver.domain.TransactionStatus
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

/**
 * Payment -> local DB -> API -> backend response, over real HTTP (MockWebServer)
 * through the real Retrofit client, with an in-memory Room database.
 */
@RunWith(AndroidJUnit4::class)
@Config(application = Application::class, sdk = [34])
class TransactionPipelineTest {
    private lateinit var server: MockWebServer
    private lateinit var network: FakeNetwork
    private lateinit var c: AppContainer

    @Before
    fun setUp() {
        server = MockWebServer().apply { start() }
        network = FakeNetwork()
        c = TestContainers.create(baseUrl = server.url("/").toString().trimEnd('/'), network = network)
    }

    @After
    fun tearDown() {
        server.shutdown()
        c.database.close()
    }

    private fun success(id: String = "lto_00000000-0000-0000-0000-000000000001", credited: Boolean = true, outcome: String = if (credited) "SUCCESS" else "NEEDS_REVIEW") =
        MockResponse().setResponseCode(200).setHeader("content-type", "application/json").setBody(
            """{"ok":true,"outcome":"$outcome","transaction":{"id":"$id","status":"${if (credited) "MATCHED" else "UNMATCHED"}","credited":$credited,"playerHandle":${if (credited) "\"alice\"" else "null"},"creditedAmountUsdtMinor":${if (credited) "\"10000000\"" else "null"},"reviewReason":${if (credited) "null" else "\"NO_MATCHING_INTENT\""}}}"""
        )

    private fun body(r: RecordedRequest): ReportRequest = RetrofitReceiverApi.json.decodeFromString(ReportRequest.serializer(), r.body.readUtf8())

    private fun ingest(text: String, sender: String? = "VF-Cash") = runBlocking {
        c.transactions.ingest(text, sender, System.currentTimeMillis(), TransactionSource.SMS)
    }

    private fun only() = runBlocking { c.database.transactions().all().first() }.single()

    @Test
    fun `a valid receipt is stored, sent with its idempotency key and sender, and confirmed by the backend`() = runBlocking {
        val stored = ingest(Receipts.vf()) as IngestResult.Stored
        assertThat(stored.transaction.status).isEqualTo(TransactionStatus.PENDING.name)

        server.enqueue(success())
        val report = c.transactions.syncPending()
        assertThat(report.sent).isEqualTo(1)

        val req = server.takeRequest(1, TimeUnit.SECONDS)!!
        assertThat(req.path).isEqualTo("/v1/payment-receiver/transactions")
        assertThat(req.getHeader("x-device-api-key")).isEqualTo("prk_test_token_0123456789abcdef")
        val sent = body(req)
        assertThat(sent.clientTransactionId).isEqualTo(stored.transaction.id)
        assertThat(sent.smsSender).isEqualTo("VF-Cash")
        assertThat(sent.rawMessage).isEqualTo(Receipts.vf())
        assertThat(sent.receivingNumberId).isEqualTo("vf_1")

        val t = c.database.transactions().get(stored.transaction.id)!!
        assertThat(t.status).isEqualTo(TransactionStatus.CONFIRMED.name)
        assertThat(t.syncStatus).isEqualTo(SyncStatus.SYNCED.name)
        assertThat(t.playerHandle).isEqualTo("alice")
        assertThat(c.database.syncQueue().allEntries()).isEmpty()
    }

    @Test
    fun `the same SMS delivered twice is one record`() {
        assertThat(ingest(Receipts.vf())).isInstanceOf(IngestResult.Stored::class.java)
        assertThat(ingest(Receipts.vf())).isInstanceOf(IngestResult.AlreadyReceived::class.java)
        // Same receipt re-rendered with Arabic-Indic digits and extra whitespace: still one record.
        assertThat(ingest(Receipts.vf().replace("500.00", "٥٠٠.٠٠") + "  ")).isInstanceOf(IngestResult.AlreadyReceived::class.java)
    }

    @Test
    fun `offline - the receipt waits in the queue and is sent when the internet returns`() = runBlocking {
        val stored = ingest(Receipts.vf()) as IngestResult.Stored
        network.online = false
        val offline = c.transactions.syncPending()
        assertThat(offline.stopReason).isEqualTo(ApiError.NoInternet)
        assertThat(server.requestCount).isEqualTo(0)
        assertThat(c.database.transactions().get(stored.transaction.id)!!.status).isEqualTo(TransactionStatus.PENDING.name)

        network.online = true
        server.enqueue(success())
        assertThat(c.transactions.syncPending().sent).isEqualTo(1)
        assertThat(c.database.transactions().get(stored.transaction.id)!!.status).isEqualTo(TransactionStatus.CONFIRMED.name)
    }

    @Test
    fun `a failed send is retried later with the SAME idempotency key, never a new one`() = runBlocking {
        val stored = ingest(Receipts.vf()) as IngestResult.Stored
        server.enqueue(MockResponse().setResponseCode(503))
        val first = c.transactions.syncPending()
        assertThat(first.failed).isEqualTo(1)

        val afterFailure = c.database.transactions().get(stored.transaction.id)!!
        assertThat(afterFailure.status).isEqualTo(TransactionStatus.PENDING.name)
        assertThat(afterFailure.syncAttempts).isEqualTo(1)
        val q = c.database.syncQueue().get(stored.transaction.id)!!
        assertThat(q.nextAttemptAt).isGreaterThan(System.currentTimeMillis())

        // Not yet due: the worker's normal run does not resend early.
        assertThat(c.transactions.syncPending(dueOnly = true).attempted).isEqualTo(0)

        server.enqueue(success(outcome = "ALREADY_PROCESSED"))
        c.transactions.makeAllDue()
        assertThat(c.transactions.syncPending().sent).isEqualTo(1)

        val keys = (1..2).map { body(server.takeRequest(1, TimeUnit.SECONDS)!!).clientTransactionId }
        assertThat(keys.distinct()).containsExactly(stored.transaction.id)
        assertThat(c.database.transactions().get(stored.transaction.id)!!.status).isEqualTo(TransactionStatus.CONFIRMED.name)
    }

    @Test
    fun `backend DUPLICATE is shown as a duplicate, never as a new credit`() = runBlocking {
        ingest(Receipts.vf())
        server.enqueue(success(credited = true, outcome = "DUPLICATE"))
        c.transactions.syncPending()
        assertThat(only().status).isEqualTo(TransactionStatus.DUPLICATE.name)
    }

    @Test
    fun `a receipt from a personal number is rejected on the phone and never sent`() = runBlocking {
        val r = ingest(Receipts.vf(), sender = "+201012345678") as IngestResult.Stored
        assertThat(r.transaction.status).isEqualTo(TransactionStatus.REJECTED.name)
        assertThat(r.transaction.syncStatus).isEqualTo(SyncStatus.NOT_SENT.name)
        c.transactions.syncPending(dueOnly = false)
        assertThat(server.requestCount).isEqualTo(0)
    }

    @Test
    fun `an unverified-format receipt is held for review until the operator sends it`() = runBlocking {
        val r = ingest(Receipts.ENGLISH_VF) as IngestResult.Stored
        assertThat(r.transaction.status).isEqualTo(TransactionStatus.NEEDS_REVIEW.name)
        c.transactions.syncPending(dueOnly = false)
        assertThat(server.requestCount).isEqualTo(0)

        assertThat(c.transactions.sendForReview(r.transaction.id)).isTrue()
        server.enqueue(success(credited = false))
        c.transactions.syncPending()
        assertThat(server.requestCount).isEqualTo(1)
        assertThat(c.database.transactions().get(r.transaction.id)!!.status).isEqualTo(TransactionStatus.NEEDS_REVIEW.name)
        assertThat(c.database.transactions().get(r.transaction.id)!!.syncStatus).isEqualTo(SyncStatus.SYNCED.name)
    }

    @Test
    fun `an invalid token stops sending and keeps every receipt queued`() = runBlocking {
        ingest(Receipts.vf(ref = "1"))
        ingest(Receipts.vf(ref = "2", balance = "10.00"))
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":{"code":"UNAUTHENTICATED"}}"""))
        val report = c.transactions.syncPending()
        assertThat(report.stopReason).isEqualTo(ApiError.Unauthorized)
        assertThat(server.requestCount).isEqualTo(1)
        assertThat(c.database.syncQueue().allEntries()).hasSize(2)
    }

    @Test
    fun `a report the backend refuses is marked failed and not retried automatically`() = runBlocking {
        val r = ingest(Receipts.vf()) as IngestResult.Stored
        server.enqueue(MockResponse().setResponseCode(422).setBody("""{"error":{"code":"INVALID_RECEIVING_NUMBER"}}"""))
        c.transactions.syncPending()
        val t = c.database.transactions().get(r.transaction.id)!!
        assertThat(t.status).isEqualTo(TransactionStatus.FAILED.name)
        assertThat(t.lastError).isEqualTo("INVALID_RECEIVING_NUMBER")
        assertThat(c.database.syncQueue().allEntries()).isEmpty()
    }

    @Test
    fun `Wi-Fi only - nothing is sent over mobile data`() = runBlocking {
        c.settings.save(c.settings.current().copy(wifiOnly = true))
        ingest(Receipts.vf())
        network.unmetered = false
        assertThat(c.transactions.syncPending().stopReason).isEqualTo(ApiError.WifiRequired)
        assertThat(server.requestCount).isEqualTo(0)
    }

    @Test
    fun `a disabled provider's receipts are not processed`() = runBlocking {
        c.settings.save(c.settings.current().copy(instapayEnabled = false))
        assertThat(ingest(Receipts.IPN, sender = "Mashreq")).isEqualTo(IngestResult.ProviderDisabled)
        assertThat(ingest(Receipts.vf())).isInstanceOf(IngestResult.Stored::class.java)
    }

    @Test
    fun `non-payment messages are never stored`() {
        assertThat(ingest("كود التحقق الخاص بك هو 482913")).isEqualTo(IngestResult.NotAReceipt)
        assertThat(runBlocking { c.database.transactions().all().first() }).isEmpty()
    }

    @Test
    fun `no receiving number configured - the receipt stays queued with a clear reason`() = runBlocking {
        c.settings.save(c.settings.current().copy(vodafoneNumberIds = emptySet()))
        val r = ingest(Receipts.vf()) as IngestResult.Stored
        val report = c.transactions.syncPending()
        assertThat(report.failureCodes).contains("NO_RECEIVING_NUMBER")
        assertThat(server.requestCount).isEqualTo(0)
        assertThat(c.database.transactions().get(r.transaction.id)!!.status).isEqualTo(TransactionStatus.PENDING.name)
    }

    @Test
    fun `a review decision made later by an admin is picked up`() = runBlocking {
        val r = ingest(Receipts.vf()) as IngestResult.Stored
        server.enqueue(success(credited = false))
        c.transactions.syncPending()
        assertThat(c.database.transactions().get(r.transaction.id)!!.status).isEqualTo(TransactionStatus.NEEDS_REVIEW.name)

        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                """{"ok":true,"transactions":[{"id":"lto_00000000-0000-0000-0000-000000000001","status":"MATCHED","credited":true,"playerHandle":"bob","creditedAmountUsdtMinor":"10000000"}]}"""
            )
        )
        c.transactions.refreshReviewStatuses()
        val t = c.database.transactions().get(r.transaction.id)!!
        assertThat(t.status).isEqualTo(TransactionStatus.CONFIRMED.name)
        assertThat(t.playerHandle).isEqualTo("bob")
    }
}
