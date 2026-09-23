-- =============================================================================
-- 0072_payment_receiver_integrity.sql
--
-- Closes the gaps between "the Android Payment Receiver reported a transfer"
-- and "a player was credited exactly once for exactly one real payment".
--
-- 1. Client idempotency key. 0063 made UNIQUE(network, transaction_ref) the
--    only duplicate guard, and Postgres admits any number of NULLs there. A
--    receipt whose reference the parser could not extract, reported once,
--    committed, and then RE-reported because the response was lost in
--    transit, landed as a second observed transfer -- one that could later
--    auto-match a second same-amount intent from the same player. Every
--    report from the app now carries a key it generated once when the SMS
--    arrived; (device_id, key) is unique, so a retry is recognized as the
--    same report, not a new payment.
--
-- 2. Message fingerprint. A hash of the normalized receipt text, computed by
--    the SERVER (never taken from the device), unique per network. Covers
--    the same receipt arriving twice under different keys -- a reinstalled
--    app, a restored backup, a second phone on the same line. Receipts carry
--    the resulting balance or a timestamp, so two genuine payments do not
--    share text; if they ever did, the second is held as a duplicate and
--    stays visible for manual review -- a missed auto-credit, never a double one.
--    NULL for rows logged by hand in the admin console.
--
-- 3. review_reason: why an observed transfer was NOT auto-credited, so the
--    operator and the admin console can say more than "unmatched".
--
-- 4. sms_sender: the SMS originating address the device saw. Providers send
--    receipts from alphanumeric sender IDs or short codes; a "receipt" from
--    an ordinary mobile number is what a forged one looks like -- anyone who
--    knows the operator's number can type the receipt wording and send it.
--    Such a report is recorded (UNTRUSTED_SENDER) and never auto-credited.
--    NULL only for the legacy route and hand-logged rows.
--
-- 5. device_confirm_local_withdrawal(): the device path to completing a
--    local-rail payout, idempotent per request key. complete_manual_withdrawal()
--    already refuses a second debit; this adds the answer the app needs --
--    "this exact confirmation already happened" vs. "done now" -- and a
--    permanent record of which device confirmed which payout.
-- =============================================================================

ALTER TABLE local_transfer_observed
  ADD COLUMN client_idempotency_key TEXT,
  ADD COLUMN message_fingerprint    TEXT,
  ADD COLUMN review_reason          TEXT,
  ADD COLUMN sms_sender             TEXT;

ALTER TABLE local_transfer_observed
  ADD CONSTRAINT local_transfer_client_key_shape
    CHECK (client_idempotency_key IS NULL OR client_idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  ADD CONSTRAINT local_transfer_client_key_unique UNIQUE (device_id, client_idempotency_key),
  ADD CONSTRAINT local_transfer_fingerprint_unique UNIQUE (network, message_fingerprint),
  ADD CONSTRAINT local_transfer_review_reason_known
    CHECK (review_reason IS NULL OR review_reason IN (
      'UNTRUSTED_SENDER',        -- sent from a personal mobile number, not a provider
      'UNPARSEABLE',             -- the server could not read the receipt itself
      'NETWORK_MISMATCH',        -- the receipt reads as the other provider
      'NO_MATCHING_INTENT',      -- no pending intent with this amount/sender/number
      'AMBIGUOUS_MATCH',         -- more than one pending intent fits
      'INTENT_ALREADY_CREDITED', -- the one fitting intent was credited by another transfer
      'NO_RATE_SET'              -- no EGP/USD rate exists yet
    ));

CREATE INDEX local_transfer_observed_device_reported_idx
  ON local_transfer_observed (device_id, reported_at DESC);

-- -----------------------------------------------------------------------------

CREATE TABLE payment_receiver_withdrawal_confirmation (
  idempotency_key TEXT PRIMARY KEY
    CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,80}$'),
  withdrawal_id   TEXT NOT NULL REFERENCES withdrawal(id),
  device_id       TEXT NOT NULL REFERENCES payment_receiver_device(id),
  reference       TEXT NOT NULL,
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A payout is confirmed from a device at most once, whatever key a
  -- second attempt carries.
  CONSTRAINT payment_receiver_withdrawal_confirmation_once UNIQUE (withdrawal_id)
);

-- Outcome is one of:
--   COMPLETED          -- this call completed the payout and posted the debit
--   ALREADY_PROCESSED  -- the payout was already COMPLETED (this key's own
--                         earlier attempt, or another path entirely); nothing
--                         was posted by this call
CREATE FUNCTION device_confirm_local_withdrawal(
  p_idempotency_key TEXT, p_withdrawal_id TEXT, p_device_id TEXT, p_reference TEXT
) RETURNS TABLE (
  o_outcome TEXT, o_status TEXT, o_reference TEXT, o_completed_at TIMESTAMPTZ
) LANGUAGE plpgsql AS $$
DECLARE
  v_w      withdrawal;
  v_prev   payment_receiver_withdrawal_confirmation;
  v_admin  TEXT;
BEGIN
  -- Lock first. A concurrent twin of this call (the same double-tap, or a
  -- retry racing its own original) waits here until the first commits, and
  -- every statement below then reads that committed state.
  SELECT * INTO v_w FROM withdrawal WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such withdrawal: %', p_withdrawal_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT * INTO v_prev FROM payment_receiver_withdrawal_confirmation
   WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_prev.withdrawal_id <> p_withdrawal_id OR v_prev.device_id <> p_device_id THEN
      RAISE EXCEPTION 'idempotency key reused for a different confirmation'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN QUERY SELECT 'ALREADY_PROCESSED'::text, v_w.status::text, v_w.tx_hash, v_w.completed_at;
    RETURN;
  END IF;

  IF v_w.status = 'COMPLETED' THEN
    RETURN QUERY SELECT 'ALREADY_PROCESSED'::text, v_w.status::text, v_w.tx_hash, v_w.completed_at;
    RETURN;
  END IF;

  SELECT created_by INTO v_admin FROM payment_receiver_device
   WHERE id = p_device_id AND enabled = TRUE;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'payment receiver device % is not enabled', p_device_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The one place a local payout's debit is posted; it re-checks network,
  -- state and reference itself.
  SELECT * INTO v_w FROM complete_manual_withdrawal(p_withdrawal_id, v_admin, p_reference);

  INSERT INTO payment_receiver_withdrawal_confirmation
    (idempotency_key, withdrawal_id, device_id, reference)
  VALUES (p_idempotency_key, p_withdrawal_id, p_device_id, p_reference);

  RETURN QUERY SELECT 'COMPLETED'::text, v_w.status::text, v_w.tx_hash, v_w.completed_at;
END;
$$;
