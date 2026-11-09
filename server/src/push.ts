import webpush from "web-push";
import { eq, and, isNull, lt, or } from "drizzle-orm";
import { db } from "./db/index.js";
import { spaces, pushSubscriptions, tasks, criticalAlertDeliveries } from "./db/schema.js";
import { criticalAlertForToday } from "./alertSchedule.js";
import { PUSH_TIMEOUT_MS, pushFailureCode, resolveVapidSubject } from "./pushDelivery.js";

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
  targetMemberId?: string,
  targetEndpoint?: string
): Promise<{ sent: number; failed: number; expired: number; rejectedStatusCodes: number[]; failureCodes: string[] }> {
  const keys = await ensureSpaceVapidKeys(spaceId);
  const subject = resolveVapidSubject(process.env.VAPID_SUBJECT);

  const memberSubs = targetMemberId
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

  const subs = targetEndpoint ? memberSubs.filter(sub => sub.endpoint === targetEndpoint) : memberSubs;
  let sent = 0;
  let failed = 0;
  let expired = 0;
  const rejectedStatusCodes = new Set<number>();
  const failureCodes = new Set<string>();

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
          message,
          { timeout: PUSH_TIMEOUT_MS, vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey } }
        );
        sent += 1;
      } catch (err: any) {
        failed += 1;
        const failureCode = pushFailureCode(err);
        if (failureCode) failureCodes.add(failureCode);
        if (typeof err?.statusCode === "number") rejectedStatusCodes.add(err.statusCode);
        // Clean up expired or unsubscribed endpoints
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expired += 1;
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error("Web Push delivery error:", err?.message || err);
        }
      }
    })
  );

  return { sent, failed, expired, rejectedStatusCodes: [...rejectedStatusCodes], failureCodes: [...failureCodes] };
}

/**
 * Checks pending critical hard deadlines and fires D-3, D-1, and Due-Date (D-0) alerts after 9:00 AM
 * (per PRD Section 2 Module 1 & Section 4 Strict Notification Protocol).
 */
export async function evaluateCriticalDeadlineAlerts() {
  const now = new Date();
  const timeZone = process.env.ALERT_TIME_ZONE || "America/Toronto";

  const pendingCriticals = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.type, "critical"), eq(tasks.status, "pending")));

  for (const task of pendingCriticals) {
    if (!task.dueDate) continue;
    const alert = criticalAlertForToday(now, task.dueDate, timeZone);
    if (alert) {
      const { alertDate: todayKey, daysLeft } = alert;
      await db.insert(criticalAlertDeliveries)
        .values({ taskId: task.id, alertDate: todayKey })
        .onConflictDoNothing();

      // A claimed row survives restarts. An abandoned claim becomes retryable after ten minutes.
      const claimTime = new Date();
      const [claimed] = await db.update(criticalAlertDeliveries)
        .set({ claimedAt: claimTime })
        .where(and(
          eq(criticalAlertDeliveries.taskId, task.id),
          eq(criticalAlertDeliveries.alertDate, todayKey),
          isNull(criticalAlertDeliveries.sentAt),
          or(
            isNull(criticalAlertDeliveries.claimedAt),
            lt(criticalAlertDeliveries.claimedAt, new Date(claimTime.getTime() - 10 * 60 * 1000))
          )
        ))
        .returning();
      if (!claimed) continue;

      const whenLabel =
        daysLeft === 0
          ? "due today"
          : daysLeft === 1
          ? "due tomorrow (1 day left)"
          : "due in 3 days";

      try {
        const result = await sendPushNotification(
          task.spaceId,
          {
            title: `⚠️ [Critical] ${task.title}`,
            body: `${task.title} is ${whenLabel}.${task.note ? ` (${task.note})` : ""}`,
            tag: `critical-${task.id}-${todayKey}`,
            url: "/",
          },
          task.assignedTo
        );
        if (result.failed > 0) {
          throw new Error(`${result.failed} push delivery attempt(s) failed`);
        }
        await db.update(criticalAlertDeliveries)
          .set({ sentAt: new Date(), claimedAt: null })
          .where(eq(criticalAlertDeliveries.id, claimed.id));
      } catch (error) {
        await db.update(criticalAlertDeliveries)
          .set({ claimedAt: null })
          .where(and(eq(criticalAlertDeliveries.id, claimed.id), isNull(criticalAlertDeliveries.sentAt)));
        console.error(`Critical alert delivery failed for task ${task.id}:`, error);
      }
    }
  }
}
