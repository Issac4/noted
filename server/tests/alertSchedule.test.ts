import test from "node:test";
import assert from "node:assert/strict";
import { criticalAlertForToday, criticalDeadlineLabel } from "../src/alertSchedule.ts";

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

test("uses 9 a.m. Toronto during daylight saving time as well", () => {
  const due = new Date("2026-07-12T13:00:00Z");
  assert.equal(criticalAlertForToday(new Date("2026-07-10T12:59:00Z"), due, zone), null);
  assert.deepEqual(criticalAlertForToday(new Date("2026-07-10T13:00:00Z"), due, zone), {
    alertDate: "2026-07-10", daysLeft: 2,
  });
});

test("schedules daily before the deadline, on the deadline, and while overdue", () => {
  const due = new Date("2026-11-07T14:00:00Z");
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-05T14:00:00Z"), due, zone), { alertDate: "2026-11-05", daysLeft: 2 });
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-06T14:00:00Z"), due, zone), {
    alertDate: "2026-11-06",
    daysLeft: 1,
  });
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-07T14:00:00Z"), due, zone), {
    alertDate: "2026-11-07",
    daysLeft: 0,
  });
});

test("overdue critical tasks remain eligible daily and reminders describe the actual deadline", () => {
  const due = new Date("2026-11-07T14:00:00Z");
  assert.equal(criticalAlertForToday(new Date("2026-11-09T13:59:00Z"), due, zone), null);
  assert.deepEqual(criticalAlertForToday(new Date("2026-11-09T14:00:00Z"), due, zone), { alertDate: "2026-11-09", daysLeft: -2 });
  assert.equal(criticalDeadlineLabel(-2), "overdue by 2 days");
  assert.equal(criticalDeadlineLabel(-1), "overdue by 1 day");
  assert.equal(criticalDeadlineLabel(0), "due today");
  assert.equal(criticalDeadlineLabel(8), "due in 8 days");
});
