# 📋 todo-app: Product Requirements & Architecture Specification (PRD)
**A Zero-Overhead, High Signal-to-Noise Household & Personal Task Hub**

> **Open-Source Positioning**: Designed for solo individuals seeking an anxiety-free workflow, as well as couples, roommates, or small families (2–4 members) collaborating with mutual transparency. Fully open-source ready, privacy-respecting, and straightforward to self-host.

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
   * No mandatory tagging, project nesting, or priority dropdowns. Type and hit Enter.
2. **🌱 Guilt-Free Rollover**:
   * Soft tasks feature no overdue badges or red penalties. Incomplete tasks quietly and smoothly roll over into tomorrow, respecting human energy fluctuations.
3. **🔕 High Signal-to-Noise Ratio**:
   * Zero push notifications for daily routine tasks. Alerts are strictly reserved for critical hard deadlines. When the phone buzzes, it is guaranteed to matter.
4. **👥 Mutual Visibility without Micromanagement**:
   * Each member maintains their own focus list. Transparency enables unspoken accountability without nagging. Supports frictionless "proxy capturing" (noting something down on behalf of a busy partner).
5. **⚡ Pragmatic Offline-First**:
   * Instant app launch and zero-latency capture in weak-signal or no-signal environments (elevators, underground parking garages, basements). Changes sync automatically upon reconnection.

---

## 2. Core Functional Architecture

### Module 1: 🚨 Critical Hard Deadlines (The Gatekeeper)
* **Purpose**: Dedicated strictly to high-consequence obligations with immutable cutoff dates (e.g., tax filings, property tax installments, utility bills, passport/license renewals, insurance expirations).
* **UI Representation**: Pinned top card displaying a prominent **"Days Left" countdown badge** (e.g., `⚠️ 3 Days Left: Property Tax`).
* **Alert Strategy**: Strict, low-frequency alerts triggered only at **D-3, D-1, and 9:00 AM on the due date**.

### Module 2: ☀️ Today & Tomorrow Action Board
* **Purpose**: Focuses on immediate day-to-day commitments and urgent errands (e.g., "Pick up prescription after work", "Order takeout tonight").
* **Adaptive Multi-Member Views**:
  * **Solo Mode**: Displays a single, pristine "My Focus" view.
  * **Collaborative Mode (2+ Members)**:
    * Displays configurable member columns (e.g., *Issac* and *Partner*).
    * Each member controls their own commitments; lists are displayed side-by-side (desktop) or stacked (mobile) for effortless mutual visibility.
* **Proxy Capture Mechanism**:
  * When one partner is driving or occupied, the other can add a task directly to their list.
  * The task is tagged with warm context attribution: `○ Pick up dry cleaning` *(Noted by Partner 📝)*, turning an order into a supportive gesture.
* **Context Notes**:
  * Any task can hold an optional, lightweight contextual snippet (e.g., filter dimension `16x25x1`, dosage `500mg`, clinic phone number), eliminating scattered notes.

### Module 3: 💬 Zero-Overhead Quick Capture
* **Single-Line Chat-Like Input**: Positioned conveniently at the bottom of the screen, mimicking modern messaging apps.
* **Natural Language Parsing (NLP)**:
  * Multilingual tolerance (English & Cantonese colloquialisms):
    * `Pick up parcel tomorrow after work` ➡️ Automatically schedules into tomorrow's list.
    * `File taxes before Nov 15 !critical` ➡️ Promotes to the top Critical Deadlines card.
* **One-Tap Assignee Toggle**: A simple tap toggles whether the task is for oneself or noted for a partner/roommate before hitting Enter.

---

## 3. Responsive UX & Tactile Experience

| Platform | Layout Form Factor | Key Interaction Details |
| :--- | :--- | :--- |
| **📱 Mobile PWA** | Single-column vertical stream; full-screen experience when added to Home Screen. | • Bottom thumb-friendly quick input bar.<br>• Subtle, satisfying haptic feedback upon task completion.<br>• Dark-mode optimized for late-night viewing. |
| **💻 Desktop Web** | Multi-column Bento Grid dashboard. | • Side-by-side member columns.<br>• Keyboard power shortcuts: Press `C` to summon input, `Enter` to commit.<br>• Clean, information-dense layout reminiscent of Linear or Things 3. |

---

## 4. Strict Notification Protocol

| Event | Notification Sent? | Timing & Content |
| :--- | :---: | :--- |
| **🚨 Critical Hard Deadline** | **✅ YES** | D-3, D-1, and morning of due date: `⚠️ [Critical] Tax return due in 2 days` |
| **📝 Proxy Task Captured** | **✅ YES** | Instant subtle ping when a member adds a task for you: `📝 [Partner] noted for you: Pick up prescription` |
| **☀️ Daily Morning Digest (Optional)** | **✅ YES (Silent)** | Single morning summary at 8:30 AM. **Silent if no critical deadlines or urgent tasks exist.** |
| **Routine Task Completed** | **❌ NO** | Updates silently via WebSocket without buzzing the partner's phone. |
| **Routine Task Incomplete** | **❌ NO** | Strictly zero "overdue" shame notifications; items roll over automatically. |

---

## 5. Domain Data Model

```
[Space / Workspace] (Household or Personal Workspace)
    ├── [Members] (1 to N: id, name, avatar, role)
    └── [Tasks]
          ├── id: uuid
          ├── space_id: uuid (foreign key)
          ├── title: string
          ├── note: text? (optional contextual note/dimensions)
          ├── type: "critical" | "daily"
          ├── due_date: timestamp? (required for critical tasks)
          ├── assigned_to: uuid (foreign key -> members.id)
          ├── created_by: uuid (foreign key -> members.id, for proxy attribution)
          ├── status: "pending" | "completed"
          ├── created_at: timestamp
          └── updated_at: timestamp
```

---

## 6. Technical Architecture Specification
*(Validated across three rounds of adversarial architectural review for aesthetic excellence, low maintenance, and long-term durability on a home Tiny PC)*

```
┌─────────────────────────────────────────────────────────────┐
│ 📱 Frontend: Vite + React 19 + TypeScript + Tailwind CSS     │
│    UI Library: shadcn/ui + Lucide Icons                     │
├─────────────────────────────────────────────────────────────┤
│ • UI/UX: Native-grade smoothness, Bento Grid, Dark Mode      │
│ • State: TanStack Query (React Query) + IndexedDB Cache      │
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

## 7. Day-1 Engineering Reliability Rules

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
