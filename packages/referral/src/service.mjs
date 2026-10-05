/**
 * The Referral Service.
 *
 * Manages permanent referral codes, attributions, player dashboard aggregation,
 * and admin oversight queries.
 */

export const ReferralError = {
  CODE_NOT_FOUND: "CODE_NOT_FOUND",
  CODE_INACTIVE: "CODE_INACTIVE",
  SELF_REFERRAL: "SELF_REFERRAL",
  ALREADY_ATTRIBUTED: "ALREADY_ATTRIBUTED",
  CONTROL_DISABLED: "CONTROL_DISABLED",
  NOT_FOUND: "NOT_FOUND",
};

export function createReferralService(db) {
  return {
    /** Look up or retrieve the player's permanent referral code */
    async getReferralCode(playerId) {
      let r = await db.query(
        "SELECT code, is_active, created_at FROM referral_code WHERE player_id = $1",
        [playerId]
      );
      if (!r.rows.length) {
        // Fallback: trigger generation if missing
        const p = await db.query("SELECT handle FROM player WHERE id = $1", [playerId]);
        if (!p.rows.length) return null;
        await db.query(
          "INSERT INTO referral_code (code, player_id) VALUES (generate_referral_code($1), $2) ON CONFLICT DO NOTHING",
          [p.rows[0].handle, playerId]
        );
        r = await db.query(
          "SELECT code, is_active, created_at FROM referral_code WHERE player_id = $1",
          [playerId]
        );
      }
      return r.rows[0] ?? null;
    },

    /** Public lookup: checks if a code exists and returns the referrer's public handle */
    async resolveReferralCode(code) {
      const cleanCode = String(code ?? "").trim().toUpperCase();
      const r = await db.query(
        `SELECT rc.code, rc.is_active, p.handle as referrer_handle
         FROM referral_code rc
         JOIN player p ON p.id = rc.player_id
         WHERE rc.code = $1`,
        [cleanCode]
      );
      if (!r.rows.length) return { ok: false, reason: ReferralError.CODE_NOT_FOUND };
      const row = r.rows[0];
      if (!row.is_active) return { ok: false, reason: ReferralError.CODE_INACTIVE };
      return { ok: true, code: row.code, referrerHandle: row.referrer_handle };
    },

    /** Link a newly registered player to a referral code */
    async attributePlayer({ referredPlayerId, referralCode, contextDuelId = null }) {
      if (!referralCode) return { ok: false, reason: "NO_CODE_SUPPLIED" };
      const cleanCode = String(referralCode).trim().toUpperCase();

      const rc = await db.query(
        "SELECT player_id, is_active FROM referral_code WHERE code = $1",
        [cleanCode]
      );
      if (!rc.rows.length) return { ok: false, reason: ReferralError.CODE_NOT_FOUND };
      if (!rc.rows[0].is_active) return { ok: false, reason: ReferralError.CODE_INACTIVE };

      const referrerPlayerId = rc.rows[0].player_id;
      if (referrerPlayerId === referredPlayerId) {
        return { ok: false, reason: ReferralError.SELF_REFERRAL };
      }

      try {
        const inserted = await db.query(
          `INSERT INTO referral_attribution (referred_player_id, referrer_player_id, referral_code, context_duel_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, attributed_at`,
          [referredPlayerId, referrerPlayerId, cleanCode, contextDuelId]
        );
        return { ok: true, attributionId: inserted.rows[0].id, referrerPlayerId };
      } catch (e) {
        if (/referral_attribution_referred_player_id_key/.test(e.message)) {
          return { ok: false, reason: ReferralError.ALREADY_ATTRIBUTED };
        }
        if (/chk_no_self_referral/.test(e.message)) {
          return { ok: false, reason: ReferralError.SELF_REFERRAL };
        }
        throw e;
      }
    },

    /** Player-facing dashboard: metrics, totals, reward history */
    async getDashboard(playerId) {
      const codeRow = await this.getReferralCode(playerId);
      if (!codeRow) return null;

      const code = codeRow.code;

      // Aggregates
      const countsQuery = await db.query(
        `SELECT
           COUNT(DISTINCT a.referred_player_id)::int as total_referred,
           COALESCE(SUM(CASE WHEN r.state = 'SETTLED' THEN r.reward_amount_minor ELSE 0 END), 0)::text as confirmed_reward_minor,
           COALESCE(SUM(CASE WHEN r.state IN ('PENDING', 'RISK_CHECK', 'ELIGIBLE', 'SETTLING') THEN r.reward_amount_minor ELSE 0 END), 0)::text as pending_reward_minor,
           COALESCE(SUM(CASE WHEN r.state = 'FLAGGED_REVIEW' THEN r.reward_amount_minor ELSE 0 END), 0)::text as review_reward_minor
         FROM referral_attribution a
         LEFT JOIN referral_reward r ON r.attribution_id = a.id
         WHERE a.referrer_player_id = $1`,
        [playerId]
      );

      // Recent referral activity items
      const historyQuery = await db.query(
        `SELECT
           a.id as attribution_id,
           p.handle as referred_handle,
           a.attributed_at,
           r.state as reward_state,
           r.reward_amount_minor::text,
           r.settled_at,
           d.observed_amount_minor::text as deposit_amount_minor
         FROM referral_attribution a
         JOIN player p ON p.id = a.referred_player_id
         LEFT JOIN referral_reward r ON r.attribution_id = a.id
         LEFT JOIN deposit d ON d.id = r.qualifying_deposit_id
         WHERE a.referrer_player_id = $1
         ORDER BY a.attributed_at DESC
         LIMIT 50`,
        [playerId]
      );

      const counts = countsQuery.rows[0] ?? {
        total_referred: 0,
        confirmed_reward_minor: "0",
        pending_reward_minor: "0",
        review_reward_minor: "0",
      };

      return {
        code,
        shareUrl: `/r/${code}`,
        stats: {
          totalReferred: counts.total_referred,
          confirmedRewardMinor: counts.confirmed_reward_minor,
          pendingRewardMinor: counts.pending_reward_minor,
          reviewRewardMinor: counts.review_reward_minor,
        },
        history: historyQuery.rows.map((row) => ({
          attributionId: row.attribution_id,
          referredHandle: row.referred_handle,
          attributedAt: row.attributed_at,
          rewardState: row.reward_state ?? "ATTRIBUTED_WAITING_DEPOSIT",
          rewardAmountMinor: row.reward_amount_minor ?? "0",
          depositAmountMinor: row.deposit_amount_minor ?? null,
          settledAt: row.settled_at ?? null,
        })),
      };
    },

    /** Admin overview list of all referral attributions and reward cases */
    async getAdminReferrals({ limit = 50, offset = 0 } = {}) {
      const r = await db.query(
        `SELECT
           a.id as attribution_id,
           r1.handle as referrer_handle,
           r2.handle as referred_handle,
           a.referral_code,
           a.attributed_at,
           rw.id as reward_id,
           rw.state as reward_state,
           rw.reward_amount_minor::text,
           rw.risk_score,
           rw.risk_reasons,
           rw.settled_at
         FROM referral_attribution a
         JOIN player r1 ON r1.id = a.referrer_player_id
         JOIN player r2 ON r2.id = a.referred_player_id
         LEFT JOIN referral_reward rw ON rw.attribution_id = a.id
         ORDER BY a.attributed_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return r.rows;
    },

    /** Admin override / decision on a flagged referral reward */
    async decideReward(rewardId, { approved, adminId, reason }) {
      const r = await db.query("SELECT * FROM referral_reward WHERE id = $1", [rewardId]);
      if (!r.rows.length) return { ok: false, reason: ReferralError.NOT_FOUND };
      const reward = r.rows[0];

      if (reward.state === "SETTLED") {
        return { ok: false, reason: "ALREADY_SETTLED" };
      }

      const nextState = approved ? "ELIGIBLE" : "REJECTED_FRAUD";
      await db.query(
        `UPDATE referral_reward
            SET state = $2,
                risk_reasons = COALESCE(risk_reasons, '[]'::jsonb) || $3::jsonb,
                updated_at = NOW()
          WHERE id = $1`,
        [rewardId, nextState, JSON.stringify([{ adminId, action: approved ? "APPROVE" : "REJECT", reason, at: new Date().toISOString() }])]
      );

      return { ok: true, state: nextState };
    },
  };
}
