-- Slice 11: wires the ALREADY-BUILT EXP/level/achievement/badge primitives
-- (migration 0020, packages/profile/src/{exp,level,achievements,badges}.mjs)
-- to real, authoritative game completion. Those primitives needed no new
-- schema of their own -- exp_event.dedupe_key, player_achievement's PK, and
-- player_badge's PK already make every award idempotent by construction.
--
-- What IS new here is the retry marker this slice's progression sweep
-- needs: "has this SETTLED duel / COMPLETED-and-prize-settled tournament
-- already had its progression processed." A duel award is itself always
-- safe to retry (dedupe_key), so this column is purely a cost/scheduling
-- optimization for the sweep -- "don't re-check 50,000 old duels forever"
-- -- never a correctness requirement on its own. Set ONCE, only after
-- every award for that duel/tournament has been attempted, so a crash
-- mid-processing leaves it unset and the NEXT sweep tick retries safely
-- (the awards underneath are idempotent either way).
--
-- Deliberately NOT a new outbox/event-log table: this codebase already has
-- an established idiom for "the database is the durable queue, a worker
-- polls it" (settlement's own settleDue(), realtime's claim-sweep,
-- reconciliation) -- this is that same idiom, not a new architecture.

ALTER TABLE duel ADD COLUMN progression_processed_at TIMESTAMPTZ NULL;

ALTER TABLE tournament ADD COLUMN progression_processed_at TIMESTAMPTZ NULL;

-- Sweep queries filter on `status = 'SETTLED' AND progression_processed_at
-- IS NULL` (duel) / the tournament equivalent -- a partial index on the
-- unprocessed rows only, so the query stays cheap forever regardless of
-- how many millions of already-processed rows accumulate.
CREATE INDEX duel_progression_pending_idx ON duel (settled_at)
  WHERE status = 'SETTLED' AND progression_processed_at IS NULL;

CREATE INDEX tournament_progression_pending_idx ON tournament (completed_at)
  WHERE status = 'COMPLETED' AND progression_processed_at IS NULL;
