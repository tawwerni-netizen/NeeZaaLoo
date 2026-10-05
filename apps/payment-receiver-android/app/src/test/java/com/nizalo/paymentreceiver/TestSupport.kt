package com.nizalo.paymentreceiver

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import com.nizalo.paymentreceiver.core.NetworkStatus
import com.nizalo.paymentreceiver.data.db.ReceiverDatabase
import com.nizalo.paymentreceiver.data.network.ReceiverApi
import com.nizalo.paymentreceiver.data.settings.Settings
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.security.SecretCipher
import com.nizalo.paymentreceiver.security.SecureStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import java.io.File
import java.util.Base64
import java.util.UUID

/** Stands in for the Android Keystore, which Robolectric does not provide. */
class ReversibleTestCipher : SecretCipher {
    override fun encrypt(plain: ByteArray): String = "enc:" + Base64.getEncoder().encodeToString(plain.reversedArray())
    override fun decrypt(encoded: String): ByteArray = Base64.getDecoder().decode(encoded.removePrefix("enc:")).reversedArray()
}

class FakeNetwork(var online: Boolean = true, var unmetered: Boolean = true) : NetworkStatus {
    override fun isOnline() = online
    override fun isUnmetered() = unmetered
}

object TestContainers {
    /**
     * A container backed by an in-memory database and a temp DataStore.
     * @param mock an in-process backend; when null, [baseUrl] and [token] point at a real HTTP server (MockWebServer).
     */
    fun create(
        mock: (() -> ReceiverApi)? = null,
        settings: Settings = Settings(
            vodafoneNumberIds = setOf("vf_1"), instapayNumberIds = setOf("instapay_1"),
            useMockBackend = mock != null,
        ),
        baseUrl: String = "",
        token: String? = "prk_test_token_0123456789abcdef",
        network: FakeNetwork = FakeNetwork(),
    ): AppContainer {
        val context: Context = ApplicationProvider.getApplicationContext()
        WorkManagerTestInitHelper.initializeTestWorkManager(
            context, Configuration.Builder().setExecutor(SynchronousExecutor()).build(),
        )
        val db = Room.inMemoryDatabaseBuilder(context, ReceiverDatabase::class.java).allowMainThreadQueries().build()
        val store = PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)) {
            File(context.filesDir, "test_settings_${UUID.randomUUID()}.preferences_pb")
        }
        val settingsRepo = SettingsRepository(store)
        runBlocking { settingsRepo.save(settings.copy(baseUrl = baseUrl.ifBlank { settings.baseUrl })) }
        val secure = SecureStore(context.getSharedPreferences("secure_${UUID.randomUUID()}", Context.MODE_PRIVATE), ReversibleTestCipher())
        if (token != null) secure.setToken(token)
        return AppContainer(context, db, settingsRepo, secure, network, mock)
    }
}

object Receipts {
    fun vf(amount: String = "500.00", phone: String = "01515339319", name: String = "أمنيه محمد شقره", ref: String? = "022857190374", balance: String = "3909.52") =
        buildString {
            append("تم استلام مبلغ $amount جنيه من رقم $phone المسجل بإسم $name على رقم محفظتك  01069999557.\n")
            append("رصيدك الحالي: $balance جنيه\n")
            append("تاريخ العملية: 21:50 26-08-19\n")
            if (ref != null) append("رقم العملية: $ref\n")
            append("تابع كل مصروفاتك من تاريخ المعاملات على أبلكيشن أنا فودافون http://vf.eg/vfcash")
        }

    const val IPN = "لقد استقبلت تحويل لحظي على  0540 بمبلغ 5,000.00 جم عبر IPN من محمد فريد احمد محمود يوم  28-02-2026 الساعة  16:50 رقم المعاملة 9def186b للمساعدة www.mashreq.com/mashreqipn"

    const val ENGLISH_VF = "You have received EGP 350.00 from 01012345678 in your Vodafone Cash wallet. Transaction ID: 0123456789"
}
