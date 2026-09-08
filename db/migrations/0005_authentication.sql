-- =============================================================================
-- 0005_authentication.sql
--
-- Identity, sessions, 2FA, devices, and the security audit trail.
--
-- The design is built around one assumption from the threat model: the client
-- is hostile and the transport is observable. Therefore:
--
--   * no secret is ever stored in a form that is useful if the database leaks
--     (passwords are Argon2id, refresh tokens are SHA-256 hashes, recovery
--     codes are hashed, TOTP secrets are encrypted with a key held outside
--     the database);
--   * a stolen refresh token is DETECTABLE, because reuse of a rotated token
--     is structurally impossible to hide;
--   * every security-relevant act is written to an append-only log.
-- =============================================================================

-- --- Credentials -------------------------------------------------------------

CREATE TABLE credential (
  player_id       TEXT PRIMARY KEY REFERENCES player(id),
  -- The full PHC string: algorithm, version, parameters and salt travel with
  -- the hash, so parameters can be raised over time without a migration.
  password_hash   TEXT        NOT NULL,
  algorithm       TEXT        NOT NULL DEFAULT 'argon2id',
  -- When the password last changed. Withdrawals are frozen for a cooling-off
  -- window after this moves: an attacker who takes over an account should not
  -- be able to change the password and cash out in the same session.
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  must_change     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT credential_hash_is_phc CHECK (password_hash LIKE '$%$%'),
  CONSTRAINT credential_hash_not_plaintext CHECK (length(password_hash) >= 40)
);

-- --- Devices -----------------------------------------------------------------

CREATE TABLE device (
  id           TEXT PRIMARY KEY,
  player_id    TEXT        NOT NULL REFERENCES player(id),
  fingerprint  TEXT        NOT NULL,
  label        TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ,

  CONSTRAINT device_unique_per_player UNIQUE (player_id, fingerprint)
);

CREATE INDEX device_fingerprint_idx ON device (fingerprint);   -- multi-account graph

-- --- Sessions ----------------------------------------------------------------
--
-- One row per REFRESH TOKEN, not one row per login. Rotation appends a child
-- row and stamps the parent. A family is the chain from an original login.

CREATE TABLE auth_session (
  id             TEXT PRIMARY KEY,
  family_id      TEXT        NOT NULL,
  player_id      TEXT        NOT NULL REFERENCES player(id),
  device_id      TEXT        REFERENCES device(id),
  -- Only the hash. A database leak must not yield usable refresh tokens.
  refresh_hash   TEXT        NOT NULL UNIQUE,
  parent_id      TEXT        REFERENCES auth_session(id),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  rotated_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  revoked_reason TEXT,
  ip             TEXT,
  user_agent     TEXT,

  -- THE reuse-detection guarantee: a given refresh token can father at most
  -- one successor. Two concurrent refreshes with the same token cannot both
  -- mint a valid child -- one wins, the other is a constraint violation, and
  -- a constraint violation here means the token was replayed.
  CONSTRAINT auth_session_one_child_per_parent UNIQUE (parent_id),
  CONSTRAINT auth_session_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE INDEX auth_session_family_idx ON auth_session (family_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_session_player_idx ON auth_session (player_id, issued_at DESC);

/**
 * Kill an entire session family.
 *
 * Called on logout-everywhere, on password change, and -- critically -- when a
 * rotated refresh token is presented again. That last case means the token was
 * captured: we cannot tell the thief from the victim, so both are logged out
 * and the user re-authenticates. Losing a session is a small harm; leaving a
 * thief holding a valid chain is not.
 */
CREATE FUNCTION auth_revoke_family(p_family_id TEXT, p_reason TEXT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_n INT;
BEGIN
  UPDATE auth_session
     SET revoked_at = now(), revoked_reason = p_reason
   WHERE family_id = p_family_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- --- Two-factor (TOTP only) --------------------------------------------------
-- SMS is deliberately absent. SIM-swap is the documented attack against any
-- account that can authorise a withdrawal, so there is no column for a phone
-- number to be tempted into using.

CREATE TABLE totp_secret (
  player_id        TEXT PRIMARY KEY REFERENCES player(id),
  -- Envelope-encrypted with a key held in the secrets manager, never in the DB.
  secret_encrypted TEXT        NOT NULL,
  key_id           TEXT        NOT NULL,
  confirmed_at     TIMESTAMPTZ,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Replay guard: a TOTP code is valid for one step, and only once.
  last_used_step   BIGINT
);

CREATE TABLE recovery_code (
  player_id  TEXT        NOT NULL REFERENCES player(id),
  code_hash  TEXT        NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, code_hash)
);

-- --- Login throttling --------------------------------------------------------

CREATE TABLE login_attempt (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier  TEXT        NOT NULL,      -- handle or email, as supplied
  ip          TEXT,
  succeeded   BOOLEAN     NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX login_attempt_recent_idx ON login_attempt (identifier, at DESC);

/** Failures in the window. Drives progressive delay and lockout. */
CREATE FUNCTION auth_recent_failures(p_identifier TEXT, p_window INTERVAL DEFAULT INTERVAL '15 minutes')
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT count(*)::INT FROM login_attempt
   WHERE identifier = p_identifier AND succeeded = FALSE AND at > now() - p_window;
$$;

-- --- Security audit (append-only) -------------------------------------------

CREATE TABLE security_event (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id  TEXT REFERENCES player(id),
  type       TEXT        NOT NULL,
  detail     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip         TEXT,
  device_id  TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER security_event_immutable
  BEFORE UPDATE OR DELETE ON security_event
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX security_event_player_idx ON security_event (player_id, at DESC);
CREATE INDEX security_event_type_idx ON security_event (type, at DESC);

-- --- Cooling-off -------------------------------------------------------------

/**
 * Is this account inside a post-change freeze?
 *
 * Account takeover follows a fixed shape: get in, change the password or the
 * 2FA device, withdraw. Freezing withdrawals for a window after either change
 * breaks that chain and costs an honest user nothing they will notice.
 */
CREATE FUNCTION auth_in_cooling_off(
  p_player_id TEXT,
  p_window INTERVAL DEFAULT INTERVAL '24 hours'
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM credential c
     WHERE c.player_id = p_player_id AND c.changed_at > now() - p_window
  ) OR EXISTS (
    SELECT 1 FROM totp_secret t
     WHERE t.player_id = p_player_id AND t.changed_at > now() - p_window
  );
$$;
