/**
 * app-logger.ts
 * Lightweight app event logger — sends to /api/app-logs, queues in memory on failure.
 * Use appLog.info/warn/error throughout the app to capture events for the admin Logs tab.
 */

import { getApiBase } from "@/lib/api";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
  device?: string;
  appVersion?: string;
}

const MAX_QUEUE = 50;
const queue: LogEntry[] = [];
let isFlushing = false;

function getDevice(): string {
  try {
    const { Platform } = require("react-native");
    return `${Platform.OS}/${Platform.Version ?? "?"}`;
  } catch {
    return "unknown";
  }
}

async function flush(): Promise<void> {
  if (isFlushing || queue.length === 0) return;
  isFlushing = true;
  const batch = queue.splice(0, 20);
  try {
    const base = getApiBase();
    if (!base) { queue.unshift(...batch); return; }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${base}/app-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) queue.unshift(...batch);
  } catch {
    queue.unshift(...batch);
  } finally {
    isFlushing = false;
  }
}

function log(level: LogLevel, category: string, message: string, details?: Record<string, unknown>, userId?: string): void {
  const entry: LogEntry = {
    level,
    category,
    message,
    device: getDevice(),
    ...(details ? { details } : {}),
    ...(userId ? { userId } : {}),
  };
  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  setTimeout(flush, 300);
}

export const appLog = {
  info: (category: string, message: string, details?: Record<string, unknown>, userId?: string) =>
    log("info", category, message, details, userId),
  warn: (category: string, message: string, details?: Record<string, unknown>, userId?: string) =>
    log("warn", category, message, details, userId),
  error: (category: string, message: string, details?: Record<string, unknown>, userId?: string) =>
    log("error", category, message, details, userId),
  flush,
};
