import { pgTable, serial, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appLogsTable = pgTable(
  "app_logs",
  {
    id: serial("id").primaryKey(),
    level: text("level").notNull().$type<"info" | "warn" | "error">(),
    category: text("category").notNull().default("app"),
    message: text("message").notNull(),
    details: jsonb("details"),
    userId: text("user_id"),
    device: text("device"),
    appVersion: text("app_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("app_logs_level_idx").on(t.level),
    index("app_logs_created_at_idx").on(t.createdAt),
  ]
);

export const insertAppLogSchema = createInsertSchema(appLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAppLog = z.infer<typeof insertAppLogSchema>;
export type AppLog = typeof appLogsTable.$inferSelect;
