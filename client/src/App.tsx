import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthStatusResponse, CreateMessagePayload, CreateTaskPayload, Member, Message, SetupPayload, Task, UpdateTaskPayload } from "@todo-app/shared";
import { useFamilySocket, type AppStateData } from "@/hooks/useFamilySocket";
import { SetupWizard } from "@/components/SetupWizard";
import { PasscodeLockScreen } from "@/components/PasscodeLockScreen";
import { DeviceIdentityScreen } from "@/components/DeviceIdentityScreen";
import { Workspace } from "@/Workspace";
import { getExistingPushSubscription, sendTestPushNotification, subscribeDeviceToPush } from "@/lib/push";
import { triggerHaptic } from "@/lib/haptics";

const MEMBER_KEY = "noted_device_member_id";
const PASSCODE_KEY = "noted_passcode";

export default function App() {
  const queryClient = useQueryClient();
  const [storedPasscode, setStoredPasscode] = useState<string | null>(() => localStorage.getItem(PASSCODE_KEY));
  const [isLocked, setIsLocked] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [activeActorId, setActiveActorId] = useState<string | null>(() => localStorage.getItem(MEMBER_KEY));
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("todo-theme") !== "light");
  const [banner, setBanner] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isPushBusy, setIsPushBusy] = useState(false);
  const stateKey = ["state", storedPasscode] as const;

  const getAuthHeaders = useCallback((override?: string | null): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const code = override === undefined ? storedPasscode : override;
    if (code) headers["x-passcode"] = code;
    return headers;
  }, [storedPasscode]);

  const { data: authStatus, isLoading: authLoading } = useQuery<AuthStatusResponse>({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const response = await fetch("/api/auth/status");
      if (!response.ok) throw new Error("Could not check workspace status");
      return response.json();
    },
  });

  const canFetchState = Boolean(authStatus?.initialized && (!authStatus.requiresPasscode || storedPasscode) && !isLocked);
  const { data, isLoading: stateLoading, isError: stateError } = useQuery<AppStateData>({
    queryKey: stateKey,
    enabled: canFetchState,
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/state", { headers: getAuthHeaders() });
      if (response.status === 401) {
        setIsLocked(true);
        setUnlockError("Enter the household passcode to continue.");
        throw new Error("Unauthorized");
      }
      if (!response.ok) throw new Error("Could not load workspace");
      return response.json();
    },
  });

  useEffect(() => {
    if (authStatus?.initialized && authStatus.requiresPasscode && !storedPasscode) setIsLocked(true);
  }, [authStatus, storedPasscode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("todo-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  const selectActiveActor = (memberId: string) => {
    setActiveActorId(memberId);
    localStorage.setItem(MEMBER_KEY, memberId);
  };

  useEffect(() => {
    if (!data?.members.length) return;
    const stored = localStorage.getItem(MEMBER_KEY);
    const valid = stored && data.members.some((member) => member.id === stored);
    if (valid && stored) {
      if (activeActorId !== stored) setActiveActorId(stored);
    } else if (data.members.length === 1) {
      selectActiveActor(data.members[0].id);
    } else {
      localStorage.removeItem(MEMBER_KEY);
      if (activeActorId !== null) setActiveActorId(null);
    }
  }, [data?.members, activeActorId]);

  useEffect(() => {
    if (!activeActorId || isLocked) return;
    getExistingPushSubscription().then((subscription) => {
      if (!subscription) { setPushEnabled(false); return; }
      subscribeDeviceToPush(activeActorId, getAuthHeaders()).then((result) => setPushEnabled(result.ok));
    });
  }, [activeActorId, isLocked, getAuthHeaders]);

  const { status: connection } = useFamilySocket({
    enabled: Boolean(data?.space && !isLocked),
    passcode: storedPasscode,
    onTaskCreated: (task) => {
      if (activeActorId && task.assignedTo === activeActorId && task.createdBy !== activeActorId) {
        const creator = data?.members.find((member) => member.id === task.createdBy)?.name || "Someone";
        setBanner(`✦ ${creator} added a task for you: ${task.title}`);
        triggerHaptic(15);
        window.setTimeout(() => setBanner(null), 5000);
      }
    },
    onMessageCreated: (message) => {
      if (activeActorId && message.recipientId === activeActorId) {
        const sender = data?.members.find((member) => member.id === message.senderId)?.name || "Someone";
        setBanner(`💬 New message from ${sender}`);
        window.setTimeout(() => setBanner(null), 5000);
      }
    },
  });

  const setupMutation = useMutation({
    mutationFn: async ({ payload, selectedMemberIndex }: { payload: SetupPayload; selectedMemberIndex: number }) => {
      const response = await fetch("/api/setup", { method: "POST", headers: getAuthHeaders(payload.passcode || null), body: JSON.stringify(payload) });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Could not create the space");
      }
      return { result: await response.json() as AppStateData, selectedMemberIndex, passcode: payload.passcode?.trim() || null };
    },
    onSuccess: ({ result, selectedMemberIndex, passcode }) => {
      if (passcode) { localStorage.setItem(PASSCODE_KEY, passcode); setStoredPasscode(passcode); }
      setIsLocked(false);
      const selected = result.members[selectedMemberIndex] || result.members[0];
      if (selected) selectActiveActor(selected.id);
      queryClient.setQueryData<AuthStatusResponse>(["authStatus"], { initialized: true, requiresPasscode: Boolean(result.space?.requiresPasscode), spaceName: result.space?.name || null });
      queryClient.setQueryData<AppStateData>(["state", passcode], result);
    },
    onError: (error: Error) => setSetupError(error.message),
  });

  const createTask = useMutation({
    mutationFn: async (payload: CreateTaskPayload) => {
      const response = await fetch("/api/tasks", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (response.status === 401) setIsLocked(true);
      if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error || "Could not add task"); }
      return response.json() as Promise<Task>;
    },
    onSuccess: (created) => queryClient.setQueryData<AppStateData>(stateKey, (previous) => previous && !previous.tasks.some((task) => task.id === created.id) ? { ...previous, tasks: [created, ...previous.tasks] } : previous),
  });

  const createMessage = useMutation({
    mutationFn: async (payload: CreateMessagePayload) => {
      const response = await fetch("/api/messages", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
      if (response.status === 401) setIsLocked(true);
      if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error || "Could not send message"); }
      return response.json() as Promise<Message>;
    },
    onSuccess: (created) => queryClient.setQueryData<AppStateData>(stateKey, (previous) => previous && !(previous.messages || []).some((message) => message.id === created.id) ? { ...previous, messages: [...(previous.messages || []), created] } : previous),
  });

  const createMember = useMutation({
    mutationFn: async ({ name, avatar, spaceId }: { name: string; avatar: string; spaceId: string }) => {
      const response = await fetch("/api/members", { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ name, avatar, spaceId }) });
      if (response.status === 401) setIsLocked(true);
      if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.error || "Could not add person"); }
      return response.json() as Promise<Member>;
    },
    onSuccess: (created) => queryClient.setQueryData<AppStateData>(stateKey, (previous) => previous && !previous.members.some((member) => member.id === created.id) ? { ...previous, members: [...previous.members, created] } : previous),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateTaskPayload }) => {
      const response = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify(patch) });
      if (!response.ok) throw new Error("Could not update task");
      return response.json() as Promise<Task>;
    },
    onMutate: ({ id, patch }) => queryClient.setQueryData<AppStateData>(stateKey, (previous) => previous ? { ...previous, tasks: previous.tasks.map((task) => task.id === id ? { ...task, ...patch } : task) } : previous),
    onSuccess: (updated) => queryClient.setQueryData<AppStateData>(stateKey, (previous) => previous ? { ...previous, tasks: previous.tasks.map((task) => task.id === updated.id ? updated : task) } : previous),
    onError: () => queryClient.invalidateQueries({ queryKey: stateKey }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!response.ok) throw new Error("Could not remove task");
      return id;
    },
    onMutate: (id) => queryClient.setQueryData<AppStateData>(stateKey, (previous) => previous ? { ...previous, tasks: previous.tasks.filter((task) => task.id !== id) } : previous),
    onError: () => queryClient.invalidateQueries({ queryKey: stateKey }),
  });

  async function unlock(enteredPin: string) {
    setIsVerifyingPin(true);
    setUnlockError(null);
    try {
      const response = await fetch("/api/state", { headers: getAuthHeaders(enteredPin) });
      if (response.status === 401) { setUnlockError("Incorrect passcode. Please try again."); return; }
      if (!response.ok) throw new Error("Could not verify passcode");
      const state = await response.json() as AppStateData;
      localStorage.setItem(PASSCODE_KEY, enteredPin);
      setStoredPasscode(enteredPin);
      setIsLocked(false);
      queryClient.setQueryData<AppStateData>(["state", enteredPin], state);
      triggerHaptic([15, 25, 15]);
    } catch { setUnlockError("Could not reach the server."); }
    finally { setIsVerifyingPin(false); }
  }

  async function toggleAlerts() {
    if (!activeActorId || isPushBusy) return;
    setIsPushBusy(true);
    try {
      const subscription = await subscribeDeviceToPush(activeActorId, getAuthHeaders());
      setPushEnabled(subscription.ok);
      if (!subscription.ok) { setBanner(`⚠️ ${subscription.error}`); return; }
      const test = await sendTestPushNotification(activeActorId, getAuthHeaders());
      if (!test.ok) setPushEnabled(false);
      setBanner(test.ok
        ? "🔔 Push service accepted this device’s test. Check Notification Center; if it is missing, check Noted’s notification settings and Focus. Delivery to your screen is not confirmed."
        : `⚠️ ${test.error}`);
    } finally {
      setIsPushBusy(false);
      window.setTimeout(() => setBanner(null), 20000);
    }
  }

  if (authLoading || (canFetchState && stateLoading)) return <div className="noted-loading">✦ Loading your space...</div>;
  if (authStatus && !authStatus.initialized) return <SetupWizard isSubmitting={setupMutation.isPending} error={setupError} onSubmit={(payload, selectedMemberIndex) => { setSetupError(null); setupMutation.mutate({ payload, selectedMemberIndex }); }} />;
  if (isLocked || (authStatus?.initialized && authStatus.requiresPasscode && !storedPasscode)) return <PasscodeLockScreen spaceName={authStatus?.spaceName} error={unlockError} isVerifying={isVerifyingPin} onUnlock={unlock} />;
  if (stateError || !data?.space) return <div className="noted-loading">Could not load your space. Check the server and refresh.</div>;

  const actor = data.members.find((member) => member.id === activeActorId);
  if (!actor && data.members.length > 1) return <DeviceIdentityScreen spaceName={data.space.name} members={data.members} onSelectMember={selectActiveActor} />;
  if (!actor && !data.members.length) return <div className="noted-loading">Add a member to get started.</div>;

  return <Workspace
    space={data.space}
    members={data.members}
    tasks={data.tasks}
    messages={data.messages || []}
    actor={actor || data.members[0]}
    connection={connection}
    isDarkMode={isDarkMode}
    pushEnabled={pushEnabled}
    isPushBusy={isPushBusy}
    banner={banner}
    onSelectActor={selectActiveActor}
    onToggleTheme={() => setIsDarkMode((current) => !current)}
    onEnableAlerts={toggleAlerts}
    onLock={() => { localStorage.removeItem(PASSCODE_KEY); localStorage.removeItem(MEMBER_KEY); setStoredPasscode(null); setActiveActorId(null); setIsLocked(true); }}
    onCreateTask={(payload) => createTask.mutateAsync(payload)}
    onCreateMessage={(payload) => createMessage.mutateAsync(payload)}
    onUpdateTask={(id, patch) => updateTask.mutate({ id, patch })}
    onDeleteTask={(id) => deleteTask.mutate(id)}
    onAddMember={(name, avatar) => createMember.mutateAsync({ name, avatar, spaceId: data.space!.id })}
  />;
}
