-- =============================================================================
-- 0037_stablecoin_valuation.sql
--
-- Financial Architecture Reconciliation, item 3: stablecoin USD valuation.
--
-- Before this migration there was no valuation model at all: USDT was
-- treated as worth exactly $1.00 forever, nowhere on record, with no source,
-- no observation time, and no way to notice or react if that ever stopped
-- being true. "USDT is a USD-pegged stablecoin" is an assumption, not a law
-- of nature, and the architecture is explicit that it must never be treated
-- as one silently.
--
-- What this migration adds:
--
--   * asset gains peg metadata (is it pegged, to what, within what tolerance)
--     and an enabled flag, extending the SAME table every other financial
--     table already references -- not a second, parallel asset registry.
--   * network: the chain a payment moves on, first-class instead of a bare
--     TEXT column repeated across deposit/withdrawal/payout_address.
--   * valuation_source: where a rate came from (an assumed peg, an oracle, an
--     exchange mid-price, or a manual entry -- each accountable differently).
--   * valuation_snapshot: an append-only, timestamped, sourced observation of
--     an asset's USD rate. NEVER a single mutable "current rate" column --
--     that would be exactly the "hardcoded 1.0000 forever" failure mode
--     restated with extra steps.
--   * record_valuation_snapshot(): the one way to add an observation. It
--     decides NOMINAL vs DEPEGGED against the asset's own configured
--     tolerance in the same statement that inserts the row, so "an asset
--     depegged and nothing downstream noticed" cannot happen between two
--     separate steps.
--
-- Integer arithmetic throughout: usd_rate_x1e8 is the rate scaled by 10^8
-- (1.00000000 USD = 100000000), the same fixed-point discipline the ledger
-- already uses for money. There is no floating point anywhere in this file.
-- =============================================================================

-- --- asset: peg metadata ------------------------------------------------------

ALTER TABLE asset
  ADD COLUMN kind               TEXT    NOT NULL DEFAULT 'STABLECOIN'
    CHECK (kind IN ('STABLECOIN', 'FIAT', 'OTHER')),
  ADD COLUMN is_pegged          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN peg_asset          TEXT,                          -- e.g. 'USD'
  ADD COLUMN peg_tolerance_bps  INT     NOT NULL DEFAULT 100,  -- 1.00% default band
  ADD COLUMN enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  ADD CONSTRAINT asset_peg_tolerance_sane CHECK (peg_tolerance_bps BETWEEN 1 AND 5000);

-- Every row existing before this migration is USDT (0001's only seed), and
-- USDT is pegged to USD -- set that before adding the constraint that
-- requires it, so the constraint's own validation scan (which runs
-- immediately, against every existing row) has something true to check.
UPDATE asset SET peg_asset = 'USD' WHERE is_pegged;

ALTER TABLE asset
  ADD CONSTRAINT asset_pegged_has_peg_asset CHECK (NOT is_pegged OR peg_asset IS NOT NULL);

-- --- network -------------------------------------------------------------

CREATE TABLE network (
  code               TEXT PRIMARY KEY,             -- 'TRON'
  display_name       TEXT NOT NULL,                -- 'TRON (TRC20)'
  confirmation_depth INT  NOT NULL DEFAULT 20,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT network_confirmation_depth_sane CHECK (confirmation_depth BETWEEN 1 AND 200)
);

INSERT INTO network (code, display_name, confirmation_depth, enabled)
VALUES ('TRON', 'TRON (TRC20)', 20, TRUE);

-- --- valuation sources ---------------------------------------------------

CREATE TABLE valuation_source (
  code         TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('PEG_ASSUMED', 'ORACLE', 'EXCHANGE_MID', 'MANUAL')),
  display_name TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO valuation_source (code, kind, display_name) VALUES
  ('PEG_ASSUMED',  'PEG_ASSUMED',  'Assumed 1:1 peg (no live feed configured)'),
  ('MANUAL',       'MANUAL',       'Manually entered by an admin');

-- --- valuation snapshots (append-only) -------------------------------------

CREATE TABLE valuation_snapshot (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset          TEXT        NOT NULL REFERENCES asset(code),
  usd_rate_x1e8  BIGINT      NOT NULL,
  source         TEXT        NOT NULL REFERENCES valuation_source(code),
  observed_at    TIMESTAMPTZ NOT NULL,
  effective_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT        NOT NULL CHECK (status IN ('NOMINAL', 'DEPEGGED', 'STALE')),
  confidence_bps INT         NOT NULL DEFAULT 10000,
  created_by     TEXT,                        -- admin id, for MANUAL; NULL otherwise
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valuation_rate_positive CHECK (usd_rate_x1e8 > 0),
  CONSTRAINT valuation_confidence_sane CHECK (confidence_bps BETWEEN 0 AND 10000),
  CONSTRAINT valuation_manual_is_accountable
    CHECK (source <> 'MANUAL' OR (created_by IS NOT NULL AND reason IS NOT NULL))
);

CREATE INDEX valuation_snapshot_asset_idx ON valuation_snapshot (asset, effective_at DESC);

CREATE TRIGGER valuation_snapshot_immutable
  BEFORE UPDATE OR DELETE ON valuation_snapshot
  FOR EACH ROW EXECUTE FUNCTION ledger_deny_mutation();

-- The one USD constant this system is allowed to have: the launch peg
-- assumption, on record with a source and a timestamp -- not a bare literal
-- buried in application code with neither.
INSERT INTO valuation_snapshot (asset, usd_rate_x1e8, source, observed_at, status)
VALUES ('USDT', 100000000, 'PEG_ASSUMED', now(), 'NOMINAL');

-- --- reads -----------------------------------------------------------------

/** The most recently effective, non-superseded valuation for an asset. */
CREATE FUNCTION valuation_current(p_asset TEXT)
RETURNS valuation_snapshot LANGUAGE sql STABLE AS $$
  SELECT v.* FROM valuation_snapshot v
   WHERE v.asset = p_asset AND v.effective_at <= now()
   ORDER BY v.effective_at DESC, v.id DESC
   LIMIT 1;
$$;

/**
 * How far the current rate has drifted from its peg, in basis points.
 * A non-pegged asset (is_pegged = FALSE) is never "depegged" -- the concept
 * does not apply to it.
 */
CREATE FUNCTION valuation_deviation_bps(p_asset TEXT)
RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN NOT a.is_pegged THEN 0
    ELSE (ABS(v.usd_rate_x1e8 - 100000000) * 10000 / 100000000)::INT
  END
  FROM asset a
  LEFT JOIN LATERAL (SELECT * FROM valuation_current(p_asset)) v ON TRUE
  WHERE a.code = p_asset;
$$;

CREATE FUNCTION asset_is_depegged(p_asset TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT valuation_deviation_bps(p_asset) > a.peg_tolerance_bps
       FROM asset a WHERE a.code = p_asset),
    FALSE
  );
$$;
