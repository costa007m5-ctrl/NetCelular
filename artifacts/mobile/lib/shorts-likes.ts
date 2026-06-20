import AsyncStorage from "@react-native-async-storage/async-storage";

const SHORTS_LIKES_KEY = "netplay_shorts_likes_v1";
const MAX_LIKES = 50;

export interface ShortsLikeEntry {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  likedAt: number;
}

export async function toggleShortsLike(
  item: { id: string; tmdbId: number; type: "movie" | "tv"; title: string; poster: string | null },
  isNowLiked: boolean
): Promise<void> {
  if (item.tmdbId === 0) return;
  try {
    const existing = await loadShortsLikes();
    if (isNowLiked) {
      const filtered = existing.filter((e) => e.id !== item.id);
      const entry: ShortsLikeEntry = { ...item, likedAt: Date.now() };
      const updated = [entry, ...filtered].slice(0, MAX_LIKES);
      await AsyncStorage.setItem(SHORTS_LIKES_KEY, JSON.stringify(updated));
    } else {
      const updated = existing.filter((e) => e.id !== item.id);
      await AsyncStorage.setItem(SHORTS_LIKES_KEY, JSON.stringify(updated));
    }
  } catch {}
}

export async function loadShortsLikes(): Promise<ShortsLikeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(SHORTS_LIKES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ShortsLikeEntry[];
  } catch {
    return [];
  }
}

export async function isShortsLiked(id: string): Promise<boolean> {
  const likes = await loadShortsLikes();
  return likes.some((e) => e.id === id);
}
