BEGIN;

UPDATE player SET avatar_key = '/images/bots/ludo_cyan.jpg', handle = 'Neon_Cyan' WHERE id = 'ai-easy';
UPDATE player SET avatar_key = '/images/bots/ludo_fuchsia.jpg', handle = 'Neon_Fuchsia' WHERE id = 'ai-easy-1';
UPDATE player SET avatar_key = '/images/bots/ludo_amber.jpg', handle = 'Neon_Amber' WHERE id = 'ai-easy-2';
UPDATE player SET avatar_key = '/images/bots/ludo_lime.jpg', handle = 'Neon_Lime' WHERE id = 'ai-easy-3';

UPDATE player SET avatar_key = '/images/bots/ludo_cyan.jpg', handle = 'Cyber_Cyan' WHERE id = 'ai-medium';
UPDATE player SET avatar_key = '/images/bots/ludo_fuchsia.jpg', handle = 'Cyber_Fuchsia' WHERE id = 'ai-medium-1';
UPDATE player SET avatar_key = '/images/bots/ludo_amber.jpg', handle = 'Cyber_Amber' WHERE id = 'ai-medium-2';
UPDATE player SET avatar_key = '/images/bots/ludo_lime.jpg', handle = 'Cyber_Lime' WHERE id = 'ai-medium-3';

UPDATE player SET avatar_key = '/images/bots/ludo_cyan.jpg', handle = 'Hyper_Cyan' WHERE id = 'ai-hard';
UPDATE player SET avatar_key = '/images/bots/ludo_fuchsia.jpg', handle = 'Hyper_Fuchsia' WHERE id = 'ai-hard-1';
UPDATE player SET avatar_key = '/images/bots/ludo_amber.jpg', handle = 'Hyper_Amber' WHERE id = 'ai-hard-2';
UPDATE player SET avatar_key = '/images/bots/ludo_lime.jpg', handle = 'Hyper_Lime' WHERE id = 'ai-hard-3';

UPDATE player SET avatar_key = '/images/bots/ludo_cyan.jpg', handle = 'Master_Cyan' WHERE id = 'ai-expert';
UPDATE player SET avatar_key = '/images/bots/ludo_fuchsia.jpg', handle = 'Master_Fuchsia' WHERE id = 'ai-expert-1';
UPDATE player SET avatar_key = '/images/bots/ludo_amber.jpg', handle = 'Master_Amber' WHERE id = 'ai-expert-2';
UPDATE player SET avatar_key = '/images/bots/ludo_lime.jpg', handle = 'Master_Lime' WHERE id = 'ai-expert-3';

COMMIT;
