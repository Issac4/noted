/** A public project URL is valid VAPID contact metadata; a .local placeholder is not. */
export const DEFAULT_VAPID_SUBJECT = "https://github.com/Issac4/noted";
export const PUSH_TIMEOUT_MS = 10_000;

export function resolveVapidSubject(configured?: string): string {
  const subject = configured?.trim();
  if (!subject) return DEFAULT_VAPID_SUBJECT;
  const parsed = new URL(subject);
  const host = parsed.protocol === "mailto:" ? parsed.pathname.split("@").pop()?.toLowerCase() || "" : parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return DEFAULT_VAPID_SUBJECT;
  if (!["https:", "mailto:"].includes(parsed.protocol)) throw new Error("VAPID subject must be an https: or mailto: URL");
  return subject;
}

const providerReasons = new Set(["BadJwtToken", "BadDeviceToken", "BadWebPushTopic", "BadTtl", "BadUrgency", "DeviceTokenNotForTopic", "ExpiredProviderToken", "InvalidProviderToken", "MissingProviderToken", "TopicDisallowed", "Unregistered", "TooManyRequests", "ServiceUnavailable", "Shutdown", "IdleTimeout"]);
const networkReasons = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN"]);

/** Only return known error codes, never raw provider bodies, endpoints or keys. */
export function pushFailureCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { body?: unknown; code?: unknown; message?: unknown };
  if (typeof value.body === "string") {
    try {
      const reason = JSON.parse(value.body)?.reason;
      if (providerReasons.has(reason)) return reason;
    } catch { /* Not an APNs JSON error. */ }
  }
  if (typeof value.code === "string" && networkReasons.has(value.code)) return value.code;
  if (value.message === "Socket timeout") return "ETIMEDOUT";
  return null;
}

export function pushDeliveryFailure(result: { failed: number; rejectedStatusCodes: number[]; failureCodes: string[] }): string {
  if (!result.failed) return "No active subscription was found for this device. Enable alerts again.";
  const detail = [...result.failureCodes, ...result.rejectedStatusCodes.map(code => `HTTP ${code}`)].join(", ");
  if (result.failureCodes.some(code => ["BadJwtToken", "ExpiredProviderToken", "InvalidProviderToken", "MissingProviderToken"].includes(code))) {
    return `Apple rejected the server's push signing (${detail}). This is a server-side authorization problem; keep this device's subscription and report this message.`;
  }
  if (result.failureCodes.includes("ETIMEDOUT")) return "The server timed out contacting the push service after 10 seconds. Delivery was not confirmed.";
  return `The push service rejected this device's test${detail ? ` (${detail})` : ""}. Delivery was not confirmed.`;
}
