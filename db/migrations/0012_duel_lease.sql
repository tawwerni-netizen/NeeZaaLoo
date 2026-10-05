-- =============================================================================
-- 0012_duel_lease.sql
--
-- A4: multiple realtime gateway instances must never concurrently believe
-- they own the same duel.
--
-- The lease lives on the `duel` row itself, not a separate table, because the
-- thing that must be atomic is "am I still the owner" checked at the exact
-- moment of the exact write that owner is about to make -- and that write
-- already touches this row. A separate lease table would need its own
-- cross-table transaction to get the same guarantee for no benefit.
--
-- `lease_token` is a classic fencing token (Kleppmann, "How to do distributed
-- locking"): it only ever goes up, and a write is valid only if it carries
-- the CURRENT token. A gateway that acquired the lease, then stalled long
-- enough for its lease to expire and be taken over, does not need to know
-- that happened -- the moment it tries to actually write, the token it is
-- carrying no longer matches, and the write is refused. No heartbeat can be
-- late enough to make that check wrong, because the check is not "was I
-- recently told I still own this" -- it is "does my token match, right now".
-- =============================================================================

ALTER TABLE duel
  ADD COLUMN lease_owner      TEXT,
  ADD COLUMN lease_token      BIGINT      NOT NULL DEFAULT 0,
  ADD COLUMN lease_expires_at TIMESTAMPTZ;

CREATE INDEX duel_lease_owner_idx ON duel (lease_owner) WHERE lease_owner IS NOT NULL;
