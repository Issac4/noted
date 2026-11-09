import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@todo-app/shared";
import { dashboardGroups, dateKey, weekDays, nearestDueIds, completedHistory } from "../src/lib/dashboard.ts";

function task(id: string, patch: Partial<Task> = {}): Task {
  return { id, spaceId: "space", assignedTo: "member", createdBy: "member", title: id, note: null, priority: "normal", type: "daily", status: "pending", completedAt: null, dueDate: null, createdAt: "2026-11-01T09:00:00Z", updatedAt: "2026-11-01T09:00:00Z", ...patch };
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

test("all tasks tied on the nearest due day are emphasized, without highlighting undated tasks", () => {
  const rows = [task("undated"), task("first", { dueDate: "2026-11-09T09:00:00" }), task("tied", { dueDate: "2026-11-09T18:00:00" }), task("later", { dueDate: "2026-11-10T09:00:00" }), task("done", { status: "completed", dueDate: "2026-11-08T09:00:00" })];
  assert.deepEqual([...nearestDueIds(rows)], ["first", "tied"]);
  assert.equal(nearestDueIds([task("none")]).size, 0);
});

test("completed history sorts by actual completion time, retains legacy unknown times and excludes reopened tasks", () => {
  const rows = [
    task("earlier", { status: "completed", completedAt: "2026-11-08T10:00:00Z", updatedAt: "2026-11-12T10:00:00Z" }),
    task("recent", { status: "completed", completedAt: "2026-11-09T10:00:00Z" }),
    task("legacy", { status: "completed", completedAt: null }),
    task("reopened", { status: "pending", completedAt: null }),
  ];
  const history = completedHistory(rows);
  assert.deepEqual(history.map(t => t.id), ["recent", "earlier", "legacy"]);
  assert.equal(history[2].completedAt, null);
});
