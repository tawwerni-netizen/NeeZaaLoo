-- =============================================================================
-- 0038_payment_rail.sql
--
-- Financial Architecture Reconciliation, item 4: a data-driven payment rail
-- model, and the item 3 depeg circuit breaker that acts on it.
--
-- Before this migration, "USDT on TRON" was not a row anywhere -- it was an
-- assumption baked into payments.mjs's DEFAULTS (confirmationDepth: 20) and
-- into isValidTronAddress()'s hardcoded TRON regex. Turning a rail off meant
-- editing source and redeploying. A payment_rail row is the single place an
-- admin (or an automated depeg observation) can turn a specific asset/network
-- combination's deposits or withdrawals on or off, independently of each
-- other, without a deploy.
--
-- record_valuation_snapshot() (referencing this migration's payment_rail
-- table, hence living here rather than in 0037) is where blocker 3's
-- requirement actually bites: "if an asset depegs beyond the allowed
-- threshold, do NOT silently continue -- move the rail into a risk/paused
-- state according to configuration." The configuration in question is
-- payment_rail.pause_withdrawals_on_depeg: deposits always pause on a depeg
-- (accepting more of a currency that just lost its peg is never correct),
-- but whether withdrawals also pause is a deliberate per-rail admin choice,
-- not a hardcoded assumption either way.
-- =============================================================================

CREATE TYPE rail_status AS ENUM ('ACTIVE', 'RISK_PAUSED', 'ADMIN_PAUSED', 'RETIRED');

CREATE TABLE payment_rail (
  id                          TEXT PRIMARY KEY,        -- 'USDT_TRON'
  asset                       TEXT NOT NULL REFERENCES asset(code),
  network                     TEXT NOT NULL REFERENCES network(code),
  status                      rail_status NOT NULL DEFAULT 'ACTIVE',
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  deposits_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  withdrawals_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  min_deposit_minor           BIGINT  NOT NULL DEFAULT 5000000,   -- 5.000000
  max_deposit_minor           BIGINT,
  min_withdrawal_minor        BIGINT  NOT NULL DEFAULT 5000000,
  max_withdrawal_minor        BIGINT,
  confirmation_depth          INT     NOT NULL DEFAULT 20,
  -- Config, not a hardcoded assumption: does a depeg also pause withdrawals
  -- on this rail, or only new deposits? Defaults to leaving withdrawals open
  -- -- a depegging stablecoin is precisely when users most want their funds
  -- out, and the platform holds the underlying tokens one-for-one regardless
  -- of their USD price, so a payout remains fully funded either way.
  pause_withdrawals_on_depeg BOOLEAN NOT NULL DEFAULT FALSE,
  jurisdictions_allowed       JSONB   NOT NULL DEFAULT '["*"]'::jsonb,  -- ["*"] = everywhere
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_rail_unique UNIQUE (asset, network),
  CONSTRAINT payment_rail_deposit_bounds
    CHECK (max_deposit_minor IS NULL OR max_deposit_minor >= min_deposit_minor),
  CONSTRAINT payment_rail_withdrawal_bounds
    CHECK (max_withdrawal_minor IS NULL OR max_withdrawal_minor >= min_withdrawal_minor),
  CONSTRAINT payment_rail_confirmation_depth_sane CHECK (confirmation_depth BETWEEN 1 AND 200)
);

INSERT INTO payment_rail (id, asset, network, status, enabled, deposits_enabled, withdrawals_enabled, confirmation_depth)
VALUES ('USDT_TRON', 'USDT', 'TRON', 'ACTIVE', TRUE, TRUE, TRUE, 20);

-- Append-only, exactly like withdrawal_transition: every enable/disable is on
-- the record, with who did it and why, not just the current state.
CREATE TABLE rail_configuration_change (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rail_id    TEXT NOT NULL REFERENCES payment_rail(id),
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  actor_type TEXT NOT NULL,        -- SYSTEM | ADMIN
  actor_id   TEXT,
  reason     TEXT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rail_configuration_change_admin_is_accountable
    CHECK (actor_type <> 'ADMIN' OR (actor_id IS NOT NULL AND reason IS NOT NULL))
);

CREATE TRIGGER rail_configuration_change_immutable
  BEFORE UPDATE OR DELETE ON rail_configuration_change
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

CREATE INDEX rail_configuration_change_rail_idx ON rail_configuration_change (rail_id, id);

/**
 * Is this asset/network pair currently allowed to accept this operation?
 *
 * RISK_PAUSED is deliberately NOT treated as an automatic full stop here:
 * record_valuation_snapshot() already set deposits_enabled/withdrawals_enabled
 * to exactly what a depeg should block (deposits always; withdrawals only if
 * that rail's own pause_withdrawals_on_depeg says so), so gating on status
 * here too would silently override that per-operation decision and block
 * withdrawals during every depeg regardless of configuration -- exactly the
 * hardcoded-assumption failure mode this model exists to avoid. ADMIN_PAUSED
 * and RETIRED ARE full stops: an admin who pauses a rail, or retires it,
 * means both operations, unconditionally.
 */
CREATE FUNCTION rail_enabled_for(p_asset TEXT, p_network TEXT, p_operation TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT r.enabled AND r.status NOT IN ('ADMIN_PAUSED', 'RETIRED') AND (
       CASE p_operation
         WHEN 'DEPOSIT'    THEN r.deposits_enabled
         WHEN 'WITHDRAWAL' THEN r.withdrawals_enabled
         ELSE FALSE
       END)
       FROM payment_rail r WHERE r.asset = p_asset AND r.network = p_network),
    FALSE
  );
$$;

/** An admin flips a rail's status explicitly, audited, four-eyes optional here
 * (rail control is operational, not a two-admin financial rule change) but
 * always attributable when the actor is an admin. */
CREATE FUNCTION set_rail_status(
  p_rail_id TEXT, p_status rail_status, p_actor_type TEXT, p_actor_id TEXT, p_reason TEXT
) RETURNS payment_rail LANGUAGE plpgsql AS $$
DECLARE
  v_old rail_status;
  v_row payment_rail;
BEGIN
  SELECT status INTO v_old FROM payment_rail WHERE id = p_rail_id FOR UPDATE;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'no such rail: %', p_rail_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  UPDATE payment_rail SET status = p_status, updated_at = now()
   WHERE id = p_rail_id
   RETURNING * INTO v_row;

  INSERT INTO rail_configuration_change (rail_id, field, old_value, new_value, actor_type, actor_id, reason)
  VALUES (p_rail_id, 'status', v_old::text, p_status::text, p_actor_type, p_actor_id, p_reason);

  RETURN v_row;
END;
$$;

/**
 * Record an independent USD valuation observation for an asset. This is the
 * ONLY way a valuation_snapshot row is created (mirrors ledger_post() being
 * the only way money moves) -- so the depeg check below can never be
 * bypassed by an insert that goes straight to the table.
 *
 * Deposits always pause on a depeg for every ACTIVE rail on that asset;
 * whether withdrawals also pause is each rail's own
 * pause_withdrawals_on_depeg configuration. Already-paused rails are left
 * alone (the UPDATE's WHERE clause only matches status = 'ACTIVE'), which is
 * what makes two concurrent depeg observations for the same asset safe: at
 * most one of them actually transitions any given rail, and the other's
 * UPDATE simply matches zero rows.
 */
CREATE FUNCTION record_valuation_snapshot(
  p_asset          TEXT,
  p_usd_rate_x1e8  BIGINT,
  p_source         TEXT,
  p_observed_at    TIMESTAMPTZ,
  p_confidence_bps INT  DEFAULT 10000,
  p_created_by     TEXT DEFAULT NULL,
  p_reason         TEXT DEFAULT NULL
) RETURNS TABLE (snapshot_id BIGINT, status TEXT, deviation_bps INT, rails_paused INT)
LANGUAGE plpgsql AS $$
DECLARE
  v_tolerance INT;
  v_is_pegged BOOLEAN;
  v_deviation INT;
  v_status    TEXT;
  v_id        BIGINT;
  v_paused    INT := 0;
BEGIN
  IF p_usd_rate_x1e8 <= 0 THEN
    RAISE EXCEPTION 'usd_rate_x1e8 must be positive, got %', p_usd_rate_x1e8
      USING ERRCODE = 'check_violation';
  END IF;

  -- Locking the asset row serialises two concurrent observations for the
  -- SAME asset, so the "which one gets to pause the rail" question has a
  -- deterministic answer (whichever commits first) rather than a race.
  SELECT peg_tolerance_bps, is_pegged INTO v_tolerance, v_is_pegged
    FROM asset WHERE code = p_asset FOR UPDATE;
  IF v_tolerance IS NULL THEN
    RAISE EXCEPTION 'no such asset: %', p_asset USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_deviation := (ABS(p_usd_rate_x1e8 - 100000000) * 10000 / 100000000)::INT;
  v_status := CASE WHEN v_is_pegged AND v_deviation > v_tolerance THEN 'DEPEGGED' ELSE 'NOMINAL' END;

  INSERT INTO valuation_snapshot
    (asset, usd_rate_x1e8, source, observed_at, status, confidence_bps, created_by, reason)
  VALUES
    (p_asset, p_usd_rate_x1e8, p_source, p_observed_at, v_status, p_confidence_bps, p_created_by, p_reason)
  RETURNING id INTO v_id;

  IF v_status = 'DEPEGGED' THEN
    WITH paused AS (
      UPDATE payment_rail r
         SET status = 'RISK_PAUSED',
             deposits_enabled = FALSE,
             withdrawals_enabled =
               CASE WHEN r.pause_withdrawals_on_depeg THEN FALSE ELSE r.withdrawals_enabled END,
             updated_at = now()
       WHERE r.asset = p_asset AND r.status = 'ACTIVE'
       RETURNING r.id
    )
    INSERT INTO rail_configuration_change (rail_id, field, old_value, new_value, actor_type, actor_id, reason)
    SELECT paused.id, 'status', 'ACTIVE', 'RISK_PAUSED', 'SYSTEM', NULL,
           format('asset %s depegged %s bps beyond %s bps tolerance (valuation_snapshot %s)',
                  p_asset, v_deviation, v_tolerance, v_id)
      FROM paused;
    GET DIAGNOSTICS v_paused = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_id, v_status, v_deviation, v_paused;
END;
$$;
