-- Migration 0049: Friends and Direct Messaging (Messenger)
CREATE TABLE IF NOT EXISTS friendship (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES player(id),
  friend_id   TEXT NOT NULL REFERENCES player(id),
  status      TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (status IN ('PENDING', 'ACCEPTED', 'BLOCKED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendship_no_self CHECK (user_id <> friend_id),
  CONSTRAINT friendship_pair_unique UNIQUE (user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS friendship_user_idx ON friendship (user_id, status);
CREATE INDEX IF NOT EXISTS friendship_friend_idx ON friendship (friend_id, status);

CREATE TABLE IF NOT EXISTS direct_message (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender_id         TEXT NOT NULL REFERENCES player(id),
  receiver_id       TEXT NOT NULL REFERENCES player(id),
  content           TEXT NOT NULL,
  client_message_id TEXT NOT NULL,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT direct_message_no_self CHECK (sender_id <> receiver_id),
  CONSTRAINT direct_message_client_msg_unique UNIQUE (sender_id, client_message_id)
);

CREATE INDEX IF NOT EXISTS direct_message_pair_idx ON direct_message (sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS direct_message_receiver_unread_idx ON direct_message (receiver_id, read_at);
