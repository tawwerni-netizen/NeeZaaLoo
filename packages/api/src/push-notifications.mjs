/**
 * Production Web Push Notification Service.
 *
 * Implements standard RFC 8291 / RFC 8292 Web Push protocol with VAPID authentication.
 * Delivers instant lock-screen & desktop push alerts to subscribed devices for:
 * - Match readiness (turn / duel start)
 * - Tournament round pairings & prize distribution
 * - Direct challenges from friends
 * - Local payment & crypto wallet credits
 * - Support ticket staff responses
 */
import webpush from "web-push";
import { randomUUID } from "node:crypto";

export const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BHUPhHvdTbRY1yErKwCBjCBFVAahioDUTGlPQgInJt3HG80htRQerBT7oBSp1rlDVvFEzk_-97QPAbls3au9578";

export const DEFAULT_VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "V2YAJNgakPcJtmKE1XQ8RTJNa8663ex1ZM1P9v_q-OI";

export const DEFAULT_VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@nizalo.com";

try {
  webpush.setVapidDetails(
    DEFAULT_VAPID_SUBJECT,
    DEFAULT_VAPID_PUBLIC_KEY,
    DEFAULT_VAPID_PRIVATE_KEY
  );
} catch (err) {
  console.error("[web-push] Failed to initialize VAPID credentials:", err.message);
}

/**
 * Register or update a browser push subscription for a player.
 */
export async function registerPushSubscription(db, { playerId, endpoint, p256dh, auth, userAgent }) {
  if (!playerId || !endpoint || !p256dh || !auth) {
    throw new Error("playerId, endpoint, p256dh, and auth keys are required");
  }

  const id = `sub_${randomUUID()}`;
  await db.query(
    `INSERT INTO push_subscription (id, player_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (endpoint) DO UPDATE
     SET player_id = EXCLUDED.player_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = COALESCE(EXCLUDED.user_agent, push_subscription.user_agent),
         last_seen_at = now()`,
    [id, playerId, endpoint, p256dh, auth, userAgent || null]
  );

  return { ok: true, subscriptionId: id };
}

/**
 * Remove an existing push subscription (e.g. user toggled notifications off).
 */
export async function removePushSubscription(db, { playerId, endpoint }) {
  if (!playerId || !endpoint) return { ok: false };
  await db.query(
    "DELETE FROM push_subscription WHERE player_id = $1 AND endpoint = $2",
    [playerId, endpoint]
  );
  return { ok: true };
}

/**
 * Dispatch a Web Push notification to all active devices registered for a player.
 * Automatically purges subscriptions that have expired or been revoked (HTTP 404/410).
 */
export async function sendPushToPlayer(db, playerId, { title, body, icon = "/icon-192.png", url = "/", data = {} } = {}) {
  if (!db || !playerId) return { sent: 0, failed: 0 };

  try {
    const res = await db.query(
      "SELECT id, endpoint, p256dh, auth FROM push_subscription WHERE player_id = $1",
      [playerId]
    );

    if (res.rows.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const payload = JSON.stringify({
      title: title || "نيزالو | Nizalo Arena",
      body: body || "",
      icon: icon || "/icon-192.png",
      badge: "/badge-72.png",
      data: {
        url: url || "/",
        ...data,
      },
    });

    let sent = 0;
    let failed = 0;

    await Promise.all(
      res.rows.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, payload, {
            TTL: 60 * 60, // 1 hour time-to-live
            urgency: "high",
          });
          sent++;
        } catch (err) {
          failed++;
          const statusCode = err?.statusCode;
          // HTTP 404 or 410 indicates the subscription is gone or expired
          if (statusCode === 404 || statusCode === 410) {
            db.query("DELETE FROM push_subscription WHERE id = $1", [sub.id]).catch(() => {});
          }
        }
      })
    );

    return { sent, failed };
  } catch (err) {
    console.error("[web-push] sendPushToPlayer error:", err.message);
    return { sent: 0, failed: 0, error: err.message };
  }
}
