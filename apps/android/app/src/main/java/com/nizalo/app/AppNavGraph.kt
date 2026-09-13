package com.nizalo.app

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.nizalo.feature.profile.*
import com.nizalo.feature.ranking.*
import com.nizalo.feature.support.*
import com.nizalo.feature.tournaments.*
import com.nizalo.feature.wallet.*

sealed class Screen(val route: String, val title: String, val icon: ImageVector? = null) {
    data object Login : Screen("login", "Sign In")
    data object Register : Screen("register", "Register")
    data object Home : Screen("home", "Home", Icons.Default.Home)
    data object Games : Screen("games", "Games", Icons.Default.SportsEsports)
    data object Tournaments : Screen("tournaments", "Tournaments", Icons.Default.EmojiEvents)
    data object Ranking : Screen("ranking", "Ranking", Icons.Default.Leaderboard)
    data object Wallet : Screen("wallet", "Wallet", Icons.Default.AccountBalanceWallet)
    data object Profile : Screen("profile", "Profile", Icons.Default.Person)
    data object Support : Screen("support", "Support", Icons.Default.Help)
    data object PlayArena : Screen("play_arena/{duelId}", "Play Arena")
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
        Screen.Profile
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
                            icon = { Icon(screen.icon!!, contentDescription = screen.title) },
                            label = { Text(screen.title) },
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
                    onLoginSuccess = { navController.navigate(Screen.Home.route) },
                    onNavigateToRegister = { navController.navigate(Screen.Register.route) },
                    onRequiresPolicyReacceptance = {}
                )
            }

            composable(Screen.Register.route) {
                RegisterScreen(
                    onRegisterSuccess = { navController.navigate(Screen.Home.route) },
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
                GameSelectionScreen(
                    onStartMatch = { game, mode, diff, stake ->
                        navController.navigate("play_arena/duel-${game.slug}")
                    }
                )
            }

            composable(Screen.Tournaments.route) {
                TournamentsScreen(
                    tournaments = listOf(
                        Tournament(
                            id = "t1",
                            title = "Weekly Speed Chess Championship",
                            gameId = GameId.CHESS,
                            format = TournamentFormat.SWISS,
                            entryFeeUsdt = 10.0,
                            prizePoolUsdt = 500.0,
                            currentParticipantsCount = 42,
                            maxParticipants = 64
                        ),
                        Tournament(
                            id = "t2",
                            title = "Dominoes Knockout Classic",
                            gameId = GameId.DOMINOES,
                            format = TournamentFormat.SINGLE_ELIMINATION,
                            entryFeeUsdt = 5.0,
                            prizePoolUsdt = 200.0,
                            currentParticipantsCount = 18,
                            maxParticipants = 32
                        )
                    ),
                    onRegisterTournament = {}
                )
            }

            composable(Screen.Ranking.route) {
                RankingScreen(
                    leaderboard = listOf(
                        LeaderboardEntry(1, Player("p1", "SultanOfChess", globalSkillScore = 2650, tier = PlayerTier.GRANDMASTER), 2650, 0.82, 142),
                        LeaderboardEntry(2, Player("p2", "DominoKing", globalSkillScore = 2510, tier = PlayerTier.GRANDMASTER), 2510, 0.78, 120),
                        LeaderboardEntry(3, Player("p3", "QuickMathsPro", globalSkillScore = 2430, tier = PlayerTier.GRANDMASTER), 2430, 0.75, 98),
                        LeaderboardEntry(4, Player("p4", "ReversiMaster", globalSkillScore = 2210, tier = PlayerTier.MASTER), 2210, 0.69, 85)
                    ),
                    myRankEntry = LeaderboardEntry(14, Player("me", "GrandmasterNizalo", globalSkillScore = 1840, tier = PlayerTier.DIAMOND), 1840, 0.64, 45)
                )
            }

            composable(Screen.Wallet.route) {
                WalletScreen(
                    balance = WalletBalance(availableUsdt = 125.50, lockedInDuelsUsdt = 10.0, totalBalanceUsdt = 135.50),
                    transactions = listOf(
                        WalletTransaction("tx1", TransactionType.DUEL_PRIZE_PAYOUT, 18.5, 0.0, null, TransactionStatus.COMPLETED, null, "Chess Duel Victory ($10 Stake)", System.currentTimeMillis() - 3600000),
                        WalletTransaction("tx2", TransactionType.DEPOSIT, 50.0, 0.0, CryptoNetwork.TRON_TRC20, TransactionStatus.COMPLETED, "0xabc123...", "USDT TRC-20 Deposit", System.currentTimeMillis() - 86400000)
                    ),
                    onRequestDepositIntent = {},
                    onRequestWithdrawal = { _, _, _, _ -> }
                )
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    player = Player("me", "GrandmasterNizalo", globalSkillScore = 1840, tier = PlayerTier.DIAMOND, referralCode = "NZ-KING-777", experiencePoints = 4850, level = 12),
                    gss = GlobalSkillScore(gssScore = 1840, tier = PlayerTier.DIAMOND, globalRank = 14, totalPlayers = 24000, percentile = 99.4),
                    streakInfo = StreakInfo(currentWinStreak = 4, longestWinStreak = 9, streakShieldsRemaining = 2),
                    challenges = listOf(
                        DailyChallenge("c1", "Tactical Victor", "Win 2 Chess or Checkers matches", GameId.CHESS, currentProgress = 2, targetProgress = 2, expReward = 150, isClaimed = false),
                        DailyChallenge("c2", "Speed Calculation", "Score 10 correct answers in Speed Math", GameId.SPEED_MATH, currentProgress = 6, targetProgress = 10, expReward = 100, isClaimed = false)
                    ),
                    antiPhishingPhrase = "SHIELD-NZ-2026",
                    onClaimChallenge = {},
                    onSetAntiPhishingPhrase = {},
                    onCopyReferralLink = {},
                    onLogout = { navController.navigate(Screen.Login.route) }
                )
            }

            composable(Screen.PlayArena.route) {
                val dummyPlayer1 = DuelParticipant(Player("p1", "GrandmasterNizalo", globalSkillScore = 1840, tier = PlayerTier.DIAMOND), seat = 1, timeRemainingMs = 180000)
                val dummyPlayer2 = DuelParticipant(Player("p2", "MagnusK", globalSkillScore = 1910, tier = PlayerTier.DIAMOND), seat = 2, timeRemainingMs = 172000)

                PlayArenaScreen(
                    duel = Duel(
                        id = "d1",
                        gameId = GameId.CHESS,
                        mode = MatchMode.RANDOM,
                        stakeUsdt = 10.0,
                        isCompetitive = true,
                        player1 = dummyPlayer1,
                        player2 = dummyPlayer2,
                        currentTurnSeat = 1,
                        status = DuelStatus.IN_PROGRESS
                    ),
                    isSpectator = false,
                    mySeat = 1,
                    onSendMove = { _, _ -> },
                    onLeaveMatch = { navController.popBackStack() },
                    onShareMatch = {}
                )
            }
        }
    }
}
