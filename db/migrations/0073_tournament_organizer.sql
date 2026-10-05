-- --- TO Dashboard (B2B Organizer) --------------------------------------------
--
-- Allows regular players to be promoted to "organizers" who can create their
-- own custom tournaments and take a cut (rake) of the prize pool.

ALTER TABLE player ADD COLUMN is_organizer BOOLEAN NOT NULL DEFAULT false;

-- The bps of the distributable prize pool that goes to the organizer
ALTER TABLE tournament ADD COLUMN organizer_rake_bps INT NOT NULL DEFAULT 0;

-- Ensure total prize bps + organizer rake bps <= 10000
-- Wait, we already have a check on tournament. Let's drop it and recreate it.
ALTER TABLE tournament DROP CONSTRAINT IF EXISTS tournament_prize_bps_sane;
ALTER TABLE tournament ADD CONSTRAINT tournament_prize_bps_sane 
  CHECK (jsonb_bps_sum(prize_structure) + organizer_rake_bps <= 10000);
