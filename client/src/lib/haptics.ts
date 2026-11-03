export function triggerHaptic(pattern: number | number[] = 15): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore environments where navigator.vibrate is blocked or unsupported
  }
}
