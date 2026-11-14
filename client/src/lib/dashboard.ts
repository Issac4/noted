import type { Task } from "@todo-app/shared";

/** Local calendar keys avoid moving due dates to a different day through UTC. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function daysUntil(value: string, now = new Date()): number {
  const date = new Date(value);
  const calendarDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  return calendarDay(date) - calendarDay(now);
}

export function countdown(value: string | null, now = new Date()): string {
  if (!value) return "No deadline";
  const days = daysUntil(value, now);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** Urgency wins over priority; every pending task appears exactly once. */
export function focusGroups(tasks: Task[], now = new Date()) {
  const pending = tasks.filter(t => t.status === "pending");
  const order = (a: Task, b: Task) =>
    (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity) ||
    Number(b.type === "critical") - Number(a.type === "critical") || Number(b.priority === "high") - Number(a.priority === "high") || a.createdAt.localeCompare(b.createdAt);
  const urgent = (t: Task) => !!t.dueDate && daysUntil(t.dueDate, now) <= 0;
  const important = (t: Task) => t.priority === "high" || t.type === "critical";
  return {
    urgent: pending.filter(urgent).sort(order),
    important: pending.filter(t => !urgent(t) && important(t)).sort(order),
    upcoming: pending.filter(t => !urgent(t) && !important(t) && t.dueDate).sort(order),
    anytime: pending.filter(t => !important(t) && !t.dueDate).sort((a, b) => Number(a.priority === "low") - Number(b.priority === "low") || order(a, b)),
  };
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

/** Highlight every task tied on the nearest due calendar day, without inventing dates. */
export function nearestDueIds(tasks: Task[]): Set<string> {
  const dated = tasks.filter(t => t.status === "pending" && t.dueDate);
  const day = dated.map(t => dateKey(new Date(t.dueDate!))).sort()[0];
  return new Set(day ? dated.filter(t => dateKey(new Date(t.dueDate!)) === day).map(t => t.id) : []);
}

export function completedHistory(tasks: Task[]): Task[] {
  return tasks.filter(t => t.status === "completed").sort((a, b) =>
    Number(!!b.completedAt) - Number(!!a.completedAt) ||
    (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt) || a.id.localeCompare(b.id)
  );
}
