import { randomUUID } from "node:crypto";

export const SeasonError = Object.freeze({
  NO_ACTIVE_SEASON: "NO_ACTIVE_SEASON",
  NOT_ENOUGH_EXP: "NOT_ENOUGH_EXP",
  ALREADY_CLAIMED: "ALREADY_CLAIMED",
  PREMIUM_REQUIRED: "PREMIUM_REQUIRED",
  INVALID_TIER: "INVALID_TIER",
  ALREADY_PREMIUM: "ALREADY_PREMIUM",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
});

export function createSeasonService(db) {

  async function getActiveSeason() {
    const r = await db.query(
      `SELECT id, name, starts_at, ends_at 
       FROM season 
       WHERE now() >= starts_at AND now() < ends_at 
       ORDER BY starts_at DESC LIMIT 1`
    );
    return r.rows[0] || null;
  }

  async function myProgress(playerId) {
    const season = await getActiveSeason();
    if (!season) return { active: false };

    // Calculate Seasonal EXP by summing EXP events in this season's window
    const expRes = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS seasonal_exp 
       FROM exp_event 
       WHERE player_id = $1 AND created_at >= $2 AND created_at < $3`,
      [playerId, season.starts_at, season.ends_at]
    );
    const seasonalExp = expRes.rows[0].seasonal_exp;

    // Check Premium status
    const premRes = await db.query(
      `SELECT purchased_at FROM battle_pass_premium WHERE player_id = $1 AND season_id = $2`,
      [playerId, season.id]
    );
    const isPremium = premRes.rows.length > 0;

    // Get Tiers
    const tiersRes = await db.query(
      `SELECT level, required_exp, 
              free_reward_type, free_reward_asset, free_reward_amount::text AS free_reward_amount,
              premium_reward_type, premium_reward_asset, premium_reward_amount::text AS premium_reward_amount
       FROM battle_pass_tier 
       WHERE season_id = $1 ORDER BY level ASC`,
      [season.id]
    );

    // Get Claims
    const claimsRes = await db.query(
      `SELECT level, is_premium, claimed_at 
       FROM battle_pass_claim 
       WHERE player_id = $1 AND season_id = $2`,
      [playerId, season.id]
    );
    const claims = claimsRes.rows;

    // Map claims for easy lookup
    const claimedFree = new Set(claims.filter(c => !c.is_premium).map(c => c.level));
    const claimedPremium = new Set(claims.filter(c => c.is_premium).map(c => c.level));

    const tiers = tiersRes.rows.map(t => ({
      level: t.level,
      requiredExp: t.required_exp,
      isUnlocked: seasonalExp >= t.required_exp,
      free: t.free_reward_type ? {
        type: t.free_reward_type,
        asset: t.free_reward_asset,
        amountMinor: t.free_reward_amount,
        claimed: claimedFree.has(t.level),
        canClaim: seasonalExp >= t.required_exp && !claimedFree.has(t.level)
      } : null,
      premium: t.premium_reward_type ? {
        type: t.premium_reward_type,
        asset: t.premium_reward_asset,
        amountMinor: t.premium_reward_amount,
        claimed: claimedPremium.has(t.level),
        canClaim: isPremium && seasonalExp >= t.required_exp && !claimedPremium.has(t.level)
      } : null
    }));

    return {
      active: true,
      season: {
        id: season.id,
        name: season.name,
        startsAt: season.starts_at,
        endsAt: season.ends_at
      },
      seasonalExp,
      isPremium,
      tiers
    };
  }

  async function purchasePremium({ playerId, seasonId }) {
    return db.transaction(async (tx) => {
      // Premium pass costs 5 USDT (fixed for now)
      const costMinor = 5000000n; 
      const asset = 'USDT';

      const premCheck = await tx.query(
        `SELECT purchased_at FROM battle_pass_premium WHERE player_id = $1 AND season_id = $2`,
        [playerId, seasonId]
      );
      if (premCheck.rows.length > 0) return { ok: false, reason: SeasonError.ALREADY_PREMIUM };

      // Check balance
      const balRes = await tx.query(
        `SELECT ledger_natural_balance('CREDIT', COALESCE(b.balance,0))::bigint AS available
         FROM ledger_account a 
         LEFT JOIN ledger_balance b ON b.account_id = a.id
         WHERE a.key = $1 AND a.asset = $2`,
        [`user:${playerId}:available`, asset]
      );
      const bal = balRes.rows.length ? BigInt(balRes.rows[0].available) : 0n;
      if (bal < costMinor) return { ok: false, reason: SeasonError.INSUFFICIENT_FUNDS };

      // Charge the player
      const txId = `bp_purchase_${playerId}_${seasonId}_${Date.now()}`;
      const legs = [
        { account: `user:${playerId}:available`, amount: costMinor.toString() },
        { account: 'platform:rake', amount: (-costMinor).toString() }
      ];
      
      await tx.query(
        `SELECT * FROM ledger_post($1, 'PURCHASE', 'USER'::ledger_actor_type, $2, $3::jsonb, $4, 'season', 'season', $5)`,
        [txId, playerId, JSON.stringify(legs), asset, seasonId]
      );

      // Unlock premium
      await tx.query(
        `INSERT INTO battle_pass_premium (player_id, season_id) VALUES ($1, $2)`,
        [playerId, seasonId]
      );

      return { ok: true };
    });
  }

  async function claimReward({ playerId, seasonId, level, track }) {
    if (track !== 'FREE' && track !== 'PREMIUM') {
      return { ok: false, reason: SeasonError.INVALID_TIER };
    }
    const isPremiumTrack = track === 'PREMIUM';

    return db.transaction(async (tx) => {
      const p = await myProgress(playerId);
      if (!p.active || p.season.id !== seasonId) return { ok: false, reason: SeasonError.NO_ACTIVE_SEASON };
      
      const tier = p.tiers.find(t => t.level === level);
      if (!tier) return { ok: false, reason: SeasonError.INVALID_TIER };
      
      if (!tier.isUnlocked) return { ok: false, reason: SeasonError.NOT_ENOUGH_EXP };

      if (isPremiumTrack && !p.isPremium) return { ok: false, reason: SeasonError.PREMIUM_REQUIRED };

      const rewardDef = isPremiumTrack ? tier.premium : tier.free;
      if (!rewardDef) return { ok: false, reason: SeasonError.INVALID_TIER };
      if (rewardDef.claimed) return { ok: false, reason: SeasonError.ALREADY_CLAIMED };

      // Insert claim
      const claimId = `bpc_${randomUUID()}`;
      await tx.query(
        `INSERT INTO battle_pass_claim (id, player_id, season_id, level, is_premium) VALUES ($1, $2, $3, $4, $5)`,
        [claimId, playerId, seasonId, level, isPremiumTrack]
      );

      // Distribute reward
      if (rewardDef.type === 'ASSET') {
        const amount = BigInt(rewardDef.amountMinor);
        const txId = `bp_reward_${claimId}`;
        const legs = [
          { account: 'platform:promotions', amount: amount.toString() },
          { account: `user:${playerId}:available`, amount: (-amount).toString() }
        ];
        // Ensure wallet open
        await tx.query(`SELECT ledger_open_user_wallet($1, $2)`, [playerId, rewardDef.asset]);
        
        await tx.query(
          `SELECT * FROM ledger_post($1, 'REWARD', 'SYSTEM'::ledger_actor_type, 'system-automation', $2::jsonb, $3, 'battle_pass_claim', 'battle_pass_claim', $4)`,
          [txId, JSON.stringify(legs), rewardDef.asset, claimId]
        );
      }

      return { ok: true, claimId };
    });
  }

  return { getActiveSeason, myProgress, purchasePremium, claimReward };
}
