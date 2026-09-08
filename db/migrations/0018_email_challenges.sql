-- A single, purpose-bound challenge table shared by email verification,
-- the 6-character login code, and password reset (later slices) -- three
-- flows that are structurally identical (issue a short-lived, single-use,
-- attempt-limited secret; verify it) but must never be usable for each
-- other's purpose. `purpose` is an enum, not a free-text column, and every
-- read in packages/auth/src/email-challenge.mjs filters on it explicitly --
-- a token issued for VERIFICATION can never be looked up, let alone
-- accepted, by a query scoped to LOGIN_CODE or PASSWORD_RESET.
--
-- Only PASSWORD_RESET and LOGIN_CODE are declared here ahead of their own
-- slices (an enum cannot cheaply grow a value later without a migration of
-- its own in every Postgres version this project supports) -- the table and
-- code that uses it are still VERIFICATION-only until those slices land.

CREATE TYPE email_challenge_purpose AS ENUM ('VERIFICATION', 'LOGIN_CODE', 'PASSWORD_RESET');

CREATE TABLE email_challenge (
  id           TEXT                     PRIMARY KEY,
  player_id    TEXT                     NOT NULL REFERENCES player(id),
  purpose      email_challenge_purpose  NOT NULL,
  -- Snapshot of the address this challenge was actually sent to. If the
  -- player changes their email between issuing and verifying, this
  -- challenge stays scoped to the address it was issued for -- it does not
  -- silently re-target itself to whatever email is on file *now*.
  email        TEXT                     NOT NULL,
  -- SHA-256 of the code, never the code itself -- same reasoning as
  -- auth_session.refresh_hash (tokens.mjs's hashRefreshToken): this is a
  -- short-lived, single-use, attempt-limited random value, not a
  -- user-chosen secret, so a fast hash is correct and a slow one (Argon2)
  -- would only cost real users time for no real security gain.
  secret_hash  TEXT                     NOT NULL,
  attempts     INT                      NOT NULL DEFAULT 0,
  max_attempts INT                      NOT NULL DEFAULT 5,
  expires_at   TIMESTAMPTZ              NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ              NOT NULL DEFAULT now(),

  CONSTRAINT email_challenge_attempts_bounded CHECK (attempts <= max_attempts)
);

-- Serves both "is there already an active challenge for this player+purpose"
-- (resend cooldown, single-active-challenge invalidation) and "give me the
-- most recent one to verify against".
CREATE INDEX email_challenge_active_idx
  ON email_challenge (player_id, purpose, created_at DESC) WHERE used_at IS NULL;

-- Welcome-email idempotency, guarded the same way this codebase already
-- guards reconciliation_run (a partial unique index, not a held
-- transaction or an application-level check-then-act race): at most one
-- WELCOME_EMAIL_REQUESTED security_event per player, ever. A concurrent
-- duplicate request (a retried registration call, two tabs, a replayed
-- webhook-shaped retry) loses the INSERT as a clean unique-violation,
-- which packages/auth/src/welcome-email.mjs treats as "already handled",
-- never as a second email going out.
CREATE UNIQUE INDEX security_event_welcome_once
  ON security_event (player_id) WHERE type = 'WELCOME_EMAIL_REQUESTED';
