-- Realigns the supported-locale list to the platform's official six
-- languages (en, zh, hi, es, ar, fr), replacing the ten-language set
-- 0014_i18n.sql originally shipped (which had ja/de/pt/ru/ko instead of
-- hi). This is a correction to match the authoritative product spec, not a
-- redesign of the localization architecture -- packages/i18n/src/locales.mjs
-- is still the single place that list lives, and nothing that reads from it
-- needed to change.
--
-- Any existing player whose saved locale is no longer on the list falls
-- back to English -- the same "unsupported -> English" rule
-- packages/i18n/src/resolve.mjs already applies everywhere else, just
-- applied once here for rows written under the old list.

UPDATE player SET locale = 'en' WHERE locale NOT IN ('en', 'zh', 'hi', 'es', 'ar', 'fr');

ALTER TABLE player DROP CONSTRAINT player_locale_supported;

ALTER TABLE player
  ADD CONSTRAINT player_locale_supported
  CHECK (locale IN ('en', 'zh', 'hi', 'es', 'ar', 'fr'));
