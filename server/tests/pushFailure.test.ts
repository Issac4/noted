import test from "node:test";
import assert from "node:assert/strict";
import { pushPreparationFailure } from "../src/pushFailure.js";

test("push preparation failures identify operator repairs without exposing input secrets", () => {
  assert.equal(pushPreparationFailure(new Error("Vapid subject is not a valid URL: SECRET")).code, "invalid_vapid_subject");
  assert.equal(pushPreparationFailure(new Error("Vapid private key should be 32 bytes long")).code, "invalid_vapid_keys");
  const database = pushPreparationFailure(new Error("Failed query; password=SECRET endpoint=PRIVATE"));
  assert.equal(database.code, "push_preparation_failed");
  assert.equal(JSON.stringify(database).includes("SECRET"), false);
  assert.equal(JSON.stringify(database).includes("PRIVATE"), false);
});
