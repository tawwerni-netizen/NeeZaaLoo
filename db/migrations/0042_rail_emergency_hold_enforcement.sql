-- =============================================================================
-- 0042_rail_emergency_hold_enforcement.sql
--
-- Separated from 0041 deliberately: a newly-added enum value (ALTER TYPE ...
-- ADD VALUE) cannot safely be referenced by anything evaluated in the SAME
-- transaction it was added in. Each migration file runs as its own
-- transaction (see migrate.mjs), so putting the actual USE of
-- 'EMERGENCY_HOLD' in a later file sidesteps the restriction entirely,
-- rather than fighting it.
--
-- EMERGENCY_HOLD is a full stop, exactly like ADMIN_PAUSED and RETIRED --
-- deposits_enabled/withdrawals_enabled are irrelevant once it is set; no
-- rail state may authorise a NEW operation while it holds.
-- =============================================================================

CREATE OR REPLACE FUNCTION rail_enabled_for(p_asset TEXT, p_network TEXT, p_operation TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT r.enabled AND r.status NOT IN ('ADMIN_PAUSED', 'RETIRED', 'EMERGENCY_HOLD') AND (
       CASE p_operation
         WHEN 'DEPOSIT'    THEN r.deposits_enabled
         WHEN 'WITHDRAWAL' THEN r.withdrawals_enabled
         ELSE FALSE
       END)
       FROM payment_rail r WHERE r.asset = p_asset AND r.network = p_network),
    FALSE
  );
$$;

-- set_rail_status()'s own body never enumerates specific status values (it
-- just records whatever it is told), so it needs no change -- restated here
-- only so a reader checking "what did 0042 touch" does not have to go
-- looking for a change that does not exist.
