import { useEffect, useRef, useState } from "react";
import { BellRing, Check, ChevronLeft, ChevronRight, Lock, MessageCircle, Moon, Plus, Send, Sun, Trash2, Wifi, WifiOff } from "lucide-react";
import type { CreateMessagePayload, CreateTaskPayload, Member, Message, Space, Task, TaskPriority, UpdateTaskPayload } from "@todo-app/shared";
import { parseQuickCapture } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";
import { dateKey, dashboardGroups, weekDays } from "@/lib/dashboard";
import "./candy.css";

interface WorkspaceProps {
  space: Space;
  members: Member[];
  tasks: Task[];
  messages: Message[];
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
  onCreateMessage: (payload: CreateMessagePayload) => Promise<Message>;
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

function TaskRow({ task, actor, members, featured = false, onUpdate, onDelete }: {
  task: Task; actor: Member; members: Member[]; featured?: boolean;
  onUpdate: WorkspaceProps["onUpdateTask"]; onDelete: WorkspaceProps["onDeleteTask"];
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(task.note || "");
  const owner = members.find(m => m.id === task.assignedTo);
  const creator = members.find(m => m.id === task.createdBy);
  const completed = task.status === "completed";
  const overdue = task.dueDate && dateKey(new Date(task.dueDate)) < dateKey(new Date());
  return <article className={`candy-task ${featured ? "candy-task-featured" : ""} ${completed ? "is-complete" : ""}`}>
    <div className="candy-task-line">
      <button type="button" className={`candy-check ${completed ? "checked" : ""}`} aria-label={`${completed ? "Reopen" : "Complete"} ${task.title}`} aria-pressed={completed} onClick={() => { onUpdate(task.id, { status: completed ? "pending" : "completed" }); triggerHaptic(12); }}>{completed && <Check size={15} strokeWidth={3} />}</button>
      {featured && <div className="candy-clock" aria-hidden="true">{task.dueDate && dateKey(new Date(task.dueDate)) === dateKey(new Date()) ? new Date(task.dueDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "★"}</div>}
      <div className="candy-task-body">
        {featured && <span className="candy-task-kicker">{task.priority === "high" ? "★ HIGH PRIORITY" : "UP NEXT"} · {dueLabel(task.dueDate)}</span>}
        <h3>{task.title}</h3>
        <p>For {owner?.id === actor.id ? "you" : owner?.name || "a member"}{creator && creator.id !== task.assignedTo ? ` · From ${creator.name}` : ""}{!featured ? ` · ${dueLabel(task.dueDate)}` : ""}</p>
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

export function Workspace({ space, members, tasks, messages, actor, connection, isDarkMode, pushEnabled, isPushBusy, banner, onSelectActor, onToggleTheme, onEnableAlerts, onLock, onCreateTask, onCreateMessage, onUpdateTask, onDeleteTask, onAddMember }: WorkspaceProps) {
  const [view, setView] = useState<"all" | "mine">("mine");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState(actor.id);
  const [mode, setMode] = useState<"task" | "message">("task");
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
  const recipient = members.find(m => m.id === recipientId) || actor;
  const draftKey = `${actor.id}:${recipient.id}:${mode}`;
  const draft = drafts[draftKey] || "";
  const setDraft = (value: string) => setDrafts(current => ({ ...current, [draftKey]: value }));
  const now = new Date();
  const days = weekDays(now, weekOffset);
  const scope = tasks.filter(t => view === "all" || t.assignedTo === actor.id);
  const filtered = selectedDay ? scope.filter(t => t.dueDate && dateKey(new Date(t.dueDate)) === selectedDay) : scope;
  const groups = dashboardGroups(filtered);
  const pending = filtered.filter(t => t.status === "pending");
  const completed = filtered.filter(t => t.status === "completed");
  const parsed = mode === "task" && draft.trim() ? parseQuickCapture(draft) : null;
  const conversation = messages.filter(m => (m.senderId === actor.id && m.recipientId === recipient.id) || (m.senderId === recipient.id && m.recipientId === actor.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).reverse();

  useEffect(() => { setRecipientId(actor.id); setMode("task"); setFeedback(null); setPriority("normal"); setDeadline(""); setCritical(false); }, [actor.id]);
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
    if (id === actor.id) setMode("task");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true); setFeedback(null);
    // Capture the destination and draft key so switching contacts during a request is safe.
    const submittedKey = draftKey;
    const submittedRecipient = recipient;
    try {
      if (mode === "message") {
        await onCreateMessage({ senderId: actor.id, recipientId: submittedRecipient.id, body: draft.trim() });
      } else {
        const result = parseQuickCapture(draft);
        const dueDate = deadline ? new Date(`${deadline}T09:00:00`).toISOString() : result.dueDate;
        const needsAlert = critical || result.type === "critical";
        if (needsAlert && !dueDate) throw new Error("Add a deadline for critical alerts, or turn them off. High priority works without a deadline.");
        await onCreateTask({ spaceId: space.id, title: result.title, note: result.note, type: needsAlert ? "critical" : "daily", priority, dueDate, assignedTo: submittedRecipient.id, createdBy: actor.id });
      }
      setDrafts(current => ({ ...current, [submittedKey]: "" }));
      setFeedback({ error: false, text: mode === "message" ? `Message sent to ${submittedRecipient.name}.` : submittedRecipient.id === actor.id ? "Added to your tasks." : `Task sent to ${submittedRecipient.name}.` });
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
  return <div className="candy-shell"><div className="candy-app">
    <header className="candy-bar">
      <a className="candy-logo" href="#dashboard" aria-label="Noted dashboard">noted ✦</a>
      <nav className="candy-nav" aria-label="Workspace navigation"><a className="active" href="#dashboard">My week</a><a href="#people">People</a><a href="#compose" onClick={() => inputRef.current?.focus()}>New task</a></nav>
      <span className="candy-space-name">{space.name}</span>
      <div className="candy-tools">
        <span className={`candy-sync ${connection === "connected" ? "connected" : ""}`} role="status">{connection === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}{connection === "connected" ? "Live sync" : connection === "connecting" ? "Connecting" : "Offline"}</span>
        <button type="button" className="candy-tool" onClick={onToggleTheme} aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}>{isDarkMode ? <Sun size={13} /> : <Moon size={13} />}{isDarkMode ? "Light" : "Dark"}</button>
        <button type="button" className="candy-tool" onClick={onEnableAlerts} disabled={isPushBusy} title={pushEnabled ? "Send a test alert" : "Enable alerts"}><BellRing size={13} />{isPushBusy ? "Please wait…" : pushEnabled ? "Test alerts" : "Enable alerts"}</button>
        <label className="candy-profile"><span className="sr-only">Using as</span><select value={actor.id} onChange={e => onSelectActor(e.target.value)} aria-label="Device profile">{members.map(m => <option value={m.id} key={m.id}>{m.avatar} {m.name}</option>)}</select></label>
        {space.requiresPasscode && <button className="candy-tool candy-icon" type="button" onClick={onLock} aria-label="Lock this device"><Lock size={14} /></button>}
      </div>
    </header>
    {banner && <div className="candy-banner" role="status">{banner}</div>}
    <section className="candy-intro"><div><div className="candy-eyebrow">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {actor.name}'s day</div><h1>Good things get done.</h1><p>Priority keeps important work visible. Deadlines show when it is due.</p></div><div className="candy-count"><b>{groups.high.length}</b> high-priority {groups.high.length === 1 ? "task" : "tasks"}</div></section>
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
        <section className="candy-section"><div className="candy-titleline"><h2>Priority tasks</h2><span>Important, even without a near deadline</span></div>{groups.high.length ? groups.high.map((t, index) => <TaskRow key={t.id} task={t} featured={index === 0 && !!t.dueDate && dateKey(new Date(t.dueDate)) <= dateKey(now)} {...taskProps} />) : <p className="candy-empty">No high-priority tasks. A little breathing room.</p>}</section>
        <section className="candy-section"><div className="candy-titleline"><h2>Due soon</h2><span>Deadline order</span></div>{groups.dated.length ? groups.dated.map((t, index) => <TaskRow key={t.id} task={t} featured={index === 0} {...taskProps} />) : <p className="candy-empty">No other deadlines to keep an eye on.</p>}</section>
        <section className="candy-section"><div className="candy-titleline"><h2>Whenever</h2><span>No deadline</span></div>{groups.later.length ? groups.later.map(t => <TaskRow key={t.id} task={t} {...taskProps} />) : <p className="candy-empty">Nothing else waiting here.</p>}</section>
        {completed.length > 0 && <details className="candy-completed"><summary>Completed · {completed.length}</summary>{completed.map(t => <TaskRow key={t.id} task={t} {...taskProps} />)}</details>}
      </main>
      <aside className="candy-side">
        <section className="candy-card" id="people"><div className="candy-titleline"><h2>Your people</h2><span>Assign ↗</span></div><div className="candy-people">{members.map(member => <button type="button" key={member.id} className={`candy-person ${recipient.id === member.id ? "on" : ""}`} aria-pressed={recipient.id === member.id} onClick={() => chooseRecipient(member.id)}><span className="candy-face">{member.avatar}</span><span><b>{member.name}{member.id === actor.id ? " · Me" : ""}</b><small>{tasks.filter(t => t.assignedTo === member.id && t.status === "pending").length} active tasks</small></span></button>)}</div><button className="candy-add-person" type="button" aria-expanded={addOpen} onClick={() => setAddOpen(!addOpen)}><Plus size={13} /> Add a person</button>
          {addOpen && <form className="candy-add-form" onSubmit={addMember}><label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label><label>Avatar<select value={avatar} onChange={e => setAvatar(e.target.value)}>{avatars.map(a => <option key={a}>{a}</option>)}</select></label><button className="candy-secondary" disabled={adding} type="submit">{adding ? "Adding…" : "Add to board"}</button>{memberError && <p className="candy-error" role="alert">{memberError}</p>}</form>}
        </section>
        <section className="candy-card candy-compose" id="compose"><div className="candy-titleline"><h2>{mode === "task" ? "Send a task" : "Send a message"}</h2><Send size={16} /></div><p className="candy-compose-help">{mode === "task" ? "Assign a person, set importance, and add a deadline if there is one." : `Send a quick note to ${recipient.name}. Their tasks stay in the dashboard.`}</p>
          <form onSubmit={submit}>
            <label className="candy-field-label" htmlFor="candy-assignee">Assign to</label><select id="candy-assignee" value={recipient.id} onChange={e => chooseRecipient(e.target.value)} disabled={sending}>{members.map(m => <option value={m.id} key={m.id}>{m.name}{m.id === actor.id ? " · Me" : ""}</option>)}</select>
            {recipient.id !== actor.id && <div className="candy-compose-mode" role="group" aria-label="Send type"><button type="button" className={mode === "task" ? "active" : ""} onClick={() => setMode("task")} disabled={sending}>Task</button><button type="button" className={mode === "message" ? "active" : ""} onClick={() => setMode("message")} disabled={sending}><MessageCircle size={11} /> Message</button></div>}
            {mode === "task" && <><span className="candy-field-label" id="priority-label">Priority</span><div className="candy-levels" role="group" aria-labelledby="priority-label">{priorities.map(p => <button type="button" key={p} className={priority === p ? "active" : ""} aria-pressed={priority === p} onClick={() => setPriority(p)} disabled={sending}>{priorityName(p)}</button>)}</div><label className="candy-field-label" htmlFor="candy-deadline">Deadline · optional</label><input id="candy-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={sending} /><label className="candy-critical-toggle"><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} disabled={sending} /> Critical deadline alerts</label></>}
            <label className="candy-field-label" htmlFor="candy-task">{mode === "task" ? "What needs doing?" : "Your message"}</label><textarea ref={inputRef} id="candy-task" rows={3} value={draft} onChange={e => { setDraft(e.target.value); setFeedback(null); }} maxLength={mode === "message" ? 2000 : undefined} placeholder={mode === "task" ? "Could you pick up milk?" : `Write to ${recipient.name}…`} disabled={sending} />
            {parsed?.dueDate && !deadline && <p className="candy-capture-hint">{dueLabel(parsed.dueDate)} · from your text</p>}
            <button className="candy-send" type="submit" disabled={!draft.trim() || sending}>{sending ? "Sending…" : mode === "task" ? "Send task ↗" : "Send message ↗"}</button>
            <p className={`candy-feedback ${feedback?.error ? "candy-error" : ""}`} role={feedback?.error ? "alert" : "status"}>{feedback?.text || ""}</p>
          </form>
          {recipient.id !== actor.id && conversation.length > 0 && <details className="candy-notes"><summary>Recent messages with {recipient.name}</summary>{conversation.map(m => <div className="candy-message" key={m.id}><b>{m.senderId === actor.id ? "You" : recipient.name}</b><p>{m.body}</p><small>{new Date(m.createdAt).toLocaleString()}</small></div>)}</details>}
        </section>
      </aside>
    </div>
    <footer className="candy-footer">{space.name} · Little steps, together. <span>Press C to write a task.</span></footer>
    <a className="candy-mobile-compose" href="#compose" onClick={() => inputRef.current?.focus()}><Plus size={15} /> New task</a>
  </div></div>;
}
