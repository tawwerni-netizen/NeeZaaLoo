import { get, post, del } from "./api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermissionState(): NotificationPermission | "unsupported" {
  if (!isPushNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function checkPushSubscriptionActive(): Promise<boolean> {
  if (!isPushNotificationSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

export async function subscribeToPushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushNotificationSupported()) {
    return { ok: false, reason: "NOT_SUPPORTED" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "PERMISSION_DENIED" };
    }

    const reg = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from backend
    const vapidRes = await get<{ publicKey: string }>("/v1/notifications/vapid-public-key");
    if (!vapidRes?.publicKey) {
      return { ok: false, reason: "MISSING_VAPID_KEY" };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const convertedKey = urlBase64ToUint8Array(vapidRes.publicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });
    }

    const subJson = sub.toJSON();
    if (!sub.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { ok: false, reason: "MALFORMED_SUBSCRIPTION" };
    }

    // Register subscription on server
    await post("/v1/me/push-subscriptions", {
      endpoint: sub.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
    });

    return { ok: true };
  } catch (err: any) {
    console.error("[push] Subscribe error:", err);
    return { ok: false, reason: err?.message || "UNKNOWN_ERROR" };
  }
}

export async function unsubscribeFromPushNotifications(): Promise<{ ok: boolean }> {
  if (!isPushNotificationSupported()) return { ok: false };

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await del(`/v1/me/push-subscriptions?endpoint=${encodeURIComponent(sub.endpoint)}`).catch(() => {});
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch (err) {
    console.error("[push] Unsubscribe error:", err);
    return { ok: false };
  }
}
