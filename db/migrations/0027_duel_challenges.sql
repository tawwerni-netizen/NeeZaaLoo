-- PLAY WITH FRIEND: a direct challenge between two known players, distinct
-- from matchmaking_ticket (which pairs a player with WHOEVER is next in a
-- pool) and from vs-computer (which has no second player at all). A
-- challenge is a proposal; it becomes a real duel only once accepted, at
-- which point it is created exactly the way vs-computer.mjs creates its
-- own duel row -- READY, tier FREE, is_vs_computer FALSE -- so every
-- downstream system (dispatch, gateway, settlement, progression) sees an
-- ordinary human-vs-human duel and needs no new case of its own.
--
-- Deliberately no new duel_status/entry_tier values and no new worker:
-- expiry is enforced lazily (a challenge past its own expires_at is simply
-- never actionable and never listed as pending), the same "the database is
-- the durable state, a read filters it" idiom used elsewhere in this
-- schema rather than a sweep whose only job would be flipping a status
-- column no query actually depends on.

CREATE TYPE duel_challenge_status AS ENUM
  ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE duel_challenge (
  id             TEXT                    PRIMARY KEY,
  game_id        TEXT                    NOT NULL REFERENCES game(id),
  challenger_id  TEXT                    NOT NULL REFERENCES player(id),
  opponent_id    TEXT                    NOT NULL REFERENCES player(id),
  status         duel_challenge_status   NOT NULL DEFAULT 'PENDING',
  duel_id        TEXT                    REFERENCES duel(id),
  created_at     TIMESTAMPTZ             NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ             NOT NULL,
  responded_at   TIMESTAMPTZ,

  CONSTRAINT duel_challenge_distinct_players CHECK (challenger_id <> opponent_id),
  CONSTRAINT duel_challenge_accepted_has_duel
    CHECK ((status = 'ACCEPTED') = (duel_id IS NOT NULL)),
  CONSTRAINT duel_challenge_resolved_has_timestamp
    CHECK (status = 'PENDING' OR responded_at IS NOT NULL)
);

-- One live challenge per (challenger, opponent, game) at a time -- a second
-- click of "Challenge" while the first is still pending is a no-op, not a
-- pile of duplicate invitations the opponent has to individually dismiss.
CREATE UNIQUE INDEX duel_challenge_pending_unique_idx
  ON duel_challenge (challenger_id, opponent_id, game_id) WHERE status = 'PENDING';

CREATE INDEX duel_challenge_incoming_idx
  ON duel_challenge (opponent_id, created_at DESC) WHERE status = 'PENDING';

CREATE INDEX duel_challenge_outgoing_idx
  ON duel_challenge (challenger_id, created_at DESC) WHERE status = 'PENDING';
