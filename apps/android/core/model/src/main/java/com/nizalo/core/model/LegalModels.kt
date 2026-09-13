package com.nizalo.core.model

import kotlinx.serialization.Serializable

@Serializable
enum class LegalDocumentType(val slug: String, val title: String) {
    TERMS_AND_CONDITIONS("terms", "Terms & Conditions"),
    PRIVACY_POLICY("privacy", "Privacy Policy"),
    FAIR_PLAY("fair-play", "Fair Play & Anti-Cheat Policy"),
    PAYMENTS_POLICY("payments", "Payments & Withdrawals Policy"),
    REFERRAL_TERMS("referrals", "Referral Program Terms"),
    RESPONSIBLE_PLAY("responsible-play", "Responsible Play Policy"),
    COMMUNITY_RULES("community", "Community & Chat Rules"),
    COOKIE_POLICY("cookies", "Cookie Policy"),
    TOURNAMENT_RULES("tournament-rules", "Tournament Rules Framework")
}

@Serializable
data class LegalPolicy(
    val type: LegalDocumentType,
    val version: String,
    val title: String,
    val summary: String,
    val contentMarkdown: String,
    val requiresAcceptance: Boolean = false,
    val lastUpdatedIso: String
)

@Serializable
data class ConsentRecord(
    val documentType: LegalDocumentType,
    val documentVersion: String,
    val acceptedAtIso: String,
    val locale: String,
    val consentSource: String = "ANDROID_APP"
)
