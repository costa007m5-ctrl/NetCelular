/**
 * app-logger.ts
 * Lightweight app event logger — sends to /api/app-logs, persists to AsyncStorage on failure.
 * Use appLog.info/warn/error throughout the app to capture events for the admin Logs tab.
 */

import { getApiBase } from "@/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

const MAX_QUEUE = 100;
const STORAGE_KEY = "@netplay/app_logs_queue";
let memQueue: LogEntry[] = [];
let isFlushing = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

function getDevice(): string {
  try {
    const { Platform } = require("react-native");
    return `${Platform.OS}/${Platform.Version ?? "?"}`;
  } catch {
    return "unknown";
  }
}

async function loadFromStorage(): Promise<LogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LogEntry[];
  } catch {
    return [];
  }
}

async function saveToStorage(entries: LogEntry[]): Promise<void> {
  try {
    if (entries.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_QUEUE)));
    }
  } catch {}
}

async function flush(): Promise<void> {
  if (isFlushing) return;

  const stored = await loadFromStorage();
  const combined = [...stored, ...memQueue];
  memQueue = [];
  if (combined.length === 0) return;

  isFlushing = true;
  const batch = combined.slice(0, 30);
  const remaining = combined.slice(30);

  try {
    const base = getApiBase();
    if (!base) {
      await saveToStorage(combined);
      isFlushing = false;
      return;
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${base}/app-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (res.ok) {
      await saveToStorage(remaining);
    } else {
      await saveToStorage([...batch, ...remaining]);
    }
  } catch {
    await saveToStorage([...batch, ...remaining]);
  } finally {
    isFlushing = false;
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flush();
  }, 500);
}

function startPeriodicFlush(): void {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    flush().catch(() => {});
  }, 15000);
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
  memQueue.push(entry);
  if (memQueue.length > MAX_QUEUE) memQueue.splice(0, memQueue.length - MAX_QUEUE);
  scheduleFlush();
  startPeriodicFlush();
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
