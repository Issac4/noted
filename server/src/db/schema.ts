import { pgTable, uuid, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const taskTypeEnum = pgEnum("task_type", ["critical", "daily"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "completed"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);

export const spaces = pgTable("spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  passcode: text("passcode"),
  vapidPublicKey: text("vapid_public_key"),
  vapidPrivateKey: text("vapid_private_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const members = pgTable("members", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  avatar: text("avatar").notNull().default("👤"),
  role: memberRoleEnum("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  note: text("note"),
  type: taskTypeEnum("type").notNull().default("daily"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  assignedTo: uuid("assigned_to")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  status: taskStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const criticalAlertDeliveries = pgTable("critical_alert_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  alertDate: text("alert_date").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [uniqueIndex("critical_alert_task_date_unique").on(table.taskId, table.alertDate)]);

export const spacesRelations = relations(spaces, ({ many }) => ({
  members: many(members),
  tasks: many(tasks),
  pushSubscriptions: many(pushSubscriptions),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  space: one(spaces, {
    fields: [members.spaceId],
    references: [spaces.id],
  }),
  assignedTasks: many(tasks, { relationName: "assignedTasks" }),
  createdTasks: many(tasks, { relationName: "createdTasks" }),
  pushSubscriptions: many(pushSubscriptions),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  space: one(spaces, {
    fields: [tasks.spaceId],
    references: [spaces.id],
  }),
  assignee: one(members, {
    fields: [tasks.assignedTo],
    references: [members.id],
    relationName: "assignedTasks",
  }),
  creator: one(members, {
    fields: [tasks.createdBy],
    references: [members.id],
    relationName: "createdTasks",
  }),
}));

export const criticalAlertDeliveriesRelations = relations(criticalAlertDeliveries, ({ one }) => ({
  task: one(tasks, {
    fields: [criticalAlertDeliveries.taskId],
    references: [tasks.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  space: one(spaces, {
    fields: [pushSubscriptions.spaceId],
    references: [spaces.id],
  }),
  member: one(members, {
    fields: [pushSubscriptions.memberId],
    references: [members.id],
  }),
}));
