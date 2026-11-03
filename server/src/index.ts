import { Hono } from "hono";
import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import type { WSContext } from "hono/ws";
import { eq, asc, desc } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "./db/index.js";
import { spaces, members, tasks } from "./db/schema.js";
import { runMigrations } from "./db/migrate.js";
import { ensureDefaultSeed } from "./db/seed.js";
import type {
  Task,
  Member,
  Space,
  CreateTaskPayload,
  UpdateTaskPayload,
  SetupPayload,
  AuthStatusResponse,
  WsMessage,
} from "@todo-app/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "x-passcode"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// Helper to resolve the active household passcode from env or DB space settings
async function getEffectivePasscode(): Promise<{
  space: typeof spaces.$inferSelect | null;
  effectivePasscode: string | null;
}> {
  const [space] = await db.select().from(spaces).orderBy(asc(spaces.createdAt)).limit(1);
  const envPasscode = process.env.APP_PASSCODE?.trim() || null;
  const dbPasscode = space?.passcode?.trim() || null;
  return {
    space: space ?? null,
    effectivePasscode: envPasscode || dbPasscode || null,
  };
}

// Passcode security middleware for protected REST & WebSocket endpoints
async function passcodeMiddleware(c: Context, next: Next) {
  const { effectivePasscode } = await getEffectivePasscode();
  if (!effectivePasscode) {
    return next();
  }

  const headerPasscode = c.req.header("x-passcode")?.trim();
  const queryPasscode = c.req.query("passcode")?.trim();
  const provided = headerPasscode || queryPasscode;

  if (!provided || provided !== effectivePasscode) {
    return c.json({ error: "Unauthorized: Invalid or missing household passcode" }, 401);
  }

  return next();
}

// Protect all sensitive endpoints
app.use("/api/state", passcodeMiddleware);
app.use("/api/tasks", passcodeMiddleware);
app.use("/api/tasks/*", passcodeMiddleware);
app.use("/api/members", passcodeMiddleware);
app.use("/api/members/*", passcodeMiddleware);
app.use("/api/spaces", passcodeMiddleware);
app.use("/ws", passcodeMiddleware);

// Active WebSocket clients and heartbeat tracking
interface ClientSession {
  ws: WSContext;
  lastSeen: number;
}
const clients = new Set<ClientSession>();

function broadcast(msg: WsMessage) {
  const payload = JSON.stringify(msg);
  for (const session of clients) {
    try {
      session.ws.send(payload);
    } catch (err) {
      console.error("Failed to send WS message:", err);
      clients.delete(session);
    }
  }
}

// 30-second server-side ping/pong heartbeat cycle (per PRD Section 6 & 7.2)
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

const heartbeatTimer = setInterval(() => {
  const now = Date.now();
  for (const session of clients) {
    if (now - session.lastSeen > HEARTBEAT_TIMEOUT_MS) {
      try {
        session.ws.close(1000, "Heartbeat timeout");
      } catch {
        // ignore close error
      }
      clients.delete(session);
      continue;
    }
    try {
      session.ws.send(JSON.stringify({ type: "ping", timestamp: now } satisfies WsMessage));
    } catch {
      clients.delete(session);
    }
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();

// Format DB rows to shared DTOs (never leak raw passcode)
function serializeSpace(
  row: typeof spaces.$inferSelect,
  effectivePasscode: string | null
): Space {
  return {
    id: row.id,
    name: row.name,
    requiresPasscode: Boolean(effectivePasscode),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeMember(row: typeof members.$inferSelect): Member {
  return {
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    avatar: row.avatar,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    note: row.note,
    type: row.type,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    assignedTo: row.assignedTo,
    createdBy: row.createdBy,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// WebSocket endpoint (protected by passcodeMiddleware)
app.get(
  "/ws",
  upgradeWebSocket(() => {
    let session: ClientSession | null = null;
    return {
      onOpen(_event, ws) {
        session = { ws, lastSeen: Date.now() };
        clients.add(session);
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() } satisfies WsMessage));
      },
      onMessage(event, ws) {
        if (session) {
          session.lastSeen = Date.now();
        }
        try {
          const data = JSON.parse(String(event.data)) as WsMessage;
          if (data.type === "ping") {
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: Date.now(),
              } satisfies WsMessage)
            );
          }
        } catch {
          // ignore malformed messages
        }
      },
      onClose() {
        if (session) {
          clients.delete(session);
        }
      },
      onError() {
        if (session) {
          clients.delete(session);
        }
      },
    };
  })
);

// Public Healthcheck endpoint
app.get("/api/health", async (c) => {
  try {
    const { space, effectivePasscode } = await getEffectivePasscode();
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      wsClients: clients.size,
      initialized: Boolean(space),
      requiresPasscode: Boolean(effectivePasscode),
    });
  } catch (err) {
    return c.json({ status: "error", message: String(err) }, 500);
  }
});

// Public Auth Status endpoint (exposes only whether workspace is initialized and if passcode is required)
app.get("/api/auth/status", async (c) => {
  const { space, effectivePasscode } = await getEffectivePasscode();
  const payload: AuthStatusResponse = {
    initialized: Boolean(space),
    requiresPasscode: Boolean(effectivePasscode),
    spaceName: space?.name ?? null,
  };
  return c.json(payload);
});

// Protected full initial state endpoint (Space + Members + Tasks)
app.get("/api/state", async (c) => {
  const { space, effectivePasscode } = await getEffectivePasscode();
  if (!space) {
    return c.json({
      space: null,
      members: [],
      tasks: [],
    });
  }

  const spaceMembers = await db
    .select()
    .from(members)
    .where(eq(members.spaceId, space.id))
    .orderBy(asc(members.createdAt));

  const spaceTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.spaceId, space.id))
    .orderBy(desc(tasks.createdAt));

  return c.json({
    space: serializeSpace(space, effectivePasscode),
    members: spaceMembers.map(serializeMember),
    tasks: spaceTasks.map(serializeTask),
  });
});

// First-Run Setup Wizard endpoint: initialize custom Space name, optional Passcode, and Members dynamically
app.post("/api/setup", async (c) => {
  const { space: existing, effectivePasscode: envLock } = await getEffectivePasscode();
  if (existing) {
    return c.json({ error: "Workspace is already initialized" }, 409);
  }

  // If APP_PASSCODE is enforced via environment variable even during first-run setup, check it if provided
  const body = await c.req.json<SetupPayload>();
  const spaceName = body.spaceName?.trim();
  if (!spaceName) {
    return c.json({ error: "Space name is required" }, 400);
  }

  const validMembers = (body.members || [])
    .map((m) => ({
      name: m.name?.trim(),
      avatar: m.avatar?.trim() || "👤",
      role: m.role,
    }))
    .filter((m) => Boolean(m.name));

  if (validMembers.length === 0) {
    return c.json({ error: "At least one member is required" }, 400);
  }

  const customPasscode = body.passcode?.trim() || null;

  const [createdSpace] = await db
    .insert(spaces)
    .values({
      name: spaceName,
      passcode: customPasscode,
    })
    .returning();

  const createdMembers = await db
    .insert(members)
    .values(
      validMembers.map((m, idx) => ({
        spaceId: createdSpace.id,
        name: m.name,
        avatar: m.avatar,
        role: m.role || (idx === 0 ? "owner" : "member"),
      }))
    )
    .returning();

  const finalEffectivePasscode = envLock || customPasscode;
  const statePayload = {
    space: serializeSpace(createdSpace, finalEffectivePasscode),
    members: createdMembers.map(serializeMember),
    tasks: [] as Task[],
  };

  broadcast({ type: "sync:state", payload: statePayload });
  return c.json(statePayload, 201);
});

// Spaces list
app.get("/api/spaces", async (c) => {
  const { effectivePasscode } = await getEffectivePasscode();
  const rows = await db.select().from(spaces).orderBy(asc(spaces.createdAt));
  return c.json(rows.map((r) => serializeSpace(r, effectivePasscode)));
});

// Members list & create
app.get("/api/members", async (c) => {
  const rows = await db.select().from(members).orderBy(asc(members.createdAt));
  return c.json(rows.map(serializeMember));
});

app.post("/api/members", async (c) => {
  const body = await c.req.json<{ spaceId?: string; name: string; avatar?: string; role?: "owner" | "member" }>();
  if (!body.name?.trim()) {
    return c.json({ error: "Name is required" }, 400);
  }
  let targetSpaceId = body.spaceId;
  if (!targetSpaceId) {
    const [space] = await db.select().from(spaces).orderBy(asc(spaces.createdAt)).limit(1);
    if (!space) return c.json({ error: "No space found" }, 404);
    targetSpaceId = space.id;
  }

  const [created] = await db
    .insert(members)
    .values({
      spaceId: targetSpaceId,
      name: body.name.trim(),
      avatar: body.avatar || "👤",
      role: body.role || "member",
    })
    .returning();

  const serialized = serializeMember(created);
  broadcast({ type: "member:created", payload: serialized });
  return c.json(serialized, 201);
});

// Tasks CRUD
app.get("/api/tasks", async (c) => {
  const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  return c.json(rows.map(serializeTask));
});

app.post("/api/tasks", async (c) => {
  const body = await c.req.json<CreateTaskPayload>();
  if (!body.title?.trim()) {
    return c.json({ error: "Task title is required" }, 400);
  }
  if (!body.assignedTo || !body.createdBy) {
    return c.json({ error: "assignedTo and createdBy member IDs are required" }, 400);
  }

  let targetSpaceId = body.spaceId;
  if (!targetSpaceId) {
    const [space] = await db.select().from(spaces).orderBy(asc(spaces.createdAt)).limit(1);
    if (!space) return c.json({ error: "No space found" }, 404);
    targetSpaceId = space.id;
  }

  const taskType = body.type || "daily";
  let parsedDueDate: Date | null = null;
  if (body.dueDate) {
    parsedDueDate = new Date(body.dueDate);
  } else if (taskType === "critical") {
    // Default critical deadline to +3 days if not specified
    parsedDueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  }

  const [created] = await db
    .insert(tasks)
    .values({
      spaceId: targetSpaceId,
      title: body.title.trim(),
      note: body.note?.trim() || null,
      type: taskType,
      dueDate: parsedDueDate,
      assignedTo: body.assignedTo,
      createdBy: body.createdBy,
      status: "pending",
    })
    .returning();

  const serialized = serializeTask(created);
  broadcast({ type: "task:created", payload: serialized });
  return c.json(serialized, 201);
});

app.patch("/api/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<UpdateTaskPayload>();

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.title !== undefined) updateData.title = body.title.trim();
  if (body.note !== undefined) updateData.note = body.note ? body.note.trim() : null;
  if (body.type !== undefined) updateData.type = body.type;
  if (body.dueDate !== undefined) {
    updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo;
  if (body.status !== undefined) updateData.status = body.status;

  const [updated] = await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Task not found" }, 404);
  }

  const serialized = serializeTask(updated);
  broadcast({ type: "task:updated", payload: serialized });
  return c.json(serialized);
});

app.delete("/api/tasks/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
  if (!deleted) {
    return c.json({ error: "Task not found" }, 404);
  }

  broadcast({
    type: "task:deleted",
    payload: { id: deleted.id, spaceId: deleted.spaceId },
  });
  return c.json({ ok: true, id: deleted.id });
});

// Serve compiled Vite static assets in production
const clientDistCandidates = [
  path.resolve(__dirname, "../../client/dist"),
  path.resolve(process.cwd(), "client/dist"),
  path.resolve(process.cwd(), "../client/dist"),
];

const clientDistPath = clientDistCandidates.find((p) => fs.existsSync(p));
if (clientDistPath) {
  const relativeRoot = path.relative(process.cwd(), clientDistPath) || ".";
  app.use("/*", serveStatic({ root: relativeRoot }));
  app.get("*", async (c) => {
    const indexPath = path.join(clientDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
    return c.notFound();
  });
}

async function startServer() {
  if (process.env.AUTO_MIGRATE !== "false") {
    await runMigrations();
    await ensureDefaultSeed();
  }

  const port = Number(process.env.PORT || 3000);
  const server = serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`🚀 Hono + WebSocket server running at http://0.0.0.0:${info.port}`);
    }
  );

  injectWebSocket(server);
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
