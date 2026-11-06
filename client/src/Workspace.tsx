import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BellRing, CalendarDays, Check, Circle, Lock, MessageCircle, Moon, Plus, Send, Sparkles, Sun, Trash2, Wifi, WifiOff } from "lucide-react";
import type { CreateMessagePayload, CreateTaskPayload, Member, Message, Space, Task, TaskPriority, UpdateTaskPayload } from "@todo-app/shared";
import { parseQuickCapture, isTaskForTomorrow, getDaysLeftInfo } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";

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

const avatarChoices = ["✨", "🌸", "⭐", "🌿", "🦊", "🐱", "🎨", "🚀", "🍒"];

function shortDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function TaskBubble({ task, actor, members, onUpdate, onDelete }: {
  task: Task;
  actor: Member;
  members: Member[];
  onUpdate: WorkspaceProps["onUpdateTask"];
  onDelete: WorkspaceProps["onDeleteTask"];
}) {
  const [justCompleted, setJustCompleted] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.note || "");
  const creator = members.find((member) => member.id === task.createdBy);
  const recipient = members.find((member) => member.id === task.assignedTo);
  const isDone = task.status === "completed";
  const isOutgoing = task.createdBy === actor.id;

  function toggleDone() {
    const nextStatus = isDone ? "pending" : "completed";
    if (!isDone) {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 650);
      triggerHaptic([18, 30, 12]);
    }
    onUpdate(task.id, { status: nextStatus });
  }

  return (
    <article className={`thread-row ${isOutgoing ? "thread-row-outgoing" : ""}`}>
      <div className={`task-bubble ${isDone ? "task-bubble-done" : ""} ${task.type === "critical" ? "task-bubble-critical" : ""}`}>
        <div className="task-bubble-top">
          <span className="task-bubble-kicker">{task.priority === "high" ? "★ HIGH PRIORITY" : task.type === "critical" ? "! CRITICAL DEADLINE" : `${task.priority || "normal"} priority`.toUpperCase()}</span>
          <span className="task-bubble-time">{shortTime(task.createdAt)}</span>
        </div>
        <div className="task-bubble-main">
          <button type="button" onClick={toggleDone} className={`task-check ${isDone ? "task-check-done" : ""}`} aria-label={isDone ? `Mark ${task.title} as not done` : `Mark ${task.title} done`}>
            {isDone ? <Check size={18} strokeWidth={3} /> : <Circle size={18} strokeWidth={2.5} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className={`task-bubble-title ${isDone ? "line-through opacity-60" : ""}`}>{task.title}</p>
            {task.note && !editingNote && <p className="task-bubble-note">{task.note}</p>}
            {editingNote && <form className="task-note-form" onSubmit={(event) => { event.preventDefault(); onUpdate(task.id, { note: noteDraft.trim() || null }); setEditingNote(false); }}><input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a detail or reminder" aria-label="Task note" autoFocus /><button type="submit">Save</button></form>}
          </div>
          {justCompleted && <span className="chomp-burst" aria-hidden="true">🍒</span>}
        </div>
        <div className="task-bubble-footer">
          <span>For {recipient?.id === actor.id ? "you" : recipient?.name || "someone"}</span>
          {task.createdBy !== task.assignedTo && <span>From {creator?.name || "member"}</span>}
          {task.dueDate && <span className="task-due"><CalendarDays size={12} /> {shortDate(task.dueDate)}</span>}
          {task.type === "critical" && !isDone && <span className="task-deadline-count">{getDaysLeftInfo(task.dueDate).label}</span>}
          <button type="button" className="task-note-button" onClick={() => { setNoteDraft(task.note || ""); setEditingNote((current) => !current); }}>{task.note ? "Edit note" : "+ Note"}</button>
          <button type="button" title="Remove task" aria-label={`Remove ${task.title}`} className="task-delete" onClick={() => {
            if (window.confirm(`Remove “${task.title}”?`)) onDelete(task.id);
          }}><Trash2 size={14} /></button>
        </div>
      </div>
    </article>
  );
}

function MessageBubble({ message, actor, members }: { message: Message; actor: Member; members: Member[] }) {
  const isOutgoing = message.senderId === actor.id;
  const sender = members.find((member) => member.id === message.senderId);
  return (
    <article className={`thread-row ${isOutgoing ? "thread-row-outgoing" : ""}`}>
      <div className={`message-bubble ${isOutgoing ? "message-bubble-outgoing" : ""}`}>
        <p>{message.body}</p>
        <span>{isOutgoing ? "You" : sender?.name || "Member"} · {shortTime(message.createdAt)}</span>
      </div>
    </article>
  );
}

export function Workspace({ space, members, tasks, messages, actor, connection, isDarkMode, pushEnabled, isPushBusy, banner, onSelectActor, onToggleTheme, onEnableAlerts, onLock, onCreateTask, onCreateMessage, onUpdateTask, onDeleteTask, onAddMember }: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState("mine");
  const [mode, setMode] = useState<"task" | "message">("task");
  const [dashboardView, setDashboardView] = useState<"all" | "mine">("mine");
  const [newPriority, setNewPriority] = useState<TaskPriority>("normal");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [taskOptions, setTaskOptions] = useState<Record<string, { dueDate: string; critical: boolean }>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberAvatar, setMemberAvatar] = useState("✨");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const contacts = members.filter((member) => member.id !== actor.id);
  const selectedMember = contacts.find((member) => member.id === selectedId);
  const selectedIsMine = !selectedMember;
  const draftKey = `${selectedId}:${mode}`;
  const draft = drafts[draftKey] || "";
  const dueDate = taskOptions[selectedId]?.dueDate || "";
  const critical = taskOptions[selectedId]?.critical || false;
  const setDraft = (value: string) => setDrafts((current) => ({ ...current, [draftKey]: value }));
  const setDueDate = (value: string) => setTaskOptions((current) => ({ ...current, [selectedId]: { dueDate: value, critical: current[selectedId]?.critical || false } }));
  const setCritical = (value: boolean) => setTaskOptions((current) => ({ ...current, [selectedId]: { dueDate: current[selectedId]?.dueDate || "", critical: value } }));

  useEffect(() => { setSelectedId("mine"); }, [actor.id]);
  useEffect(() => { setSendError(null); setMode("task"); }, [selectedId]);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [selectedId, tasks.length, messages.length]);
  useEffect(() => {
    const focusShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", focusShortcut);
    return () => window.removeEventListener("keydown", focusShortcut);
  }, []);

  const myTasks = useMemo(() => tasks.filter((task) => task.assignedTo === actor.id), [tasks, actor.id]);
  const pendingMine = myTasks.filter((task) => task.status === "pending");
  const completedMine = myTasks.filter((task) => task.status === "completed");
  const criticalMine = pendingMine.filter((task) => task.type === "critical");
  const visiblePending = dashboardView === "all" ? tasks.filter((task) => task.status === "pending") : pendingMine;
  const prioritySort = (a: Task, b: Task) => ({ high: 0, normal: 1, low: 2 }[a.priority || "normal"] - { high: 0, normal: 1, low: 2 }[b.priority || "normal"] || ((a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)));
  const priorityTasks = visiblePending.filter((task) => task.priority === "high").sort(prioritySort);
  const dueSoonTasks = visiblePending.filter((task) => task.priority !== "high" && (task.type === "critical" || task.dueDate)).sort(prioritySort);
  const laterTasks = visiblePending.filter((task) => task.priority !== "high" && task.type !== "critical" && !task.dueDate).sort(prioritySort);
  const completedCount = completedMine.length;
  const totalMine = myTasks.length;

  const threadItems = useMemo(() => {
    if (!selectedMember) return [];
    const relevantTasks = tasks.filter((task) =>
      task.assignedTo === selectedMember.id ||
      (task.createdBy === selectedMember.id && task.assignedTo === actor.id)
    ).map((task) => ({ kind: "task" as const, id: task.id, at: task.createdAt, task }));
    const relevantMessages = messages.filter((message) =>
      (message.senderId === actor.id && message.recipientId === selectedMember.id) ||
      (message.senderId === selectedMember.id && message.recipientId === actor.id)
    ).map((message) => ({ kind: "message" as const, id: message.id, at: message.createdAt, message }));
    return [...relevantTasks, ...relevantMessages].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }, [selectedMember, actor.id, tasks, messages]);

  const parsed = mode === "task" && draft.trim() ? parseQuickCapture(draft) : null;
  const isCritical = critical || parsed?.type === "critical";
  const target = selectedMember || actor;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSendError(null);
    setSending(true);
    try {
      if (mode === "message") {
        if (!selectedMember) return;
        await onCreateMessage({ senderId: actor.id, recipientId: selectedMember.id, body: draft.trim() });
      } else {
        const result = parseQuickCapture(draft);
        const date = dueDate ? new Date(`${dueDate}T09:00:00`).toISOString() : result.dueDate;
        if (isCritical && !date) {
          setSendError("Choose a date for this deadline.");
          return;
        }
        await onCreateTask({ spaceId: space.id, title: result.title, note: result.note, type: isCritical ? "critical" : "daily", priority: newPriority, dueDate: date, assignedTo: target.id, createdBy: actor.id });
      }
      setDraft("");
      setDueDate("");
      setCritical(false);
      setNewPriority("normal");
      triggerHaptic(12);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    const name = memberName.trim();
    if (!name || addingMember) return;
    if (members.some((member) => member.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMemberError("That name is already here.");
      return;
    }
    setAddingMember(true);
    setMemberError(null);
    try {
      const created = await onAddMember(name, memberAvatar);
      setMemberName("");
      setMemberAvatar("✨");
      setShowAddMember(false);
      setSelectedId(created.id);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not add member.");
    } finally {
      setAddingMember(false);
    }
  }

  function selectContact(id: string) {
    setSelectedId(id);
    triggerHaptic(8);
  }

  return (
    <div className="noted-shell">
      <div className="noted-glow noted-glow-one" aria-hidden="true" />
      <div className="noted-glow noted-glow-two" aria-hidden="true" />
      <header className="noted-topbar">
        <div className="noted-brand"><span className="noted-brand-mark">✦</span><div><strong>NOTED<span className="noted-brand-dot">.</span></strong><small>{space.name}</small></div></div>
        <div className="noted-top-actions">
          <span className="noted-connection" title={connection === "connected" ? "Live sync connected" : "Reconnecting"}>{connection === "connected" ? <Wifi size={14} /> : <WifiOff size={14} />}<span className="hidden sm:inline">{connection === "connected" ? "Live" : "Offline"}</span></span>
          <label className="noted-profile-label">Using as <select value={actor.id} onChange={(event) => onSelectActor(event.target.value)} aria-label="Device profile">{members.map((member) => <option key={member.id} value={member.id}>{member.avatar} {member.name}</option>)}</select></label>
          <button type="button" className="noted-icon-button" title={pushEnabled ? "Send a test alert" : "Enable alerts"} onClick={onEnableAlerts} disabled={isPushBusy}><BellRing size={18} /></button>
          <button type="button" className="noted-icon-button" title={isDarkMode ? "Light mode" : "Dark mode"} onClick={onToggleTheme}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
          {space.requiresPasscode && <button type="button" className="noted-icon-button" title="Lock this device" onClick={onLock}><Lock size={18} /></button>}
        </div>
      </header>
      {banner && <div className="noted-banner" role="status">{banner}</div>}
      <div className="noted-layout">
        <aside className="noted-sidebar">
          <div className="noted-sidebar-heading"><span>YOUR SPACE</span><span className="noted-sidebar-star">✦ 199X</span></div>
          <button type="button" className={`noted-nav-item ${selectedIsMine ? "noted-nav-active" : ""}`} onClick={() => selectContact("mine")}>
            <span className="noted-avatar noted-avatar-me">{actor.avatar}</span><span className="noted-nav-text"><strong>My day</strong><small>{pendingMine.length ? `${pendingMine.length} tasks waiting` : "All clear for now"}</small></span><span className="noted-nav-count">{pendingMine.length}</span>
          </button>
          <div className="noted-sidebar-heading noted-sidebar-heading-people"><span>PEOPLE</span><span>{contacts.length}</span></div>
          <div className="noted-contacts">
            {contacts.map((member) => {
              const count = tasks.filter((task) => task.assignedTo === member.id && task.status === "pending").length;
              const lastMessage = [...messages].reverse().find((message) =>
                (message.senderId === actor.id && message.recipientId === member.id) ||
                (message.senderId === member.id && message.recipientId === actor.id)
              );
              return <button key={member.id} type="button" className={`noted-nav-item ${selectedId === member.id ? "noted-nav-active" : ""}`} onClick={() => selectContact(member.id)}><span className="noted-avatar">{member.avatar}</span><span className="noted-nav-text"><strong>{member.name}</strong><small>{lastMessage?.body || (count ? `${count} tasks on their list` : "Start a conversation")}</small></span>{count > 0 && <span className="noted-nav-count">{count}</span>}</button>;
            })}
          </div>
          <button type="button" className="noted-add-person" onClick={() => setShowAddMember((current) => !current)}><Plus size={17} /> Add a person</button>
          {showAddMember && <form onSubmit={addMember} className="noted-add-form"><div className="flex gap-2"><select aria-label="New person avatar" value={memberAvatar} onChange={(event) => setMemberAvatar(event.target.value)}>{avatarChoices.map((avatar) => <option key={avatar} value={avatar}>{avatar}</option>)}</select><input value={memberName} onChange={(event) => { setMemberName(event.target.value); setMemberError(null); }} placeholder="Their name" aria-label="New person name" autoFocus /></div><button type="submit" disabled={!memberName.trim() || addingMember}>{addingMember ? "Adding..." : "Add to space"}</button>{memberError && <p role="alert">{memberError}</p>}</form>}
          <div className="noted-sidebar-bottom"><div className="maze-mini" aria-hidden="true"><i /><i /><i /><i /><i /></div><p>Little steps count.<br /><span>Keep the good things moving.</span></p></div>
        </aside>

        <main className="noted-main">
          <div className="noted-main-header">
            <div className="noted-heading-line"><span className="noted-heading-spark">✦</span><span>{selectedIsMine ? "PLAYER ONE" : "CONVERSATION"}</span></div>
            <div className="noted-main-heading"><div className="noted-main-avatar">{selectedIsMine ? actor.avatar : selectedMember?.avatar}</div><div><h1>{selectedIsMine ? "Your day, your pace" : selectedMember?.name}</h1><p>{selectedIsMine ? "The small things you want to get done." : `Send ${selectedMember?.name} a task or just say hello.`}</p></div></div>
            {selectedIsMine && <img className="noted-hero-muse" src="/arcade-muse.png" alt="" aria-hidden="true" />}
            {!selectedIsMine && <button type="button" className="noted-back-mobile" onClick={() => selectContact("mine")}><ArrowLeft size={16} /> My day</button>}
          </div>

          {selectedIsMine ? <div className="noted-myday">
            <div className="noted-dashboard-switch"><button type="button" className={dashboardView === "all" ? "active" : ""} onClick={() => setDashboardView("all")}>Complete Action · Everyone</button><button type="button" className={dashboardView === "mine" ? "active" : ""} onClick={() => setDashboardView("mine")}>My focus</button><span>{dashboardView === "all" ? `${visiblePending.length} open across ${members.length} people` : `${pendingMine.length} open for you`}</span></div>
            <div className="noted-progress-card"><div><div className="noted-progress-eyebrow"><Sparkles size={14} /> {dashboardView === "all" ? "THE WHOLE CREW" : "YOUR LITTLE WINS"}</div><strong>{dashboardView === "all" ? visiblePending.length : completedCount}<span>{dashboardView === "all" ? " open" : ` / ${totalMine}`}</span></strong><p>{dashboardView === "all" ? "Everyone’s active tasks, ordered by priority and deadline." : completedCount === 0 ? "Every journey begins with one dot." : "Look at you go. One step at a time."}</p></div><div className="noted-progress-maze" aria-hidden="true"><span>●　●　●</span><span className="noted-cherry">🍒</span></div></div>
            {priorityTasks.length > 0 && <section className="noted-task-section"><h2><span className="section-icon section-icon-coral">★</span> High priority <small>{priorityTasks.length}</small></h2>{priorityTasks.map((task) => <TaskBubble key={task.id} task={task} actor={actor} members={members} onUpdate={onUpdateTask} onDelete={onDeleteTask} />)}</section>}
            {dueSoonTasks.length > 0 && <section className="noted-task-section"><h2><span className="section-icon section-icon-yellow"><CalendarDays size={15} /></span> Due soon <small>{dueSoonTasks.length}</small></h2>{dueSoonTasks.map((task) => <TaskBubble key={task.id} task={task} actor={actor} members={members} onUpdate={onUpdateTask} onDelete={onDeleteTask} />)}</section>}
            <section className="noted-task-section"><h2><span className="section-icon section-icon-blue">●</span> Whenever <small>{laterTasks.length}</small></h2>{laterTasks.length ? laterTasks.map((task) => <TaskBubble key={task.id} task={task} actor={actor} members={members} onUpdate={onUpdateTask} onDelete={onDeleteTask} />) : <div className="noted-empty-small">No other open tasks. Add one below whenever you’re ready.</div>}</section>
            {completedMine.length > 0 && <section className="noted-task-section noted-completed-section"><h2><span className="section-icon section-icon-green"><Check size={15} /></span> Done <small>{completedMine.length}</small></h2>{completedMine.slice(0, 8).map((task) => <TaskBubble key={task.id} task={task} actor={actor} members={members} onUpdate={onUpdateTask} onDelete={onDeleteTask} />)}</section>}
          </div> : <div className="noted-thread">
            <div className="noted-thread-intro"><span className="thread-intro-star">✦</span><p>Your space with <strong>{selectedMember?.name}</strong><br /><small>Shared space · profiles can be switched by members.</small></p><span className="thread-intro-star">✦</span></div>
            {threadItems.length ? threadItems.map((item) => item.kind === "task" ? <TaskBubble key={`task-${item.id}`} task={item.task} actor={actor} members={members} onUpdate={onUpdateTask} onDelete={onDeleteTask} /> : <MessageBubble key={`message-${item.id}`} message={item.message} actor={actor} members={members} />) : <div className="noted-thread-empty"><img src="/arcade-muse.png" alt="" aria-hidden="true" /><strong>A fresh page</strong><p>Send a task to make something happen, or a message to start talking.</p></div>}
            <div ref={threadEndRef} />
          </div>}

          <div className="noted-composer-wrap"><form onSubmit={submit} className="noted-composer"><div className="noted-composer-tabs"><button type="button" className={mode === "task" ? "active" : ""} onClick={() => { setMode("task"); setSendError(null); }}><Circle size={14} /> Task</button>{!selectedIsMine && <button type="button" className={mode === "message" ? "active" : ""} onClick={() => { setMode("message"); setSendError(null); }}><MessageCircle size={14} /> Message</button>}<span className="noted-composer-recipient">{mode === "task" ? `For ${target.id === actor.id ? "you" : target.name}` : `To ${selectedMember?.name}`}</span></div><div className="noted-composer-input-row"><textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); setSendError(null); }} placeholder={mode === "task" ? `Add a task for ${target.id === actor.id ? "yourself" : target.name}...` : `Write to ${selectedMember?.name}...`} rows={1} maxLength={mode === "message" ? 2000 : undefined} disabled={sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" className="noted-send" disabled={!draft.trim() || sending} aria-label={mode === "task" ? "Add task" : "Send message"}><Send size={18} /></button></div>{mode === "task" && <div className="noted-composer-options"><div className="noted-priority-picker" aria-label="Task priority"><span>Priority</span>{(["high", "normal", "low"] as TaskPriority[]).map((priority) => <button key={priority} type="button" className={newPriority === priority ? "selected" : ""} onClick={() => setNewPriority(priority)}>{priority[0].toUpperCase() + priority.slice(1)}</button>)}</div><label><CalendarDays size={14} /> <input type="date" aria-label="Optional task deadline" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><button type="button" className={isCritical ? "selected" : ""} onClick={() => setCritical(!critical)}>★ Critical alert</button>{parsed?.dueDate && !dueDate && <span>Using date in your task</span>}{parsed?.note && <span>Note attached</span>}</div>}{sendError && <p className="noted-composer-error" role="alert">{sendError}</p>}</form><p className="noted-composer-hint">Press <kbd>C</kbd> to write · <kbd>Enter</kbd> to send · <kbd>Shift Enter</kbd> for a new line</p></div>
        </main>
      </div>
    </div>
  );
}
