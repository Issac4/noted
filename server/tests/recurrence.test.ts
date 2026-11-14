import test from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, validRecurrence } from "../src/recurrence.ts";

test("validates repeat schedules and rejects malformed or unbounded intervals", () => {
  for (const rule of [null, { kind: "days", interval: 14 }, { kind: "monthly", day: 31 }]) assert.equal(validRecurrence(rule), true);
  for (const rule of [[], "daily", {}, { kind: "days", interval: 0 }, { kind: "days", interval: 1.5 }, { kind: "days", interval: "14" }, { kind: "days", interval: 3651 }, { kind: "monthly", day: 32 }]) assert.equal(validRecurrence(rule), false);
});

test("fortnightly repeats keep the original cadence after an early or late completion", () => {
  const due = new Date("2026-11-13T14:00:00Z");
  assert.equal(nextOccurrence(due, { kind: "days", interval: 14 }, new Date("2026-11-12T14:00:00Z")).toISOString(), "2026-11-27T14:00:00.000Z");
  assert.equal(nextOccurrence(due, { kind: "days", interval: 14 }, new Date("2026-12-15T14:00:00Z")).toISOString(), "2026-12-25T14:00:00.000Z");
});

test("every N calendar days stays at 9 AM Toronto across both DST changes", () => {
  assert.equal(nextOccurrence(new Date("2026-03-07T14:00:00Z"), { kind: "days", interval: 1 }, new Date("2026-03-07T16:00:00Z")).toISOString(), "2026-03-08T13:00:00.000Z");
  assert.equal(nextOccurrence(new Date("2026-10-31T13:00:00Z"), { kind: "days", interval: 1 }, new Date("2026-10-31T16:00:00Z")).toISOString(), "2026-11-01T14:00:00.000Z");
});

test("monthly day 31 clamps short months without drifting the following month", () => {
  const rule = { kind: "monthly" as const, day: 31 };
  const february = nextOccurrence(new Date("2026-01-31T14:00:00Z"), rule, new Date("2026-01-31T16:00:00Z"));
  assert.equal(february.toISOString(), "2026-02-28T14:00:00.000Z");
  assert.equal(nextOccurrence(february, rule, new Date("2026-02-28T16:00:00Z")).toISOString(), "2026-03-31T13:00:00.000Z");
  assert.equal(nextOccurrence(new Date("2028-01-31T14:00:00Z"), rule, new Date("2028-01-31T16:00:00Z")).toISOString(), "2028-02-29T14:00:00.000Z");
});

test("a chosen monthly day is used, missed dates skip ahead, and years roll over", () => {
  assert.equal(nextOccurrence(new Date("2026-11-01T14:00:00Z"), { kind: "monthly", day: 15 }, new Date("2026-11-01T16:00:00Z")).toISOString(), "2026-11-15T14:00:00.000Z");
  assert.equal(nextOccurrence(new Date("2026-11-15T14:00:00Z"), { kind: "monthly", day: 15 }, new Date("2027-01-20T16:00:00Z")).toISOString(), "2027-02-15T14:00:00.000Z");
});
