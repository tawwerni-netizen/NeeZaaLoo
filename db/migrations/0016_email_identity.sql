-- Email identity -- additive, and deliberately its own table rather than a
-- column on `player` or `credential`. Per the architecture this migration
-- follows:
--
--   Player
--   ├── credential      (password identity, migration 0005)
--   ├── totp_secret     (2FA, migration 0005)
--   └── email_identity  (this migration)
--
-- and later, google_identity alongside it (a future migration -- not
-- created here; Slice 5 of the authentication roadmap). Keeping identities
-- as sibling tables means adding Google login is "one more sibling table",
-- never a rewrite of this one.
--
-- One email per player for now: the product has no stated need for
-- secondary/recovery emails yet, and a UNIQUE(player_id) constraint is easy
-- to relax later (a real schema addition) but hard to safely un-assume once
-- application code depends on "a player has at most one email".
--
-- `email` is the normalized form (lowercased, trimmed -- see
-- packages/auth/src/email-identity.mjs's `normalizeEmail`) and is what every
-- uniqueness check and lookup uses; `email_display` preserves what the
-- person actually typed, for showing back to them and for the "To:" header
-- of anything mailed to them.

CREATE TABLE email_identity (
  id            TEXT PRIMARY KEY,
  player_id     TEXT        NOT NULL REFERENCES player(id),
  email         TEXT        NOT NULL,
  email_display TEXT        NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A shape check, not a full RFC 5322 validator -- the same trade-off the
  -- rest of this schema makes elsewhere (see player_handle_shape): reject
  -- what is obviously wrong, let a real deliverability check (which this
  -- system does not have) be the thing that ultimately proves an address
  -- works, by actually sending to it.
  CONSTRAINT email_identity_shape CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),

  -- One verified-or-not email row per player. A second call to "set my
  -- email" updates this row (see setEmail's ON CONFLICT below); it does not
  -- create a second identity.
  CONSTRAINT email_identity_one_per_player UNIQUE (player_id),

  -- The uniqueness that actually matters for login, password reset and
  -- Google account linking: no two players can claim the same normalized
  -- address. This is also what makes "does this email already have an
  -- account" a real, DB-enforced fact rather than an application promise.
  CONSTRAINT email_identity_unique_email UNIQUE (email)
);

CREATE INDEX email_identity_player_idx ON email_identity (player_id);
