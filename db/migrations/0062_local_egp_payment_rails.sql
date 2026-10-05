-- =============================================================================
-- 0062_local_egp_payment_rails.sql
--
-- Vodafone Cash and InstaPay: two EGP mobile-money rails, reconciled by a
-- private Android app (packages/payment-receiver-android, not distributed
-- to players) that reads the operator's own phone for incoming transfer
-- SMS/notifications and reports them here.
--
-- The one architectural decision this whole migration exists to enforce:
-- EGP never becomes a balance a player holds. It is a number that gets
-- converted to a USDT credit at the moment a deposit is confirmed, using
-- whatever rate is active at that instant (valuation_snapshot, exactly the
-- same append-only, sourced, audited mechanism 0037 already built for
-- stablecoin USD rates -- MANUAL source here, since the operator sets the
-- EGP/USD rate from the admin panel; an automated feed can be added later
-- as a second source without touching this schema at all). A player's
-- wallet is asset='USDT' before, during, and after a Vodafone Cash deposit
-- -- there is no second currency to reconcile against the first, because
-- there is only ever one currency in the ledger.
--
-- Withdrawals reuse the EXISTING withdrawal/payment_rail machinery
-- wholesale (funds locking, admin approval, four-eyes, audit trail) rather
-- than inventing a parallel table: VODAFONE_CASH and INSTAPAY are
-- registered as ordinary networks under asset='USDT', same as TRON is for
-- crypto. The only real difference is fulfillment -- there is no on-chain
-- broadcast to verify, so an admin manually sends the EGP and attests to
-- it (complete_manual_withdrawal() below), instead of payments.mjs's
-- automated provider.createPayout()/chain-verified reconcile() path.
--
-- What is genuinely new here is the DEPOSIT side, because there is no
-- blockchain to independently verify a Vodafone Cash/InstaPay transfer
-- against -- the operator's own phone IS the source of truth. The design
-- this migration encodes: a player declares a deposit intent FIRST (their
-- own name, their own sending number, the amount, which of the operator's
-- receiving numbers they're sending to) -- local_deposit_intent. The
-- Android app reports every transfer it actually observed, unconditionally
-- -- local_transfer_observed. A transfer is matched to an intent only on
-- sender name + sending number + amount + a tight time window; a clean
-- match auto-credits, anything ambiguous is left UNMATCHED for the
-- operator to resolve by hand in the app. This is the same "never credit
-- on an unverified claim alone" principle payments.mjs's own header
-- already states for OxaPay deposits, applied to a rail that has no chain
-- to check against.
-- =============================================================================

-- --- EGP: a rate to convert from, never a balance to hold ---------------------

INSERT INTO asset (code, minor_units, kind, is_pegged, peg_asset, enabled)
VALUES ('EGP', 2, 'FIAT', FALSE, NULL, TRUE);

-- --- Two new "networks" -- not blockchains, but payment_rail's own model
-- already only asks for a code, a display name, and a confirmation depth
-- (meaningless here; set to 1), so reusing it gives these two rails the
-- SAME admin Finance Control screen, the SAME enable/disable and min/max
-- controls every crypto rail already has, for free. -------------------------

INSERT INTO network (code, display_name, confirmation_depth, enabled) VALUES
  ('VODAFONE_CASH', 'Vodafone Cash', 1, TRUE),
  ('INSTAPAY',      'InstaPay',      1, TRUE);

INSERT INTO payment_rail
  (id, asset, network, status, enabled, deposits_enabled, withdrawals_enabled,
   min_deposit_minor, min_withdrawal_minor, confirmation_depth)
VALUES
  ('USDT_VODAFONE_CASH', 'USDT', 'VODAFONE_CASH', 'ACTIVE', TRUE, TRUE, TRUE,
   1000000, 1000000, 1),   -- 1.000000 USDT-equivalent floor, same shape as every other rail's own minimum
  ('USDT_INSTAPAY',      'USDT', 'INSTAPAY',      'ACTIVE', TRUE, TRUE, TRUE,
   1000000, 1000000, 1);

-- --- The operator's own receiving numbers --------------------------------
--
-- A player picks ONE of these to send to; the platform never picks for
-- them (different numbers may belong to different real accounts the
-- operator actually controls). Admin-editable, not hardcoded in
-- application source, for the same reason payment_rail itself exists:
-- changing a receiving number must never require a deploy.

CREATE TABLE local_payment_number (
  id           TEXT PRIMARY KEY,             -- 'vf_1', 'vf_2', 'vf_3', 'instapay_1'
  network      TEXT NOT NULL REFERENCES network(code),
  phone_number TEXT NOT NULL,
  label        TEXT,                         -- optional operator note, e.g. "primary"
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT local_payment_number_unique UNIQUE (network, phone_number)
);

INSERT INTO local_payment_number (id, network, phone_number, label) VALUES
  ('vf_1',       'VODAFONE_CASH', '01069999557', NULL),
  ('vf_2',       'VODAFONE_CASH', '01200176755', NULL),
  ('vf_3',       'VODAFONE_CASH', '01067558133', NULL),
  ('instapay_1', 'INSTAPAY',      '01067558133', NULL);

-- --- Custody accounts for the two new rails ---------------------------------
--
-- ledger_post() posts only between EXISTING ledger_account rows -- it never
-- creates one implicitly (deliberately: an unrecognized account name in a
-- leg is a bug, not a thing to silently provision). 0055 established this
-- exact pattern when USDC/DAI custody was added; same shape here, still
-- asset='USDT' since the player's balance never becomes anything else.
--
-- allow_negative=TRUE here, unlike every crypto custody account: those
-- represent real on-chain reserve the platform actually holds, so going
-- negative would mean promising out coins it does not have. This account
-- is a bookkeeping counterpart for real EGP the OPERATOR personally
-- advances or collects by hand -- it is entirely normal, especially early
-- on, for local withdrawals paid out of pocket to outrun local deposits
-- collected so far, and that should show up as a real negative balance to
-- reconcile against, not be blocked as if it were an impossible payout.
INSERT INTO ledger_account
  (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset, network)
VALUES
  ('platform:custody:USDT:VODAFONE_CASH', 'PLATFORM', NULL, 'ASSET', 'DEBIT', TRUE, 'USDT', 'VODAFONE_CASH'),
  ('platform:custody:USDT:INSTAPAY',      'PLATFORM', NULL, 'ASSET', 'DEBIT', TRUE, 'USDT', 'INSTAPAY')
ON CONFLICT (key, asset) DO NOTHING;

-- --- The Android app's own credential --------------------------------------
--
-- Machine-to-machine, deliberately NOT a player or admin login: this app
-- runs unattended on the operator's own device and calls the reporting
-- endpoint far more often than any human session would. api_key_hash is
-- SHA-256 of the actual key (same discipline as refresh_token's own
-- hashed-at-rest storage in packages/auth) -- the raw key is shown to the
-- operator exactly once, at creation, and never stored.

CREATE TABLE payment_receiver_device (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  api_key_hash  TEXT NOT NULL UNIQUE,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ
);

-- A placeholder row so local_transfer_observed.device_id (NOT NULL) has
-- something to reference before the Android app -- and therefore any real
-- device row -- exists. api_key_hash is not a hash of any issued key, so
-- nothing can ever authenticate as it; it exists purely as an FK anchor for
-- deposits an admin logs by hand (see local-payments.mjs's observeAndCredit()).
INSERT INTO payment_receiver_device (id, label, api_key_hash, enabled, created_by) VALUES
  ('manual_admin', 'Manually logged by an admin (no Android app connected yet)', 'UNUSED_NO_DEVICE_KEY', FALSE, 'SYSTEM');

-- --- What a player declares before sending anything ------------------------

CREATE TYPE local_deposit_status AS ENUM (
  'PENDING', 'MATCHED', 'CREDITED', 'EXPIRED', 'REJECTED'
);

CREATE TABLE local_deposit_intent (
  id                      TEXT PRIMARY KEY,
  player_id               TEXT NOT NULL REFERENCES player(id),
  network                 TEXT NOT NULL REFERENCES network(code)
    CHECK (network IN ('VODAFONE_CASH', 'INSTAPAY')),
  receiving_number_id     TEXT NOT NULL REFERENCES local_payment_number(id),
  declared_sender_name    TEXT NOT NULL,
  declared_sender_phone   TEXT NOT NULL,
  declared_amount_egp_minor BIGINT NOT NULL,
  status                  local_deposit_status NOT NULL DEFAULT 'PENDING',

  matched_transfer_id     TEXT,   -- FK added below, after local_transfer_observed exists
  rate_x1e8_used          BIGINT,
  credited_amount_usdt_minor BIGINT,
  credited_tx_id          BIGINT REFERENCES ledger_transaction(id),

  reviewed_by             TEXT,   -- admin id, set only if a human resolved an ambiguous match
  review_reason           TEXT,
  reviewed_at              TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at               TIMESTAMPTZ NOT NULL,
  credited_at              TIMESTAMPTZ,

  CONSTRAINT local_deposit_amount_positive CHECK (declared_amount_egp_minor > 0),
  CONSTRAINT local_deposit_credited_has_ledger
    CHECK (status <> 'CREDITED' OR (credited_tx_id IS NOT NULL AND credited_at IS NOT NULL
      AND rate_x1e8_used IS NOT NULL AND credited_amount_usdt_minor IS NOT NULL)),
  CONSTRAINT local_deposit_reviewed_is_accountable
    CHECK (reviewed_by IS NULL OR review_reason IS NOT NULL)
);

CREATE INDEX local_deposit_intent_player_idx ON local_deposit_intent (player_id, created_at DESC);
CREATE INDEX local_deposit_intent_pending_idx ON local_deposit_intent (network, status, expires_at)
  WHERE status = 'PENDING';

-- --- What the Android app actually observed ---------------------------------
--
-- Recorded unconditionally, whether or not it ends up matching anything --
-- an unmatched transfer is exactly the case the operator needs to see in
-- the app (a real payment came in that no declared intent claims), not a
-- row that's convenient to skip persisting.

CREATE TYPE local_transfer_status AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

CREATE TABLE local_transfer_observed (
  id                  TEXT PRIMARY KEY,
  network             TEXT NOT NULL REFERENCES network(code)
    CHECK (network IN ('VODAFONE_CASH', 'INSTAPAY')),
  received_number_id  TEXT NOT NULL REFERENCES local_payment_number(id),
  raw_sender_name     TEXT,             -- not every provider SMS includes a name
  raw_sender_phone    TEXT,
  amount_egp_minor    BIGINT NOT NULL,
  raw_message         TEXT NOT NULL,    -- full SMS/notification text, for audit and re-matching by hand
  device_id           TEXT NOT NULL REFERENCES payment_receiver_device(id),
  status               local_transfer_status NOT NULL DEFAULT 'UNMATCHED',
  matched_intent_id    TEXT REFERENCES local_deposit_intent(id),

  observed_at          TIMESTAMPTZ NOT NULL,   -- the transfer's own timestamp, from the SMS
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),  -- when the app told us about it

  CONSTRAINT local_transfer_amount_positive CHECK (amount_egp_minor > 0),
  CONSTRAINT local_transfer_matched_is_consistent
    CHECK (status <> 'MATCHED' OR matched_intent_id IS NOT NULL),
  -- The operator's phone can receive the same forwarded/duplicated
  -- notification twice; this is what makes reporting it a second time a
  -- no-op instead of a duplicate credit.
  CONSTRAINT local_transfer_dedupe UNIQUE (network, device_id, raw_message, observed_at)
);

ALTER TABLE local_deposit_intent
  ADD CONSTRAINT local_deposit_intent_matched_transfer_fkey
  FOREIGN KEY (matched_transfer_id) REFERENCES local_transfer_observed(id);

CREATE INDEX local_transfer_observed_unmatched_idx ON local_transfer_observed (network, reported_at DESC)
  WHERE status = 'UNMATCHED';

-- --- Crediting a matched deposit --------------------------------------------
--
-- The ONE way an intent moves to CREDITED, mirroring ledger_post() being
-- the only way money moves and record_valuation_snapshot() being the only
-- way a rate observation is recorded: no other code path may post this
-- credit. Converts at valuation_current('EGP') -- the admin-set (or,
-- later, automated) rate active at THIS moment, not whatever the intent's
-- declared amount implied when it was created minutes earlier.
CREATE FUNCTION credit_local_deposit(
  p_intent_id TEXT, p_transfer_id TEXT
) RETURNS local_deposit_intent LANGUAGE plpgsql AS $$
DECLARE
  v_intent   local_deposit_intent;
  v_rate     BIGINT;
  v_usdt_minor BIGINT;
  v_posted   RECORD;
BEGIN
  SELECT * INTO v_intent FROM local_deposit_intent WHERE id = p_intent_id FOR UPDATE;
  IF v_intent IS NULL THEN
    RAISE EXCEPTION 'no such local deposit intent: %', p_intent_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_intent.status = 'CREDITED' THEN
    RETURN v_intent; -- idempotent: already done, never post a second credit
  END IF;
  IF v_intent.status NOT IN ('PENDING', 'MATCHED') THEN
    RAISE EXCEPTION 'local deposit intent % is % -- cannot credit', p_intent_id, v_intent.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT usd_rate_x1e8 INTO v_rate FROM valuation_current('EGP');
  IF v_rate IS NULL THEN
    RAISE EXCEPTION 'no EGP/USD rate has ever been set -- an admin must set one before any EGP deposit can be credited'
      USING ERRCODE = 'check_violation';
  END IF;

  -- declared_amount_egp_minor is EGP piastres (minor_units=2); usd_rate_x1e8
  -- is USD per 1 EGP scaled by 10^8; USDT has minor_units=6. This is the
  -- same fixed-point-only discipline 0037's own header insists on -- no
  -- floating point anywhere in the conversion.
  v_usdt_minor := (v_intent.declared_amount_egp_minor * v_rate) / 10000;

  UPDATE local_transfer_observed
     SET status = 'MATCHED', matched_intent_id = p_intent_id
   WHERE id = p_transfer_id AND status = 'UNMATCHED';

  SELECT * INTO v_posted FROM ledger_post(
    format('local_deposit:%s', p_intent_id), 'DEPOSIT', 'SYSTEM', NULL,
    jsonb_build_array(
      jsonb_build_object('account', format('platform:custody:USDT:%s', v_intent.network), 'amount', v_usdt_minor::text),
      jsonb_build_object('account', format('user:%s:available', v_intent.player_id), 'amount', (-v_usdt_minor)::text)
    ),
    'USDT', NULL, 'local_deposit_intent', p_intent_id
  );

  UPDATE local_deposit_intent
     SET status = 'CREDITED', matched_transfer_id = p_transfer_id,
         rate_x1e8_used = v_rate, credited_amount_usdt_minor = v_usdt_minor,
         credited_tx_id = v_posted.transaction_id, credited_at = now()
   WHERE id = p_intent_id
   RETURNING * INTO v_intent;

  RETURN v_intent;
END;
$$;

-- --- Evidence, redefined for a rail with no chain to check against --------
--
-- G12 (0040) requires confirmed_block_number/confirmations for COMPLETED --
-- correct for crypto, where "an admin says so" is exactly the unverified
-- claim G12 exists to refuse. A manual local-rail payout has no block to
-- point at; what stands in for chain evidence here is the same thing
-- tx_hash already means for crypto -- a permanent, non-null, unique
-- reference the operator can be held to -- so the constraint is narrowed
-- to demand block evidence only where a block could exist, while still
-- demanding SOME reference for every COMPLETED withdrawal, local or not.
ALTER TABLE withdrawal
  DROP CONSTRAINT withdrawal_completed_has_evidence,
  ADD CONSTRAINT withdrawal_completed_has_evidence
    CHECK (status <> 'COMPLETED' OR (
      tx_hash IS NOT NULL AND (
        network IN ('VODAFONE_CASH', 'INSTAPAY')
        OR (confirmed_block_number IS NOT NULL AND confirmations IS NOT NULL)
      )
    ));

-- --- One new edge in the withdrawal state machine ---------------------------
--
-- withdrawal_transition_allowed() (0007, replaced by 0040) only ever
-- allowed CONFIRMED -> COMPLETED -- the end of the crypto path's own
-- broadcast/chain-confirmation chain, which a manual cash payout has no
-- equivalent of. Adding PROCESSING -> COMPLETED as its own explicit edge
-- (not touching any existing one) is what lets complete_manual_withdrawal()
-- below reach COMPLETED at all; every other transition is exactly as
-- restrictive as it already was.
CREATE OR REPLACE FUNCTION withdrawal_transition_allowed(
  p_from withdrawal_status, p_to withdrawal_status
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_from, p_to) IN (
    ('REQUESTED','VALIDATING'), ('REQUESTED','CANCELLED'),
    ('VALIDATING','RISK_CHECK'), ('VALIDATING','REJECTED'), ('VALIDATING','FAILED'),
    ('RISK_CHECK','PENDING_REVIEW'), ('RISK_CHECK','APPROVED'), ('RISK_CHECK','REJECTED'),
    ('PENDING_REVIEW','APPROVED'), ('PENDING_REVIEW','REJECTED'),
    ('PENDING_REVIEW','ON_HOLD'), ('ON_HOLD','PENDING_REVIEW'), ('ON_HOLD','REJECTED'),
    ('APPROVED','PROCESSING'), ('APPROVED','REJECTED'),
    ('PROCESSING','BROADCASTED'), ('PROCESSING','FAILED'),
    ('BROADCASTED','CONFIRMED'), ('BROADCASTED','FAILED'),
    ('CONFIRMED','COMPLETED'),
    ('PROCESSING','COMPLETED')   -- new: the manual local-rail path only, see complete_manual_withdrawal()
  );
$$;

-- --- Manual withdrawal fulfillment -------------------------------------------
--
-- The withdrawal itself is an ordinary row in the EXISTING withdrawal
-- table (network='VODAFONE_CASH'/'INSTAPAY', asset still 'USDT' -- the
-- player's balance was never anything else), locked and approved through
-- the exact same admin flow every crypto withdrawal already uses. This
-- function is the one difference: instead of payments.mjs's process()
-- calling an automated payout provider, an admin who has personally sent
-- the EGP attests to it with a reference (a Vodafone Cash/InstaPay
-- transaction id, or any note that lets them trace it later) --
-- deliberately named separately from crypto's tx_hash so a manual
-- reference is never mistaken for on-chain proof.
CREATE FUNCTION complete_manual_withdrawal(
  p_withdrawal_id TEXT, p_admin_id TEXT, p_reference TEXT
) RETURNS withdrawal LANGUAGE plpgsql AS $$
DECLARE
  v_w        withdrawal;
  v_custody  TEXT;
  v_posted   RECORD;
BEGIN
  SELECT * INTO v_w FROM withdrawal WHERE id = p_withdrawal_id FOR UPDATE;
  IF v_w IS NULL THEN
    RAISE EXCEPTION 'no such withdrawal: %', p_withdrawal_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_w.network NOT IN ('VODAFONE_CASH', 'INSTAPAY') THEN
    RAISE EXCEPTION 'complete_manual_withdrawal() is only for local rails, % is not one', v_w.network
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_w.status = 'COMPLETED' THEN
    RETURN v_w; -- idempotent
  END IF;
  IF v_w.status NOT IN ('APPROVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'withdrawal % is % -- cannot complete', p_withdrawal_id, v_w.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_reference IS NULL OR length(trim(p_reference)) = 0 THEN
    RAISE EXCEPTION 'a manual completion requires a reference the operator can trace later'
      USING ERRCODE = 'check_violation';
  END IF;

  -- APPROVED -> PROCESSING is already a legal edge (the crypto path takes
  -- it the instant process() starts broadcasting); take it here too so a
  -- withdrawal that hasn't been touched yet lands on PROCESSING before the
  -- PROCESSING -> COMPLETED edge this migration adds below fires. A
  -- withdrawal already PROCESSING (an admin who called this, hit an error,
  -- and is retrying) skips straight to the completion below.
  IF v_w.status = 'APPROVED' THEN
    UPDATE withdrawal SET status = 'PROCESSING'::withdrawal_status WHERE id = p_withdrawal_id
      RETURNING * INTO v_w;
  END IF;

  v_custody := format('platform:custody:%s:%s', v_w.asset, v_w.network);

  -- Unlike every other ledger_post call in the codebase (always actor_type
  -- 'SYSTEM', with admin attribution living separately on
  -- withdrawal_transition via a session setting the caller has to
  -- remember to set first), this one names the admin directly on the
  -- ledger transaction itself: a human personally sending real EGP out of
  -- pocket is the direct, sole cause of this specific posting, not an
  -- automated process, and that attribution should not depend on a
  -- separate session-config call the caller could forget.
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'complete_manual_withdrawal() requires the admin who actually sent the money'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_posted FROM ledger_post(
    format('withdrawal:%s:debit', p_withdrawal_id), 'WITHDRAWAL', 'ADMIN', p_admin_id,
    jsonb_build_array(
      jsonb_build_object('account', format('user:%s:locked', v_w.player_id), 'amount', v_w.amount_minor::text),
      jsonb_build_object('account', v_custody, 'amount', (-v_w.amount_minor)::text)
    ),
    v_w.asset, NULL, 'withdrawal', p_withdrawal_id
  );

  UPDATE withdrawal
     SET status = 'COMPLETED'::withdrawal_status,
         tx_hash = p_reference, provider = 'MANUAL_OPERATOR',
         settle_tx_id = v_posted.transaction_id, completed_at = now()
   WHERE id = p_withdrawal_id
   RETURNING * INTO v_w;

  RETURN v_w;
END;
$$;
