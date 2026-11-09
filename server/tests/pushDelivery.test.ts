import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VAPID_SUBJECT, PUSH_TIMEOUT_MS, resolveVapidSubject, pushFailureCode, pushDeliveryFailure } from "../src/pushDelivery.js";

test("VAPID defaults and old local placeholders use a public identity; configured contacts remain unchanged", () => {
  for (const value of [undefined, "", "mailto:admin@noted.local", "mailto:admin@localhost", "https://localhost"]) assert.equal(resolveVapidSubject(value), DEFAULT_VAPID_SUBJECT);
  assert.equal(resolveVapidSubject("mailto:operator@example.com"), "mailto:operator@example.com");
  assert.equal(resolveVapidSubject("https://noted.issacbeth.com"), "https://noted.issacbeth.com");
  assert.throws(() => resolveVapidSubject("file:///private"), /VAPID subject/);
  assert.equal(PUSH_TIMEOUT_MS, 10_000);
});

test("provider diagnostics only include recognized reasons and do not expose raw data", () => {
  assert.equal(pushFailureCode({ body: '{"reason":"BadJwtToken"}' }), "BadJwtToken");
  assert.equal(pushFailureCode({ message: "Socket timeout" }), "ETIMEDOUT");
  assert.equal(pushFailureCode({ body: '{"reason":"SECRET"}', endpoint: "PRIVATE" }), null);
  const failure = pushDeliveryFailure({ failed: 1, rejectedStatusCodes: [403], failureCodes: ["BadJwtToken"] });
  assert.match(failure, /server.*signing/);
  assert.match(failure, /keep this device/);
  assert.match(failure, /BadJwtToken/);
});
