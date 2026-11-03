export type TaskType = "critical" | "daily";
export type TaskStatus = "pending" | "completed";
export type MemberRole = "owner" | "member";

export interface Space {
  id: string;
  name: string;
  requiresPasscode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  spaceId: string;
  name: string;
  avatar: string;
  role: MemberRole;
  createdAt: string;
}

export interface Task {
  id: string;
  spaceId: string;
  title: string;
  note: string | null;
  type: TaskType;
  dueDate: string | null;
  assignedTo: string;
  createdBy: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  spaceId?: string;
  title: string;
  note?: string | null;
  type?: TaskType;
  dueDate?: string | null;
  assignedTo: string;
  createdBy: string;
}

export interface UpdateTaskPayload {
  title?: string;
  note?: string | null;
  type?: TaskType;
  dueDate?: string | null;
  assignedTo?: string;
  status?: TaskStatus;
}

export interface SetupMemberInput {
  name: string;
  avatar: string;
  role?: MemberRole;
}

export interface SetupPayload {
  spaceName: string;
  passcode?: string | null;
  members: SetupMemberInput[];
}

export interface AuthStatusResponse {
  initialized: boolean;
  requiresPasscode: boolean;
  spaceName: string | null;
}

export type WsMessage =
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number }
  | { type: "task:created"; payload: Task }
  | { type: "task:updated"; payload: Task }
  | { type: "task:deleted"; payload: { id: string; spaceId: string } }
  | { type: "member:created"; payload: Member }
  | { type: "sync:state"; payload: { space: Space; members: Member[]; tasks: Task[] } };
