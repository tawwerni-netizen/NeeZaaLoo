BEGIN;

INSERT INTO player (id, handle, is_ai) VALUES
  ('ai-easy-2',   'bot_easy_2', TRUE),
  ('ai-easy-3',   'bot_easy_3', TRUE),
  ('ai-medium-2', 'bot_medium_2', TRUE),
  ('ai-medium-3', 'bot_medium_3', TRUE),
  ('ai-hard-2',   'bot_hard_2', TRUE),
  ('ai-hard-3',   'bot_hard_3', TRUE),
  ('ai-expert-2', 'bot_expert_2', TRUE),
  ('ai-expert-3', 'bot_expert_3', TRUE)
ON CONFLICT (id) DO UPDATE SET is_ai = TRUE;

COMMIT;
