# 📋 Noted: Product Requirements & Architecture Specification
**A Candy Calendar dashboard for households and groups**

> **Open-Source Positioning**: Designed for solo individuals, families, roommates, and groups of friends. Profiles identify the person using a device but are not separate authenticated accounts; conversations are visible to anyone with access to the space.

---

## 1. Core Philosophy & Problem Statement

### 1.1 Why Mainstream To-Do Apps (TickTick, Todoist, etc.) Fail in Households
1. **The "Manager vs. Employee" Trap**:
   * Conventional shared lists force one person to assign tasks to another, creating an inherent corporate hierarchy. The assigner feels overburdened by invisible mental load (noticing, recording, delegating), while the assignee feels micromanaged, sparking psychological reactance and procrastination.
   * *Real-life dynamic*: Household tasks should be self-claimed with mutual visibility, not top-down task delegation.
2. **The "Overdue Snowball of Shame"**:
   * Mainstream apps treat minor chores ("wash bedsheets") with the same rigid urgency as non-negotiable obligations ("file annual taxes").
   * Missing a soft chore turns the interface into a sea of red badges. The brain associates opening the app with feelings of guilt and failure, prompting avoidance and eventual **Task Bankruptcy (abandonment)**.
3. **Administrative Friction & Context Separation**:
   * Forcing users through multi-step dropdowns (selecting projects, priority tiers P1–P4, tags) introduces high cognitive friction. Users instinctively abandon the app and send a quick chat message instead, which then gets buried in everyday conversations.

### 1.2 The Five Core Principles
1. **⚡ Zero Administrative Overhead**:
   * *Capture friction must approach zero. The tool serves action—managing the tool must never become a chore itself.*
   * No mandatory tagging or project nesting. Tasks default to Normal priority; optional High / Normal / Low controls are independent of the deadline.
2. **🌱 Guilt-Free Rollover**:
   * Undated tasks stay visible without artificial overdue dates. Explicitly dated tasks show their deadline, including an overdue indicator when it has passed.
3. **🔕 High Signal-to-Noise Ratio**:
   * Push notifications are for direct messages, tasks someone added for you, and critical deadlines. Routine completion and rollover remain quiet.
4. **👥 Mutual Visibility without Micromanagement**:
   * Each member maintains their own focus list. Members can add a task for someone else while keeping the original sender visible.
5. **⚡ Resilient Capture**:
   * The PWA caches its interface for quick loading. Sending a task or message requires a connection; failed sends keep the draft so the user can retry.

---

## 2. Core Functional Architecture

### Module 1: 🚨 Critical Deadlines
* **Purpose**: Dedicated strictly to high-consequence obligations with immutable cutoff dates (e.g., tax filings, property tax installments, utility bills, passport/license renewals, insurance expirations).
* **UI Representation**: Priority and deadline are separate. High-priority tasks stay at the top even without a deadline. Critical alert tasks retain their explicit deadline and alert schedule.
* **Alert Strategy**: Strict, low-frequency alerts triggered only at **D-3, D-1, and 9:00 AM on the due date**.

### Module 2: ☀️ Candy Calendar Dashboard
* The approved #05 Candy Calendar layout has a full-page pastel dashboard on the left and the people list and task composer on the right. Dark mode uses navy surfaces with cyan and magenta accents.
* **My focus** shows the active device profile's tasks; **Complete Action · Everyone** includes the entire board and labels task owners.
* A real Monday–Sunday week strip shows due counts. Selecting a day filters dated tasks; clearing the filter restores important undated work. Previous/next week controls use local calendar dates.
* Active tasks appear once in **Priority tasks**, **Due soon**, or **Whenever**. Completed tasks remain available in a collapsed section with a reopen action.
* Tasks support completion, deletion, note editing, priority changes, and deadline changes. Selecting a person sets the composer recipient and keeps the dashboard visible.

### Module 3: ✎ Task Composer
* The right-side composer has a recipient selector including **Me**, High / Normal / Low priority, an optional deadline, and an optional critical deadline alert setting.
* Natural language parsing recognizes phrases such as `tomorrow`, `Nov 15`, and `!critical`. High priority works without a date; critical alerts require a date.
* Sending uses the existing API and WebSocket synchronization. Failed requests preserve the draft and show an error. Separate drafts are maintained per author, recipient, and send type.
* A secondary Message option is available for other members. Recent messages are collapsed below the composer rather than replacing the task dashboard.

---

## 3. Responsive UX & Tactile Experience

| Platform | Layout | Interaction |
| :--- | :--- | :--- |
| **Mobile PWA** | Dashboard, people, and composer stack in a single column. | New task navigation and the C shortcut reach the composer; all header controls remain available. |
| **Desktop Web** | Calendar/task dashboard on the left; people and composer on the right. | C focuses the composer. The Send button submits; Enter in task text adds a new line. Candy Calendar styling with light and neon dark themes. |

---

## 4. Strict Notification Protocol

| Event | Notification Sent? | Timing & Content |
| :--- | :---: | :--- |
| **🚨 Critical Hard Deadline** | **✅ YES** | D-3, D-1, and morning of due date: `⚠️ [Critical] Tax return due in 2 days` |
| **📝 Task Added for You** | **✅ YES** | Alert the recipient when another member adds a task to their list. |
| **💬 Direct Message** | **✅ YES** | Alert the recipient when a member sends a message. |
| **Routine Task Completed** | **❌ NO** | Updates silently via WebSocket without buzzing the partner's phone. |
| **Routine Task Incomplete** | **❌ NO** | Strictly zero "overdue" shame notifications; items roll over automatically. |

---

## 5. Domain Data Model

```
[Space / Workspace] (Household or Personal Workspace)
    ├── [Members] (1 to N: id, name, avatar, role)
    ├── [Tasks]
    │     ├── id: uuid
    │     ├── space_id: uuid (foreign key)
    │     ├── title: string
    │     ├── note: text? (optional contextual note/dimensions)
    │     ├── type: "critical" | "daily"
    │     ├── priority: "high" | "normal" | "low"
    │     ├── due_date: timestamp? (required for critical tasks)
    │     ├── assigned_to: uuid (foreign key -> members.id)
    │     ├── created_by: uuid (foreign key -> members.id)
    │     ├── status: "pending" | "completed"
    │     ├── created_at: timestamp
    │     └── updated_at: timestamp
    └── [Messages]
          ├── id: uuid
          ├── space_id: uuid (foreign key)
          ├── sender_id: uuid (foreign key -> members.id)
          ├── recipient_id: uuid (foreign key -> members.id)
          ├── body: text
          └── created_at: timestamp
```

---

## 6. Technical Architecture Specification

```
┌─────────────────────────────────────────────────────────────┐
│ 📱 Frontend: Vite + React 19 + TypeScript + Tailwind CSS     │
│    UI Library: shadcn/ui + Lucide Icons                     │
├─────────────────────────────────────────────────────────────┤
│ • UI/UX: People list, task feeds, message threads, themes   │
│ • State: TanStack Query (React Query) + WebSocket updates    │
│ • Offline: Vite PWA Plugin (Workbox), static resource cache  │
└──────────────────────────────┬──────────────────────────────┘
                               │ WebSocket (Real-time sync)
                               │ REST / JSON (CRUD APIs)
┌──────────────────────────────┴──────────────────────────────┐
│ 🚀 Backend: Hono (TypeScript on Node.js)                    │
├─────────────────────────────────────────────────────────────┤
│ • Real-time: Native WebSocket via @hono/node-ws             │
│ • Heartbeat: 30-second ping/pong keep-alive cycle            │
│ • Static Server: Serves compiled Vite `dist` assets          │
│ • Memory: ~30MB idle footprint                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ TCP / Connection Pool
┌──────────────────────────────┴──────────────────────────────┐
│ 🐘 Database: PostgreSQL 16 (Alpine Docker)                   │
│    ORM: Drizzle ORM + Drizzle Kit (Type-safe SQL)           │
├─────────────────────────────────────────────────────────────┤
│ • Reliability: Resilient to sudden power outages             │
│ • Migrations: Effortless schema evolution via Drizzle Kit    │
└─────────────────────────────────────────────────────────────┘
```

### 6.1 Container & Deployment Topology (Tiny PC)
* **2-Service Docker Compose Architecture**:
  1. `db`: `postgres:16-alpine` configured with an integrated Docker healthcheck (`pg_isready`).
  2. `app`: Single container running Hono, serving both the API/WebSocket server and compiled static frontend assets. Configured with `depends_on: db: condition: service_healthy` to eliminate startup race conditions after power interruptions.
* **Edge Routing & SSL**: Cloudflare Tunnel (`cloudflared`) routing traffic to the Tiny PC. Zero router port-forwarding required; TLS termination handled at Cloudflare's edge.
* **CI/CD Pipeline**: GitHub Actions builds multi-platform Docker images on push to `main` ➡️ pushes to GitHub Container Registry (`ghcr.io`) ➡️ Watchtower on Tiny PC pulls clean images automatically.

---

## 7. Planned Reliability Work

1. **Pragmatic Offline Synchronization**:
   * Avoid heavy CRDT overhead. Implement **Level-2 Pragmatic Offline**:
     * Client reads from TanStack Query cache (persisted in IndexedDB).
     * Offline mutations update UI optimistically and enqueue into an IndexedDB outbox.
     * Reconnection drains the outbox with column-level Last-Write-Wins (LWW).
2. **Robust WebSocket Lifecycle Management**:
   * Encapsulate a dedicated `useFamilySocket` hook with:
     * **30-second ping/pong heartbeat** (preventing Cloudflare's 100-second idle disconnect).
     * **Page Visibility API listener**: Triggers immediate connectivity validation and catch-up query when waking the device.
     * **Exponential backoff with jitter** for reconnections.
3. **Power-Outage Protection (Uninterruptible Operation without UPS)**:
   * Keep PostgreSQL `synchronous_commit = on`.
   * Configure an automated daily backup cronjob:
     ```bash
     docker exec -t db pg_dump -U todo_admin family_todo | gzip > /backup/todo_$(date +%F).sql.gz
     ```
   * Optionally sync archives off-site via `rclone` to Cloudflare R2 or personal cloud storage.
