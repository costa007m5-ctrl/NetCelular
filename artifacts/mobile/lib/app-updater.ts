import { Platform } from "react-native";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "error"
  | "unavailable";

export type UpdateState = {
  status: UpdateStatus;
  error?: string;
};

type Listener = (state: UpdateState) => void;

let _state: UpdateState = { status: "idle" };
const _listeners = new Set<Listener>();
let _checkInterval: ReturnType<typeof setInterval> | null = null;
let _lastCheck = 0;

function setState(next: UpdateState) {
  _state = next;
  _listeners.forEach((fn) => fn(next));
}

export function getUpdateState(): UpdateState {
  return _state;
}

export function subscribeToUpdateState(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function checkAndApplyUpdate(
  options: { silent?: boolean; forceReload?: boolean } = {}
): Promise<void> {
  if (Platform.OS === "web") {
    setState({ status: "unavailable" });
    return;
  }

  const now = Date.now();
  // Throttle: skip if checked less than 5 minutes ago
  if (!options.forceReload && now - _lastCheck < 5 * 60 * 1000 && _state.status !== "idle") {
    return;
  }

  try {
    const Updates = require("expo-updates");

    if (__DEV__) {
      setState({ status: "unavailable" });
      return;
    }

    _lastCheck = now;
    setState({ status: "checking" });

    const result = await Updates.checkForUpdateAsync();

    if (!result.isAvailable) {
      setState({ status: "up-to-date" });
      return;
    }

    setState({ status: "downloading" });
    await Updates.fetchUpdateAsync();

    if (options.forceReload) {
      // Silent reload: app just launched, apply immediately without asking
      try {
        await Updates.reloadAsync();
      } catch {
        setState({ status: "ready" });
      }
    } else {
      // Show banner: user is actively using the app
      setState({ status: "ready" });
    }
  } catch (e: any) {
    const reason: string = e?.message ?? String(e);
    console.warn("[Update] Erro:", reason);
    setState({ status: "error", error: reason });
  }
}

export async function applyUpdate(): Promise<void> {
  try {
    const Updates = require("expo-updates");
    await Updates.reloadAsync();
  } catch {}
}

/**
 * Start periodic background checks every `intervalMs` ms (default 30 min).
 * Call once at app startup. Safe to call multiple times — only one timer runs.
 */
export function startPeriodicUpdateChecks(intervalMs = 30 * 60 * 1000): void {
  if (_checkInterval) return;
  _checkInterval = setInterval(() => {
    checkAndApplyUpdate({ silent: true }).catch(() => {});
  }, intervalMs);
}

export function stopPeriodicUpdateChecks(): void {
  if (_checkInterval) {
    clearInterval(_checkInterval);
    _checkInterval = null;
  }
}

/** @deprecated use checkAndApplyUpdate */
export async function checkAndPromptUpdate(_silent = true) {
  await checkAndApplyUpdate({ silent: true });
}
