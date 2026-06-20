import AsyncStorage from "@react-native-async-storage/async-storage";

const SHORTS_SHARES_KEY = "netplay_shorts_shares_v1";
const MAX_SHARES = 30;

export interface ShortsShareItem {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: number;
  rating: number;
  genre: string;
  overview: string;
  sharedAt: number; // unix ms
  shareCount: number; // quantas vezes foi compartilhado
}

export async function recordShortsShare(item: {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: number;
  rating: number;
  genre: string;
  overview: string;
}): Promise<void> {
  if (item.tmdbId === 0) return;
  try {
    const existing = await loadShortsShares();
    const prev = existing.find((s) => s.id === item.id);
    const entry: ShortsShareItem = {
      ...item,
      sharedAt: Date.now(),
      shareCount: (prev?.shareCount ?? 0) + 1,
    };
    const filtered = existing.filter((s) => s.id !== item.id);
    const updated = [entry, ...filtered].slice(0, MAX_SHARES);
    await AsyncStorage.setItem(SHORTS_SHARES_KEY, JSON.stringify(updated));
  } catch {}
}

export async function loadShortsShares(): Promise<ShortsShareItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SHORTS_SHARES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShortsShareItem[];
  } catch {
    return [];
  }
}

export async function clearShortsShares(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SHORTS_SHARES_KEY);
  } catch {}
}

export function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Agora mesmo";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ontem";
  if (d < 7) return `${d} dias atrás`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} sem. atrás`;
  const mo = Math.floor(d / 30);
  return `${mo} mes${mo > 1 ? "es" : ""} atrás`;
}
