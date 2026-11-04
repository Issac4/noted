import type { TaskType } from "@todo-app/shared";

export interface ParsedQuickCapture {
  title: string;
  note: string | null;
  type: TaskType;
  dueDate: string | null;
  detectedKeywords: string[];
  targetBucket: "critical" | "today" | "tomorrow";
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function parseQuickCapture(rawInput: string): ParsedQuickCapture {
  let text = rawInput.trim();
  let note: string | null = null;
  const detectedKeywords: string[] = [];

  // 1. Extract optional context note via "//" separator, e.g. "Replace filter // 16x25x1"
  if (text.includes("//")) {
    const [mainPart, ...noteParts] = text.split("//");
    text = mainPart.trim();
    note = noteParts.join("//").trim() || null;
    if (note) {
      detectedKeywords.push("📝 Note attached");
    }
  }

  // 2. Detect Critical Hard Deadline markers (!critical, !urgent)
  let type: TaskType = "daily";
  if (/!(critical|urgent)\b/i.test(text)) {
    type = "critical";
    text = text.replace(/!(critical|urgent)\b/gi, "").replace(/\s{2,}/g, " ").trim();
    detectedKeywords.push("🚨 Critical Deadline");
  }

  let dueDate: string | null = null;
  let targetBucket: "critical" | "today" | "tomorrow" = type === "critical" ? "critical" : "today";
  const now = new Date();

  // 3. Detect explicit Month + Day (e.g. "before Nov 15", "on Dec 1", "Nov 15")
  const monthDayRegex =
    /\b(?:before|by|on)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i;
  const monthMatch = text.match(monthDayRegex);

  // 4. Detect "in X days"
  const inDaysMatch = text.match(/\bin\s+(\d+)\s+days?\b/i);

  if (monthMatch) {
    const monthIndex = MONTHS[monthMatch[1].toLowerCase()];
    const dayNum = parseInt(monthMatch[2], 10);
    if (monthIndex !== undefined && dayNum >= 1 && dayNum <= 31) {
      let year = now.getFullYear();
      const candidate = new Date(year, monthIndex, dayNum, 9, 0, 0, 0);
      if (candidate.getMonth() === monthIndex && candidate.getDate() === dayNum) {
        if (candidate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
          year += 1;
        }
        const target = new Date(year, monthIndex, dayNum, 9, 0, 0, 0);
        if (target.getMonth() === monthIndex && target.getDate() === dayNum) {
          dueDate = target.toISOString();
          detectedKeywords.push(
            `📅 Due ${target.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          );
        }
      }
    }
  } else if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    dueDate = target.toISOString();
    if (days >= 1 && type !== "critical") {
      targetBucket = "tomorrow";
    }
    detectedKeywords.push(`📅 In ${days} day${days === 1 ? "" : "s"}`);
  } else if (/\b(tomorrow|tmr)\b/i.test(text) || /(聽日|明天)/.test(text)) {
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    dueDate = target.toISOString();
    if (type !== "critical") {
      targetBucket = "tomorrow";
    }
    detectedKeywords.push("🌅 Tomorrow");
  } else if (/\b(tonight|today)\b/i.test(text) || /(今晚|今日|今天)/.test(text)) {
    const target = new Date(now);
    if (/\btonight\b/i.test(text) || /今晚/.test(text)) {
      target.setHours(20, 0, 0, 0);
      detectedKeywords.push("🌙 Tonight");
    } else {
      target.setHours(18, 0, 0, 0);
      detectedKeywords.push("☀️ Today");
    }
    dueDate = target.toISOString();
    if (type !== "critical") {
      targetBucket = "today";
    }
  }

  if (type === "critical") {
    targetBucket = "critical";
  }

  return {
    title: text || rawInput.trim(),
    note,
    type,
    dueDate,
    detectedKeywords,
    targetBucket,
  };
}

export function isTaskForTomorrow(dueDateStr: string | null): boolean {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr);
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return due.getTime() > endOfToday.getTime();
}

export function getDaysLeftInfo(dueDateStr: string | null): {
  label: string;
  daysLeft: number;
  urgency: "overdue" | "imminent" | "upcoming";
} {
  if (!dueDateStr) {
    return { label: "Date needed", daysLeft: 0, urgency: "upcoming" };
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueDate = new Date(dueDateStr);
  const startOfDue = new Date(
    dueDate.getFullYear(),
    dueDate.getMonth(),
    dueDate.getDate()
  ).getTime();

  const days = Math.round((startOfDue - startOfToday) / (1000 * 60 * 60 * 24));
  if (days < 0) {
    return {
      label: `${Math.abs(days)}d Past Cutoff`,
      daysLeft: days,
      urgency: "overdue",
    };
  }
  if (days === 0) {
    return { label: "Due today", daysLeft: 0, urgency: "imminent" };
  }
  if (days === 1) {
    return { label: "1 Day Left", daysLeft: 1, urgency: "imminent" };
  }
  return {
    label: `${days} Days Left`,
    daysLeft: days,
    urgency: days <= 3 ? "imminent" : "upcoming",
  };
}
