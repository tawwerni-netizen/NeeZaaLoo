-- =============================================================================
-- 0044_replay_mismatch_category.sql
--
-- Security review finding F-11: packages/duel-engine/src/duel.mjs's own
-- verifyReplay() -- built precisely to catch "the recorded result disagrees
-- with what the game's own rules derive from replaying its moves" -- was
-- wired into no production code path. settlementLegs() pays out whoever
-- duel.result names, and duel.result comes from a game plugin's evaluate();
-- a plugin bug (or a compromised plugin release) decided real-money payouts
-- with no independent check ever running, before or after settlement.
--
-- This adds the case category, and the matching reconciliation_run_kind
-- value withRun() stamps on every run of the new check, that
-- runReplayVerification() (packages/reconciliation/src/reconcile.mjs) uses
-- to report a mismatch. Adding bare enum values is sufficient here (no
-- CHECK constraint or index anywhere references a literal value of either
-- enum -- confirmed by grep across every migration), so this is the same
-- lightweight technique used for payment_rail.status's own EMERGENCY_HOLD
-- addition (0041), simpler than the full convert-to-TEXT-and-back rebuild
-- older migrations needed.
-- =============================================================================

ALTER TYPE reconciliation_case_category ADD VALUE 'REPLAY_MISMATCH';
ALTER TYPE reconciliation_run_kind ADD VALUE 'REPLAY_VERIFICATION';
