-- =============================================================================
-- 0043_withdrawal_fee_immutability.sql
--
-- Security review finding F-5: fee_minor was added to `withdrawal` by
-- 0040_withdrawal_hardening.sql (G13, "a declared fee must actually reach the
-- ledger") but was never added to either place that governs a withdrawal's
-- OTHER immutable financial fields:
--
--   1. withdrawal_payload_digest() -- the four-eyes approval's "this exact
--      payload" fingerprint (G9). Changing fee_minor after an admin proposes
--      an approval, but before a second admin decides it or the requester
--      executes it, left the digest byte-identical: an approved release
--      could be silently inflated by the fee amount, moving that amount out
--      of custody with no on-chain counterpart (the broadcast only ever
--      sends amount_minor) and with no DIGEST_MISMATCH catching it.
--
--   2. withdrawal_guard()'s immutability branch -- amount_minor, destination
--      and player_id are already structurally frozen the instant the row is
--      written; fee_minor was the one financial field left mutable for the
--      whole lifetime of the row.
--
-- Nothing in this codebase today sets fee_minor to anything but its 0
-- default (no admin fee-assessment flow exists yet), so this closes a real
-- gap with no legitimate behaviour to preserve. If a fee-assessment feature
-- is built later, relaxing this -- to "immutable once a value is set" rather
-- than "immutable from creation" -- should be its own deliberate, reviewed
-- change, exactly like this one.
-- =============================================================================

CREATE OR REPLACE FUNCTION withdrawal_payload_digest(p_withdrawal_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT md5(w.id || ':' || w.amount_minor::text || ':' || w.asset || ':' || w.network || ':' || w.destination || ':' || w.fee_minor::text)
    FROM withdrawal w WHERE w.id = p_withdrawal_id;
$$;

CREATE OR REPLACE FUNCTION withdrawal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actor_type TEXT := COALESCE(NULLIF(current_setting('nizalo.actor_type', true), ''), 'SYSTEM');
  v_actor_id   TEXT := NULLIF(current_setting('nizalo.actor_id', true), '');
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT withdrawal_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'illegal withdrawal transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO withdrawal_transition (withdrawal_id, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, OLD.status, NEW.status, v_actor_type, v_actor_id);
  END IF;

  -- The amount, destination, owner AND fee of a withdrawal are fixed at
  -- request time. Allowing any to change after approval would make the
  -- approval meaningless: an approver signs off on a specific payout, not
  -- on a row that can still grow a fee underneath them.
  IF OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
     OR OLD.destination IS DISTINCT FROM NEW.destination
     OR OLD.player_id IS DISTINCT FROM NEW.player_id
     OR OLD.fee_minor IS DISTINCT FROM NEW.fee_minor THEN
    RAISE EXCEPTION 'a withdrawal amount, destination, owner and fee are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Once a transaction hash is recorded, it is the payout's permanent
  -- identity. Allowing it to change would let a single withdrawal row
  -- silently point at a second, different on-chain payment.
  IF OLD.tx_hash IS NOT NULL AND NEW.tx_hash IS DISTINCT FROM OLD.tx_hash THEN
    RAISE EXCEPTION 'a withdrawal transaction hash is immutable once recorded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
