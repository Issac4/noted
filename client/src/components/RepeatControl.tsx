import type { TaskRecurrence } from "@todo-app/shared";
import { useEffect, useState } from "react";

export function repeatLabel(rule: TaskRecurrence | null | undefined): string {
  if (!rule) return "Does not repeat";
  if (rule.kind === "monthly") return `Monthly · day ${rule.day}`;
  if (rule.interval === 1) return "Daily";
  if (rule.interval === 7) return "Weekly";
  if (rule.interval === 14) return "Every 2 weeks";
  return `Every ${rule.interval} days`;
}

export function RepeatControl({ value, onChange, disabled = false, commitOnBlur = false }: {
  value: TaskRecurrence | null; onChange: (value: TaskRecurrence | null) => void; disabled?: boolean; commitOnBlur?: boolean;
}) {
  const mode = !value ? "none" : value.kind === "monthly" ? "monthly" : [1, 7, 14].includes(value.interval) ? String(value.interval) : "custom";
  const number = value ? value.kind === "monthly" ? value.day : value.interval : 1;
  const [draftNumber, setDraftNumber] = useState(String(number));
  useEffect(() => setDraftNumber(String(number)), [number]);
  return <div className="candy-repeat-control">
    <label><span>Repeat</span><select aria-label="Repeat schedule" disabled={disabled} value={mode} onChange={e => {
      const next = e.target.value;
      onChange(next === "none" ? null : next === "monthly" ? { kind: "monthly", day: 1 } : { kind: "days", interval: next === "custom" ? 3 : Number(next) });
    }}>
      <option value="none">Does not repeat</option><option value="1">Daily</option><option value="7">Weekly</option><option value="14">Every 2 weeks</option><option value="monthly">Day of each month</option><option value="custom">Every N days</option>
    </select></label>
    {value && (mode === "monthly" || mode === "custom") && <label><span>{mode === "monthly" ? "Day of month" : "Number of days"}</span><input type="number" aria-label={mode === "monthly" ? "Day of month" : "Repeat interval in days"} min={1} max={mode === "monthly" ? 31 : 3650} required disabled={disabled} value={draftNumber} onChange={e => {
      setDraftNumber(e.target.value);
      const n = e.target.valueAsNumber;
      if (!commitOnBlur && Number.isInteger(n) && n >= 1 && n <= (mode === "monthly" ? 31 : 3650)) onChange(mode === "monthly" ? { kind: "monthly", day: n } : { kind: "days", interval: n });
    }} onBlur={e => {
      if (!commitOnBlur) return;
      const n = e.target.valueAsNumber;
      if (Number.isInteger(n) && n >= 1 && n <= (mode === "monthly" ? 31 : 3650)) onChange(mode === "monthly" ? { kind: "monthly", day: n } : { kind: "days", interval: n });
      else setDraftNumber(String(number));
    }} /></label>}
  </div>;
}
