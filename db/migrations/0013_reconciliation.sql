-- =============================================================================
-- 0013_reconciliation.sql
--
-- Section 19 of the ledger spec, section 7 of the payment architecture doc:
-- reconciliation runs continuously at three levels (L1 internal, L2 provider,
-- L3 chain) plus a global solvency check, and any discrepancy produces
-- ALERT -> CASE -> REVIEW. Never a silent repair.
--
-- L1's comparison view (`ledger_balance_verification`) and the solvency view
-- (`ledger_solvency`) already existed (migration 0001) -- nothing has ever run
-- them on a schedule or turned a mismatch into anything a human could see.
-- This migration adds the two things that were missing: a record of each run
-- (so a run is idempotent, resumable, and observable rather than a fire-and-
-- forget script), and a case/event trail matching the SAME append-only
-- pattern already used for fair-play cases -- opened, reviewed, decided,
-- never silently closed by a repair.
-- =============================================================================

-- --- Runs ----------------------------------------------------------------

CREATE TYPE reconciliation_run_kind AS ENUM (
  'L1_LEDGER_DRIFT', 'SOLVENCY', 'STUCK_DEPOSITS', 'STUCK_WITHDRAWALS',
  'PROVIDER_DEPOSITS', 'PROVIDER_WITHDRAWALS', 'SETTLEMENT_SLA', 'PRIZE_SLA'
);

CREATE TYPE reconciliation_run_status AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED_ALREADY_RUNNING');

CREATE TABLE reconciliation_run (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind             reconciliation_run_kind   NOT NULL,
  status           reconciliation_run_status NOT NULL DEFAULT 'RUNNING',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  records_checked  INT NOT NULL DEFAULT 0,
  mismatches_found INT NOT NULL DEFAULT 0,
  cases_opened     INT NOT NULL DEFAULT 0,
  error            TEXT,
  CONSTRAINT reconciliation_run_finished_has_timestamp
    CHECK (status NOT IN ('COMPLETED', 'FAILED') OR completed_at IS NOT NULL),
  CONSTRAINT reconciliation_run_failed_has_error
    CHECK (status <> 'FAILED' OR error IS NOT NULL)
);

CREATE INDEX reconciliation_run_kind_idx ON reconciliation_run (kind, started_at DESC);

-- Only one run of a given kind may be RUNNING at a time. This is the ENTIRE
-- concurrency guard for the job runner: no advisory lock, no held
-- transaction spanning the run's actual work (which calls other services --
-- payments' verifyAndCredit/reconcile -- that open their OWN transactions;
-- holding this run inside one continuous transaction would self-deadlock
-- exactly the way the tx-calls-public-service pattern always does). A
-- second concurrent invocation's own INSERT simply finds this index already
-- satisfied and reports SKIPPED_ALREADY_RUNNING; the row it is skipping
-- around is the actual source of truth, not a lock held in memory anywhere.
CREATE UNIQUE INDEX reconciliation_run_one_running_per_kind
  ON reconciliation_run (kind) WHERE status = 'RUNNING';

-- --- Cases -----------------------------------------------------------------

CREATE TYPE reconciliation_case_category AS ENUM (
  'LEDGER_DRIFT', 'SOLVENCY_BREACH', 'PROVIDER_MISMATCH', 'AMOUNT_MISMATCH',
  'ASSET_MISMATCH', 'NETWORK_MISMATCH', 'DUPLICATE_EVENT',
  'STUCK_DEPOSIT', 'STUCK_WITHDRAWAL', 'SETTLEMENT_SLA_BREACH', 'PRIZE_SLA_BREACH', 'OTHER'
);

CREATE TYPE reconciliation_case_status AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'FALSE_POSITIVE');

CREATE TYPE reconciliation_severity AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE reconciliation_case (
  id              TEXT                          PRIMARY KEY,
  category        reconciliation_case_category  NOT NULL,
  severity        reconciliation_severity       NOT NULL,
  status          reconciliation_case_status    NOT NULL DEFAULT 'OPEN',
  -- What this case is ABOUT: 'deposit' | 'withdrawal' | 'duel' | 'tournament'
  -- | 'ledger_account' | 'platform'. Not a foreign key -- the subject can be
  -- any one of several tables, and a case must be able to outlive whatever
  -- inconsistency it names (including rows that turn out not to exist).
  subject_type    TEXT                          NOT NULL,
  subject_id      TEXT                          NOT NULL,
  detail          JSONB                         NOT NULL DEFAULT '{}'::jsonb,
  opened_at       TIMESTAMPTZ                   NOT NULL DEFAULT now(),
  resolved_by     TEXT                          REFERENCES admin_user(id),
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  resolution_note TEXT,

  -- A financial discrepancy is never closed without a human explaining it in
  -- writing -- the same "sanction requires a note" discipline fairplay_case
  -- already enforces, applied here to closing a reconciliation case instead
  -- of deciding a fair-play sanction.
  CONSTRAINT reconciliation_case_resolved_is_explained
    CHECK (status NOT IN ('RESOLVED', 'FALSE_POSITIVE')
           OR (resolved_by IS NOT NULL AND resolved_at IS NOT NULL
               AND length(btrim(COALESCE(resolution_note, ''))) > 0))
);

-- THE idempotency guarantee: re-detecting an already-flagged problem, on a
-- later run or a genuinely concurrent one, opens no second case. This is
-- what makes repeated and concurrent reconciliation runs safe by
-- construction rather than by careful scheduling -- a partial unique index,
-- not an advisory lock, is what actually prevents the duplicate (the
-- advisory lock used around a single run's execution, see the service,
-- prevents wasted duplicate WORK; this index is the one thing that would
-- still be correct even if that lock were bypassed entirely).
CREATE UNIQUE INDEX reconciliation_case_open_dedup
  ON reconciliation_case (category, subject_type, subject_id)
  WHERE status IN ('OPEN', 'UNDER_REVIEW');

CREATE INDEX reconciliation_case_status_idx ON reconciliation_case (status, opened_at DESC);
CREATE INDEX reconciliation_case_subject_idx ON reconciliation_case (subject_type, subject_id);

CREATE TABLE reconciliation_case_event (
  id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id    TEXT        NOT NULL REFERENCES reconciliation_case(id),
  event      TEXT        NOT NULL,
  actor_type TEXT        NOT NULL,
  actor_id   TEXT,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_case_event_actor_type_known CHECK (actor_type IN ('SYSTEM', 'ADMIN'))
);

CREATE TRIGGER reconciliation_case_event_immutable
  BEFORE UPDATE OR DELETE ON reconciliation_case_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX reconciliation_case_event_case_idx ON reconciliation_case_event (case_id, id);

-- --- The system actor for automated emergency actions -----------------------
--
-- The global solvency check is the one reconciliation finding severe enough
-- to act on automatically rather than only opening a case: both the ledger
-- spec and the payment architecture doc call it out by name as triggering an
-- "automatic withdrawal halt" (never a repair of any balance -- a halt is a
-- brake, not a correction). `platform_control.changed_by` has a hard foreign
-- key to `admin_user`, with no NULL-actor escape hatch the way
-- `ledger_transaction.actor_type = 'SYSTEM'` has -- so an automated halt needs
-- a real row to attribute itself to. This one exists ONLY for that
-- attribution: it is created already disabled, and no credential is ever
-- issued for it anywhere in the codebase, so it cannot authenticate through
-- any interactive admin path even if a future code path forgot to check
-- `disabled_at`.
INSERT INTO admin_user (id, email, display_name, mfa_enrolled, disabled_at)
VALUES ('system-automation', 'system-automation@internal.invalid', 'System Automation (reconciliation)', FALSE, now())
ON CONFLICT (id) DO NOTHING;
