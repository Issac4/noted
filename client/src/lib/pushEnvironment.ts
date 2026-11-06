export interface PushEnvironment {
  secure: boolean;
  ios: boolean;
  standalone: boolean;
  supported: boolean;
  permission: NotificationPermission | "unsupported";
}

export function pushSetupError(environment: PushEnvironment): string | null {
  if (!environment.secure) return "Notifications need HTTPS. Open Noted at its secure https:// address; the http:// local-network address cannot receive push alerts.";
  if (environment.ios && !environment.standalone) return "On iPhone or iPad, open Noted in Safari, tap Share → Add to Home Screen, then open its Home Screen icon and enable alerts there. Web Push needs iOS/iPadOS 16.4 or later.";
  if (!environment.supported) return "This browser does not support push alerts. On iPhone or iPad, use iOS/iPadOS 16.4 or later and open Noted from its Home Screen icon.";
  if (environment.permission === "denied") return environment.ios
    ? "Notifications are blocked. On your iPhone, open Settings → Notifications → Noted and turn on Allow Notifications, then return here."
    : "Notifications are blocked. Allow notifications for Noted in your browser's site settings, then try again.";
  return null;
}
