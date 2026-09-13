/**
 * The Referral Settlement Sweep.
 *
 * Runs periodically in the background worker:
 *  1. Discovers confirmed deposits from attributed players meeting the qualifying threshold (>= $5).
 *  2. Evaluates anti-fraud risk score.
 *  3. Atomically credits the referrer via double-entry ledger_post().
 *  4. Advances reward state to SETTLED (or FLAGGED_REVIEW / REJECTED_FRAUD).
 */
import { evaluateReferralRisk } from "./anti-fraud.mjs";

export function createReferralSweep(db, { defaultRewardMinor = 1_000_000n, defaultThresholdMinor = 5_000_000n } = {}) {
  return {
    async sweepDue() {
      // 1. Find attributed players with a CREDITED deposit >= threshold where no referral_reward row exists yet
      const candidateDeposits = await db.query(
        `SELECT
           a.id as attribution_id,
           a.referrer_player_id,
           a.referred_player_id,
           d.id as deposit_id,
           d.observed_amount_minor::bigint as deposit_amount,
           d.asset
         FROM referral_attribution a
         JOIN deposit d ON d.player_id = a.referred_player_id AND d.status = 'CREDITED'
         LEFT JOIN referral_reward r ON r.attribution_id = a.id
         WHERE r.id IS NULL
           AND d.observed_amount_minor::bigint >= $1
         ORDER BY d.credited_at ASC
         LIMIT 25`,
        [defaultThresholdMinor.toString()]
      );

      let processedCount = 0;
      let settledCount = 0;

      for (const row of candidateDeposits.rows) {
        processedCount++;
        const risk = await evaluateReferralRisk(db, {
          referrerId: row.referrer_player_id,
          referredId: row.referred_player_id,
          depositId: row.deposit_id,
        });

        const initialState = risk.isTerminalFraud
          ? "REJECTED_FRAUD"
          : risk.isHighRisk
          ? "FLAGGED_REVIEW"
          : "ELIGIBLE";

        const rewardRow = await db.query(
          `INSERT INTO referral_reward (
             attribution_id, referrer_player_id, referred_player_id,
             qualifying_deposit_id, reward_asset, reward_amount_minor,
             qualifying_threshold_minor, state, risk_score, risk_reasons
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           ON CONFLICT (qualifying_deposit_id) DO NOTHING
           RETURNING id`,
          [
            row.attribution_id,
            row.referrer_player_id,
            row.referred_player_id,
            row.deposit_id,
            row.asset || "USDT",
            defaultRewardMinor.toString(),
            defaultThresholdMinor.toString(),
            initialState,
            risk.score,
            JSON.stringify(risk.reasons),
          ]
        );

        if (!rewardRow.rows.length) continue;
        const rewardId = rewardRow.rows[0].id;

        // If clean / eligible, settle immediately via double-entry ledger_post
        if (initialState === "ELIGIBLE") {
          const settled = await this.settleReward(rewardId);
          if (settled) settledCount++;
        }
      }

      // 2. Also sweep any existing ELIGIBLE rewards that were deferred or approved by admin
      const eligibleRewards = await db.query(
        "SELECT id FROM referral_reward WHERE state = 'ELIGIBLE' LIMIT 25"
      );

      for (const row of eligibleRewards.rows) {
        const settled = await this.settleReward(row.id);
        if (settled) settledCount++;
      }

      return { processed: processedCount, settled: settledCount };
    },

    /** Atomically settle a single eligible reward via the double-entry ledger */
    async settleReward(rewardId) {
      return db.transaction(async (tx) => {
        const r = await tx.query(
          "SELECT * FROM referral_reward WHERE id = $1 FOR UPDATE",
          [rewardId]
        );
        if (!r.rows.length) return false;
        const reward = r.rows[0];
        if (reward.state !== "ELIGIBLE") return false;

        const amount = BigInt(reward.reward_amount_minor);
        const asset = reward.reward_asset || "USDT";

        // Double-entry posting:
        // Debit marketing expense (-amount)
        // Credit referrer available balance (+amount)
        const posted = await tx.query(
          `SELECT * FROM ledger_post($1, 'REFERRAL_REWARD', 'SYSTEM', NULL, $2::jsonb, $3, NULL, 'referral_reward', $4)`,
          [
            `ref_reward:${reward.id}`,
            JSON.stringify([
              { account: "platform:marketing:referral_rewards", amount: amount.toString() },
              { account: `user:${reward.referrer_player_id}:available`, amount: (-amount).toString() },
            ]),
            asset,
            reward.id,
          ]
        );

        const txId = posted.rows[0]?.transaction_id;

        await tx.query(
          `UPDATE referral_reward
              SET state = 'SETTLED',
                  ledger_tx_id = $2,
                  settled_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [reward.id, txId]
        );

        return true;
      });
    },
  };
}
