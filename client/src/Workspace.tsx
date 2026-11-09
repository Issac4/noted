import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BellRing, Check, ChevronLeft, ChevronRight, Lock, Moon, Plus, Send, Sun, Trash2, Wifi, WifiOff } from "lucide-react";
import type { CreateTaskPayload, Member, Space, Task, TaskPriority, UpdateTaskPayload } from "@todo-app/shared";
import { parseQuickCapture } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";
import { dateKey, dashboardGroups, weekDays, nearestDueIds, completedHistory } from "@/lib/dashboard";
import "./candy.css";
import { getPushSetupError } from "@/lib/push";

interface WorkspaceProps {
  space: Space;
  members: Member[];
  tasks: Task[];
  actor: Member;
  connection: "connecting" | "connected" | "disconnected";
  isDarkMode: boolean;
  pushEnabled: boolean;
  isPushBusy: boolean;
  banner: string | null;
  onSelectActor: (memberId: string) => void;
  onToggleTheme: () => void;
  onEnableAlerts: () => void;
  onLock: () => void;
  onCreateTask: (payload: CreateTaskPayload) => Promise<Task>;
  onUpdateTask: (id: string, patch: UpdateTaskPayload) => void;
  onDeleteTask: (id: string) => void;
  onAddMember: (name: string, avatar: string) => Promise<Member>;
}

const avatars = ["✨", "🌸", "⭐", "🌿", "🦊", "🐱", "🎨", "🚀", "🍒"];
const priorities: TaskPriority[] = ["low", "normal", "high"];
const priorityName = (value: TaskPriority) => value[0].toUpperCase() + value.slice(1);
function dueLabel(value: string | null) {
  if (!value) return "No deadline";
  const date = new Date(value);
  const today = dateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateKey(date) < today) return `Overdue · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  if (dateKey(date) === today) return "Due today";
  if (dateKey(date) === dateKey(tomorrow)) return "Due tomorrow";
  return `Due ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function TaskRow({ task, actor, members, soonest = false, onUpdate, onDelete }: {
  task: Task; actor: Member; members: Member[]; soonest?: boolean;
  onUpdate: WorkspaceProps["onUpdateTask"]; onDelete: WorkspaceProps["onDeleteTask"];
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(task.note || "");
  const owner = members.find(m => m.id === task.assignedTo);
  const creator = members.find(m => m.id === task.createdBy);
  const completed = task.status === "completed";
  const overdue = task.dueDate && dateKey(new Date(task.dueDate)) < dateKey(new Date());
  return <article className={`candy-task ${soonest ? "is-nearest" : ""} ${completed ? "is-complete" : ""}`}>
    <div className="candy-task-line">
      <button type="button" className={`candy-check ${completed ? "checked" : ""}`} aria-label={`${completed ? "Reopen" : "Complete"} ${task.title}`} aria-pressed={completed} onClick={() => { onUpdate(task.id, { status: completed ? "pending" : "completed" }); triggerHaptic(12); }}>{completed && <Check size={15} strokeWidth={3} />}</button>
      <div className="candy-task-body">
        {soonest && <span className="candy-task-kicker">Next due · {dueLabel(task.dueDate)}</span>}
        <h3>{task.title}</h3>
        <p>For {owner?.id === actor.id ? "you" : owner?.name || "a member"}{creator && creator.id !== task.assignedTo ? ` · From ${creator.name}` : ""}{!soonest ? ` · ${dueLabel(task.dueDate)}` : ""}</p>
        {completed && <p className="candy-completion-time">{task.completedAt ? <>Completed <time dateTime={task.completedAt}>{new Date(task.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></> : "Completed · time not recorded"}</p>}
        {task.note && <p className="candy-task-note">{task.note}</p>}
      </div>
      <span className={`candy-chip priority-${task.priority || "normal"} ${overdue ? "overdue" : ""}`}>{completed ? "Done" : overdue ? "Overdue" : `${priorityName(task.priority || "normal")} priority`}</span>
    </div>
    <div className="candy-task-actions">
      {task.type === "critical" && <span className="candy-critical">Critical alerts on</span>}
      <button type="button" onClick={() => { setNote(task.note || ""); setEditing(!editing); }}>{editing ? "Cancel" : "Edit task"}</button>
      <button type="button" aria-label={`Delete ${task.title}`} onClick={() => { if (window.confirm(`Remove “${task.title}”?`)) onDelete(task.id); }}><Trash2 size={12} /></button>
    </div>
    {editing && <div className="candy-task-edit">
      <label>Priority<select aria-label={`Priority for ${task.title}`} value={task.priority || "normal"} onChange={e => onUpdate(task.id, { priority: e.target.value as TaskPriority })}>{priorities.map(p => <option key={p} value={p}>{priorityName(p)}</option>)}</select></label>
      <label>Deadline · optional<input type="date" aria-label={`Deadline for ${task.title}`} value={task.dueDate ? dateKey(new Date(task.dueDate)) : ""} onChange={e => onUpdate(task.id, { dueDate: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null, ...(!e.target.value ? { type: "daily" as const } : {}) })} /></label>
      <form onSubmit={e => { e.preventDefault(); onUpdate(task.id, { note: note.trim() || null }); setEditing(false); }}><label>Note<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></label><button className="candy-secondary" type="submit">Save note</button></form>
    </div>}
  </article>;
}

export function Workspace({ space, members, tasks, actor, connection, isDarkMode, pushEnabled, isPushBusy, banner, onSelectActor, onToggleTheme, onEnableAlerts, onLock, onCreateTask, onUpdateTask, onDeleteTask, onAddMember }: WorkspaceProps) {
  const [view, setView] = useState<"all" | "mine">("mine");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState(actor.id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [deadline, setDeadline] = useState("");
  const [critical, setCritical] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(avatars[0]);
  const [adding, setAdding] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dockHeight, setDockHeight] = useState(210);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [viewHeight, setViewHeight] = useState(window.innerHeight);
  const recipient = members.find(m => m.id === recipientId) || actor;
  const draftKey = `${actor.id}:${recipient.id}`;
  const draft = drafts[draftKey] || "";
  const setDraft = (value: string) => setDrafts(current => ({ ...current, [draftKey]: value }));
  const now = new Date();
  const days = weekDays(now, weekOffset);
  const scope = tasks.filter(t => view === "all" || t.assignedTo === actor.id);
  const filtered = selectedDay ? scope.filter(t => t.dueDate && dateKey(new Date(t.dueDate)) === selectedDay) : scope;
  const groups = dashboardGroups(filtered);
  const pending = filtered.filter(t => t.status === "pending");
  const completed = completedHistory(scope);
  const nearestHigh = nearestDueIds(groups.high);
  const nearestDated = nearestDueIds(groups.dated);
  const parsed = draft.trim() ? parseQuickCapture(draft) : null;


  useEffect(() => { setRecipientId(actor.id); setFeedback(null); setPriority("normal"); setDeadline(""); setCritical(false); }, [actor.id]);
  useEffect(() => {
    const measure = () => setDockHeight(Math.ceil(dockRef.current?.getBoundingClientRect().height || 210));
    const observer = new ResizeObserver(measure);
    if (dockRef.current) observer.observe(dockRef.current);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const measure = () => {
      setKeyboardInset(viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
      setViewHeight(viewport?.height || window.innerHeight);
    };
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => { viewport?.removeEventListener("resize", measure); viewport?.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (addOpen && dialog && !dialog.open) dialog.showModal();
    else if (!addOpen && dialog?.open) dialog.close();
  }, [addOpen]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)))) return;
      event.preventDefault(); inputRef.current?.focus();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function chooseRecipient(id: string) {
    setRecipientId(id); setFeedback(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true); setFeedback(null);
    // Capture the destination and draft key so switching contacts during a request is safe.
    const submittedKey = draftKey;
    const submittedRecipient = recipient;
    try {
      const result = parseQuickCapture(draft);
      const dueDate = deadline ? new Date(`${deadline}T09:00:00`).toISOString() : result.dueDate;
      const needsAlert = critical || result.type === "critical";
      if (needsAlert && !dueDate) throw new Error("Add a deadline for critical alerts, or turn them off. High priority works without a deadline.");
      await onCreateTask({ spaceId: space.id, title: result.title, note: result.note, type: needsAlert ? "critical" : "daily", priority, dueDate, assignedTo: submittedRecipient.id, createdBy: actor.id });
      setDrafts(current => ({ ...current, [submittedKey]: "" }));
      setFeedback({ error: false, text: submittedRecipient.id === actor.id ? "Added to your tasks." : `Task sent to ${submittedRecipient.name}.` });
      setDeadline(""); setCritical(false); setPriority("normal"); triggerHaptic(12);
    } catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : "Could not send. Please try again." }); }
    finally { setSending(false); }
  }
  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || adding) return;
    if (members.some(m => m.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) { setMemberError("That name is already here."); return; }
    setAdding(true); setMemberError(null);
    try { const member = await onAddMember(name.trim(), avatar); chooseRecipient(member.id); setName(""); setAddOpen(false); }
    catch (error) { setMemberError(error instanceof Error ? error.message : "Could not add person."); }
    finally { setAdding(false); }
  }

  const taskProps = { actor, members, onUpdate: onUpdateTask, onDelete: onDeleteTask };
  return <div className="candy-shell" style={{ "--candy-dock-height": `${dockHeight}px`, "--candy-keyboard-inset": `${keyboardInset}px`, "--candy-view-height": `${viewHeight}px` } as CSSProperties}><div className="candy-app">
    <header className="candy-bar">
      <a className="candy-logo" href="#dashboard" aria-label="Noted dashboard">noted ✦</a>
      <nav className="candy-nav" aria-label="Workspace navigation"><a className="active" href="#dashboard">My week</a><a href="#completed">Completed</a></nav>
      <span className="candy-space-name">{space.name}</span>
      <div className="candy-tools">
        <button className="candy-tool" type="button" onClick={() => setAddOpen(true)}><Plus size={13} /> Add person</button>
        <span className={`candy-sync ${connection === "connected" ? "connected" : ""}`} role="status">{connection === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}{connection === "connected" ? "Live sync" : connection === "connecting" ? "Connecting" : "Offline"}</span>
        <button type="button" className="candy-tool" onClick={onToggleTheme} aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}>{isDarkMode ? <Sun size={13} /> : <Moon size={13} />}{isDarkMode ? "Light" : "Dark"}</button>
        <button type="button" className="candy-tool" onClick={onEnableAlerts} disabled={isPushBusy} title={pushEnabled ? "Send a test alert" : "Enable alerts"}><BellRing size={13} />{isPushBusy ? "Please wait…" : pushEnabled ? "Test alerts" : "Enable alerts"}</button>
        <label className="candy-profile"><span className="sr-only">Using as</span><select value={actor.id} onChange={e => onSelectActor(e.target.value)} aria-label="Device profile">{members.map(m => <option value={m.id} key={m.id}>{m.avatar} {m.name}</option>)}</select></label>
        {space.requiresPasscode && <button className="candy-tool candy-icon" type="button" onClick={onLock} aria-label="Lock this device"><Lock size={14} /></button>}
      </div>
    </header>
    {banner && <div className="candy-banner" role="status">{banner}</div>}
    {getPushSetupError() && <p className="candy-alert-help">{getPushSetupError()}</p>}
    <section className="candy-intro candy-intro-compact"><div><div className="candy-eyebrow">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {actor.name}'s day</div><h1>Good things get done.</h1><p>Priority keeps important work visible. Deadlines show when it is due.</p></div><div className="candy-count"><b>{groups.high.length}</b> high-priority {groups.high.length === 1 ? "task" : "tasks"}</div></section>
    <div className="candy-layout">
      <main className="candy-main" id="dashboard">
        <div className="candy-calendar-head"><span>{days[0].toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span><div><button type="button" aria-label="Previous week" onClick={() => setWeekOffset(value => value - 1)}><ChevronLeft size={15} /></button><button type="button" onClick={() => { setWeekOffset(0); setSelectedDay(null); }}>This week</button><button type="button" aria-label="Next week" onClick={() => setWeekOffset(value => value + 1)}><ChevronRight size={15} /></button></div></div>
        <div className="candy-week" aria-label="Week at a glance">{days.map(day => {
          const key = dateKey(day);
          const count = scope.filter(t => t.status === "pending" && t.dueDate && dateKey(new Date(t.dueDate)) === key).length;
          return <button type="button" key={key} className={`candy-day ${key === dateKey(now) ? "today" : ""} ${selectedDay === key ? "selected" : ""}`} aria-pressed={selectedDay === key} aria-label={`Tasks due ${day.toLocaleDateString()}: ${count}`} onClick={() => setSelectedDay(selectedDay === key ? null : key)}><span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span><b>{day.getDate()}</b><i aria-hidden="true">{count ? `${count} due` : "·"}</i></button>;
        })}</div>
        <div className="candy-board-controls"><div className="candy-view-switch" role="group" aria-label="Task view"><button type="button" className={view === "all" ? "active" : ""} aria-pressed={view === "all"} onClick={() => setView("all")}>Complete Action · Everyone</button><button type="button" className={view === "mine" ? "active" : ""} aria-pressed={view === "mine"} onClick={() => setView("mine")}>My focus</button></div><span>{pending.length} open{view === "all" ? ` · ${members.length} people` : " for you"}</span></div>
        {selectedDay && <div className="candy-filter">Due {new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}<button type="button" onClick={() => setSelectedDay(null)}>Show all dates ×</button></div>}
        <div className="candy-task-groups">
        <section className="candy-section candy-group-high"><div className="candy-titleline"><h2>Priority tasks</h2><span>Important, even without a near deadline</span></div>{groups.high.length ? groups.high.map(t => <TaskRow key={t.id} task={t} soonest={nearestHigh.has(t.id)} {...taskProps} />) : <p className="candy-empty">No high-priority tasks. A little breathing room.</p>}</section>
        <section className="candy-section candy-group-dated"><div className="candy-titleline"><h2>Due soon</h2><span>Deadline order</span></div>{groups.dated.length ? groups.dated.map(t => <TaskRow key={t.id} task={t} soonest={nearestDated.has(t.id)} {...taskProps} />) : <p className="candy-empty">No other deadlines to keep an eye on.</p>}</section>
        <section className="candy-section candy-group-later"><div className="candy-titleline"><h2>Whenever</h2><span>No deadline</span></div>{groups.later.length ? groups.later.map(t => <TaskRow key={t.id} task={t} {...taskProps} />) : <p className="candy-empty">Nothing else waiting here.</p>}</section>
        </div>
        <details className="candy-completed" id="completed"><summary>Completed history · {completed.length}</summary>{completed.length ? completed.map(t => <TaskRow key={t.id} task={t} {...taskProps} />) : <p className="candy-empty">Completed tasks and their completion times will appear here.</p>}</details>
      </main>
    </div>
    <footer className="candy-footer">{space.name} · Little steps, together. <span>Press C to write a task.</span></footer>
    <dialog className="candy-member-dialog" ref={dialogRef} onCancel={() => setAddOpen(false)} onClick={e => { if (e.target === e.currentTarget) setAddOpen(false); }}>
      <div className="candy-titleline"><h2>Add a person</h2><button type="button" onClick={() => setAddOpen(false)} aria-label="Close add person">×</button></div>
      <form className="candy-add-form" onSubmit={addMember}><label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label><label>Avatar<select value={avatar} onChange={e => setAvatar(e.target.value)}>{avatars.map(a => <option key={a}>{a}</option>)}</select></label><button className="candy-secondary" disabled={adding} type="submit">{adding ? "Adding…" : "Add to board"}</button>{memberError && <p className="candy-error" role="alert">{memberError}</p>}</form>
    </dialog>
  </div>
  <section className="candy-composer-dock candy-compose" id="compose" ref={dockRef} aria-label="Send a task">
    <form className="candy-dock-inner" onSubmit={submit}>
      <div className="candy-dock-options">
        <label className="candy-dock-field" htmlFor="candy-assignee"><span>Assign to</span><select id="candy-assignee" value={recipient.id} onChange={e => chooseRecipient(e.target.value)} disabled={sending}>{members.map(m => <option value={m.id} key={m.id}>{m.name}{m.id === actor.id ? " · Me" : ""}</option>)}</select></label>
        <fieldset className="candy-dock-priority"><legend>Priority</legend><div className="candy-levels">{priorities.map(p => <button type="button" key={p} className={priority === p ? "active" : ""} aria-pressed={priority === p} onClick={() => setPriority(p)} disabled={sending}>{priorityName(p)}</button>)}</div></fieldset>
        <label className="candy-dock-field" htmlFor="candy-deadline"><span>Deadline · optional</span><input id="candy-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={sending} /></label>
        <label className="candy-critical-toggle candy-dock-critical" title="Daily reminders after 9 AM Toronto time until completed, including overdue tasks."><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} disabled={sending} /><span>Critical alerts<small>Daily · 9 AM Toronto</small></span></label>
      </div>
      <div className="candy-dock-entry"><label className="sr-only" htmlFor="candy-task">What needs doing?</label><textarea ref={inputRef} id="candy-task" rows={1} value={draft} onChange={e => { setDraft(e.target.value); setFeedback(null); }} placeholder={`Add a task for ${recipient.id === actor.id ? "yourself" : recipient.name}…`} disabled={sending} enterKeyHint="send" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button className="candy-send" type="submit" aria-label="Send task" disabled={!draft.trim() || sending}><Send size={15} /><span>{sending ? "Sending…" : "Send task"}</span></button></div>
      {(parsed?.dueDate && !deadline || feedback) && <p className={`candy-feedback ${feedback?.error ? "candy-error" : ""}`} role={feedback?.error ? "alert" : "status"}>{feedback?.text || (parsed?.dueDate ? `${dueLabel(parsed.dueDate)} · from your text` : "")}</p>}
    </form>
  </section>
  </div>;
}
