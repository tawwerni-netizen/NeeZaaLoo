package com.nizalo.app

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.nizalo.core.designsystem.*
import com.nizalo.core.model.*
import com.nizalo.feature.auth.*
import com.nizalo.feature.games.*
import com.nizalo.feature.home.*
import com.nizalo.feature.play.*
import androidx.compose.foundation.layout.*
import androidx.compose.ui.Alignment
import androidx.compose.material3.CircularProgressIndicator
import com.nizalo.feature.play.*
import com.nizalo.feature.profile.*
import com.nizalo.feature.ranking.*
import com.nizalo.feature.support.*
import com.nizalo.feature.tournaments.*
import com.nizalo.feature.wallet.*
import androidx.annotation.StringRes
import com.nizalo.app.R

sealed class Screen(val route: String, @StringRes val titleRes: Int, val icon: ImageVector? = null) {
    data object Login : Screen("login", R.string.app_name)
    data object Register : Screen("register", R.string.app_name)
    data object Home : Screen("home", R.string.nav_home, Icons.Default.Home)
    data object Games : Screen("games", R.string.nav_games, Icons.Default.Gamepad)
    data object Tournaments : Screen("tournaments", R.string.nav_tournaments, Icons.Default.EmojiEvents)
    data object Ranking : Screen("ranking", R.string.nav_ranking, Icons.Default.Leaderboard)
    data object Wallet : Screen("wallet", R.string.nav_wallet, Icons.Default.AccountBalanceWallet)
    data object Profile : Screen("profile", R.string.nav_profile, Icons.Default.Person)
    data object Social : Screen("social", R.string.nav_social, Icons.Default.ChatBubble)
    data object Settings : Screen("settings", R.string.app_name, Icons.Default.Settings)
    data object Support : Screen("support", R.string.app_name, Icons.Default.Info)
    data object PlayArena : Screen("play_arena/{duelId}", R.string.app_name)
    data object TournamentDetail : Screen("tournament_detail/{tournamentId}", R.string.app_name)
}

@Composable
fun NizaloApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val bottomNavItems = listOf(
        Screen.Home,
        Screen.Games,
        Screen.Tournaments,
        Screen.Ranking,
        Screen.Wallet,
        Screen.Profile,
        Screen.Social
    )

    val showBottomBar = bottomNavItems.any { it.route == currentRoute }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = SurfaceDark,
                    contentColor = TextPrimary
                ) {
                    bottomNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon!!, contentDescription = stringResource(id = screen.titleRes)) },
                            label = { Text(stringResource(id = screen.titleRes), fontSize = 10.sp) },
                            selected = currentRoute == screen.route,
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = GoldAccent,
                                selectedTextColor = GoldAccent,
                                indicatorColor = SurfaceElevated,
                                unselectedIconColor = TextSecondary,
                                unselectedTextColor = TextSecondary
                            ),
                            onClick = {
                                if (currentRoute != screen.route) {
                                    navController.navigate(screen.route) {
                                        popUpTo(Screen.Home.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            }
                        )
                    }
                }
            }
        },
        containerColor = ObsidianBg
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Login.route) {
                LoginScreen(
                    authState = AuthState.Idle,
                    onLoginClick = { _, _, _ -> navController.navigate(Screen.Home.route) },
                    onNavigateToRegister = { navController.navigate(Screen.Register.route) }
                )
            }

            composable(Screen.Register.route) {
                RegisterScreen(
                    authState = AuthState.Idle,
                    onRegisterClick = { _, _, _, _ -> navController.navigate(Screen.Home.route) },
                    onNavigateToLogin = { navController.navigate(Screen.Login.route) },
                    onViewPolicy = {}
                )
            }

            composable(Screen.Home.route) {
                HomeScreen(
                    player = Player("p1", "GrandmasterNizalo", globalSkillScore = 1840, tier = PlayerTier.DIAMOND, referralCode = "NZ-KING-777"),
                    streakInfo = StreakInfo(currentWinStreak = 4, streakShieldsRemaining = 2),
                    onSelectGame = { game ->
                        navController.navigate(Screen.Games.route)
                    },
                    onNavigateToTournaments = { navController.navigate(Screen.Tournaments.route) },
                    onNavigateToWallet = { navController.navigate(Screen.Wallet.route) },
                    onWatchLiveMatch = { duelId ->
                        navController.navigate("play_arena/$duelId")
                    }
                )
            }

            composable(Screen.Games.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val apiService = remember { com.nizalo.app.AppDependencies.getApiService(context) }
                val viewModel: MatchmakingViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            return MatchmakingViewModel(apiService) as T
                        }
                    }
                )
                val state by viewModel.state.collectAsState()

                Box(modifier = Modifier.fillMaxSize()) {
                    GameSelectionScreen(
                        onStartMatch = { game, mode, diff, stake ->
                            viewModel.enqueue(
                                gameId = game.slug,
                                mode = mode.name,
                                difficulty = diff?.name?.lowercase(),
                                tier = if (stake > 0) "CASH" else "FREE",
                                stakeMinor = if (stake > 0) (stake * 100).toLong().toString() else null,
                                timeProfile = null
                            )
                        }
                    )

                    if (state is MatchmakingState.Requesting || state is MatchmakingState.Queued || state is MatchmakingState.Error) {
                        MatchmakingOverlay(state = state, onCancel = { viewModel.cancel() })
                    }
                }

                LaunchedEffect(state) {
                    if (state is MatchmakingState.Matched) {
                        val duelId = (state as MatchmakingState.Matched).duelId
                        navController.navigate("play_arena/$duelId")
                        viewModel.reset()
                    }
                }
            }

            composable(Screen.Tournaments.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val tournamentsViewModel: TournamentsViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val apiService = AppDependencies.getApiService(context)
                            @Suppress("UNCHECKED_CAST")
                            return TournamentsViewModel(apiService) as T
                        }
                    }
                )
                TournamentsScreen(viewModel = tournamentsViewModel) { tournamentId ->
                    navController.navigate("tournament_detail/$tournamentId")
                }
            }

            composable("tournament_detail/{tournamentId}") { backStackEntry ->
                val tournamentId = backStackEntry.arguments?.getString("tournamentId") ?: ""
                val context = androidx.compose.ui.platform.LocalContext.current
                val detailViewModel: TournamentDetailViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val apiService = AppDependencies.getApiService(context)
                            @Suppress("UNCHECKED_CAST")
                            return TournamentDetailViewModel(apiService, tournamentId) as T
                        }
                    }
                )
                TournamentDetailScreen(
                    viewModel = detailViewModel,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Ranking.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val rankingViewModel: RankingViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val apiService = AppDependencies.getApiService(context)
                            @Suppress("UNCHECKED_CAST")
                            return RankingViewModel(apiService) as T
                        }
                    }
                )
                RankingScreen(viewModel = rankingViewModel, myPlayerId = null) // We can fetch myPlayerId from SecureStorage later if needed
            }

            composable(Screen.Wallet.route) {
                WalletScreen(
                    balance = WalletBalance(availableMinor = "125500000", lockedMinor = "10000000", withdrawableMinor = "135500000"),
                    transactions = listOf(
                        WalletTransaction("tx1", TransactionType.DUEL_PRIZE_PAYOUT, 18.5, 0.0, null, TransactionStatus.COMPLETED, null, "Chess Duel Victory ($10 Stake)", System.currentTimeMillis() - 3600000),
                        WalletTransaction("tx2", TransactionType.DEPOSIT, 50.0, 0.0, CryptoNetwork.TRON_TRC20, TransactionStatus.COMPLETED, "0xabc123...", "USDT TRC-20 Deposit", System.currentTimeMillis() - 86400000)
                    ),
                    onRequestDepositIntent = {},
                    onRequestWithdrawal = { _, _, _, _ -> }
                )
            }

            composable(Screen.Profile.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val profileViewModel: com.nizalo.feature.profile.ProfileViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val apiService = AppDependencies.getApiService(context)
                            val keyStore = com.nizalo.core.security.KeyStoreManager(context.applicationContext)
                            @Suppress("UNCHECKED_CAST")
                            return com.nizalo.feature.profile.ProfileViewModel(apiService, keyStore) as T
                        }
                    }
                )
                ProfileScreen(
                    viewModel = profileViewModel,
                    onCopyReferralLink = {},
                    onSupportClick = { navController.navigate(Screen.Support.route) },
                    onSettingsClick = { navController.navigate(Screen.Settings.route) },
                    onLogout = { navController.navigate(Screen.Login.route) }
                )
            }

            composable(Screen.Social.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val chatViewModel: com.nizalo.feature.social.ChatViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val wsClient = AppDependencies.getWsClient(context)
                            @Suppress("UNCHECKED_CAST")
                            return com.nizalo.feature.social.ChatViewModel(wsClient) as T
                        }
                    }
                )
                com.nizalo.feature.social.SocialTabsScreen(chatViewModel = chatViewModel)
            }

            composable(Screen.Settings.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val settingsViewModel: com.nizalo.feature.settings.SettingsViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val keyStore = com.nizalo.core.security.KeyStoreManager(context.applicationContext)
                            @Suppress("UNCHECKED_CAST")
                            return com.nizalo.feature.settings.SettingsViewModel(keyStore) as T
                        }
                    }
                )
                com.nizalo.feature.settings.SettingsScreen(
                    viewModel = settingsViewModel,
                    onBackClick = { navController.popBackStack() }
                )
            }

            composable(Screen.Support.route) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val supportViewModel: com.nizalo.feature.support.SupportViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            val apiService = AppDependencies.getApiService(context)
                            @Suppress("UNCHECKED_CAST")
                            return com.nizalo.feature.support.SupportViewModel(apiService) as T
                        }
                    }
                )
                SupportScreen(viewModel = supportViewModel)
            }

            composable(
                "play_arena/{duelId}",
                deepLinks = listOf(androidx.navigation.navDeepLink { uriPattern = "https://nizalo.com/play_arena/{duelId}" })
            ) { backStackEntry ->
                val duelId = backStackEntry.arguments?.getString("duelId") ?: return@composable
                
                val context = androidx.compose.ui.platform.LocalContext.current
                val wsClient = remember { com.nizalo.app.AppDependencies.getWsClient(context) }
                
                val playViewModel: PlayArenaViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                            return PlayArenaViewModel(wsClient, duelId) as T
                        }
                    }
                )
                val playState by playViewModel.state.collectAsState()

                if (playState is PlayArenaState.Active) {
                    val duel = (playState as PlayArenaState.Active).syncPayload.duel

                    PlayArenaScreen(
                        duel = duel,
                        isSpectator = false,
                        mySeat = 1, // To be determined by decoding the player ID
                        onSendMove = { actionType, payload -> playViewModel.sendMove(actionType, payload) },
                        onLeaveMatch = { navController.popBackStack() },
                        onShareMatch = {}
                    )
                } else {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = GoldAccent)
                    }
                }
            }
        }

        val stepUpManager = com.nizalo.core.network.NetworkModule.stepUpManager
        val context = androidx.compose.ui.platform.LocalContext.current
        val authViewModel: com.nizalo.feature.auth.AuthViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
            factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    val apiService = AppDependencies.getApiService(context)
                    val secureStorage = com.nizalo.core.security.KeyStoreManager(context.applicationContext)
                    @Suppress("UNCHECKED_CAST")
                    return com.nizalo.feature.auth.AuthViewModel(apiService, secureStorage) as T
                }
            }
        )
        com.nizalo.feature.auth.StepUpDialogRoute(
            stepUpManager = stepUpManager,
            viewModel = authViewModel
        )
    }
}
