import type { PushSubscribePayload } from "@todo-app/shared";

/**
 * Convert a base64url VAPID public key string into a Uint8Array for PushManager.subscribe()
 */
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

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Check whether this browser currently has an active PushSubscription
 */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Request notification permission, subscribe the browser via Web Push VAPID key,
 * and associate the subscription with the current device's memberId on the server.
 */
export async function subscribeDeviceToPush(
  memberId: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) {
    return {
      ok: false,
      error:
        "Web Push is not supported in this browser. On iPhone/iPad, tap Share → 'Add to Home Screen' first.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      error: "Notification permission was denied. Please enable notifications in browser settings.",
    };
  }

  try {
    const keyRes = await fetch("/api/push/vapid-public-key", { headers });
    if (!keyRes.ok) {
      return { ok: false, error: "Could not fetch server push key." };
    }
    const { publicKey } = (await keyRes.json()) as { publicKey: string };

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      const appServerKey = urlBase64ToUint8Array(publicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer as ArrayBuffer,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { ok: false, error: "Browser returned an incomplete push subscription." };
    }

    const payload: PushSubscribePayload = {
      memberId,
      subscription: {
        endpoint: subJson.endpoint,
        keys: {
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        },
      },
    };

    const subRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!subRes.ok) {
      return { ok: false, error: "Failed to save push subscription on server." };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to enable push notifications.",
    };
  }
}

/**
 * Send a test push notification to all devices subscribed for memberId
 */
export async function sendTestPushNotification(
  memberId: string,
  headers: Record<string, string>
): Promise<boolean> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ memberId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
