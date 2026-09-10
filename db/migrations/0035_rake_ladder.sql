-- =============================================================================
-- 0035_rake_ladder.sql
--
-- Financial Architecture Reconciliation, item 1: the platform fee ceiling.
--
-- 0004_economy_and_settlement.sql capped rake_bps at 2000 (20%) -- a
-- deliberately conservative launch ceiling. The approved architecture raises
-- the competitive band to 10%-25% (1000-2500 bps) while explicitly allowing a
-- FREE-tier rule to charge nothing at all. The naive fix -- just widening the
-- upper bound -- would also silently open every value from 1 to 999 bps to a
-- CASH rule, which is not "a safely configured fee", it is what a fat-fingered
-- admin typing "1250" as "125" produces. So the constraint stays two-sided:
--
--   * exactly 0 is allowed (a rule that charges nothing -- FREE tier, or a
--     deliberately zero-rated CASH promotion; both are legitimate configured
--     states, never an unconfigured gap)
--   * or a value inside the documented competitive band, 1000-2500
--   * nothing else -- not negative, not above 2500, not a sub-band typo
--
-- rake.mjs mirrors this exact predicate (see its own header) so the
-- application and the database can never disagree about what a valid fee is.
-- =============================================================================

ALTER TABLE economy_rule DROP CONSTRAINT economy_rule_rake_sane;

ALTER TABLE economy_rule
  ADD CONSTRAINT economy_rule_rake_sane
    CHECK (rake_bps = 0 OR rake_bps BETWEEN 1000 AND 2500);
