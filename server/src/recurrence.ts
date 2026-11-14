import type { TaskRecurrence } from "@todo-app/shared";

const zone = "America/Toronto";
function parts(date: Date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { year: +values.year, month: +values.month, day: +values.day, hour: +values.hour };
}
function dayNumber(date: Date) {
  const p = parts(date);
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
}
function torontoMorning(year: number, month: number, day: number) {
  let date = new Date(Date.UTC(year, month - 1, day, 14));
  date = new Date(date.getTime() + (9 - parts(date).hour) * 3_600_000);
  return date;
}

export function validRecurrence(value: unknown): value is TaskRecurrence | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rule = value as Record<string, unknown>;
  if (rule.kind === "days") return Number.isInteger(rule.interval) && Number(rule.interval) >= 1 && Number(rule.interval) <= 3650;
  if (rule.kind === "monthly") return Number.isInteger(rule.day) && Number(rule.day) >= 1 && Number(rule.day) <= 31;
  return false;
}

/** Keep the original calendar cadence; skip missed dates rather than creating a backlog. */
export function nextOccurrence(dueDate: Date, rule: TaskRecurrence, completedAt: Date): Date {
  const anchor = parts(dueDate);
  const afterDay = Math.max(dayNumber(dueDate), dayNumber(completedAt));
  if (rule.kind === "days") {
    const jumps = Math.floor((afterDay - dayNumber(dueDate)) / rule.interval) + 1;
    const next = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + jumps * rule.interval));
    return torontoMorning(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
  const after = new Date(afterDay * 86_400_000);
  for (let month = after.getUTCMonth(); ; month++) {
    const last = new Date(Date.UTC(after.getUTCFullYear(), month + 1, 0));
    const candidate = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(rule.day, last.getUTCDate())));
    if (candidate.getTime() / 86_400_000 > afterDay) return torontoMorning(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, candidate.getUTCDate());
  }
}
