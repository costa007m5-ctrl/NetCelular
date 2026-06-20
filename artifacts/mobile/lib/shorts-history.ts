import AsyncStorage from "@react-native-async-storage/async-storage";

const SHORTS_HISTORY_KEY = "netplay_shorts_history_v1";
const MAX_HISTORY = 20;

export interface ShortsHistoryItem {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  progress: number; // 0..1 — visual progress bar value
  watchedAt: number; // unix ms
}

export async function recordShortsWatch(
  item: { id: string; tmdbId: number; type: "movie" | "tv"; title: string; poster: string | null },
  progress: number
): Promise<void> {
  if (progress < 0.05 || item.tmdbId === 0) return;
  try {
    const existing = await loadShortsHistory();
    const filtered = existing.filter((h) => h.id !== item.id);
    const entry: ShortsHistoryItem = { ...item, progress, watchedAt: Date.now() };
    const updated = [entry, ...filtered].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(SHORTS_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

export async function loadShortsHistory(): Promise<ShortsHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SHORTS_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShortsHistoryItem[];
  } catch {
    return [];
  }
}

export async function clearShortsHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SHORTS_HISTORY_KEY);
  } catch {}
}
