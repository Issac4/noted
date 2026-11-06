import type { Task } from "@todo-app/shared";

/** Local calendar keys avoid moving due dates to a different day through UTC. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekDays(today: Date, offset = 0): Date[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7 + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    return day;
  });
}

export function dashboardGroups(tasks: Task[]) {
  const pending = tasks.filter(t => t.status === "pending");
  const deadlineOrder = (a: Task, b: Task) => {
    const left = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const right = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return left - right || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  };
  return {
    high: pending.filter(t => t.priority === "high").sort(deadlineOrder),
    dated: pending.filter(t => t.priority !== "high" && t.dueDate).sort(deadlineOrder),
    later: pending.filter(t => t.priority !== "high" && !t.dueDate).sort((a, b) => Number(a.priority === "low") - Number(b.priority === "low") || deadlineOrder(a, b)),
  };
}
