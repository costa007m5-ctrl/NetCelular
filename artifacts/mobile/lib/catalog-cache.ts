import AsyncStorage from "@react-native-async-storage/async-storage";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface CacheEntry {
  raw: any[];
  ts: number;
}

function key(type: string) {
  return `flix2_catalog_v1_${type}`;
}

export async function getCached(type: string): Promise<any[] | null> {
  try {
    const val = await AsyncStorage.getItem(key(type));
    if (!val) return null;
    const entry: CacheEntry = JSON.parse(val);
    if (Date.now() - entry.ts > TTL_MS) return null;
    return entry.raw;
  } catch {
    return null;
  }
}

export async function setCached(type: string, raw: any[]): Promise<void> {
  try {
    const entry: CacheEntry = { raw, ts: Date.now() };
    await AsyncStorage.setItem(key(type), JSON.stringify(entry));
  } catch {}
}

export async function clearCatalogCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      key("movies"),
      key("series"),
      key("animes"),
    ]);
  } catch {}
}

export function isFresh(type: string): Promise<boolean> {
  return getCached(type).then((v) => v !== null);
}
