package com.nizalo.paymentreceiver.domain

/**
 * Where a received payment stands, as the operator sees it.
 * The backend is the authority for CONFIRMED / NEEDS_REVIEW / DUPLICATE;
 * the phone never marks a payment CONFIRMED on its own.
 */
enum class TransactionStatus {
    /** Parsed and waiting to be sent. */
    PENDING,
    /** A send is in flight. */
    PROCESSING,
    /** Backend credited it to a player. */
    CONFIRMED,
    /** Recorded by the backend (or held on the phone) for a human to match. */
    NEEDS_REVIEW,
    /** Backend already had this receipt. */
    DUPLICATE,
    /** Refused: forged-looking sender, or the backend refused the report. */
    REJECTED,
    /** Could not be sent and will not be retried automatically (configuration or validation). */
    FAILED,
}

enum class SyncStatus {
    /** Held on the phone by design (needs review / rejected); never sent automatically. */
    NOT_SENT,
    PENDING,
    SYNCING,
    SYNCED,
    FAILED,
}

enum class TransactionSource { SMS, INBOX_SCAN, LEGACY_IMPORT }

/** The operator's view of a payout, mirroring the backend's receiverStatus. */
enum class WithdrawalStatus { PENDING, PROCESSING, COMPLETED, REJECTED, AWAITING_APPROVAL;

    companion object {
        fun from(raw: String?): WithdrawalStatus = entries.firstOrNull { it.name == raw } ?: AWAITING_APPROVAL
    }
}

enum class ConfirmState { IDLE, SENDING, FAILED }
