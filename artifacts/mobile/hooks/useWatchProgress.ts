import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_KEY_PREFIX = "netplay_progress_v2_";
const INDEX_KEY = "netplay_progress_index_v2";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WatchEntry {
  contentId: string;      // "<type>_<tmdbId>"  e.g. "movie_550"
  tmdbId: string;
  type: "movie" | "tv";
  title: string;
  posterPath: string;
  backdropPath: string;
  progress: number;       // 0–1 ratio
  positionMs: number;
  durationMs: number;
  season?: number;
  episode?: number;
  updatedAt: number;
}

// ─── Static helpers (use these in non-hook contexts like the player) ──────────

/** Save a watch entry to AsyncStorage (always works, no auth needed) */
export async function saveLocalProgress(
  entry: Omit<WatchEntry, "updatedAt">
): Promise<void> {
  try {
    const full: WatchEntry = { ...entry, updatedAt: Date.now() };
    await AsyncStorage.setItem(
      PROGRESS_KEY_PREFIX + entry.contentId,
      JSON.stringify(full)
    );
    // Keep an ordered index of content IDs (most recent first)
    const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
    const ids: string[] = rawIdx ? JSON.parse(rawIdx) : [];
    const next = [
      entry.contentId,
      ...ids.filter((id) => id !== entry.contentId),
    ].slice(0, 50);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch {}
}

/** Return all saved progress entries sorted by most recently watched.
 *  Filters out entries below 2 % or above 95 % (not meaningful). */
export async function getAllLocalProgress(): Promise<WatchEntry[]> {
  try {
    const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
    if (!rawIdx) return [];
    const ids: string[] = JSON.parse(rawIdx);
    const entries = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await AsyncStorage.getItem(PROGRESS_KEY_PREFIX + id);
          return r ? (JSON.parse(r) as WatchEntry) : null;
        } catch {
          return null;
        }
      })
    );
    return entries
      .filter(
        (e): e is WatchEntry =>
          e !== null && e.progress > 0.02 && e.progress < 0.95
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Fetch progress for a single content item */
export async function getLocalProgress(
  contentId: string
): Promise<WatchEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY_PREFIX + contentId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Remove a single item's progress and update the index */
export async function clearLocalProgress(contentId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY_PREFIX + contentId);
    const rawIdx = await AsyncStorage.getItem(INDEX_KEY);
    if (rawIdx) {
      const ids: string[] = JSON.parse(rawIdx);
      await AsyncStorage.setItem(
        INDEX_KEY,
        JSON.stringify(ids.filter((id) => id !== contentId))
      );
    }
  } catch {}
}

// ─── Per-item hook (used in detail screen, etc.) ──────────────────────────────

interface LegacyEntry {
  contentId: string;
  progress: number;
  position: number;
  duration: number;
  updatedAt: number;
  season?: number;
  episode?: number;
}

/** Hook to manage watch progress for a specific content item (legacy compat) */
export function useWatchProgress(contentId: string) {
  const [entry, setEntry] = useState<LegacyEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(PROGRESS_KEY_PREFIX + contentId)
      .then((raw) => setEntry(raw ? JSON.parse(raw) : null))
      .finally(() => setLoading(false));
  }, [contentId]);

  const save = useCallback(
    async (
      position: number,
      duration: number,
      season?: number,
      episode?: number
    ) => {
      const progress = duration > 0 ? position / duration : 0;
      const updated: LegacyEntry = {
        contentId,
        progress,
        position,
        duration,
        updatedAt: Date.now(),
        season,
        episode,
      };
      setEntry(updated);
      try {
        await AsyncStorage.setItem(
          PROGRESS_KEY_PREFIX + contentId,
          JSON.stringify(updated)
        );
      } catch {}
    },
    [contentId]
  );

  const clear = useCallback(async () => {
    setEntry(null);
    await clearLocalProgress(contentId);
  }, [contentId]);

  return { entry, loading, save, clear };
}
