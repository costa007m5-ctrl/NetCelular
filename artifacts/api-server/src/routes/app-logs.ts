import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appLogsTable, insertAppLogSchema } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/app-logs", async (req, res) => {
  try {
    const body = req.body;
    const entries = Array.isArray(body) ? body : [body];
    const parsed = entries.map((e) => insertAppLogSchema.parse(e));
    if (parsed.length === 0) { res.json({ ok: true, inserted: 0 }); return; }
    await db.insert(appLogsTable).values(parsed);
    res.json({ ok: true, inserted: parsed.length });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "app-logs: insert failed");
    res.status(400).json({ error: e?.message ?? "Invalid log entry" });
  }
});

router.get("/app-logs", async (req, res) => {
  try {
    const level = req.query["level"] as string | undefined;
    const limit = Math.min(500, parseInt((req.query["limit"] as string) || "300", 10));
    const conditions = [];
    if (level && level !== "all") {
      conditions.push(eq(appLogsTable.level, level as "info" | "warn" | "error"));
    }
    const logs = await db
      .select()
      .from(appLogsTable)
      .where(conditions.length ? and(...(conditions as [any, ...any[]])) : undefined)
      .orderBy(desc(appLogsTable.createdAt))
      .limit(limit);
    res.json({ logs });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch logs" });
  }
});

router.delete("/app-logs", async (req, res) => {
  try {
    await db.delete(appLogsTable);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to clear logs" });
  }
});

export default router;
