import type { PushSubscribePayload } from "@todo-app/shared";
import { pushSetupError } from "./pushEnvironment";

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
  return typeof window !== "undefined" && window.isSecureContext &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getPushSetupError(): string | null {
  if (typeof window === "undefined") return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return pushSetupError({
    secure: window.isSecureContext,
    ios,
    standalone: window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    supported: isPushSupported(),
    permission: "Notification" in window ? Notification.permission : "unsupported",
  });
}

async function workerReady(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("The notification service is not ready. Refresh Noted and try again.")), 15000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/**
 * Check whether this browser currently has an active PushSubscription
 */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (getPushSetupError() || !isPushSupported() || Notification.permission !== "granted") return null;
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
  const setupError = getPushSetupError();
  if (setupError) return { ok: false, error: setupError };
  try {
    // Keep the permission request directly in the button's user gesture.
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: getPushSetupError() || "Allow notifications to enable alerts for this device." };
    const keyRes = await fetch("/api/push/vapid-public-key", { headers });
    if (!keyRes.ok) {
      return { ok: false, error: "Could not fetch server push key." };
    }
    const { publicKey } = (await keyRes.json()) as { publicKey: string };

    const reg = await workerReady();
    let subscription = await reg.pushManager.getSubscription();

    const appServerKey = urlBase64ToUint8Array(publicKey);
    const existingKey = subscription?.options.applicationServerKey;
    if (subscription && existingKey) {
      const bytes = new Uint8Array(existingKey);
      if (bytes.length !== appServerKey.length || bytes.some((byte, index) => byte !== appServerKey[index])) {
        await subscription.unsubscribe();
        subscription = null;
      }
    }
    if (!subscription) {
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

/** Test the current device only. Acceptance by a push service is not delivery confirmation. */
export async function sendTestPushNotification(
  memberId: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const setupError = getPushSetupError();
    if (setupError) return { ok: false, error: setupError };
    const subscription = await getExistingPushSubscription();
    if (!subscription) return { ok: false, error: "This device is not subscribed. Enable alerts again." };
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ memberId, endpoint: subscription.endpoint }),
    });
    const result = await res.json().catch(() => null) as { ok?: boolean; sent?: number; failed?: number; expired?: number; rejectedStatusCodes?: number[]; error?: string } | null;
    const requestId = res.headers.get("X-Noted-Request-ID");
    const reference = requestId ? ` Reference: ${requestId}.` : "";
    if (!result) {
      return { ok: false, error: res.status >= 500
        ? `The notification server returned an error (HTTP ${res.status}) instead of a test result. This needs a server-side check; reinstalling will not fix it.${reference}`
        : `The notification request received an unexpected non-JSON response (HTTP ${res.status}). A proxy or sign-in page may be intercepting it.${reference}` };
    }
    if (result?.expired) {
      await subscription.unsubscribe();
      return { ok: false, error: "This device’s notification subscription expired. Tap Enable alerts to create a fresh one." };
    }
    if (result?.rejectedStatusCodes?.some(code => code === 401 || code === 403)) {
      await subscription.unsubscribe();
      return { ok: false, error: "The push service rejected this device’s authorization. Tap Enable alerts to renew its subscription, then test again." };
    }
    if (!res.ok || result.ok !== true || !Number.isInteger(result.sent) || (result.sent ?? 0) < 1 || result.failed !== 0) {
      return { ok: false, error: result.error
        ? `${result.error}${reference}`
        : `The notification API did not confirm any successful push (HTTP ${res.status}). The server response needs checking.${reference}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reach the notification service." };
  }
}
