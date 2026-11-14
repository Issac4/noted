import { useEffect, useRef, useState, type CSSProperties } from "react";
import { BellRing, Check, Lock, Moon, Plus, Send, Sun, Trash2, Wifi, WifiOff } from "lucide-react";
import type { CreateTaskPayload, Member, Space, Task, TaskPriority, TaskRecurrence, UpdateTaskPayload } from "@todo-app/shared";
import { parseQuickCapture } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";
import { dateKey, focusGroups, countdown, daysUntil, completedHistory } from "@/lib/dashboard";
import { RepeatControl, repeatLabel } from "@/components/RepeatControl";
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
const dueLabel = countdown;

function TaskRow({ task, actor, members, soonest = false, onUpdate, onDelete }: {
  task: Task; actor: Member; members: Member[]; soonest?: boolean;
  onUpdate: WorkspaceProps["onUpdateTask"]; onDelete: WorkspaceProps["onDeleteTask"];
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(task.note || "");
  const owner = members.find(m => m.id === task.assignedTo);
  const creator = members.find(m => m.id === task.createdBy);
  const completed = task.status === "completed";
  return <article className={`candy-task ${soonest ? "is-nearest" : ""} ${completed ? "is-complete" : ""}`}>
    <div className="candy-task-line">
      <button type="button" className={`candy-check ${completed ? "checked" : ""}`} aria-label={`${completed ? "Reopen" : "Complete"} ${task.title}`} aria-pressed={completed} onClick={() => {
        if (completed && task.recurrence && !window.confirm("Reopen this occurrence? Its next unfinished occurrence will be removed. If a later occurrence is already completed, reopening is unavailable.")) return;
        onUpdate(task.id, { status: completed ? "pending" : "completed" }); triggerHaptic(12);
      }}>{completed && <Check size={15} strokeWidth={3} />}</button>
      <div className="candy-task-body">
        {soonest && <span className="candy-task-kicker">Next to tackle</span>}
        <h3>{task.title}</h3>
        <p>For {owner?.id === actor.id ? "you" : owner?.name || "a member"}{creator && creator.id !== task.assignedTo ? ` · From ${creator.name}` : ""}</p>
        {completed && <p className="candy-completion-time">{task.completedAt ? <>Completed <time dateTime={task.completedAt}>{new Date(task.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></> : "Completed · time not recorded"}</p>}
        {task.recurrence && <p className="candy-repeat-label">↻ {repeatLabel(task.recurrence)}</p>}
        {task.note && <p className="candy-task-note">{task.note}</p>}
      </div>
      {!completed && task.dueDate && <div className={`candy-countdown ${daysUntil(task.dueDate) <= 0 ? "is-urgent" : ""}`}><strong>{countdown(task.dueDate)}</strong><time dateTime={task.dueDate}>{new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", })}</time></div>}

    </div>
    <div className="candy-task-actions">
      {task.type === "critical" && <span className="candy-critical">Critical</span>}
      {task.priority === "high" && <span className="candy-critical">High priority</span>}
      <button type="button" onClick={() => { setNote(task.note || ""); setEditing(!editing); }}>{editing ? "Cancel" : "Edit task"}</button>

    </div>
    {editing && <div className="candy-task-edit">
      <label>Priority<select aria-label={`Priority for ${task.title}`} value={task.priority || "normal"} onChange={e => onUpdate(task.id, { priority: e.target.value as TaskPriority })}>{priorities.map(p => <option key={p} value={p}>{priorityName(p)}</option>)}</select></label>
      <label>Deadline · optional<input type="date" aria-label={`Deadline for ${task.title}`} value={task.dueDate ? dateKey(new Date(task.dueDate)) : ""} onChange={e => onUpdate(task.id, { dueDate: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null, ...(!e.target.value ? { type: "daily" as const, recurrence: null } : {}) })} /></label>
      <RepeatControl value={task.recurrence || null} commitOnBlur disabled={!task.dueDate || completed} onChange={recurrence => onUpdate(task.id, { recurrence })} />
      <p className="candy-repeat-help">{completed ? "Edit the next occurrence to change future repeats." : !task.dueDate ? "Set a deadline to enable repeating." : "Completion creates the next scheduled task. Short months use their last day."}</p>
      <button className="candy-delete-task" type="button" onClick={() => { if (window.confirm(`Remove “${task.title}”?`)) onDelete(task.id); }}><Trash2 size={14} /> Delete task</button>
      <form onSubmit={e => { e.preventDefault(); onUpdate(task.id, { note: note.trim() || null }); setEditing(false); }}><label>Note<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></label><button className="candy-secondary" type="submit">Save note</button></form>
    </div>}
  </article>;
}

export function Workspace({ space, members, tasks, actor, connection, isDarkMode, pushEnabled, isPushBusy, banner, onSelectActor, onToggleTheme, onEnableAlerts, onLock, onCreateTask, onUpdateTask, onDeleteTask, onAddMember }: WorkspaceProps) {
  const [view, setView] = useState<"all" | "mine">("mine");
  const [recipientId, setRecipientId] = useState(actor.id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [deadline, setDeadline] = useState("");
  const [critical, setCritical] = useState(false);
  const [recurrence, setRecurrence] = useState<TaskRecurrence | null>(null);
  const [now, setNow] = useState(() => new Date());
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
  const scope = tasks.filter(t => view === "all" || t.assignedTo === actor.id);
  const groups = focusGroups(scope, now);
  const pending = scope.filter(t => t.status === "pending");
  const completed = completedHistory(scope);
  const nextTask = groups.urgent[0] || groups.important[0] || groups.upcoming[0] || groups.anytime[0];
  const overdueCount = groups.urgent.filter(t => t.dueDate && daysUntil(t.dueDate, now) < 0).length;
  const parsed = draft.trim() ? parseQuickCapture(draft) : null;


  useEffect(() => { setRecipientId(actor.id); setFeedback(null); setPriority("normal"); setDeadline(""); setCritical(false); setRecurrence(null); }, [actor.id]);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, []);
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
      if (recurrence && !dueDate) throw new Error("Set the first deadline for this repeating task.");
      await onCreateTask({ spaceId: space.id, title: result.title, note: result.note, type: needsAlert ? "critical" : "daily", priority, dueDate, recurrence, assignedTo: submittedRecipient.id, createdBy: actor.id });
      setDrafts(current => ({ ...current, [submittedKey]: "" }));
      setFeedback({ error: false, text: submittedRecipient.id === actor.id ? "Added to your tasks." : `Task sent to ${submittedRecipient.name}.` });
      setDeadline(""); setCritical(false); setRecurrence(null); setPriority("normal"); triggerHaptic(12);
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
      <a className="candy-logo" href="#dashboard" aria-label="Noted dashboard">noted <span className="candy-seal" aria-hidden="true">記</span></a>
      <nav className="candy-nav" aria-label="Workspace navigation"><a className="active" href="#dashboard">Focus board</a><a href="#completed">Completed</a></nav>
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
    <section className="candy-intro candy-intro-compact"><div><div className="candy-eyebrow">{space.name} · {view === "mine" ? actor.name : "Everyone"}</div><div className="candy-shigoto-heading"><span lang="ja" aria-hidden="true">今日の一歩</span><h1>One step at a time.</h1></div><p>{groups.urgent.length ? `${groups.urgent.length} need attention today${overdueCount ? ` · ${overdueCount} overdue` : ""}. Start at the top.` : "A little clarity for your next step."}</p></div><div className="candy-focus-total"><b>{pending.length}</b><span>open tasks</span></div></section>
    <div className="candy-layout">
      <main className="candy-main" id="dashboard">
        <div className="candy-board-controls"><div className="candy-view-switch" role="group" aria-label="Task view"><button type="button" className={view === "all" ? "active" : ""} aria-pressed={view === "all"} onClick={() => setView("all")}>Complete Action · Everyone</button><button type="button" className={view === "mine" ? "active" : ""} aria-pressed={view === "mine"} onClick={() => setView("mine")}>My focus</button></div><span>{pending.length} open{view === "all" ? ` · ${members.length} people` : " for you"}</span></div>
        <div className="candy-task-groups candy-focus-groups" aria-label="Tasks by urgency">
          <section className="candy-section candy-group-urgent"><div className="candy-titleline"><h2><span className="candy-lane-jp" lang="ja" aria-hidden="true">今</span>Act now <small>{groups.urgent.length}</small></h2><span>Overdue & due today · deadline first</span></div>{groups.urgent.length ? groups.urgent.map(t => <TaskRow key={t.id} task={t} soonest={t.id === nextTask?.id} {...taskProps} />) : <p className="candy-empty">Nothing overdue or due today. You’re clear here.</p>}</section>
          <section className="candy-section candy-group-high"><div className="candy-titleline"><h2><span className="candy-lane-jp" lang="ja" aria-hidden="true">大切</span>Important <small>{groups.important.length}</small></h2><span>High priority & critical · keep in view</span></div>{groups.important.length ? groups.important.map(t => <TaskRow key={t.id} task={t} soonest={t.id === nextTask?.id} {...taskProps} />) : <p className="candy-empty">No other high-priority work waiting.</p>}</section>
          <section className="candy-section candy-group-dated"><div className="candy-titleline"><h2><span className="candy-lane-jp" lang="ja" aria-hidden="true">次</span>Coming up <small>{groups.upcoming.length}</small></h2><span>Upcoming deadlines · soonest first</span></div>{groups.upcoming.length ? groups.upcoming.map(t => <TaskRow key={t.id} task={t} soonest={t.id === nextTask?.id} {...taskProps} />) : <p className="candy-empty">No other deadlines ahead.</p>}</section>
          <section className="candy-section candy-group-later"><div className="candy-titleline"><h2><span className="candy-lane-jp" lang="ja" aria-hidden="true">余白</span>Whenever <small>{groups.anytime.length}</small></h2><span>No deadline · at your own pace</span></div>{groups.anytime.length ? groups.anytime.map(t => <TaskRow key={t.id} task={t} soonest={t.id === nextTask?.id} {...taskProps} />) : <p className="candy-empty">Nothing else waiting here.</p>}</section>
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
      <details className="candy-capture-options"><summary>Task options <span>{priorityName(priority)} priority · {deadline ? countdown(new Date(`${deadline}T09:00:00`).toISOString(), now) : "No deadline"} · {repeatLabel(recurrence)}{critical ? " · Critical alerts" : ""}</span></summary><div className="candy-dock-options">

        <fieldset className="candy-dock-priority"><legend>Priority</legend><div className="candy-levels">{priorities.map(p => <button type="button" key={p} className={priority === p ? "active" : ""} aria-pressed={priority === p} onClick={() => setPriority(p)} disabled={sending}>{priorityName(p)}</button>)}</div></fieldset>
        <label className="candy-dock-field" htmlFor="candy-deadline"><span>Deadline · optional</span><input id="candy-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={sending} /></label>
        <RepeatControl value={recurrence} disabled={sending} onChange={setRecurrence} />
        <label className="candy-critical-toggle candy-dock-critical" title="Daily reminders after 9 AM Toronto time until completed, including overdue tasks."><input type="checkbox" checked={critical} onChange={e => setCritical(e.target.checked)} disabled={sending} /><span>Critical alerts<small>Daily · 9 AM Toronto</small></span></label>
      </div><p className="candy-repeat-help">Repeats need a first deadline. Completing a task creates the next occurrence; missed dates are skipped.</p></details>
      <div className="candy-dock-entry"><label className="candy-dock-field" htmlFor="candy-assignee"><span>Assign to</span><select id="candy-assignee" value={recipient.id} onChange={e => chooseRecipient(e.target.value)} disabled={sending}>{members.map(m => <option value={m.id} key={m.id}>{m.name}{m.id === actor.id ? " · Me" : ""}</option>)}</select></label><label className="sr-only" htmlFor="candy-task">What needs doing?</label><textarea ref={inputRef} id="candy-task" rows={1} value={draft} onChange={e => { setDraft(e.target.value); setFeedback(null); }} placeholder={`Add a task for ${recipient.id === actor.id ? "yourself" : recipient.name}…`} disabled={sending} enterKeyHint="send" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button className="candy-send" type="submit" aria-label="Send task" disabled={!draft.trim() || sending}><Send size={15} /><span>{sending ? "Sending…" : "Send task"}</span></button></div>
      {(parsed?.dueDate && !deadline || feedback) && <p className={`candy-feedback ${feedback?.error ? "candy-error" : ""}`} role={feedback?.error ? "alert" : "status"}>{feedback?.text || (parsed?.dueDate ? `${dueLabel(parsed.dueDate)} · from your text` : "")}</p>}
    </form>
  </section>
  </div>;
}
