import webpush from "web-push";
import { eq, and } from "drizzle-orm";
import { db } from "./db/index.js";
import { spaces, pushSubscriptions, tasks, members } from "./db/schema.js";

export interface PushNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

/**
 * Ensures the given space has a valid VAPID keypair generated and persisted in PostgreSQL.
 */
export async function ensureSpaceVapidKeys(spaceId: string): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  if (!space) {
    throw new Error("Space not found");
  }

  if (space.vapidPublicKey && space.vapidPrivateKey) {
    return {
      publicKey: space.vapidPublicKey,
      privateKey: space.vapidPrivateKey,
    };
  }

  const generated = webpush.generateVAPIDKeys();
  await db
    .update(spaces)
    .set({
      vapidPublicKey: generated.publicKey,
      vapidPrivateKey: generated.privateKey,
      updatedAt: new Date(),
    })
    .where(eq(spaces.id, spaceId));

  console.log("🔑 Generated and persisted new VAPID keypair for space", spaceId);
  return generated;
}

/**
 * Sends a Web Push notification to all active device subscriptions for a specific member
 * (or all members in the space if memberId is omitted).
 * Automatically prunes expired (404/410) subscriptions.
 */
export async function sendPushNotification(
  spaceId: string,
  payload: PushNotificationPayload,
  targetMemberId?: string
): Promise<{ sent: number; failed: number }> {
  const keys = await ensureSpaceVapidKeys(spaceId);
  const contactEmail = process.env.VAPID_SUBJECT || "mailto:admin@noted.local";

  webpush.setVapidDetails(contactEmail, keys.publicKey, keys.privateKey);

  const subs = targetMemberId
    ? await db
        .select()
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.spaceId, spaceId),
            eq(pushSubscriptions.memberId, targetMemberId)
          )
        )
    : await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.spaceId, spaceId));

  let sent = 0;
  let failed = 0;

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || "noted-notification",
    url: payload.url || "/",
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          message
        );
        sent += 1;
      } catch (err: any) {
        failed += 1;
        // Clean up expired or unsubscribed endpoints
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error("Web Push delivery error:", err?.message || err);
        }
      }
    })
  );

  return { sent, failed };
}

// Track which critical task alerts have already fired today (`${taskId}:${dateStr}`)
const firedCriticalAlerts = new Set<string>();

/**
 * Checks pending critical hard deadlines and fires D-3, D-1, and Due-Date (D-0) alerts at 9:00 AM
 * (per PRD Section 2 Module 1 & Section 4 Strict Notification Protocol).
 */
export async function evaluateCriticalDeadlineAlerts() {
  const now = new Date();
  // Fire during the 9:00 AM hour local server time
  if (now.getHours() !== 9) {
    return;
  }

  const todayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const pendingCriticals = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.type, "critical"), eq(tasks.status, "pending")));

  for (const task of pendingCriticals) {
    if (!task.dueDate) continue;

    const dedupeKey = `${task.id}:${todayKey}`;
    if (firedCriticalAlerts.has(dedupeKey)) continue;

    const due = new Date(task.dueDate);
    const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const daysLeft = Math.round((startOfDue - startOfToday) / (1000 * 60 * 60 * 24));

    // Only trigger at D-3, D-1, or D-0 (morning of due date)
    if (daysLeft === 3 || daysLeft === 1 || daysLeft === 0) {
      firedCriticalAlerts.add(dedupeKey);

      const whenLabel =
        daysLeft === 0
          ? "due today"
          : daysLeft === 1
          ? "due tomorrow (1 day left)"
          : "due in 3 days";

      await sendPushNotification(
        task.spaceId,
        {
          title: `⚠️ [Critical] ${task.title}`,
          body: `${task.title} is ${whenLabel}.${task.note ? ` (${task.note})` : ""}`,
          tag: `critical-${task.id}-${todayKey}`,
          url: "/",
        },
        task.assignedTo
      );
    }
  }
}
