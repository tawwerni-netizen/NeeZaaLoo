-- =============================================================================
-- 0082_store_cosmetic_catalog.sql
--
-- Seeds avatar frames and cosmetic badges available in the Nizalo Store
-- so that player purchases can be awarded cleanly with valid foreign keys.
-- =============================================================================

-- 1. Store avatar frames
INSERT INTO frame (code) VALUES
  ('neon'),
  ('gold'),
  ('cyber_dice'),
  ('holo_board'),
  ('FRAME_NEON'),
  ('FRAME_GOLD'),
  ('FRAME_CYBER'),
  ('FRAME_HOLO'),
  ('FRAME_FIRE'),
  ('FRAME_VIP')
ON CONFLICT (code) DO NOTHING;

-- 2. Store cosmetic badges
INSERT INTO badge (code, kind) VALUES
  ('veteran', 'COSMETIC'),
  ('VIP_GOLD', 'COSMETIC'),
  ('cyber_dice', 'COSMETIC'),
  ('holo_board', 'COSMETIC'),
  ('neon', 'COSMETIC'),
  ('gold', 'COSMETIC'),
  ('BADGE_VIP_GOLD', 'COSMETIC'),
  ('BADGE_VETERAN', 'COSMETIC'),
  ('BADGE_CHAMPION', 'COSMETIC')
ON CONFLICT (code) DO NOTHING;
