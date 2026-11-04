import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
  Lock,
} from "lucide-react";
import type {
  Task,
  Member,
  CreateTaskPayload,
  UpdateTaskPayload,
  SetupPayload,
  AuthStatusResponse,
} from "@todo-app/shared";
import { useFamilySocket, type AppStateData } from "@/hooks/useFamilySocket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TaskItemCard } from "@/components/TaskItemCard";
import { SetupWizard } from "@/components/SetupWizard";
import { PasscodeLockScreen } from "@/components/PasscodeLockScreen";
import { DeviceIdentityScreen } from "@/components/DeviceIdentityScreen";
import { parseQuickCapture, isTaskForTomorrow } from "@/lib/nlp";
import { triggerHaptic } from "@/lib/haptics";
import {
  getExistingPushSubscription,
  subscribeDeviceToPush,
  sendTestPushNotification,
} from "@/lib/push";

const ACTIVE_ACTOR_STORAGE_KEY = "noted_device_member_id";
const PASSCODE_STORAGE_KEY = "noted_passcode";

export default function App() {
  const queryClient = useQueryClient();

  const [storedPasscode, setStoredPasscode] = useState<string | null>(() => {
    return localStorage.getItem(PASSCODE_STORAGE_KEY);
  });
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState<boolean>(false);

  const [activeActorId, setActiveActorId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_ACTOR_STORAGE_KEY);
  });
  const [assigneeId, setAssigneeId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_ACTOR_STORAGE_KEY);
  });
  const [quickInput, setQuickInput] = useState("");
  const [forceCritical, setForceCritical] = useState(false);
  const [criticalDueDate, setCriticalDueDate] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberAvatar, setNewMemberAvatar] = useState("✨");
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [soloMode, setSoloMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("todo-theme");
    return saved ? saved === "dark" : true;
  });
  const [proxyPingBanner, setProxyPingBanner] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [isPushBusy, setIsPushBusy] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Build headers with x-passcode attached when available
  const getAuthHeaders = useCallback(
    (overridePasscode?: string | null): Record<string, string> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const code = overridePasscode !== undefined ? overridePasscode : storedPasscode;
      if (code) {
        headers["x-passcode"] = code;
      }
      return headers;
    },
    [storedPasscode]
  );

  // 1. Check public auth status first (/api/auth/status)
  const { data: authStatus, isLoading: isAuthStatusLoading } = useQuery<AuthStatusResponse>({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const res = await fetch("/api/auth/status");
      if (!res.ok) throw new Error("Failed to check auth status");
      return res.json();
    },
  });

  // Determine whether we can query /api/state
  const shouldFetchState = Boolean(
    authStatus &&
      authStatus.initialized &&
      (!authStatus.requiresPasscode || Boolean(storedPasscode)) &&
      !isLocked
  );

  // 2. Fetch workspace state with x-passcode header
  const {
    data,
    isLoading: isStateLoading,
    isError: isStateError,
  } = useQuery<AppStateData>({
    queryKey: ["state", storedPasscode],
    enabled: shouldFetchState,
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/state", {
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        setIsLocked(true);
        setUnlockError("Passcode required or invalid. Please unlock your household.");
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error("Failed to fetch workspace state");
      setIsLocked(false);
      return res.json();
    },
  });

  // If workspace requires passcode and none is stored in localStorage, lock immediately
  useEffect(() => {
    if (authStatus?.initialized && authStatus.requiresPasscode && !storedPasscode) {
      setIsLocked(true);
    }
  }, [authStatus, storedPasscode]);

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

  // Persist chosen member identity in localStorage ("activeActorId")
  const selectActiveActor = (memberId: string) => {
    setActiveActorId(memberId);
    setAssigneeId(memberId);
    localStorage.setItem(ACTIVE_ACTOR_STORAGE_KEY, memberId);
    // If this device already has an active Web Push subscription, re-bind it to the selected member
    getExistingPushSubscription().then((sub) => {
      if (sub) {
        subscribeDeviceToPush(memberId, getAuthHeaders()).then((res) => {
          if (res.ok) setPushEnabled(true);
        });
      }
    });
  };

  // Check if this browser already has an active Web Push subscription on load
  useEffect(() => {
    if (!activeActorId || isLocked) return;
    getExistingPushSubscription().then((sub) => {
      if (sub) {
        setPushEnabled(true);
        // Keep server subscription mapped to this device's active member
        subscribeDeviceToPush(activeActorId, getAuthHeaders());
      } else {
        setPushEnabled(false);
      }
    });
  }, [activeActorId, isLocked, getAuthHeaders]);

  const handlePushButtonClick = async () => {
    if (!activeActorId || isPushBusy) return;
    setIsPushBusy(true);
    triggerHaptic(12);
    try {
      if (!pushEnabled) {
        const result = await subscribeDeviceToPush(activeActorId, getAuthHeaders());
        if (result.ok) {
          setPushEnabled(true);
          await sendTestPushNotification(activeActorId, getAuthHeaders());
          setProxyPingBanner("🔔 Phone push alerts enabled! Sent a test notification.");
        } else {
          setProxyPingBanner(`⚠️ ${result.error}`);
        }
      } else {
        const sent = await sendTestPushNotification(activeActorId, getAuthHeaders());
        setProxyPingBanner(
          sent
            ? "🔔 Sent a test push notification to your device!"
            : "⚠️ Could not send test push. Try re-enabling alerts."
        );
      }
      window.setTimeout(() => {
        setProxyPingBanner(null);
      }, 5000);
    } finally {
      setIsPushBusy(false);
    }
  };

  // Validate stored activeActorId once members load (only auto-select if sole member)
  useEffect(() => {
    if (!data?.members?.length) return;
    const storedId = localStorage.getItem(ACTIVE_ACTOR_STORAGE_KEY);
    const isValidStored = Boolean(storedId && data.members.some((m) => m.id === storedId));

    if (isValidStored && storedId) {
      if (activeActorId !== storedId) {
        setActiveActorId(storedId);
      }
      if (!assigneeId || !data.members.some((m) => m.id === assigneeId)) {
        setAssigneeId(storedId);
      }
    } else if (data.members.length === 1) {
      // Solo workspace: only 1 member exists, select automatically
      const soloId = data.members[0].id;
      setActiveActorId(soloId);
      setAssigneeId(soloId);
      localStorage.setItem(ACTIVE_ACTOR_STORAGE_KEY, soloId);
    } else {
      // Multi-member workspace on a new device: clear invalid/missing ID so DeviceIdentityScreen prompts the user
      if (activeActorId !== null) {
        setActiveActorId(null);
      }
      if (storedId) {
        localStorage.removeItem(ACTIVE_ACTOR_STORAGE_KEY);
      }
    }
  }, [data?.members, activeActorId, assigneeId]);

  // WebSocket real-time sync (enabled only when unlocked and initialized)
  const { status: wsStatus } = useFamilySocket({
    enabled: Boolean(data?.space && !isLocked),
    passcode: storedPasscode,
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

  // Handle Unlock Household PIN submission
  const handleUnlockSubmit = async (enteredPin: string) => {
    setIsVerifyingPin(true);
    setUnlockError(null);
    try {
      const res = await fetch("/api/state", {
        headers: getAuthHeaders(enteredPin),
      });
      if (res.status === 401) {
        triggerHaptic([30, 50, 30]);
        setUnlockError("Incorrect passcode. Please try again.");
        setIsVerifyingPin(false);
        return;
      }
      if (!res.ok) {
        throw new Error("Unable to verify passcode");
      }
      const stateResult = (await res.json()) as AppStateData;
      localStorage.setItem(PASSCODE_STORAGE_KEY, enteredPin);
      setStoredPasscode(enteredPin);
      setIsLocked(false);
      setUnlockError(null);
      queryClient.setQueryData<AppStateData>(["state", enteredPin], stateResult);
      triggerHaptic([15, 25, 15]);
    } catch {
      setUnlockError("Could not reach server to verify passcode.");
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const setupMutation = useMutation({
    mutationFn: async ({
      payload,
      selectedMemberIndex,
    }: {
      payload: SetupPayload;
      selectedMemberIndex: number;
    }) => {
      setSetupError(null);
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: getAuthHeaders(payload.passcode || null),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to initialize workspace");
      }
      const result = (await res.json()) as AppStateData;
      return { result, selectedMemberIndex, passcode: payload.passcode?.trim() || null };
    },
    onSuccess: ({ result, selectedMemberIndex, passcode }) => {
      if (passcode) {
        localStorage.setItem(PASSCODE_STORAGE_KEY, passcode);
        setStoredPasscode(passcode);
      }
      setIsLocked(false);
      const chosenMember =
        result.members[selectedMemberIndex] || result.members[0];
      if (chosenMember) {
        selectActiveActor(chosenMember.id);
      }
      queryClient.setQueryData<AuthStatusResponse>(["authStatus"], {
        initialized: true,
        requiresPasscode: Boolean(result.space?.requiresPasscode),
        spaceName: result.space?.name ?? null,
      });
      queryClient.setQueryData<AppStateData>(["state", passcode], result);
    },
    onError: (err: Error) => {
      setSetupError(err.message);
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setIsLocked(true);
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Could not add task. Please try again.");
      }
      return res.json() as Promise<Task>;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<AppStateData>(["state", storedPasscode], (prev) => {
        if (!prev) return prev;
        if (prev.tasks.some((t) => t.id === created.id)) return prev;
        return { ...prev, tasks: [created, ...prev.tasks] };
      });
    },
  });

  const createMemberMutation = useMutation({
    mutationFn: async (payload: { spaceId: string; name: string; avatar: string }) => {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setIsLocked(true);
        throw new Error("Unauthorized");
      }
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Could not add member. Please try again.");
      }
      return res.json() as Promise<Member>;
    },
    onSuccess: (created) => {
      queryClient.setQueryData<AppStateData>(["state", storedPasscode], (prev) => {
        if (!prev || prev.members.some((member) => member.id === created.id)) return prev;
        return { ...prev, members: [...prev.members, created] };
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateTaskPayload }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        setIsLocked(true);
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error("Failed to update task");
      return res.json() as Promise<Task>;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["state"] });
      queryClient.setQueryData<AppStateData>(["state", storedPasscode], (prev) => {
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
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        setIsLocked(true);
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error("Failed to delete task");
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["state"] });
      queryClient.setQueryData<AppStateData>(["state", storedPasscode], (prev) => {
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

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || !activeActorId || !assigneeId || !data?.space || createTaskMutation.isPending) return;

    const parsed = parseQuickCapture(quickInput);
    const finalType = forceCritical ? "critical" : parsed.type;
    const finalDueDate = finalType === "critical" && criticalDueDate
      ? new Date(`${criticalDueDate}T09:00:00`).toISOString()
      : parsed.dueDate;

    if (finalType === "critical" && !finalDueDate) {
      setCaptureError("Choose a date for this critical deadline.");
      return;
    }

    setCaptureError(null);
    try {
      await createTaskMutation.mutateAsync({
        spaceId: data.space.id,
        title: parsed.title,
        note: parsed.note,
        type: finalType,
        dueDate: finalDueDate,
        assignedTo: assigneeId,
        createdBy: activeActorId,
      });
      triggerHaptic(12);
      setQuickInput("");
      setForceCritical(false);
      setCriticalDueDate("");
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : "Could not add task. Please try again.");
    }
  };

  if (isAuthStatusLoading || (shouldFetchState && isStateLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 animate-spin text-primary" />
          Loading Household Hub...
        </div>
      </div>
    );
  }

  // 1. If workspace is NOT initialized yet, show First-Run Setup Wizard
  if (authStatus && !authStatus.initialized) {
    return (
      <SetupWizard
        isSubmitting={setupMutation.isPending}
        error={setupError}
        onSubmit={(payload, selectedMemberIndex) =>
          setupMutation.mutate({ payload, selectedMemberIndex })
        }
      />
    );
  }

  // 2. If workspace IS initialized and requires a passcode (missing or rejected), show Unlock Household screen
  if (
    isLocked ||
    (authStatus?.initialized && authStatus.requiresPasscode && !storedPasscode)
  ) {
    return (
      <PasscodeLockScreen
        spaceName={authStatus?.spaceName}
        error={unlockError}
        isVerifying={isVerifyingPin}
        onUnlock={handleUnlockSubmit}
      />
    );
  }

  if (isStateError || !data || !data.space) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-destructive">
        Unable to load workspace state. Please verify the server is running.
      </div>
    );
  }

  const { space, members, tasks } = data;
  const memberById = new Map<string, Member>(members.map((m) => [m.id, m]));

  // 3. If this device hasn't selected its member identity yet (and there are 2+ members), show "Who is using this device?" screen
  const validActiveActor = activeActorId ? memberById.get(activeActorId) : undefined;
  if (!validActiveActor && members.length > 1) {
    return (
      <DeviceIdentityScreen
        spaceName={space.name}
        members={members}
        onSelectMember={(memberId) => selectActiveActor(memberId)}
      />
    );
  }

  const activeActor = validActiveActor ?? members[0];
  const targetAssignee = (assigneeId ? memberById.get(assigneeId) : undefined) ?? activeActor;

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

  const handleAddMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newMemberName.trim();
    if (!name || createMemberMutation.isPending) return;
    if (members.some((member) => member.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setAddMemberError("That name is already on the board.");
      return;
    }
    setAddMemberError(null);
    try {
      await createMemberMutation.mutateAsync({ spaceId: space.id, name, avatar: newMemberAvatar });
      setNewMemberName("");
      setNewMemberAvatar("✨");
      setShowAddMember(false);
      setSoloMode(false);
      triggerHaptic(12);
    } catch (error) {
      setAddMemberError(error instanceof Error ? error.message : "Could not add member. Please try again.");
    }
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
            <label
              data-testid="actor-switcher"
              title="Profiles identify this device for convenience; they are not separate sign-ins"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              Using as
              <select
                value={activeActor?.id || ""}
                onChange={(event) => {
                  triggerHaptic(10);
                  selectActiveActor(event.target.value);
                }}
                data-testid="device-profile-select"
                className="h-8 max-w-40 rounded-md border border-border bg-secondary px-2 text-xs font-medium text-foreground"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.avatar} {member.name}</option>
                ))}
              </select>
            </label>

            {members.length > 1 && <Button
              variant="outline"
              size="sm"
              data-testid="view-mode-toggle"
              onClick={() => setSoloMode((v) => !v)}
              className="text-xs h-8"
            >
              {soloMode ? "👤 My tasks" : `👥 Everyone (${members.length})`}
            </Button>}

            {/* Phone Web Push Notification Toggle / Test Button */}
            <Button
              variant={pushEnabled ? "secondary" : "outline"}
              size="sm"
              data-testid="push-alerts-button"
              disabled={isPushBusy}
              onClick={handlePushButtonClick}
              className={`text-xs h-8 gap-1.5 ${
                pushEnabled
                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : ""
              }`}
              title={
                pushEnabled
                  ? "Push alerts are active for this device. Tap to send a test notification."
                  : "Enable background phone push notifications for tasks from others and critical deadlines"
              }
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{pushEnabled ? "Alerts On" : "Enable Alerts"}</span>
            </Button>

            {/* Lock button if passcode protection is enabled */}
            {space.requiresPasscode && (
              <Button
                variant="ghost"
                size="icon"
                data-testid="lock-button"
                onClick={() => {
                  localStorage.removeItem(PASSCODE_STORAGE_KEY);
                  localStorage.removeItem(ACTIVE_ACTOR_STORAGE_KEY);
                  setStoredPasscode(null);
                  setActiveActorId(null);
                  setIsLocked(true);
                }}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Lock Household on this device"
              >
                <Lock className="w-4 h-4" />
              </Button>
            )}

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

        {/* Member focus board */}
        <section aria-label="Today and Tomorrow Action Board" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">☀️ Everyone's tasks</h2>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddMember((current) => !current)} className="h-8 text-xs">
              {showAddMember ? "Cancel" : "+ Add member"}
            </Button>
          </div>

          {showAddMember && (
            <form onSubmit={handleAddMember} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
              <select
                aria-label="New member avatar"
                value={newMemberAvatar}
                onChange={(event) => setNewMemberAvatar(event.target.value)}
                className="h-10 rounded-md border border-border bg-background px-2 text-lg"
              >
                {["✨", "🌸", "⭐", "🌿", "🦊", "🐱", "🎨", "🚀"].map((avatar) => <option key={avatar} value={avatar}>{avatar}</option>)}
              </select>
              <Input
                aria-label="New member name"
                value={newMemberName}
                onChange={(event) => {
                  setNewMemberName(event.target.value);
                  setAddMemberError(null);
                }}
                placeholder="Name of family member or friend"
                className="h-10 min-w-48 flex-1"
                autoFocus
              />
              <Button type="submit" size="sm" disabled={!newMemberName.trim() || createMemberMutation.isPending} className="h-10">
                {createMemberMutation.isPending ? "Adding..." : "Add to board"}
              </Button>
              {addMemberError && <p role="alert" className="w-full text-xs text-destructive">{addMemberError}</p>}
            </form>
          )}

          <div
            data-testid="action-board-grid"
            className={`grid gap-4 ${
              visibleMembers.length > 2
                ? "md:grid-cols-2 xl:grid-cols-3"
                : visibleMembers.length > 1 ? "md:grid-cols-2" : "grid-cols-1"
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
                      {isSelf ? "+ Add to My Focus" : `+ Task for ${member.name}`}
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
                  📝 For {targetAssignee.name} (from this device's {activeActor.name} profile)
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

          <form id="quick-capture-form" onSubmit={handleCaptureSubmit} className="flex items-center gap-2">
            <label
              data-testid="assignee-toggle"
              className="flex shrink-0 items-center gap-1.5 text-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span className="sr-only">Task for</span>
              <select
                value={assigneeId || activeActor?.id || ""}
                onChange={(event) => {
                  triggerHaptic(10);
                  setAssigneeId(event.target.value);
                }}
                className="h-10 max-w-32 rounded-md border border-border bg-secondary px-2 font-medium text-foreground"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>{member.avatar} {member.name}</option>
                ))}
              </select>
            </label>

            {/* Critical toggle pill */}
            <Button
              type="button"
              variant={forceCritical ? "destructive" : "outline"}
              size="sm"
              data-testid="critical-toggle"
              onClick={() => {
                triggerHaptic(10);
                setForceCritical((v) => !v);
                setCriticalDueDate("");
                setCaptureError(null);
              }}
              className="shrink-0 text-xs h-10"
              title="Toggle Critical Hard Deadline"
            >
              ⚠️ Critical
            </Button>

            <Input
              ref={inputRef}
              value={quickInput}
              onChange={(e) => {
                setQuickInput(e.target.value);
                setCaptureError(null);
              }}
              data-testid="quick-capture-input"
              disabled={createTaskMutation.isPending}
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
          {(forceCritical || liveNlpPreview?.type === "critical") && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Deadline date
              <Input
                type="date"
                form="quick-capture-form"
                value={criticalDueDate}
                onChange={(e) => {
                  setCriticalDueDate(e.target.value);
                  setCaptureError(null);
                }}
                disabled={createTaskMutation.isPending}
                data-testid="critical-due-date-input"
                className="w-40 h-8 bg-background"
              />
              {liveNlpPreview?.dueDate && !criticalDueDate && "Using the date found in your task"}
            </label>
          )}
          {captureError && <p role="alert" className="text-xs text-destructive">{captureError}</p>}
        </div>
      </div>
    </div>
  );
}
