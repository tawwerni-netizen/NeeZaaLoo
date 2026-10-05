package com.nizalo.paymentreceiver.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.nizalo.paymentreceiver.AppContainer
import com.nizalo.paymentreceiver.InitState
import com.nizalo.paymentreceiver.R
import com.nizalo.paymentreceiver.ui.audit.AuditScreen
import com.nizalo.paymentreceiver.ui.audit.AuditViewModel
import com.nizalo.paymentreceiver.ui.components.ActionButton
import com.nizalo.paymentreceiver.ui.dashboard.DashboardNav
import com.nizalo.paymentreceiver.ui.dashboard.DashboardScreen
import com.nizalo.paymentreceiver.ui.dashboard.DashboardViewModel
import com.nizalo.paymentreceiver.ui.details.TransactionDetailsScreen
import com.nizalo.paymentreceiver.ui.details.TransactionDetailsViewModel
import com.nizalo.paymentreceiver.ui.history.HistoryScreen
import com.nizalo.paymentreceiver.ui.history.HistoryViewModel
import com.nizalo.paymentreceiver.ui.settings.SettingsScreen
import com.nizalo.paymentreceiver.ui.settings.SettingsViewModel
import com.nizalo.paymentreceiver.ui.testmode.TestModeScreen
import com.nizalo.paymentreceiver.ui.testmode.TestModeViewModel
import com.nizalo.paymentreceiver.ui.theme.Brand
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalDetailsScreen
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalDetailsViewModel
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalsScreen
import com.nizalo.paymentreceiver.ui.withdrawals.WithdrawalsViewModel
import kotlinx.coroutines.delay

object Routes {
    const val DASHBOARD = "dashboard"
    const val HISTORY = "history"
    const val TRANSACTION = "transaction/{id}"
    const val SETTINGS = "settings"
    const val TEST_MODE = "test"
    const val WITHDRAWALS = "withdrawals"
    const val WITHDRAWAL = "withdrawal/{id}"
    const val AUDIT = "audit"
    fun transaction(id: String) = "transaction/$id"
    fun withdrawal(id: String) = "withdrawal/$id"
}

@Composable
fun AppRoot(
    initState: InitState,
    containerProvider: () -> AppContainer?,
    deepLinkWithdrawalId: String?,
    onDeepLinkConsumed: () -> Unit,
    onRetryInit: () -> Unit,
) {
    // The branded splash stays up for a moment even when startup is instant,
    // so the operator always sees which app opened.
    var minimumShown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(700); minimumShown = true }

    when {
        initState is InitState.Failed -> InitErrorScreen(initState.reason, onRetryInit)
        initState is InitState.Starting || !minimumShown -> SplashScreen()
        else -> containerProvider()?.let { AppNavigation(it, deepLinkWithdrawalId, onDeepLinkConsumed) } ?: SplashScreen()
    }
}

@Composable
fun SplashScreen() {
    Column(
        Modifier.fillMaxSize().background(Brand.Ink).testTag("splash"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(painterResource(R.drawable.ic_nizalo_mark_on_dark), contentDescription = null, modifier = Modifier.size(88.dp))
        Spacer(Modifier.padding(10.dp))
        // Latin brand text reads left-to-right even inside the RTL layout.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Text(stringResource(R.string.brand_name), color = Brand.Paper, fontSize = 30.sp, fontWeight = FontWeight.Black, letterSpacing = 6.sp)
            Text(stringResource(R.string.brand_tagline), color = Brand.Signal, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp)
        }
        Spacer(Modifier.padding(18.dp))
        CircularProgressIndicator(Modifier.size(22.dp), color = Brand.Paper, strokeWidth = 2.dp)
        Text(stringResource(R.string.init_starting), color = Brand.Paper.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
    }
}

@Composable
fun InitErrorScreen(reason: String, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp).testTag("init_error"), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Image(painterResource(R.drawable.ic_nizalo_mark), contentDescription = null, modifier = Modifier.size(56.dp))
            Text(stringResource(R.string.init_failed_title), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
            Text(stringResource(R.string.init_failed_body), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
            Text(stringResource(R.string.init_failed_detail, reason), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            ActionButton(stringResource(R.string.retry), stringResource(R.string.retry), false, onRetry, Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun AppNavigation(c: AppContainer, deepLinkWithdrawalId: String?, onDeepLinkConsumed: () -> Unit) {
    val nav = rememberNavController()

    LaunchedEffect(deepLinkWithdrawalId) {
        if (deepLinkWithdrawalId != null) {
            nav.navigate(Routes.withdrawal(deepLinkWithdrawalId)) { launchSingleTop = true }
            onDeepLinkConsumed()
        }
    }

    NavHost(navController = nav, startDestination = Routes.DASHBOARD) {
        composable(Routes.DASHBOARD) {
            DashboardScreen(
                vm = viewModel { DashboardViewModel(c) },
                nav = DashboardNav(
                    openTransaction = { nav.navigate(Routes.transaction(it)) },
                    openHistory = { nav.navigate(Routes.HISTORY) },
                    openWithdrawals = { nav.navigate(Routes.WITHDRAWALS) },
                    openTestMode = { nav.navigate(Routes.TEST_MODE) },
                    openSettings = { nav.navigate(Routes.SETTINGS) },
                    openAudit = { nav.navigate(Routes.AUDIT) },
                ),
            )
        }
        composable(Routes.HISTORY) {
            HistoryScreen(viewModel { HistoryViewModel(c.transactions) }, onBack = { nav.popBackStack() }, onOpen = { nav.navigate(Routes.transaction(it)) })
        }
        composable(Routes.TRANSACTION, arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            TransactionDetailsScreen(viewModel(key = "tx_$id") { TransactionDetailsViewModel(c.transactions, id) }, onBack = { nav.popBackStack() })
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(viewModel { SettingsViewModel(c) }, onBack = { nav.popBackStack() })
        }
        composable(Routes.TEST_MODE) {
            TestModeScreen(viewModel { TestModeViewModel() }, onBack = { nav.popBackStack() })
        }
        composable(Routes.WITHDRAWALS) {
            WithdrawalsScreen(viewModel { WithdrawalsViewModel(c.withdrawals) }, onBack = { nav.popBackStack() }, onOpen = { nav.navigate(Routes.withdrawal(it)) })
        }
        composable(Routes.WITHDRAWAL, arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            val id = entry.arguments?.getString("id").orEmpty()
            WithdrawalDetailsScreen(viewModel(key = "w_$id") { WithdrawalDetailsViewModel(c.withdrawals, id) }, onBack = { nav.popBackStack() })
        }
        composable(Routes.AUDIT) {
            AuditScreen(viewModel { AuditViewModel(c.audit) }, onBack = { nav.popBackStack() })
        }
    }
}
