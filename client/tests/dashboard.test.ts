import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@todo-app/shared";
import { dashboardGroups, dateKey, weekDays } from "../src/lib/dashboard.ts";

function task(id: string, patch: Partial<Task> = {}): Task {
  return { id, spaceId: "space", assignedTo: "member", createdBy: "member", title: id, note: null, priority: "normal", type: "daily", status: "pending", dueDate: null, createdAt: "2026-11-01T09:00:00Z", updatedAt: "2026-11-01T09:00:00Z", ...patch };
}
test("important undated tasks stay visible and tasks appear in exactly one dashboard group", () => {
  const groups = dashboardGroups([
    task("important", { priority: "high" }),
    task("urgent-important", { priority: "high", type: "critical", dueDate: "2026-11-06T09:00:00Z" }),
    task("later-date", { dueDate: "2026-11-09T09:00:00Z" }),
    task("overdue", { priority: "low", dueDate: "2026-11-02T09:00:00Z" }),
    task("low", { priority: "low" }), task("normal"), task("done", { status: "completed", priority: "high" }),
  ]);
  assert.deepEqual(groups.high.map(t => t.id), ["urgent-important", "important"]);
  assert.deepEqual(groups.dated.map(t => t.id), ["overdue", "later-date"]);
  assert.deepEqual(groups.later.map(t => t.id), ["normal", "low"]);
  const ids = Object.values(groups).flat().map(t => t.id);
  assert.equal(new Set(ids).size, 6);
  assert.equal(ids.includes("done"), false);
});
test("calendar uses a local Monday–Sunday week across month boundaries", () => {
  const days = weekDays(new Date(2026, 10, 1, 0, 15));
  assert.equal(dateKey(days[0]), "2026-10-26");
  assert.equal(dateKey(days[6]), "2026-11-01");
  assert.equal(dateKey(weekDays(new Date(2026, 10, 1), 1)[0]), "2026-11-02");
  assert.equal(dateKey(weekDays(new Date(2026, 10, 1), -1)[0]), "2026-10-19");
});
