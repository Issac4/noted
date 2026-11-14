# 📋 Noted: Product Requirements & Architecture Specification
**A Shigoto task board for households and groups**

> **Open-Source Positioning**: Designed for solo individuals, families, roommates, and groups of friends. Profiles identify the person using a device but are not separate authenticated accounts; tasks are visible to anyone with access to the space.

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
   * Push notifications are for tasks someone added for you and daily critical reminders. Routine completion and rollover remain quiet.
4. **👥 Mutual Visibility without Micromanagement**:
   * Each member maintains their own focus list. Members can add a task for someone else while keeping the original sender visible.
5. **⚡ Resilient Capture**:
   * The PWA caches its interface for quick loading. Sending a task requires a connection; failed sends keep the draft so the user can retry.

---

## 2. Core Functional Architecture

### Module 1: 🚨 Critical Deadlines
* **Purpose**: Dedicated strictly to high-consequence obligations with immutable cutoff dates (e.g., tax filings, property tax installments, utility bills, passport/license renewals, insurance expirations).
* **UI Representation**: Priority and deadline are separate. High-priority tasks stay at the top even without a deadline. Critical alert tasks retain their explicit deadline and alert schedule.
* **Alert Strategy**: **Daily at 9:00 AM Toronto time until completed, including overdue tasks**. The server checks every minute and catches up after a restart. Daylight saving time is automatic. A persistent task/day record prevents repeating an accepted reminder; failed delivery with no accepted device is retried. Push acceptance does not guarantee immediate device display.

### Module 2: ☀️ Shigoto Focus Board
* Calendar/week navigation is removed. The board always shows all pending tasks in the selected My focus / Everyone scope.
* A clear urgency hierarchy groups tasks once: **Needs attention** (overdue and today, earliest deadline first), **Important** (other high priority or critical work, including undated work), **Coming up** (other future deadlines), and **Whenever** (other undated work).
* The first task to tackle is highlighted. Group colors distinguish urgency without filling the whole board with badges. The approved Shigoto layout uses four paper-and-ink lanes on desktop, two on tablets, and one on phones, preserving urgency order. Vermilion marks the next action; dark mode uses charcoal and muted paper tones.
* Deadline countdowns show calendar days left, due today, or days overdue, alongside the actual deadline. The view refreshes every minute and on wake. Larger task titles and subdued supporting text improve scanning.
* My focus uses the active device profile; Complete Action · Everyone includes every member and shows owners. Live sync, themes, alerts, self-assignment, adding people, and locking remain available.
* Completed history records actual completion times and supports reopening. Legacy tasks with unknown completion times are labelled honestly.

### Module 3: ✎ Task Composer & Repeating Tasks
* The composer stays fixed to the device screen bottom, with assignment and text always visible. Task options expands priority, deadline, recurrence, and critical alerts. The collapsed summary shows selected options.
* Natural language capture still supports deadlines and notes. Enter sends; Shift+Enter inserts a newline. Failed sends retain the draft.
* Repeat options: daily, weekly, every two weeks (14 days), every N days (1–3650), and day 1–31 of each month. Repeating tasks require an explicit first deadline. Dates are calculated at 9 AM America/Toronto, including daylight saving changes.
* Completing an occurrence atomically records its completion and creates one next pending occurrence with the same assignee, creator, note, priority, type, and repeat rule. The schedule stays anchored to the previous deadline; missed dates are skipped, keeping the board clear of backlogs. Early completion advances to the following scheduled date. A monthly date that does not exist uses the last day of that month, then returns to the chosen day the following month.
* Row locks and a unique previous-occurrence reference prevent duplicate next occurrences when completion requests race. Repeated completion requests preserve the original completion timestamp.
* Reopening removes the next unfinished occurrence in the same transaction; reopening is rejected if that next occurrence has already been completed. The UI confirms this behavior. Edit the active occurrence to change future repeats; choosing Does not repeat stops further generation. Deleting an active task stops that chain; deleting history does not delete its next active occurrence.
* Existing message data remains untouched; messaging remains retired.

---

## 3. Responsive UX & Tactile Experience

| Platform | Layout | Interaction |
| :--- | :--- | :--- |
| **Mobile PWA** | Dashboard with a compact composer fixed at the screen bottom. | Assignment stays visible; task options expands priority, deadline, repeats and critical alerts; all header controls remain available. |
| **Desktop Web** | Four urgency lanes on desktop, two on tablets, and a compact bottom composer. | C focuses the composer. Send or Enter submits; Shift+Enter adds a new line. Shigoto styling with warm paper and charcoal themes. |

---

## 4. Strict Notification Protocol

| Event | Notification Sent? | Timing & Content |
| :--- | :---: | :--- |
| **🚨 Critical Hard Deadline** | **✅ YES** | Daily at/shortly after 9 AM Toronto, including after the deadline, until completed. Only the assignee’s subscribed devices receive reminders. |
| **📝 Task Added for You** | **✅ YES** | Alert the recipient when another member adds a task to their list. |
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
    │     ├── due_date: timestamp? (required for critical or repeating tasks)
    │     ├── recurrence: json? ({kind: days, interval} or {kind: monthly, day})
    │     ├── previous_occurrence_id: uuid? (unique; prevents duplicate generation)
    │     ├── assigned_to: uuid (foreign key -> members.id)
    │     ├── created_by: uuid (foreign key -> members.id)
    │     ├── status: "pending" | "completed"
    │     ├── completed_at: timestamp? (cleared on reopen; legacy times unknown)
    │     ├── created_at: timestamp
    │     └── updated_at: timestamp
    └── [Legacy Messages — retained, no active messaging feature]
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
│ • UI/UX: Task dashboard, completion history, composer, themes   │
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

### 6.1 Installed Web App Identity
* The Shigoto icon is an original SVG paper note/check on a vermilion seal, exported as opaque 180, 192 and 512 pixel PNGs. Versioned icon URLs are used in the manifest, Apple touch link, favicon, and push notification icon. Legacy asset URLs remain available.
* Manifest ID, start URL and scope stay `/`; display remains standalone. Portrait locking is removed to support desktop and landscape use. Service worker revisions include all public assets so an icon-only change also creates a new worker URL. Theme-color metadata follows the chosen light/dark palette.
* iOS Home Screen icon refresh is OS-controlled; a newly added install uses the new touch icon after deployment. If an existing install retains the old icon, re-add from Safari and re-enable alerts in that installation. Existing board data remains on the server.
* macOS Sonoma 14+ supports Safari File → Add to Dock. Each installed app/device needs its own profile selection and notification permission. Confirm physical-device notification delivery separately from local browser layout checks.

### 6.2 Container & Deployment Topology (Tiny PC)
* **2-Service Docker Compose Architecture**:
  1. `db`: `postgres:16-alpine` configured with an integrated Docker healthcheck (`pg_isready`).
  2. `app`: Single container running Hono, serving both the API/WebSocket server and compiled static frontend assets. Configured with `depends_on: db: condition: service_healthy` to eliminate startup race conditions after power interruptions.
* **Edge Routing & SSL**: Cloudflare Tunnel (`cloudflared`) routing traffic to the Tiny PC. Zero router port-forwarding required; TLS termination handled at Cloudflare's edge.
* **CI/CD Pipeline**: GitHub Actions builds Docker images on push to `main` and publishes to GitHub Container Registry (`ghcr.io`). Production updates are explicit over SSH using the existing deploy helper, which backs up the database and pulls the latest image. Watchtower is stopped.

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
