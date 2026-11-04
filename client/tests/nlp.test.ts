import test from "node:test";
import assert from "node:assert/strict";
import { parseQuickCapture } from "../src/lib/nlp.ts";

test("critical capture never invents a deadline", () => {
  const result = parseQuickCapture("!critical File taxes");
  assert.equal(result.type, "critical");
  assert.equal(result.dueDate, null);
  assert.equal(result.title, "File taxes");
});

test("critical capture keeps an explicitly stated deadline", () => {
  const result = parseQuickCapture("!critical File taxes tomorrow");
  assert.equal(result.type, "critical");
  assert.ok(result.dueDate);
});

test("an impossible calendar date cannot become a deadline", () => {
  const result = parseQuickCapture("!critical File taxes by Feb 31");
  assert.equal(result.dueDate, null);
});
