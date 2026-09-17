package com.nizalo.core.network.dto

import com.nizalo.core.model.*
import kotlinx.serialization.Serializable

@Serializable
data class ApiResponse<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiError? = null
)

@Serializable
data class ApiError(
    val code: String,
    val message: String,
    val details: Map<String, String>? = null
)

@Serializable
data class LoginRequest(
    val identifier: String,
    val password: String,
    val totpCode: String? = null,
    val deviceFingerprint: String? = null
)

@Serializable
data class RegisterRequest(
    val handle: String,
    val email: String,
    val password: String,
    val referralCode: String? = null,
    val termsAccepted: Boolean,
    val locale: String = "en",
    val policyVersion: String = "1.0.0"
)

@Serializable
data class AuthResponse(
    val playerId: String,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresInSeconds: Long? = null
)

@Serializable
data class StepUpRequest(
    val action: String,
    val password: String,
    val totpCode: String? = null
)

@Serializable
data class StepUpResponse(
    val stepUpToken: String,
    val expiresInSeconds: Long? = null
)

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String
)

@Serializable
data class CreateDuelRequest(
    val gameId: String,
    val mode: String,
    val stakeUsdt: Double = 0.0,
    val difficulty: String? = null,
    val isCompetitive: Boolean = false
)

@Serializable
data class SubmitConsentRequest(
    val documentType: String,
    val documentVersion: String,
    val locale: String
)

@Serializable
data class CreateDepositIntentRequest(
    val network: String,
    val amountUsdt: Double? = null
)

@Serializable
data class CreateWithdrawalRequest(
    val amountUsdt: Double,
    val destinationAddress: String,
    val network: String,
    val totpCode: String
)

@Serializable
data class CreateTicketRequest(
    val category: String,
    val subject: String,
    val message: String
)

@Serializable
data class ReplyTicketRequest(
    val message: String
)

@Serializable
data class AppUpdateCheckResponse(
    val latestVersionCode: Int,
    val latestVersionName: String,
    val minSupportedVersionCode: Int,
    val apkUrl: String,
    val sha256Checksum: String,
    val releaseNotes: String,
    val isMandatory: Boolean
)
