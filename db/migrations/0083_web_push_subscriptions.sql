-- Migration 0083: Web Push Subscriptions
-- Enables player browser push notifications (Chrome, Safari iOS/macOS, Firefox, Edge)
-- for match readiness, tournament rounds, friend challenges, and wallet transactions.

CREATE TABLE IF NOT EXISTS push_subscription (
  id text PRIMARY KEY,
  player_id text NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscription_player_id_idx ON push_subscription (player_id);
