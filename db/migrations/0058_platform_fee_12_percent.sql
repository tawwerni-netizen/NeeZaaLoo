-- =============================================================================
-- 0058_platform_fee_12_percent.sql
--
-- Platform economics update: align standard rake to 12% (1200 bps)
-- across all cash matches and duels.
-- Two-admin audit trail preserved: created_by <> approved_by.
-- =============================================================================

INSERT INTO economy_rule
  (id, version, game_id, tier, rake_bps, min_rake_minor, max_rake_minor,
   effective_from, created_by, approved_by, reason)
VALUES
  ('standard', 2, NULL, 'CASH', 1200, 0, NULL,
   now(), 'founder', 'finance-admin',
   'Platform economics: 12% standard rake across all cash duels and tournaments.');
