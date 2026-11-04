import test from "node:test";
import assert from "node:assert/strict";
import { criticalAlertForToday } from "../src/alertSchedule.ts";

const zone = "America/Toronto";

test("waits until 9 a.m. in the household timezone", () => {
  const due = new Date("2026-11-07T14:00:00Z");
  assert.equal(criticalAlertForToday(new Date("2026-11-04T13:59:00Z"), due, zone), null);
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-04T14:00:00Z"), due, zone), {
    alertDate: "2026-11-04",
    daysLeft: 3,
  });
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-04T18:00:00Z"), due, zone), {
    alertDate: "2026-11-04",
    daysLeft: 3,
  });
});

test("counts calendar days across daylight saving time", () => {
  assert.deepEqual(
    criticalAlertForToday(
      new Date("2026-03-07T14:00:00Z"),
      new Date("2026-03-08T13:00:00Z"),
      zone
    ),
    { alertDate: "2026-03-07", daysLeft: 1 }
  );
});

test("only schedules three, one, and zero days before a deadline", () => {
  const due = new Date("2026-11-07T14:00:00Z");
  assert.equal(criticalAlertForToday(new Date("2026-11-05T14:00:00Z"), due, zone), null);
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-06T14:00:00Z"), due, zone), {
    alertDate: "2026-11-06",
    daysLeft: 1,
  });
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-07T14:00:00Z"), due, zone), {
    alertDate: "2026-11-07",
    daysLeft: 0,
  });
});
