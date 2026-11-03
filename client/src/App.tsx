import React, { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Send,
  Sparkles,
  UserCheck,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  BellRing,
  CalendarClock,
  Sunrise,
} from "lucide-react";
import type { Task, Member, CreateTaskPayload, UpdateTaskPayload } from "@todo-app/shared";
import { useFamilySocket, type AppStateData } from "@/hooks/useFamilySocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TaskItemCard } from "@/components/TaskItemCard";
import { parseQuickCapture, isTaskForTomorrow } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";

export default function App() {
  const queryClient = useQueryClient();

  const [activeActorId, setActiveActorId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState("");
  const [forceCritical, setForceCritical] = useState(false);
  const [soloMode, setSoloMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("todo-theme");
    return saved ? saved === "dark" : true;
  });
  const [proxyPingBanner, setProxyPingBanner] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery<AppStateData>({
    queryKey: ["state"],
    queryFn: async () => {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("Failed to fetch workspace state");
      return res.json();
    },
  });

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
      localStorage.setItem("todo-theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("todo-theme", "light");
    }
  }, [isDarkMode]);

  // WebSocket real-time sync + subtle proxy task notification banner (PRD Section 4)
  const { status: wsStatus } = useFamilySocket({
    onTaskCreated: (created) => {
      if (
        activeActorId &&
        created.assignedTo === activeActorId &&
        created.createdBy !== activeActorId
      ) {
        const creatorName =
          data?.members.find((m) => m.id === created.createdBy)?.name || "Partner";
        setProxyPingBanner(`📝 ${creatorName} noted for you: ${created.title}`);
        triggerHaptic(15);
        window.setTimeout(() => {
          setProxyPingBanner((current) =>
            current?.includes(created.title) ? null : current
          );
        }, 5000);
      }
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

  // Live NLP preview for the bottom quick input bar
  const liveNlpPreview = useMemo(() => {
    if (!quickInput.trim()) return null;
    return parseQuickCapture(quickInput);
  }, [quickInput]);

  const handleCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || !activeActorId || !assigneeId || !data?.space) return;

    const parsed = parseQuickCapture(quickInput);
    const finalType = forceCritical ? "critical" : parsed.type;
    const finalDueDate =
      finalType === "critical" && !parsed.dueDate
        ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        : parsed.dueDate;

    triggerHaptic(12);

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

  // Sort critical tasks by earliest cutoff date first
  const criticalTasks = tasks
    .filter((t) => t.type === "critical" && t.status === "pending")
    .sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  // Order columns so the active member ("My Focus") appears first, followed by Partner(s)
  const orderedMembers = [...members].sort((a, b) => {
    if (a.id === activeActor?.id) return -1;
    if (b.id === activeActor?.id) return 1;
    return 0;
  });
  const visibleMembers = soloMode && activeActor ? [activeActor] : orderedMembers;

  const cycleAssignee = () => {
    if (!members.length) return;
    triggerHaptic(10);
    const idx = members.findIndex((m) => m.id === assigneeId);
    const next = members[(idx + 1) % members.length];
    setAssigneeId(next.id);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      {/* Header Bar */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-bold">
              ✓
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight flex items-center gap-2">
                {space.name}
                <Badge variant="secondary" className="text-[11px] font-normal">
                  🌱 Guilt-Free Rollover
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Zero-overhead household & personal task hub
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Active user selector ("Viewing as") */}
            <div
              data-testid="actor-switcher"
              className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border/60"
            >
              <span className="text-[11px] text-muted-foreground px-2">Identity:</span>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`switch-actor-${m.name.toLowerCase()}`}
                  onClick={() => {
                    triggerHaptic(10);
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

            {/* Solo / Dual Action Board toggle */}
            <Button
              variant="outline"
              size="sm"
              data-testid="view-mode-toggle"
              onClick={() => setSoloMode((v) => !v)}
              className="text-xs h-8"
            >
              {soloMode ? "👤 My Focus Only" : "👥 Dual Action Board"}
            </Button>

            {/* Dark / Light Mode toggle */}
            <Button
              variant="ghost"
              size="icon"
              data-testid="theme-toggle"
              onClick={() => setIsDarkMode((v) => !v)}
              className="h-8 w-8"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
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

        {/* Real-time Proxy Task Capture Toast Banner (PRD Section 4) */}
        {proxyPingBanner && (
          <div
            data-testid="proxy-ping-banner"
            className="bg-primary/15 border-t border-primary/30 px-4 py-2 text-xs text-primary flex items-center justify-center gap-2"
          >
            <BellRing className="w-3.5 h-3.5 animate-bounce" />
            <span className="font-medium">{proxyPingBanner}</span>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* Module 1: Critical Hard Deadlines (The Gatekeeper) */}
        <section aria-label="Critical Hard Deadlines" data-testid="critical-gatekeeper">
          <Card className="border-amber-500/35 bg-gradient-to-r from-amber-500/10 via-card to-card shadow-sm">
            <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <CardTitle className="text-sm font-semibold text-amber-300">
                  🚨 Critical Hard Deadlines (The Gatekeeper)
                </CardTitle>
                <Badge variant="outline" className="text-[11px] border-amber-500/40 text-amber-300">
                  {criticalTasks.length} Pinned
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Strict alerts only at D-3, D-1 & 9:00 AM on due date
              </span>
            </CardHeader>
            <CardContent>
              {criticalTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">
                  No critical hard deadlines pending. Type{" "}
                  <code className="text-amber-300 px-1 py-0.5 rounded bg-amber-500/10">
                    !critical
                  </code>{" "}
                  in quick capture to pin non-negotiable obligations here.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {criticalTasks.map((task) => (
                    <TaskItemCard
                      key={task.id}
                      task={task}
                      assignee={memberById.get(task.assignedTo)}
                      creator={memberById.get(task.createdBy)}
                      showOwner={true}
                      isCriticalCard={true}
                      onUpdate={(id, patch) => updateTaskMutation.mutate({ id, patch })}
                      onDelete={(id) => deleteTaskMutation.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Module 2: Dual Action Board (My Focus vs. Partner Focus) */}
        <section aria-label="Today and Tomorrow Action Board" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">
                ☀️ Today & Tomorrow Action Board
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              Press{" "}
              <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-secondary border">C</kbd> to
              quick capture • Click any task to attach a{" "}
              <span className="text-foreground font-medium">Context Note</span>
            </span>
          </div>

          <div
            data-testid="action-board-grid"
            className={`grid gap-4 ${
              visibleMembers.length > 1 ? "md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {visibleMembers.map((member) => {
              const isSelf = member.id === activeActor?.id;
              const memberTasks = tasks.filter(
                (t) => t.assignedTo === member.id && t.type !== "critical"
              );
              const pendingTasks = memberTasks.filter((t) => t.status === "pending");
              const todayTasks = pendingTasks.filter((t) => !isTaskForTomorrow(t.dueDate));
              const tomorrowTasks = pendingTasks.filter((t) => isTaskForTomorrow(t.dueDate));
              const completedTasks = memberTasks.filter((t) => t.status === "completed");

              return (
                <Card
                  key={member.id}
                  data-testid={`member-column-${member.name.toLowerCase()}`}
                  className={`flex flex-col ${
                    isSelf ? "border-primary/30 shadow-sm" : "border-border/70"
                  }`}
                >
                  <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{member.avatar}</span>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {isSelf ? `My Focus (${member.name})` : `${member.name}'s Focus`}
                          {isSelf && (
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              You
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {todayTasks.length} today • {tomorrowTasks.length} tomorrow •{" "}
                          {completedTasks.length} done
                        </p>
                      </div>
                    </div>

                    <Button
                      variant={assigneeId === member.id ? "default" : "outline"}
                      size="sm"
                      data-testid={`proxy-select-${member.name.toLowerCase()}`}
                      onClick={() => {
                        triggerHaptic(10);
                        setAssigneeId(member.id);
                        inputRef.current?.focus();
                      }}
                      className="text-xs h-8"
                    >
                      {isSelf ? "+ Add to My Focus" : `📝 Proxy Note for ${member.name}`}
                    </Button>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4 flex-1">
                    {pendingTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground">
                        All clear! Incomplete tasks quietly roll over with zero shame 🌱
                      </div>
                    ) : (
                      <>
                        {/* Today Focus Stream */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <CalendarClock className="w-3.5 h-3.5 text-primary" />
                            <span>Today ({todayTasks.length})</span>
                          </div>
                          {todayTasks.length === 0 ? (
                            <p className="text-xs text-muted-foreground/70 pl-1">
                              Nothing urgent remaining for today.
                            </p>
                          ) : (
                            todayTasks.map((task) => (
                              <TaskItemCard
                                key={task.id}
                                task={task}
                                creator={memberById.get(task.createdBy)}
                                assignee={member}
                                onUpdate={(id, patch) =>
                                  updateTaskMutation.mutate({ id, patch })
                                }
                                onDelete={(id) => deleteTaskMutation.mutate(id)}
                              />
                            ))
                          )}
                        </div>

                        {/* Tomorrow Focus Stream */}
                        {tomorrowTasks.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-border/40">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                              <Sunrise className="w-3.5 h-3.5" />
                              <span>Tomorrow & Upcoming ({tomorrowTasks.length})</span>
                            </div>
                            {tomorrowTasks.map((task) => (
                              <TaskItemCard
                                key={task.id}
                                task={task}
                                creator={memberById.get(task.createdBy)}
                                assignee={member}
                                onUpdate={(id, patch) =>
                                  updateTaskMutation.mutate({ id, patch })
                                }
                                onDelete={(id) => deleteTaskMutation.mutate(id)}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Completed Stream */}
                    {completedTasks.length > 0 && (
                      <div className="pt-3 border-t border-border/40 space-y-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                          Completed Silently ({completedTasks.length})
                        </p>
                        <div className="space-y-1.5">
                          {completedTasks.slice(0, 5).map((task) => (
                            <TaskItemCard
                              key={task.id}
                              task={task}
                              creator={memberById.get(task.createdBy)}
                              assignee={member}
                              onUpdate={(id, patch) =>
                                updateTaskMutation.mutate({ id, patch })
                              }
                              onDelete={(id) => deleteTaskMutation.mutate(id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>

      {/* Module 3: Bottom Single-Line Chat-Like Quick Capture Bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border/80 bg-card/95 backdrop-blur-lg shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-2.5 space-y-1.5">
          {/* Live NLP & Proxy Detection Pills */}
          {(liveNlpPreview?.detectedKeywords.length || activeActorId !== assigneeId || forceCritical) ? (
            <div
              data-testid="nlp-detection-bar"
              className="flex flex-wrap items-center gap-1.5 text-[11px]"
            >
              <span className="text-muted-foreground">Smart Capture:</span>
              {activeActorId !== assigneeId && targetAssignee && activeActor && (
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium">
                  📝 Proxy for {targetAssignee.name} (Noted by {activeActor.name})
                </span>
              )}
              {forceCritical && !liveNlpPreview?.detectedKeywords.includes("🚨 Critical Deadline") && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  🚨 Critical Deadline
                </span>
              )}
              {liveNlpPreview?.detectedKeywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border"
                >
                  {kw}
                </span>
              ))}
            </div>
          ) : null}

          <form onSubmit={handleCaptureSubmit} className="flex items-center gap-2">
            {/* One-Tap Self vs Partner Assignee Toggle */}
            <Button
              type="button"
              variant={activeActorId !== assigneeId ? "default" : "secondary"}
              size="sm"
              onClick={cycleAssignee}
              data-testid="assignee-toggle"
              className="shrink-0 gap-1.5 text-xs h-10"
              title="One-tap toggle: assign to yourself or proxy-note for partner"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>
                {activeActorId === assigneeId
                  ? `Self (${targetAssignee?.avatar} ${targetAssignee?.name})`
                  : `Proxy → ${targetAssignee?.avatar} ${targetAssignee?.name}`}
              </span>
            </Button>

            {/* Critical toggle pill */}
            <Button
              type="button"
              variant={forceCritical ? "destructive" : "outline"}
              size="sm"
              data-testid="critical-toggle"
              onClick={() => {
                triggerHaptic(10);
                setForceCritical((v) => !v);
              }}
              className="shrink-0 text-xs h-10"
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
                  ? `Noting for ${targetAssignee?.name}... (e.g. 'Pick up prescription tomorrow // 500mg')`
                  : "Type a task & hit Enter... ('Order takeout tonight', 'Pick up parcel tomorrow', '!critical File taxes')"
              }
              className="flex-1 h-10 bg-background/90"
            />

            <Button
              type="submit"
              size="sm"
              data-testid="quick-capture-submit"
              disabled={!quickInput.trim() || createTaskMutation.isPending}
              className="shrink-0 h-10 px-4"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
