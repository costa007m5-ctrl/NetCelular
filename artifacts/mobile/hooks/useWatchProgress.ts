import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_KEY_PREFIX = "netplay_progress_v2_";

interface WatchProgressEntry {
  contentId: string;
  progress: number;
  position: number;
  duration: number;
  updatedAt: number;
  season?: number;
  episode?: number;
}

async function getProgress(contentId: string): Promise<WatchProgressEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY_PREFIX + contentId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveProgress(entry: WatchProgressEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PROGRESS_KEY_PREFIX + entry.contentId,
      JSON.stringify({ ...entry, updatedAt: Date.now() })
    );
  } catch {}
}

async function clearProgress(contentId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY_PREFIX + contentId);
  } catch {}
}

/** Hook to manage watch progress for a specific content item */
export function useWatchProgress(contentId: string) {
  const [entry, setEntry] = useState<WatchProgressEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProgress(contentId)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [contentId]);

  const save = useCallback(
    async (position: number, duration: number, season?: number, episode?: number) => {
      const progress = duration > 0 ? position / duration : 0;
      const updated: WatchProgressEntry = {
        contentId,
        progress,
        position,
        duration,
        updatedAt: Date.now(),
        season,
        episode,
      };
      setEntry(updated);
      await saveProgress(updated);
    },
    [contentId]
  );

  const clear = useCallback(async () => {
    setEntry(null);
    await clearProgress(contentId);
  }, [contentId]);

  return { entry, loading, save, clear };
}
