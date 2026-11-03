import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const taskTypeEnum = pgEnum("task_type", ["critical", "daily"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "completed"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);

export const spaces = pgTable("spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  passcode: text("passcode"),
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

export const spacesRelations = relations(spaces, ({ many }) => ({
  members: many(members),
  tasks: many(tasks),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  space: one(spaces, {
    fields: [members.spaceId],
    references: [spaces.id],
  }),
  assignedTasks: many(tasks, { relationName: "assignedTasks" }),
  createdTasks: many(tasks, { relationName: "createdTasks" }),
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
