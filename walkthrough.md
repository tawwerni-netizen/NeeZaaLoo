# Nizalo Live Arena & UI Dazzle Update

## 1. Fixed the "Bots Standing Still" (Live Arena Bug)
- Discovered that the `live-arena-simulator.mjs` was inserting 1 to 4 fake `ACTION` events into the `duel_event` table for each bot match.
- This caused a desync: the gateway loaded the board at move 0, but the events array had length 3. When the bot played its first move, it got inserted as `seq: 4`, causing a confusing sequence of events and leading to spectator state issues where the board appeared stuck.
- **Fix:** Removed the fake `ACTION` event generation completely. Bots now play naturally from Move 1 as soon as the Gateway claims the match, allowing spectators to watch real, uncorrupted gameplay.

## 2. Redesigned Live Arena (/watch)
- The Live Arena was described as dull. We added a stunning, 8k glassmorphic esports neon hero banner to the top of the page.
- Match cards now feature an epic abstract VS background behind them.
- Fixed the "Copy Paste Ranks" issue: bots previously had no avatars and identical layouts. We integrated dynamic `dicebear` bot avatars based on their handle, and color-coded their rating borders (Gold for 2000+, Blue for 1500+) so each bot looks unique and ranks are instantly readable.

## 3. Redesigned "Choose Challenge" (LiveDuelLobby)
- The user complained it was hard to tell which game a match belonged to because the badge was a tiny 26px image.
- We completely overhauled the Challenge Cards. They now feature a full-width background image of the specific game (e.g. `chess-hero.jpg`) with a dark, glassmorphic overlay.
- Added glassmorphic styling to the game name and badge to make it pop out elegantly.

## 4. Dazzled the Homepage and Play Page
- We generated an epic 8k "Main Hero Background" featuring glowing holographic game pieces (chess, dice, cards) in a cyberpunk arena.
- Replaced the plain radial gradient on the main Landing Page Hero with this epic cinematic background.
- Upgraded the `/play` page hero section to also use this background, styled with sleek borders and shadow for an instant premium feel.
