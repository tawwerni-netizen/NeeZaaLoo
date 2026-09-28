import { randomUUID } from "node:crypto";

export const StoreError = {
  UNKNOWN_ITEM: "UNKNOWN_ITEM",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  ALREADY_OWNED: "ALREADY_OWNED",
};

export function createStoreService(db, {
  awardFrame = async () => ({ awarded: true }),
  awardBadge = async () => ({ awarded: true }),
  purchasePremium = async () => ({ ok: true }),
  now = () => Date.now()
} = {}) {
  
  async function ledgerPost(key, purpose, actorType, actorId, legsJson, asset, memo) {
    return db.query(
      `SELECT * FROM ledger_post($1, $2, $3::ledger_actor_type, $4, $5::jsonb, $6, $7)`,
      [key, purpose, actorType, actorId, legsJson, asset, memo]
    );
  }

  async function ensureCoinAccount(playerId) {
    await db.query(
      `INSERT INTO ledger_account (key, owner_type, owner_id, account_type, normal_side, allow_negative, asset)
       VALUES ($1, 'USER', $2, 'LIABILITY', 'CREDIT', FALSE, 'COIN')
       ON CONFLICT (key, asset) DO NOTHING`,
      [`user:${playerId}:available`, playerId]
    );
  }

  // Hardcoded catalog for now
  const COIN_PACKS = {
    "c1": { asset: "USDT", cost: 1_000_000, yields: 100 },
    "c2": { asset: "USDT", cost: 5_000_000, yields: 550 },
    "c3": { asset: "USDT", cost: 10_000_000, yields: 1400 },
    "c4": { asset: "USDT", cost: 20_000_000, yields: 3000 },
    "pack_1000": { asset: "USDT", cost: 10_000_000, yields: 1000 },
    "pack_2150": { asset: "USDT", cost: 20_000_000, yields: 2150 },
    "pack_5500": { asset: "USDT", cost: 50_000_000, yields: 5500 },
    "pack_12000": { asset: "USDT", cost: 100_000_000, yields: 12000 },
  };

  const COSMETICS = {
    "cos1": { type: "frame", cost: 500, code: "neon" },
    "cos2": { type: "frame", cost: 800, code: "gold" },
    "cos3": { type: "frame", cost: 1200, code: "neon" },
    "cos4": { type: "badge", cost: 300, code: "veteran" },
    "frame_neon": { type: "frame", cost: 500, code: "neon" },
    "frame_gold": { type: "frame", cost: 800, code: "gold" },
    "badge_veteran": { type: "badge", cost: 300, code: "veteran" },
  };

  const PASSES = {
    "pass1": { type: "pass", cost: 15_000_000, seasonId: "season_1" },
    "premium_pass": { type: "pass", cost: 5_000_000, seasonId: "season_1" },
  };

  async function buyCoins(playerId, packId) {
    const pack = COIN_PACKS[packId];
    if (!pack) return { ok: false, reason: StoreError.UNKNOWN_ITEM };

    await ensureCoinAccount(playerId);

    const idempotencyUsdt = `store:buy:usdt:${playerId}:${packId}:${now()}:${randomUUID()}`;
    const idempotencyCoin = `store:buy:coin:${playerId}:${packId}:${now()}:${randomUUID()}`;

    // 1. Deduct USDT
    try {
      await ledgerPost(
        idempotencyUsdt,
        "STORE_PURCHASE",
        "USER",
        playerId,
        JSON.stringify([
          { account: `user:${playerId}:available`, amount: pack.cost },
          { account: `platform:store:revenue`, amount: -pack.cost }
        ]),
        pack.asset,
        "Bought coin pack"
      );
    } catch (e) {
      if (e.message && (e.message.includes("insufficient funds") || e.message.includes("never_negative"))) {
        return { ok: false, reason: StoreError.INSUFFICIENT_FUNDS };
      }
      throw e;
    }

    // 2. Issue COIN
    await ledgerPost(
      idempotencyCoin,
      "STORE_ISSUANCE",
      "SYSTEM",
      "store",
      JSON.stringify([
        { account: `platform:store:issuance`, amount: pack.yields },
        { account: `user:${playerId}:available`, amount: -pack.yields }
      ]),
      "COIN",
      "Issued coins for pack"
    );

    return { ok: true, yields: pack.yields };
  }

  async function buyCosmetic(playerId, itemId) {
    const item = COSMETICS[itemId];
    if (!item) return { ok: false, reason: StoreError.UNKNOWN_ITEM };

    await ensureCoinAccount(playerId);

    const idempotency = `store:buy:cosmetic:${playerId}:${itemId}:${now()}:${randomUUID()}`;

    // 1. Deduct COIN
    try {
      await ledgerPost(
        idempotency,
        "STORE_SPEND",
        "USER",
        playerId,
        JSON.stringify([
          { account: `user:${playerId}:available`, amount: item.cost },
          { account: `platform:store:revenue`, amount: -item.cost }
        ]),
        "COIN",
        `Bought cosmetic ${itemId}`
      );
    } catch (e) {
      if (e.message && (e.message.includes("insufficient funds") || e.message.includes("never_negative"))) {
        return { ok: false, reason: StoreError.INSUFFICIENT_FUNDS };
      }
      throw e;
    }

    // 2. Award cosmetic
    let awardRes;
    if (item.type === "frame") {
      awardRes = await awardFrame(playerId, item.code);
    } else if (item.type === "badge") {
      awardRes = await awardBadge(playerId, item.code);
    }

    if (awardRes && !awardRes.awarded) {
      return { ok: false, reason: StoreError.ALREADY_OWNED };
    }

    return { ok: true };
  }

  async function buyPass(playerId, itemId) {
    const item = PASSES[itemId];
    if (!item) return { ok: false, reason: StoreError.UNKNOWN_ITEM };

    const res = await purchasePremium({ playerId, seasonId: item.seasonId });
    if (!res.ok) {
      if (res.reason === "INSUFFICIENT_FUNDS") {
        return { ok: false, reason: StoreError.INSUFFICIENT_FUNDS };
      }
      if (res.reason === "ALREADY_PREMIUM") {
        return { ok: false, reason: StoreError.ALREADY_OWNED };
      }
      return { ok: false, reason: res.reason };
    }

    return { ok: true };
  }

  return { buyCoins, buyCosmetic, buyPass };
}
