/**
 * The compliance policy layer.
 *
 * Independent of feature code by design: every sensitive action asks this
 * module, and this module can change a market's status by CONFIGURATION rather
 * than deployment. If enabling a country requires a release, the layer has
 * failed.
 *
 * Two rules govern everything here:
 *
 *   1. FAIL CLOSED. An unlisted jurisdiction, an unscreened player, an
 *      unreachable dependency -- all resolve to "free play only", never to
 *      "allowed".
 *   2. NEVER SILENT. Every decision carries a reason code, and a user is told
 *      which requirement they have not met, to the extent disclosure is itself
 *      permitted.
 */

export const Verdict = {
  ALLOW: "ALLOW",
  DENY: "DENY",
  REQUIRE_KYC: "REQUIRE_KYC",
  REQUIRE_AGE_VERIFICATION: "REQUIRE_AGE_VERIFICATION",
  REVIEW: "REVIEW",
};

export const Reason = {
  JURISDICTION_PROHIBITED: "JURISDICTION_PROHIBITED",
  JURISDICTION_UNDETERMINED: "JURISDICTION_UNDETERMINED",
  PRODUCT_NOT_PERMITTED: "PRODUCT_NOT_PERMITTED",
  REAL_MONEY_NOT_ELIGIBLE: "REAL_MONEY_NOT_ELIGIBLE",
  CRYPTO_NOT_ELIGIBLE: "CRYPTO_NOT_ELIGIBLE",
  UNDER_AGE: "UNDER_AGE",
  AGE_UNVERIFIED: "AGE_UNVERIFIED",
  KYC_TIER_TOO_LOW: "KYC_TIER_TOO_LOW",
  SANCTIONS_NOT_CLEAR: "SANCTIONS_NOT_CLEAR",
  SELF_EXCLUDED: "SELF_EXCLUDED",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  NO_JURISDICTION: "NO_JURISDICTION",
  GEO_MISMATCH: "GEO_MISMATCH",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
};

const TIER_ORDER = { TIER_0: 0, TIER_1: 1, TIER_2: 2, TIER_3: 3 };

/** The products the market matrix actually lists. Money movement is separate. */
const PLAY_PRODUCTS = new Set(["FREE_PLAY", "RANKED", "CASH_DUEL", "CASH_TOURNAMENT"]);
const tierAtLeast = (have, need) => TIER_ORDER[have] >= TIER_ORDER[need];

/** What each product needs, over and above what the market requires. */
const PRODUCT_REQUIREMENTS = {
  FREE_PLAY: { realMoney: false, minKyc: "TIER_0" },
  RANKED: { realMoney: false, minKyc: "TIER_0" },
  CASH_DUEL: { realMoney: true, minKyc: "TIER_1" },
  CASH_TOURNAMENT: { realMoney: true, minKyc: "TIER_1" },
  DEPOSIT: { realMoney: true, minKyc: "TIER_1", crypto: true },
  WITHDRAWAL: { realMoney: true, minKyc: "TIER_2", crypto: true },
};

export function createComplianceService(db, { now = () => Date.now() } = {}) {
  const svc = {
    /** The market matrix, resolved most-specific-first, defaulting closed. */
    async resolveMarket(countryCode, regionCode = null) {
      const r = await db.query(
        "SELECT * FROM market_resolve($1,$2)", [countryCode, regionCode]
      );
      return r.rows[0];
    },

    /**
     * The single question every sensitive action asks.
     *
     * @param {string} playerId
     * @param {keyof PRODUCT_REQUIREMENTS} product
     * @param {object} [opts] { observedCountry } for travel-mismatch detection
     */
    async can(playerId, product, opts = {}) {
      const need = PRODUCT_REQUIREMENTS[product];
      if (!need) return deny(Reason.PRODUCT_NOT_PERMITTED, `unknown product: ${product}`);

      // Self-exclusion is checked FIRST and outranks everything, including an
      // otherwise perfectly eligible player in a fully licensed market.
      const excluded = await db.query("SELECT self_excluded($1) AS x", [playerId]);
      if (excluded.rows[0].x) return deny(Reason.SELF_EXCLUDED);

      const j = await db.query(
        "SELECT country_code, region_code FROM player_jurisdiction WHERE player_id=$1",
        [playerId]
      );
      if (!j.rows.length) {
        // Free play is still allowed to someone we have not placed yet; nothing
        // involving money is.
        return need.realMoney
          ? deny(Reason.NO_JURISDICTION)
          : allow("no jurisdiction on file; free play only");
      }

      const market = await svc.resolveMarket(j.rows[0].country_code, j.rows[0].region_code);

      if (market.legal_status === "PROHIBITED" || market.geo_rule === "BLOCK") {
        return deny(Reason.JURISDICTION_PROHIBITED, market.country_code);
      }
      // Order matters for the REASON, not the outcome. A cash product in an
      // unruled market is denied either way, but "this market has no legal
      // determination" tells the user and the support agent something, while
      // "product not permitted" tells them nothing they can act on.
      if (need.realMoney) {
        if (market.legal_status === "UNDETERMINED") {
          return deny(Reason.JURISDICTION_UNDETERMINED,
            "this market has no legal determination, so only free play is available");
        }
        if (!market.real_money_eligible || market.geo_rule === "ALLOW_FREE_PLAY_ONLY") {
          return deny(Reason.REAL_MONEY_NOT_ELIGIBLE);
        }
        if (need.crypto && !market.crypto_eligible) {
          return deny(Reason.CRYPTO_NOT_ELIGIBLE);
        }

        const clear = await db.query("SELECT sanctions_clear($1) AS ok", [playerId]);
        if (!clear.rows[0].ok) return deny(Reason.SANCTIONS_NOT_CLEAR);
      }

      // DEPOSIT and WITHDRAWAL are not products in the market matrix; they are
      // gated by real_money_eligible and crypto_eligible above.
      if (PLAY_PRODUCTS.has(product) && !market.allowed_products.includes(product)) {
        return deny(Reason.PRODUCT_NOT_PERMITTED, product);
      }

      // Age. Attested at registration, VERIFIED at KYC; only the verified value
      // gates money.
      const requiredTier = maxTier(need.minKyc, market.kyc_requirement);
      if (TIER_ORDER[requiredTier] > 0) {
        const age = await db.query("SELECT player_age_years($1) AS y", [playerId]);
        const years = age.rows[0]?.y ?? null;
        if (years === null) {
          return { verdict: Verdict.REQUIRE_AGE_VERIFICATION, reason: Reason.AGE_UNVERIFIED };
        }
        if (years < market.minimum_age) {
          return deny(Reason.UNDER_AGE, `minimum age in this market is ${market.minimum_age}`);
        }
      }

      const have = (await db.query("SELECT kyc_effective_tier($1) AS t", [playerId])).rows[0].t;
      if (!tierAtLeast(have, requiredTier)) {
        return {
          verdict: Verdict.REQUIRE_KYC,
          reason: Reason.KYC_TIER_TOO_LOW,
          detail: `${product} requires ${requiredTier}; you hold ${have}`,
          requiredTier,
        };
      }

      // Travel: the home market governs, but a mismatch is worth a look. It is
      // a review signal, never an automatic denial -- people travel.
      if (opts.observedCountry && opts.observedCountry !== j.rows[0].country_code) {
        return {
          verdict: Verdict.REVIEW, reason: Reason.GEO_MISMATCH,
          detail: `home ${j.rows[0].country_code}, observed ${opts.observedCountry}`,
        };
      }

      return allow(`${product} permitted in ${market.country_code}/${market.region_code}`);
    },

    // --- Responsible competition --------------------------------------------

    /**
     * Set a limit.
     *
     * Tightening takes effect immediately. Loosening waits out a cooling-off
     * window: a player must not be able to raise their own ceiling in the
     * moment they most want to.
     */
    async setLimit({ playerId, kind, valueMinor, coolingOffHours = 24 }) {
      const current = await db.query(
        "SELECT responsible_limit_current($1,$2) AS v", [playerId, kind]
      );
      const currentValue = current.rows[0].v === null ? null : BigInt(current.rows[0].v);
      const next = BigInt(valueMinor);
      const isLoosening = currentValue !== null && next > currentValue;

      await db.query(
        `INSERT INTO responsible_limit (player_id, kind, value_minor, effective_from)
         VALUES ($1,$2,$3, now() + ($4 || ' hours')::interval)`,
        [playerId, kind, next.toString(), isLoosening ? String(coolingOffHours) : "0"]
      );
      return {
        ok: true,
        effectiveImmediately: !isLoosening,
        effectiveInHours: isLoosening ? coolingOffHours : 0,
      };
    },

    async checkLimit({ playerId, kind, proposedMinor, spentMinor = 0n }) {
      const r = await db.query("SELECT responsible_limit_current($1,$2) AS v", [playerId, kind]);
      if (r.rows[0].v === null) return allow("no limit set");
      const limit = BigInt(r.rows[0].v);
      const total = BigInt(spentMinor) + BigInt(proposedMinor);
      return total > limit
        ? deny(Reason.LIMIT_EXCEEDED, `limit ${limit}, would reach ${total}`)
        : allow("within limit");
    },

    // --- Self-exclusion ------------------------------------------------------

    async selfExclude({ playerId, permanent = false, days = null, reason = null }) {
      await db.query(
        `INSERT INTO self_exclusion (player_id, permanent, ends_at, reason)
         VALUES ($1,$2, CASE WHEN $2 THEN NULL ELSE now() + ($3 || ' days')::interval END, $4)`,
        [playerId, permanent, days === null ? "30" : String(days), reason]
      );
      return { ok: true, permanent };
    },

    isSelfExcluded: async (playerId) =>
      (await db.query("SELECT self_excluded($1) AS x", [playerId])).rows[0].x,

    // --- Skill evidence ------------------------------------------------------

    /**
     * Record one duel's contribution to the skill-vs-chance argument.
     * Cheap now, impossible to reconstruct later.
     */
    async recordSkillEvidence(duelId) {
      const r = await db.query(
        `SELECT d.id, d.game_id, d.result, d.seat_0, d.seat_1
           FROM duel d WHERE d.id = $1`,
        [duelId]
      );
      if (!r.rows.length) return { ok: false, reason: "NOT_FOUND" };
      const d = r.rows[0];
      if (!d.result) return { ok: false, reason: "NOT_COMPLETED" };

      // Ratings BEFORE the duel, which is what the correlation must be measured
      // against -- using post-duel ratings would build the answer into the data.
      const before = await db.query(
        `SELECT player_id, rating_before_x100, rating_after_x100
           FROM rating_change WHERE duel_id=$1`, [duelId]
      );
      if (before.rows.length !== 2) return { ok: false, reason: "NO_RATING_CHANGE" };

      const byId = Object.fromEntries(before.rows.map((x) => [x.player_id, x]));
      const a = byId[d.seat_0], b = byId[d.seat_1];
      const gap = Math.abs(a.rating_before_x100 - b.rating_before_x100);
      const wasDraw = d.result === "1/2-1/2";
      const higherRatedWon = wasDraw ? null
        : (a.rating_before_x100 >= b.rating_before_x100) === (d.result === "1-0");

      await db.query(
        `INSERT INTO skill_evidence
           (game_id, duel_id, higher_rated_won, rating_gap_x100, was_draw)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (duel_id) DO NOTHING`,
        [d.game_id, duelId, higherRatedWon, gap, wasDraw]
      );
      return { ok: true, higherRatedWon, ratingGapX100: gap, wasDraw };
    },

    async skillCorrelation(gameId) {
      const r = await db.query(
        "SELECT * FROM skill_correlation WHERE game_id=$1 ORDER BY gap_bucket", [gameId]
      );
      return r.rows;
    },
  };

  return svc;
}

const allow = (detail) => ({ verdict: Verdict.ALLOW, reason: "OK", detail });
const deny = (reason, detail) => ({ verdict: Verdict.DENY, reason, detail });
const maxTier = (a, b) => (TIER_ORDER[a] >= TIER_ORDER[b] ? a : b);

export { PRODUCT_REQUIREMENTS, TIER_ORDER };
