function calendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
  };
}

function dayNumber(parts: ReturnType<typeof calendarParts>) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

export function criticalAlertForToday(now: Date, dueDate: Date, timeZone: string) {
  const today = calendarParts(now, timeZone);
  if (today.hour < 9) return null;

  const daysLeft = dayNumber(calendarParts(dueDate, timeZone)) - dayNumber(today);

  return {
    alertDate: `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`,
    daysLeft,
  };
}

export function criticalDeadlineLabel(daysLeft: number): string {
  if (daysLeft < 0) return `overdue by ${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"}`;
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  return `due in ${daysLeft} days`;
}
