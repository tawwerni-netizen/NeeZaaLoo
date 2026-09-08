-- Localization: a player's saved language preference.
--
-- Per the platform locale-resolution order (packages/i18n/src/resolve.mjs):
-- explicit choice > saved account preference > device locale > English. This
-- column is the "saved account preference" tier -- it exists so a signed-in
-- player's language survives switching devices or OS languages.
--
-- The list of codes here must stay in lockstep with
-- packages/i18n/src/locales.mjs SUPPORTED_LOCALE_CODES. There is no way to
-- share a single source of truth between SQL and application code across a
-- migration boundary, so both are considered authoritative and a new
-- language ships as a change to both in the same commit.

ALTER TABLE player
  ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
    CONSTRAINT player_locale_supported
    CHECK (locale IN ('ar', 'en', 'zh', 'es', 'ja', 'fr', 'de', 'pt', 'ru', 'ko'));
