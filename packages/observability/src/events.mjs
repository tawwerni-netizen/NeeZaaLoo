/**
 * The event name catalog.
 *
 * Every structured event this platform emits has its name here, as a
 * constant -- never a free-form string built ad hoc at the call site. This
 * is what makes "grep the codebase for every place X can happen" and "build
 * a dashboard panel for X" both possible without archaeology: a event name
 * that is not in this file is either a bug (a typo) or missing catalog
 * entry, and either way it should be fixed here, not tolerated at the call
 * site. Names are lowercase, dot-namespaced by domain, past-tense for
 * things that happened.
 */
export const Events = Object.freeze({
  AUTH: Object.freeze({
    REGISTERED: "auth.registered",
    LOGIN_SUCCESS: "auth.login.success",
    LOGIN_FAILURE: "auth.login.failure",
    LOCKED_OUT: "auth.locked_out",
    REFRESH_ROTATED: "auth.refresh.rotated",
    REFRESH_REUSE_DETECTED: "auth.refresh.reuse_detected",
    LOGOUT: "auth.logout",
    LOGOUT_EVERYWHERE: "auth.logout_everywhere",
    STEP_UP_ISSUED: "auth.step_up.issued",
    TOTP_ENROLLED: "auth.totp.enrolled",
  }),
  GAME: Object.freeze({
    CREATED: "game.created",
    STARTED: "game.started",
    MOVE_ACCEPTED: "game.move.accepted",
    MOVE_REJECTED: "game.move.rejected",
    COMPLETED: "game.completed",
    RESIGNED: "game.resigned",
    TIMED_OUT: "game.timed_out",
  }),
  MATCHMAKING: Object.freeze({
    ENQUEUED: "matchmaking.enqueued",
    ENQUEUE_REFUSED: "matchmaking.enqueue_refused",
    CANCELLED: "matchmaking.cancelled",
    PAIRED: "matchmaking.paired",
    STALE_EXPIRED: "matchmaking.stale_expired",
    UNKNOWN_GAME_POOL: "matchmaking.unknown_game_pool",
  }),
  REALTIME: Object.freeze({
    CONNECTED: "realtime.connected",
    DISCONNECTED: "realtime.disconnected",
    AUTHENTICATED: "realtime.authenticated",
    JOINED: "realtime.joined",
    RATE_LIMITED: "realtime.rate_limited",
    DEAD_CONNECTION_DROPPED: "realtime.dead_connection_dropped",
  }),
  LEASE: Object.freeze({
    ACQUIRED: "lease.acquired",
    HELD_BY_OTHER: "lease.held_by_other",
    RENEWED: "lease.renewed",
    LOST: "lease.lost",
    RELEASED: "lease.released",
    STALE_WRITE_REJECTED: "lease.stale_write_rejected",
  }),
  TOURNAMENT: Object.freeze({
    CREATED: "tournament.created",
    REGISTERED: "tournament.registered",
    REGISTRATION_REFUSED: "tournament.registration_refused",
    WITHDRAWN: "tournament.withdrawn",
    ROUND_STARTED: "tournament.round_started",
    ROUND_ADVANCED: "tournament.round_advanced",
    SETTLED: "tournament.settled",
  }),
  RATING: Object.freeze({
    UPDATED: "rating.updated",
    ESTABLISHED: "rating.established",
  }),
  WALLET: Object.freeze({
    LEDGER_POSTED: "wallet.ledger_posted",
    LEDGER_POST_REFUSED: "wallet.ledger_post_refused",
  }),
  DEPOSIT: Object.freeze({
    WEBHOOK_RECEIVED: "deposit.webhook_received",
    WEBHOOK_FORGED: "deposit.webhook_forged",
    DETECTED: "deposit.detected",
    QUARANTINED: "deposit.quarantined",
    CREDITED: "deposit.credited",
  }),
  WITHDRAWAL: Object.freeze({
    REQUESTED: "withdrawal.requested",
    REFUSED: "withdrawal.refused",
    AUTO_APPROVED: "withdrawal.auto_approved",
    QUEUED_FOR_REVIEW: "withdrawal.queued_for_review",
    APPROVED: "withdrawal.approved",
    PROCESSING: "withdrawal.processing",
    COMPLETED: "withdrawal.completed",
    REJECTED: "withdrawal.rejected",
  }),
  PAYMENT: Object.freeze({
    WEBHOOK_VERIFIED: "payment.webhook_verified",
    WEBHOOK_REJECTED: "payment.webhook_rejected",
  }),
  RISK: Object.freeze({
    CASE_OPENED: "risk.case_opened",
    CASE_CLOSED: "risk.case_closed",
    SCORE_COMPUTED: "risk.score_computed",
  }),
  FAIRPLAY: Object.freeze({
    SIGNAL_RECORDED: "fairplay.signal_recorded",
    CASE_OPENED: "fairplay.case_opened",
    HOLD_APPLIED: "fairplay.hold_applied",
    HOLD_RELEASED: "fairplay.hold_released",
  }),
  ADMIN: Object.freeze({
    ACTION_TAKEN: "admin.action_taken",
    APPROVAL_REQUESTED: "admin.approval_requested",
    APPROVAL_DECIDED: "admin.approval_decided",
    EMERGENCY_CONTROL_TOGGLED: "admin.emergency_control_toggled",
  }),
  WORKER: Object.freeze({
    TICK_STARTED: "worker.tick_started",
    TICK_COMPLETED: "worker.tick_completed",
    TICK_FAILED: "worker.tick_failed",
    JOB_RETRIED: "worker.job_retried",
  }),
  RECONCILIATION: Object.freeze({
    RUN_STARTED: "reconciliation.run_started",
    RUN_COMPLETED: "reconciliation.run_completed",
    MISMATCH_FOUND: "reconciliation.mismatch_found",
    CASE_OPENED: "reconciliation.case_opened",
  }),
  EVIDENCE: Object.freeze({
    CLEANUP_PURGED: "evidence.cleanup_purged",
  }),
  DB: Object.freeze({
    MIGRATIONS_APPLIED: "db.migrations_applied",
    MIGRATION_ERROR: "db.migration_error",
  }),
  API: Object.freeze({
    REQUEST_COMPLETED: "api.request_completed",
    REQUEST_FAILED: "api.request_failed",
  }),
  /** Emitted by instrument.mjs's generic wrapper, for ANY wrapped service. */
  SERVICE_CALL: Object.freeze({
    FAILED: "service_call.failed",
  }),
});

/** Flat set of every catalog value, for validating an emitted name at test time. */
export const ALL_EVENT_NAMES = new Set(
  Object.values(Events).flatMap((group) => Object.values(group))
);
