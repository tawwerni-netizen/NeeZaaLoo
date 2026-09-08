-- Third-party identity providers (Slice 5: Google, first). Two tables,
-- deliberately separate from `credential` and `email_identity`:
--
--   oauth_identity -- the durable link between a player and a provider's
--   own stable subject identifier ("sub" for OIDC). `provider` is a plain
--   column, not baked into the table name, so a future provider (Apple,
--   Microsoft) is a new row shape the existing schema already supports,
--   not a new migration inventing a parallel table. The UNIQUE constraints
--   below encode the whole security model: a given provider subject can
--   belong to at most one player (no two players can claim the same
--   external identity), and a given player can link at most one identity
--   per provider (one Google account per Nizalo account, today).
--
--   oauth_handoff -- see packages/auth/src/oauth-handoff.mjs's own header
--   for why this exists: the browser is mid-redirect (Google -> our
--   callback -> the frontend) when a session needs to be handed off, and a
--   bearer token must never ride in a URL. This is a short-lived,
--   single-use, hashed-at-rest opaque code binding that one redirect
--   round-trip to a specific player -- structurally the same shape as
--   email_challenge (issue, verify-once via the same atomic
--   used_at-is-null compare-and-swap idiom, expire), but it is not an
--   emailed, human-typed code and has no `purpose`/`email` concept, so it
--   does not belong in that table.

CREATE TABLE oauth_identity (
  id              TEXT        PRIMARY KEY,
  player_id       TEXT        NOT NULL REFERENCES player(id),
  provider        TEXT        NOT NULL,
  -- The provider's own stable identifier (OIDC "sub") -- NEVER the email.
  -- An email can change or be reused after account deletion on the
  -- provider's side; a "sub" is defined by the provider to never be
  -- reassigned. This column, not email, is what a login looks up.
  provider_subject TEXT       NOT NULL,
  -- Informational snapshot of what the provider reported at link time --
  -- never used as a lookup key, only ever displayed back to the player
  -- ("linked to you@gmail.com") and consulted at NEW-signup time to decide
  -- whether to pre-fill/pre-verify the application email identity.
  email           TEXT,
  email_verified  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL,

  CONSTRAINT oauth_identity_unique_subject UNIQUE (provider, provider_subject),
  CONSTRAINT oauth_identity_one_per_provider UNIQUE (player_id, provider)
);

CREATE INDEX oauth_identity_player_idx ON oauth_identity (player_id);

CREATE TABLE oauth_handoff (
  id          TEXT        PRIMARY KEY,
  player_id   TEXT        NOT NULL REFERENCES player(id),
  provider    TEXT        NOT NULL,
  code_hash   TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL
);
