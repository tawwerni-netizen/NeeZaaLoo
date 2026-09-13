package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
data class WalletBalance(
    val availableUsdt: Double = 0.0,
    val lockedInDuelsUsdt: Double = 0.0,
    val lockedInTournamentsUsdt: Double = 0.0,
    val totalPendingDepositUsdt: Double = 0.0,
    val totalPendingWithdrawalUsdt: Double = 0.0,
    val totalBalanceUsdt: Double = 0.0
)

@Serializable
enum class CryptoNetwork(val networkName: String, val feeUsdt: Double, val minDepositUsdt: Double) {
    TRON_TRC20("Tron (TRC-20)", 1.0, 5.0),
    SOLANA("Solana (SPL)", 0.5, 5.0),
    POLYGON("Polygon (PoS)", 0.8, 5.0),
    ETHEREUM_ERC20("Ethereum (ERC-20)", 5.0, 20.0),
    BSC_BEP20("BNB Smart Chain (BEP-20)", 0.8, 5.0)
}

@Serializable
enum class TransactionStatus {
    PENDING,
    CONFIRMING,
    COMPLETED,
    FAILED,
    REJECTED,
    CANCELLED
}

@Serializable
data class DepositIntent(
    val id: String,
    val network: CryptoNetwork,
    val depositAddress: String,
    val qrCodePayload: String,
    val minimumDepositUsdt: Double = 5.0,
    val expectedAmountUsdt: Double? = null,
    val expiresAtMs: Long,
    val status: TransactionStatus = TransactionStatus.PENDING,
    val txHash: String? = null,
    val confirmations: Int = 0,
    val requiredConfirmations: Int = 12
)

@Serializable
data class WithdrawalRequest(
    val id: String,
    val amountUsdt: Double,
    val feeUsdt: Double,
    val destinationAddress: String,
    val network: CryptoNetwork,
    val status: TransactionStatus = TransactionStatus.PENDING,
    val txHash: String? = null,
    val createdAtMs: Long = System.currentTimeMillis()
)

@Serializable
data class WalletTransaction(
    val id: String,
    val type: TransactionType,
    val amountUsdt: Double,
    val feeUsdt: Double = 0.0,
    val network: CryptoNetwork? = null,
    val status: TransactionStatus,
    val txHash: String? = null,
    val description: String,
    val createdAtMs: Long
)

@Serializable
enum class TransactionType {
    DEPOSIT,
    WITHDRAWAL,
    DUEL_ENTRY_FEE,
    DUEL_PRIZE_PAYOUT,
    TOURNAMENT_ENTRY_FEE,
    TOURNAMENT_PRIZE_PAYOUT,
    REFERRAL_REWARD
}
