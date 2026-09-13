package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class SupportCategory(val displayName: String) {
    ACCOUNT("Account & Login"),
    GAMES("Games & Gameplay"),
    MATCHMAKING("Matchmaking & Disconnections"),
    TOURNAMENTS("Tournaments"),
    WALLET_DEPOSITS("Deposits & USDT"),
    WALLET_WITHDRAWALS("Withdrawals & Settlement"),
    SECURITY_FAIRPLAY("Security & Fair Play"),
    REFERRALS("Referrals & Rewards"),
    OTHER("Other")
}

@Serializable
enum class TicketStatus {
    OPEN,
    ANSWERED,
    RESOLVED,
    CLOSED
}

@Serializable
data class SupportMessage(
    val id: String,
    val senderId: String,
    val isStaff: Boolean,
    val senderName: String,
    val message: String,
    val timestampMs: Long = System.currentTimeMillis()
)

@Serializable
data class SupportTicket(
    val id: String,
    val category: SupportCategory,
    val subject: String,
    val status: TicketStatus = TicketStatus.OPEN,
    val messages: List<SupportMessage> = emptyList(),
    val createdAtMs: Long = System.currentTimeMillis(),
    val updatedAtMs: Long = System.currentTimeMillis()
)
