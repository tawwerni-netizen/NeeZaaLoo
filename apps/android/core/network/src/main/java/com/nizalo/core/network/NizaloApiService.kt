package com.nizalo.core.network

import com.nizalo.core.model.*
import com.nizalo.core.network.dto.*
import retrofit2.Response
import retrofit2.http.*

interface NizaloApiService {

    // Auth
    @POST("v1/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @POST("v1/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse> // We will assume AuthResponse can parse { playerId } by making token nullable

    @POST("v1/auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequest): Response<AuthResponse>

    @POST("v1/auth/step-up")
    suspend fun stepUp(@Body request: StepUpRequest): Response<StepUpResponse>

    @POST("v1/auth/logout")
    suspend fun logout(): Response<ApiResponse<Unit>>

    // Player & Progression
    @GET("v1/me")
    suspend fun getCurrentPlayer(): Response<ApiResponse<Player>>

    @GET("v1/me/progression")
    suspend fun getProgression(): Response<ApiResponse<GlobalSkillScore>>

    @GET("v1/me/challenges")
    suspend fun getDailyChallenges(): Response<ApiResponse<List<DailyChallenge>>>

    @POST("v1/me/challenges/{id}/claim")
    suspend fun claimChallenge(@Path("id") challengeId: String): Response<ApiResponse<Unit>>

    @GET("v1/me/streaks")
    suspend fun getStreakInfo(): Response<ApiResponse<StreakInfo>>

    // Duels
    @POST("v1/duels")
    suspend fun createDuel(@Body request: CreateDuelRequest): Response<ApiResponse<Duel>>

    @GET("v1/duels/{id}")
    suspend fun getDuel(@Path("id") duelId: String): Response<ApiResponse<Duel>>

    @GET("v1/duels/history")
    suspend fun getDuelHistory(): Response<ApiResponse<List<Duel>>>

    // Tournaments
    @GET("v1/tournaments")
    suspend fun getTournaments(): Response<ApiResponse<List<Tournament>>>

    @GET("v1/tournaments/{id}")
    suspend fun getTournament(@Path("id") id: String): Response<ApiResponse<Tournament>>

    @POST("v1/tournaments/{id}/register")
    suspend fun registerTournament(@Path("id") id: String): Response<ApiResponse<Unit>>

    // Leaderboard
    @GET("v1/leaderboard")
    suspend fun getLeaderboard(@Query("gameId") gameId: String? = null): Response<ApiResponse<List<LeaderboardEntry>>>

    // Wallet
    @GET("v1/players/{id}/wallet")
    suspend fun getWalletBalance(@Path("id") playerId: String): Response<WalletBalance>

    @POST("v1/players/{id}/deposits")
    suspend fun createDepositIntent(@Path("id") playerId: String, @Body request: CreateDepositIntentRequest): Response<DepositIntent>

    @POST("v1/players/{id}/withdrawals")
    suspend fun createWithdrawal(@Path("id") playerId: String, @Body request: CreateWithdrawalRequest): Response<WithdrawalRequest>

    @GET("v1/players/{id}/transactions")
    suspend fun getTransactions(@Path("id") playerId: String): Response<List<WalletTransaction>>

    // Legal & Policies
    @GET("v1/legal/policies")
    suspend fun getPolicies(@Query("locale") locale: String): Response<ApiResponse<List<LegalPolicy>>>

    @POST("v1/legal/consent")
    suspend fun submitConsent(@Body request: SubmitConsentRequest): Response<ApiResponse<Unit>>

    // Support
    @GET("v1/support/tickets")
    suspend fun getTickets(): Response<ApiResponse<List<SupportTicket>>>

    @POST("v1/support/tickets")
    suspend fun createTicket(@Body request: CreateTicketRequest): Response<ApiResponse<SupportTicket>>

    @POST("v1/support/tickets/{id}/reply")
    suspend fun replyTicket(@Path("id") id: String, @Body request: ReplyTicketRequest): Response<ApiResponse<SupportMessage>>

    // App Updater
    @GET("v1/app/check-update")
    suspend fun checkAppUpdate(@Query("currentVersionCode") currentVersionCode: Int): Response<ApiResponse<AppUpdateCheckResponse>>
}
