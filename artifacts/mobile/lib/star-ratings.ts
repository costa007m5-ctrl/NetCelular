import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "./supabase";

const KEY = (userId: string, type: string, tmdbId: number) =>
  `@netplay:stars:${userId}:${type}:${tmdbId}`;

export async function getStarRating(
  userId: string,
  tmdbId: number,
  type: "movie" | "series",
): Promise<number> {
  if (!userId || !tmdbId) return 0;
  try {
    const val = await AsyncStorage.getItem(KEY(userId, type, tmdbId));
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export async function setStarRating(
  userId: string,
  tmdbId: number,
  type: "movie" | "series",
  stars: number,
): Promise<void> {
  if (!userId || !tmdbId) return;
  const k = KEY(userId, type, tmdbId);
  try {
    if (stars === 0) {
      await AsyncStorage.removeItem(k);
    } else {
      await AsyncStorage.setItem(k, String(stars));
    }
    const dbType: "movie" | "tv" = type === "series" ? "tv" : "movie";
    if (stars >= 3) {
      db.ratings.set(userId, tmdbId, dbType, true).catch(() => {});
    } else if (stars > 0) {
      db.ratings.set(userId, tmdbId, dbType, false).catch(() => {});
    }
  } catch {}
}

export async function bulkGetStarRatings(
  userId: string,
  items: Array<{ tmdbId?: number; type: "movie" | "series" }>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!userId) return map;
  try {
    const meta: Array<{ key: string; tmdbId: number; type: string }> = [];
    for (const item of items) {
      if (!item.tmdbId) continue;
      meta.push({
        key: KEY(userId, item.type, item.tmdbId),
        tmdbId: item.tmdbId,
        type: item.type,
      });
    }
    if (meta.length === 0) return map;
    const pairs = await AsyncStorage.multiGet(meta.map((m) => m.key));
    for (const [k, val] of pairs) {
      if (!val) continue;
      const m = meta.find((x) => x.key === k);
      if (m) map.set(`${m.type}:${m.tmdbId}`, parseInt(val, 10));
    }
  } catch {}
  return map;
}
