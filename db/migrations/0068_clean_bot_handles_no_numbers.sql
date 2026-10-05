-- Migration 0068: Handled cleanly in 0069_sync_clean_bot_handles.sql
-- (Avoids unique constraint collisions on player_handle_key by using two-phase tmp_ rename)
SELECT 1;
