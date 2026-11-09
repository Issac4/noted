/** Public diagnostics must not expose subscriptions, signing keys or database errors. */
export function pushPreparationFailure(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/subject|vapid.*(?:https|mailto)/.test(message)) return {
    code: "invalid_vapid_subject",
    message: "The notification server's VAPID contact is invalid. The administrator must set VAPID_SUBJECT to a valid mailto: address or public https:// URL; reinstalling the app will not fix this.",
  };
  if (/vapid|public.?key|private.?key/.test(message)) return {
    code: "invalid_vapid_keys",
    message: "The notification server could not use its signing keys. This needs a server-side repair; enabling alerts again will not fix it.",
  };
  return {
    code: "push_preparation_failed",
    message: "The notification server failed before it could confirm this test. This needs a server-side check; no delivery was confirmed.",
  };
}
