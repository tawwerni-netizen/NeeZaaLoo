package com.nizalo.paymentreceiver

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.nizalo.paymentreceiver.ui.AppRoot
import com.nizalo.paymentreceiver.ui.theme.ReceiverTheme

class MainActivity : ComponentActivity() {
    private val deepLinkWithdrawal = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Player names, phone numbers and amounts: kept out of screenshots and the recents thumbnail.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        deepLinkWithdrawal.value = intent?.getStringExtra(EXTRA_WITHDRAWAL_ID)

        val app = application as ReceiverApp
        setContent {
            val init by app.initState.collectAsState()
            ReceiverTheme {
                AppRoot(
                    initState = init,
                    containerProvider = { app.containerOrNull },
                    deepLinkWithdrawalId = deepLinkWithdrawal.value,
                    onDeepLinkConsumed = { deepLinkWithdrawal.value = null },
                    onRetryInit = { app.initialize() },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_WITHDRAWAL_ID)?.let { deepLinkWithdrawal.value = it }
    }

    companion object {
        const val EXTRA_WITHDRAWAL_ID = "withdrawal_id"
    }
}
