-- =============================================================================
-- 0046_evidence_lifecycle_and_replay_removal.sql
--
-- Implements the approved live-evidence retention rule: during an active
-- match, the full per-action log in `duel_event` stays because realtime,
-- reconnect, spectating AND the existing runReplayVerification() check
-- (0044) all need it. After completion, that detailed log is deleted --
-- except a CASH duel keeps it for the exact 24-hour window
-- runReplayVerification() itself sweeps by default (so the money check
-- always gets its full window before the evidence it depends on can be
-- purged), and any duel with a real fair-play signal or an open funds hold
-- against it is never purged at all (see reconcile.mjs's own
-- runEvidenceCleanup()). This migration makes both mechanics possible:
--
--  1. `duel_event_immutable` denied UPDATE and DELETE outright. The event
--     log must still never be silently EDITED (UPDATE stays denied), but a
--     bulk retention DELETE -- run only by runEvidenceCleanup(), never ad
--     hoc -- is now the one legitimate way rows in this table go away.
--  2. A new reconciliation_run_kind value for that sweep, the same
--     additive technique 0044 already used for REPLAY_VERIFICATION.
--  3. The Replay Center (packages/replay) is retired: a replay rebuilt any
--     completed match's full move list on demand, which is the direct
--     opposite of "delete detailed replayable data after completion".
--     Its two supporting tables are dropped.
--  4. The "watch a replay" daily challenge depended on replay_view, which
--     no longer exists. It is repointed at a different, already-durable
--     signal (a real rated match completed today) rather than removed
--     outright, so a player who had it assigned today does not simply
--     lose a challenge slot mid-day.
-- =============================================================================

DROP TRIGGER duel_event_immutable ON duel_event;
CREATE TRIGGER duel_event_immutable
  BEFORE UPDATE ON duel_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

ALTER TYPE reconciliation_run_kind ADD VALUE 'EVIDENCE_CLEANUP';

DROP TABLE player_replay_favorite;
DROP TABLE replay_view;

UPDATE daily_challenge_template
   SET code = 'PLAY_RATED_MATCH', metric = 'PLAY_RATED_MATCH'
 WHERE id = 'dct_watch_replay';
