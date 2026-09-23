package com.nizalo.paymentreceiver

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore
import com.nizalo.paymentreceiver.core.NetworkMonitor
import com.nizalo.paymentreceiver.core.NetworkStatus
import com.nizalo.paymentreceiver.data.db.ReceiverDatabase
import com.nizalo.paymentreceiver.data.legacy.LegacyImporter
import com.nizalo.paymentreceiver.data.network.ReceiverApi
import com.nizalo.paymentreceiver.data.repo.ApiProvider
import com.nizalo.paymentreceiver.data.repo.AuditLog
import com.nizalo.paymentreceiver.data.repo.ConnectionRepository
import com.nizalo.paymentreceiver.data.repo.TransactionRepository
import com.nizalo.paymentreceiver.data.repo.WithdrawalRepository
import com.nizalo.paymentreceiver.data.settings.SettingsRepository
import com.nizalo.paymentreceiver.notifications.Notifier
import com.nizalo.paymentreceiver.security.KeystoreCipher
import com.nizalo.paymentreceiver.security.SecureStore
import com.nizalo.paymentreceiver.sms.InboxScanner
import com.nizalo.paymentreceiver.sync.WorkScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private val Context.settingsStore: DataStore<Preferences> by preferencesDataStore(name = "receiver_settings")

/**
 * Manual dependency wiring: one instance of each service for the process.
 * The constructor is what tests use to inject an in-memory database and a
 * fake API; [production] is what the app uses.
 */
class AppContainer(
    val context: Context,
    val database: ReceiverDatabase,
    val settings: SettingsRepository,
    val secureStore: SecureStore,
    val network: NetworkStatus,
    mockApiFactory: (() -> ReceiverApi)?,
) {
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val audit = AuditLog(database.audit(), settings)
    val apiProvider = ApiProvider(settings, secureStore, network::isOnline, mockApiFactory)
    val scheduler = WorkScheduler(context, wifiOnly = { settings.current().wifiOnly }, nextDueAt = { transactions.nextDueAt() })
    val transactions: TransactionRepository = TransactionRepository(
        transactions = database.transactions(),
        queue = database.syncQueue(),
        settings = settings,
        apiProvider = apiProvider,
        network = network,
        audit = audit,
        scheduleSync = { appScope.launch { runCatching { scheduler.syncSoon() } } },
    )
    val withdrawals = WithdrawalRepository(database.withdrawals(), apiProvider, audit)
    val connection = ConnectionRepository(apiProvider, audit)
    val notifier = Notifier(context, settings)
    val inboxScanner = InboxScanner(context, transactions, settings)
    val legacyImporter = LegacyImporter(context, transactions, settings, secureStore, audit)

    companion object {
        fun production(context: Context): AppContainer {
            val app = context.applicationContext
            val secureStore = SecureStore(app.getSharedPreferences("secure_store", Context.MODE_PRIVATE), KeystoreCipher())
            return AppContainer(
                context = app,
                database = ReceiverDatabase.encrypted(app, secureStore.databasePassphrase()),
                settings = SettingsRepository(app.settingsStore),
                secureStore = secureStore,
                network = NetworkMonitor(app),
                mockApiFactory = MockBackend.factory(),
            )
        }
    }
}
