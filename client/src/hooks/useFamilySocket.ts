import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsMessage, Task, Member, Space } from "@todo-app/shared";

export interface AppStateData {
  space: Space | null;
  members: Member[];
  tasks: Task[];
}

export interface UseFamilySocketOptions {
  enabled?: boolean;
  passcode?: string | null;
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
}

export function useFamilySocket(options?: UseFamilySocketOptions) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const enabled = options?.enabled ?? true;
  const passcode = options?.passcode ?? null;

  useEffect(() => {
    if (!enabled) {
      setStatus("disconnected");
      return;
    }

    let unmounted = false;

    function clearTimers() {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current !== null) {
        window.clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    }

    function connect() {
      if (unmounted) return;
      clearTimers();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const qs = passcode ? `?passcode=${encodeURIComponent(passcode)}` : "";
      const wsUrl = `${protocol}//${window.location.host}/ws${qs}`;

      setStatus("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setStatus("connected");
        retryCountRef.current = 0;
        setLastHeartbeat(Date.now());

        // Start 30-second ping/pong heartbeat cycle (per PRD Section 7.2)
        heartbeatTimerRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const msg: WsMessage = { type: "ping", timestamp: Date.now() };
            ws.send(JSON.stringify(msg));
          }
        }, 30_000);
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          if (msg.type === "ping") {
            setLastHeartbeat(Date.now());
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() } satisfies WsMessage));
            }
            return;
          }
          if (msg.type === "pong") {
            setLastHeartbeat(Date.now());
            return;
          }

          if (msg.type === "task:created") {
            queryClient.setQueryData<AppStateData>(["state"], (prev) => {
              if (!prev) return prev;
              const exists = prev.tasks.some((t) => t.id === msg.payload.id);
              if (exists) {
                return {
                  ...prev,
                  tasks: prev.tasks.map((t) => (t.id === msg.payload.id ? msg.payload : t)),
                };
              }
              return {
                ...prev,
                tasks: [msg.payload, ...prev.tasks],
              };
            });
            optionsRef.current?.onTaskCreated?.(msg.payload);
          } else if (msg.type === "task:updated") {
            queryClient.setQueryData<AppStateData>(["state"], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                tasks: prev.tasks.map((t) => (t.id === msg.payload.id ? msg.payload : t)),
              };
            });
            optionsRef.current?.onTaskUpdated?.(msg.payload);
          } else if (msg.type === "task:deleted") {
            queryClient.setQueryData<AppStateData>(["state"], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                tasks: prev.tasks.filter((t) => t.id !== msg.payload.id),
              };
            });
          } else if (msg.type === "member:created") {
            queryClient.setQueryData<AppStateData>(["state"], (prev) => {
              if (!prev) return prev;
              const exists = prev.members.some((m) => m.id === msg.payload.id);
              if (exists) return prev;
              return {
                ...prev,
                members: [...prev.members, msg.payload],
              };
            });
          } else if (msg.type === "sync:state") {
            queryClient.setQueryData<AppStateData>(["state"], msg.payload);
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setStatus("disconnected");
        clearTimers();

        // Exponential backoff with jitter
        const baseDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 15_000);
        const jitter = Math.random() * 500;
        retryCountRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, baseDelay + jitter);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    // Page Visibility API listener: validate connection and catch-up query on wake
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: ["state"] });
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        } else {
          wsRef.current.send(
            JSON.stringify({ type: "ping", timestamp: Date.now() } satisfies WsMessage)
          );
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unmounted = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [queryClient, enabled, passcode]);

  return { status, lastHeartbeat };
}
