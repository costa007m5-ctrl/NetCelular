import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendContentAddedNotification } from "@/lib/notifications";

const KEY = "netplay_catalog_watch_v1";

export interface CatalogWatchItem {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  posterPath?: string;
  addedAt: string;
}

export async function getCatalogWatchList(): Promise<CatalogWatchItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addCatalogWatch(item: Omit<CatalogWatchItem, "addedAt">): Promise<void> {
  try {
    const list = await getCatalogWatchList();
    const exists = list.some((i) => i.tmdbId === item.tmdbId && i.type === item.type);
    if (exists) return;
    const newItem: CatalogWatchItem = { ...item, addedAt: new Date().toISOString() };
    await AsyncStorage.setItem(KEY, JSON.stringify([...list, newItem]));
  } catch {}
}

export async function removeCatalogWatch(tmdbId: number, type: string): Promise<void> {
  try {
    const list = await getCatalogWatchList();
    const updated = list.filter((i) => !(i.tmdbId === tmdbId && i.type === type));
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  } catch {}
}

export async function isWatchingCatalog(tmdbId: number, type: string): Promise<boolean> {
  try {
    const list = await getCatalogWatchList();
    return list.some((i) => i.tmdbId === tmdbId && i.type === type);
  } catch {
    return false;
  }
}

export async function checkCatalogWatchAndNotify(availableTmdbIds: Set<number>): Promise<void> {
  try {
    const list = await getCatalogWatchList();
    if (list.length === 0) return;
    const found = list.filter((i) => availableTmdbIds.has(i.tmdbId));
    for (const item of found) {
      const posterUrl = item.posterPath
        ? `https://image.tmdb.org/t/p/w342${item.posterPath}`
        : undefined;
      await sendContentAddedNotification(item.title, posterUrl);
      await removeCatalogWatch(item.tmdbId, item.type);
    }
  } catch {}
}
