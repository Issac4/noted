import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { pushSetupError } from "../src/lib/pushEnvironment.ts";
import { sendTestPushNotification } from "../src/lib/push.ts";

const ready = { secure: true, ios: true, standalone: true, supported: true, permission: "granted" as const };
test("iPhone setup accepts HTTPS installed apps and explains browser, insecure and blocked cases", () => {
  assert.equal(pushSetupError(ready), null);
  assert.match(pushSetupError({ ...ready, secure: false })!, /HTTPS/);
  assert.match(pushSetupError({ ...ready, standalone: false })!, /Add to Home Screen/);
  assert.match(pushSetupError({ ...ready, permission: "denied" })!, /Settings → Notifications/);
});

test("a test targets the current device and never treats HTTP 200 alone as success", async () => {
  const saved = new Map(["window", "navigator", "Notification", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let unsubscribed = false;
  const subscription = { endpoint: "https://web.push.apple.com/current-device", unsubscribe: async () => { unsubscribed = true; } };
  const registration = { pushManager: { getSubscription: async () => subscription } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: true }) } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 1, standalone: true, serviceWorker: { getRegistration: async () => registration } } });
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: { permission: "granted" } });
  let response: unknown = { ok: true, sent: 0, failed: 0 };
  let status = 200;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (_url: string, options: RequestInit) => {
    assert.deepEqual(JSON.parse(options.body as string), { memberId: "member", endpoint: subscription.endpoint });
    return new Response(JSON.stringify(response), { status, headers: { "content-type": "application/json" } });
  } });
  try {
    assert.equal((await sendTestPushNotification("member", {})).ok, false);
    response = { ok: true, sent: 0, failed: 1 };
    assert.equal((await sendTestPushNotification("member", {})).ok, false);
    response = { ok: false, sent: 0, failed: 1, rejectedStatusCodes: [403], failureCodes: ["BadJwtToken"], error: "Apple rejected server signing" };
    assert.match((await sendTestPushNotification("member", {})).error!, /server signing/);
    assert.equal(unsubscribed, false, "server signing errors must not discard the phone subscription");
    response = { ok: false, sent: 1, failed: 0 };
    assert.equal((await sendTestPushNotification("member", {})).ok, false);
    response = { ok: true, sent: 1, failed: 0 };
    assert.equal((await sendTestPushNotification("member", {})).ok, true);
    status = 502;
    assert.equal((await sendTestPushNotification("member", {})).ok, false);
    response = { ok: true, sent: "one", failed: 0 };
    status = 200;
    assert.equal((await sendTestPushNotification("member", {})).ok, false);
    response = null;
    status = 500;
    assert.match((await sendTestPushNotification("member", {})).error!, /HTTP 500/);
    status = 200;
    assert.match((await sendTestPushNotification("member", {})).error!, /non-JSON/);
    response = { ok: false, sent: 0, failed: 1, expired: 1 };
    assert.match((await sendTestPushNotification("member", {})).error!, /expired/);
    assert.equal(unsubscribed, true);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("push worker displays a notification even when the incoming payload is empty", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: string[] = [];
  vm.runInNewContext(fs.readFileSync(new URL("../public/sw-push.js", import.meta.url), "utf8"), { self: {
    addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler; },
    registration: { showNotification: async (title: string) => { shown.push(title); } },
  } });
  let pending: Promise<void> | undefined;
  listeners.push({ data: null, waitUntil: (promise: Promise<void>) => { pending = promise; } });
  await pending;
  assert.deepEqual(shown, ["Noted"]);
});
