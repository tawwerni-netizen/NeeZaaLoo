import { errorBody, sendJson } from "../router.mjs";
import { StoreError } from "../../../store/src/service.mjs";

export function registerStoreRoutes(routes, storeSvc) {
  if (!storeSvc) return;

  routes.push(
    { method: "POST", path: "/v1/store/buy/coins", action: "player.store.purchase",
      handler: async (ctx) => {
        const { actor, body } = ctx;
        if (!body.packId) return { status: 400, body: errorBody("MISSING_FIELD", "packId is required") };
        const result = await storeSvc.buyCoins(actor.id, body.packId);
        if (!result.ok) {
          if (result.reason === StoreError.INSUFFICIENT_FUNDS) {
            return { status: 402, body: errorBody("INSUFFICIENT_FUNDS", "Insufficient USDT balance to purchase this pack") };
          }
          if (result.reason === StoreError.UNKNOWN_ITEM) {
            return { status: 404, body: errorBody("UNKNOWN_ITEM", "Coin pack not found") };
          }
          return { status: 500, body: errorBody("STORE_ERROR", result.reason) };
        }
        return { body: { ok: true, yields: result.yields } };
      }
    },
    { method: "POST", path: "/v1/store/buy/cosmetic", action: "player.store.purchase",
      handler: async (ctx) => {
        const { actor, body } = ctx;
        if (!body.itemId) return { status: 400, body: errorBody("MISSING_FIELD", "itemId is required") };
        const result = await storeSvc.buyCosmetic(actor.id, body.itemId);
        if (!result.ok) {
          if (result.reason === StoreError.INSUFFICIENT_FUNDS) {
            return { status: 402, body: errorBody("INSUFFICIENT_FUNDS", "Insufficient Coins balance") };
          }
          if (result.reason === StoreError.ALREADY_OWNED) {
            return { status: 409, body: errorBody("ALREADY_OWNED", "You already own this item") };
          }
          if (result.reason === StoreError.UNKNOWN_ITEM) {
            return { status: 404, body: errorBody("UNKNOWN_ITEM", "Cosmetic item not found") };
          }
          return { status: 500, body: errorBody("STORE_ERROR", result.reason) };
        }
        return { body: { ok: true } };
      }
    },
    { method: "POST", path: "/v1/store/buy/pass", action: "player.store.purchase",
      handler: async (ctx) => {
        const { actor, body } = ctx;
        if (!body.itemId) return { status: 400, body: errorBody("MISSING_FIELD", "itemId is required") };
        const result = await storeSvc.buyPass(actor.id, body.itemId);
        if (!result.ok) {
          if (result.reason === StoreError.INSUFFICIENT_FUNDS) {
            return { status: 402, body: errorBody("INSUFFICIENT_FUNDS", "Insufficient USDT balance to purchase Battle Pass") };
          }
          if (result.reason === StoreError.ALREADY_OWNED) {
            return { status: 409, body: errorBody("ALREADY_OWNED", "You already own this pass") };
          }
          if (result.reason === StoreError.UNKNOWN_ITEM) {
            return { status: 404, body: errorBody("UNKNOWN_ITEM", "Pass item not found") };
          }
          return { status: 500, body: errorBody("STORE_ERROR", result.reason) };
        }
        return { body: { ok: true } };
      }
    }
  );
}
