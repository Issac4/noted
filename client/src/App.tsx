import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Wifi,
  WifiOff,
  FileText,
  Sun,
} from "lucide-react";
import type { Task, Member, CreateTaskPayload, UpdateTaskPayload } from "@todo-app/shared";
import { useFamilySocket, type AppStateData } from "@/hooks/useFamilySocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

function parseQuickCapture(rawInput: string): {
  title: string;
  note: string | null;
  type: "critical" | "daily";
  dueDate: string | null;
} {
  let text = rawInput.trim();
  let note: string | null = null;

  // Support optional note via "//" separator, e.g. "Replace filter // 16x25x1"
  if (text.includes("//")) {
    const [mainPart, ...noteParts] = text.split("//");
    text = mainPart.trim();
    note = noteParts.join("//").trim() || null;
  }

  let type: "critical" | "daily" = "daily";
  if (/!critical\b/i.test(text) || /!urgent\b/i.test(text)) {
    type = "critical";
    text = text.replace(/!(critical|urgent)\b/gi, "").trim();
  }

  let dueDate: string | null = null;
  const now = new Date();

  // Detect "in X days"
  const inDaysMatch = text.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const target = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    dueDate = target.toISOString();
  } else if (/\btomorrow\b/i.test(text) || /聽日/.test(text)) {
    const target = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    dueDate = target.toISOString();
  } else if (type === "critical") {
    const target = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    dueDate = target.toISOString();
  }

  return {
    title: text || rawInput.trim(),
    note,
    type,
    dueDate,
  };
}

function getDaysLeftLabel(dueDateStr: string | null): string {
  if (!dueDateStr) return "Due Soon";
  const diffMs = new Date(dueDateStr).getTime() - Date.now();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)}d Past Cutoff`;
  if (days === 0) return "Due Today";
  if (days === 1) return "1 Day Left";
  return `${days} Days Left`;
}

export default function App() {
  const queryClient = useQueryClient();
  const { status: wsStatus } = useFamilySocket();

  const [activeActorId, setActiveActorId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [forceCritical, setForceCritical] = useState(false);
  const [soloMode, setSoloMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery<AppStateData>({
    queryKey: ["state"],
    queryFn: async () => {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("Failed to fetch workspace state");
      return res.json();
    },
  });

  // Set default actor and assignee once members are loaded
  useEffect(() => {
    if (data?.members?.length) {
      if (!activeActorId) setActiveActorId(data.members[0].id);
      if (!assigneeId) setAssigneeId(data.members[0].id);
    }
  }, [data?.members, activeActorId, assigneeId]);

  // Keyboard shortcut: Press 'C' to summon quick capture input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const createTaskMutation = useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json() as Promise<Task>;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<AppStateData>(["state"], (prev) => {
        if (!prev) return prev;
        if (prev.tasks.some((t) => t.id === created.id)) return prev;
        return { ...prev, tasks: [created, ...prev.tasks] };
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateTaskPayload }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update task");
      return res.json() as Promise<Task>;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["state"] });
      queryClient.setQueryData<AppStateData>(["state"], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        };
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete task");
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["state"] });
      queryClient.setQueryData<AppStateData>(["state"], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== id),
        };
      });
    },
  });

  const handleCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || !activeActorId || !assigneeId || !data?.space) return;

    const parsed = parseQuickCapture(quickInput);
    const finalType = forceCritical ? "critical" : parsed.type;
    const finalDueDate =
      finalType === "critical" && !parsed.dueDate
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        : parsed.dueDate;

    createTaskMutation.mutate({
      spaceId: data.space.id,
      title: parsed.title,
      note: parsed.note,
      type: finalType,
      dueDate: finalDueDate,
      assignedTo: assigneeId,
      createdBy: activeActorId,
    });

    setQuickInput("");
    setForceCritical(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 animate-spin text-primary" />
          Loading Household Hub...
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-destructive">
        Unable to load workspace state. Please verify the server is running.
      </div>
    );
  }

  const { space, members, tasks } = data;
  const memberById = new Map<string, Member>(members.map((m) => [m.id, m]));
  const activeActor = activeActorId ? memberById.get(activeActorId) : members[0];
  const targetAssignee = assigneeId ? memberById.get(assigneeId) : members[0];

  const criticalTasks = tasks.filter((t) => t.type === "critical" && t.status === "pending");
  const visibleMembers = soloMode && activeActor ? [activeActor] : members;

  const cycleAssignee = () => {
    if (!members.length) return;
    const idx = members.findIndex((m) => m.id === assigneeId);
    const next = members[(idx + 1) % members.length];
    setAssigneeId(next.id);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      {/* Header Bar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-bold">
              ✓
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight flex items-center gap-2">
                {space.name}
                <Badge variant="secondary" className="text-[11px] font-normal">
                  Guilt-Free Rollover
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Zero-overhead household & personal task hub
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Active user selector ("Viewing as") */}
            <div className="flex items-center gap-1.5 bg-secondary/60 p-1 rounded-lg border border-border/60">
              <span className="text-[11px] text-muted-foreground px-2">Acting as:</span>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setActiveActorId(m.id);
                    setAssigneeId(m.id);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeActorId === m.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m.avatar} {m.name}
                </button>
              ))}
            </div>

            {/* Solo / Collaborative view toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSoloMode((v) => !v)}
              className="text-xs"
            >
              {soloMode ? "👤 Solo Focus" : "👥 Collaborative"}
            </Button>

            {/* WebSocket real-time indicator */}
            <div
              data-testid="ws-status"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                wsStatus === "connected"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}
            >
              {wsStatus === "connected" ? (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Live Sync</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Reconnecting</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* Module 1: Critical Hard Deadlines (The Gatekeeper) */}
        <section aria-label="Critical Hard Deadlines">
          <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-card to-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <CardTitle className="text-sm font-semibold text-amber-200">
                  Critical Hard Deadlines (The Gatekeeper)
                </CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                Alerts strictly at D-3, D-1 & 9:00 AM due date
              </span>
            </CardHeader>
            <CardContent>
              {criticalTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">
                  No critical hard deadlines pending. Add <code className="text-amber-300">!critical</code> to any task to pin it here.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {criticalTasks.map((task) => {
                    const assignee = memberById.get(task.assignedTo);
                    const creator = memberById.get(task.createdBy);
                    const isProxy = task.createdBy !== task.assignedTo;
                    return (
                      <div
                        key={task.id}
                        data-testid="critical-task-item"
                        className="flex items-start justify-between gap-3 p-3 rounded-lg border border-amber-500/30 bg-background/60"
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateTaskMutation.mutate({
                                id: task.id,
                                patch: { status: "completed" },
                              })
                            }
                            className="mt-0.5 text-amber-400 hover:text-emerald-400 transition-colors"
                            title="Complete critical deadline"
                          >
                            <Circle className="w-4 h-4" />
                          </button>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="destructive" className="text-[11px]">
                                ⚠️ {getDaysLeftLabel(task.dueDate)}
                              </Badge>
                              <span className="text-sm font-medium text-foreground">
                                {task.title}
                              </span>
                            </div>
                            {task.note && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <FileText className="w-3 h-3" /> {task.note}
                              </p>
                            )}
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              {assignee && (
                                <span>
                                  Owner: {assignee.avatar} {assignee.name}
                                </span>
                              )}
                              {isProxy && creator && (
                                <span className="text-primary">
                                  (Noted by {creator.name} 📝)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete task"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Module 2: Today & Tomorrow Action Board (Bento Grid) */}
        <section aria-label="Today and Tomorrow Action Board" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">
                Today & Tomorrow Action Board
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Press <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-secondary border">C</kbd> to quick capture
            </span>
          </div>

          <div
            className={`grid gap-4 ${
              visibleMembers.length > 1 ? "md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {visibleMembers.map((member) => {
              const memberTasks = tasks.filter((t) => t.assignedTo === member.id);
              const pendingTasks = memberTasks.filter((t) => t.status === "pending");
              const completedTasks = memberTasks.filter((t) => t.status === "completed");

              return (
                <Card key={member.id} className="flex flex-col">
                  <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{member.avatar}</span>
                      <div>
                        <CardTitle className="text-base">{member.name}&apos;s Focus</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {pendingTasks.length} active • {completedTasks.length} completed
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAssigneeId(member.id);
                        inputRef.current?.focus();
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      + Note for {member.name}
                    </Button>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-2.5 flex-1">
                    {pendingTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        All clear! Enjoy a peaceful, guilt-free evening 🌱
                      </div>
                    ) : (
                      pendingTasks.map((task) => {
                        const creator = memberById.get(task.createdBy);
                        const isProxy = task.createdBy !== task.assignedTo;

                        return (
                          <div
                            key={task.id}
                            data-testid="task-item"
                            className="group flex items-start justify-between gap-3 p-3 rounded-lg border border-border/60 bg-secondary/20 hover:bg-secondary/40 transition-colors"
                          >
                            <div className="flex items-start gap-2.5">
                              <button
                                type="button"
                                data-testid={`toggle-task-${task.id}`}
                                onClick={() =>
                                  updateTaskMutation.mutate({
                                    id: task.id,
                                    patch: { status: "completed" },
                                  })
                                }
                                className="mt-0.5 text-muted-foreground hover:text-primary transition-colors"
                                title="Mark completed"
                              >
                                <Circle className="w-4 h-4" />
                              </button>
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">
                                    {task.title}
                                  </span>
                                  {task.type === "critical" && (
                                    <Badge variant="destructive" className="text-[10px] py-0">
                                      Critical
                                    </Badge>
                                  )}
                                  {isProxy && creator && (
                                    <span
                                      data-testid="proxy-attribution"
                                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                                    >
                                      Noted by {creator.name} 📝
                                    </span>
                                  )}
                                </div>
                                {task.note && (
                                  <p className="text-xs text-muted-foreground">
                                    {task.note}
                                  </p>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                              title="Remove task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}

                    {completedTasks.length > 0 && (
                      <div className="pt-3 border-t border-border/40 space-y-1.5">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Completed
                        </p>
                        {completedTasks.slice(0, 4).map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between gap-2 py-1 px-2 rounded text-xs text-muted-foreground/70"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                updateTaskMutation.mutate({
                                  id: task.id,
                                  patch: { status: "pending" },
                                })
                              }
                              className="flex items-center gap-2 line-through hover:text-foreground transition-colors text-left"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>{task.title}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTaskMutation.mutate(task.id)}
                              className="hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      {/* Module 3: Zero-Overhead Quick Capture Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border/80 bg-card/95 backdrop-blur-lg">
        <form
          onSubmit={handleCaptureSubmit}
          className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2"
        >
          {/* One-Tap Assignee Toggle */}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={cycleAssignee}
            data-testid="assignee-toggle"
            className="shrink-0 gap-1.5 text-xs"
            title="Tap to toggle who this task is for (Self vs Partner proxy capture)"
          >
            <UserCheck className="w-3.5 h-3.5 text-primary" />
            <span>
              For: {targetAssignee?.avatar} {targetAssignee?.name}
            </span>
          </Button>

          {/* Critical toggle pill */}
          <Button
            type="button"
            variant={forceCritical ? "destructive" : "outline"}
            size="sm"
            onClick={() => setForceCritical((v) => !v)}
            className="shrink-0 text-xs"
            title="Toggle Critical Hard Deadline"
          >
            ⚠️ Critical
          </Button>

          <Input
            ref={inputRef}
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            data-testid="quick-capture-input"
            placeholder={
              activeActorId !== assigneeId
                ? `Proxy note for ${targetAssignee?.name}... (use // for context note, !critical for hard deadline)`
                : "Type a task and hit Enter... (e.g. 'Pick up parcel tomorrow // locker #12' or '!critical File taxes')"
            }
            className="flex-1 bg-background/90"
          />

          <Button
            type="submit"
            size="sm"
            data-testid="quick-capture-submit"
            disabled={!quickInput.trim() || createTaskMutation.isPending}
            className="shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Capture</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
