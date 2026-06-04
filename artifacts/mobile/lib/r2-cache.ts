import AsyncStorage from "@react-native-async-storage/async-storage";

const SIGNED_URL_TTL = 50 * 60 * 1000;
const REGISTRY_TTL = 30 * 60 * 1000;
const EPISODES_TTL = 60 * 60 * 1000;
const TERABOX_URL_TTL = 22 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

async function cGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

async function cSet<T>(key: string, data: T, ttl: number): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttl };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {}
}

export async function getCachedSignedUrl(r2Key: string): Promise<string | null> {
  return cGet<string>(`r2_url:${r2Key}`);
}

export async function setCachedSignedUrl(r2Key: string, url: string): Promise<void> {
  await cSet<string>(`r2_url:${r2Key}`, url, SIGNED_URL_TTL);
}

export async function getCachedTeraboxUrl(itemId: string): Promise<string | null> {
  return cGet<string>(`tera_url:${itemId}`);
}

export async function setCachedTeraboxUrl(itemId: string, url: string): Promise<void> {
  await cSet<string>(`tera_url:${itemId}`, url, TERABOX_URL_TTL);
}

export async function clearCachedTeraboxUrl(itemId: string): Promise<void> {
  try { await AsyncStorage.removeItem(`tera_url:${itemId}`); } catch {}
}

export async function getCachedEpisodes(tmdbId: number, season: number): Promise<any[] | null> {
  return cGet<any[]>(`tmdb_eps:${tmdbId}:${season}`);
}

export async function setCachedEpisodes(tmdbId: number, season: number, data: any[]): Promise<void> {
  await cSet<any[]>(`tmdb_eps:${tmdbId}:${season}`, data, EPISODES_TTL);
}

export async function getCachedRegistry(): Promise<any | null> {
  return cGet<any>("r2_registry_v2");
}

export async function setCachedRegistry(data: any): Promise<void> {
  await cSet<any>("r2_registry_v2", data, REGISTRY_TTL);
}

export async function clearPlayerCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const playerKeys = keys.filter(
      (k) => k.startsWith("r2_url:") || k.startsWith("tera_url:") || k.startsWith("tmdb_eps:")
    );
    if (playerKeys.length > 0) await AsyncStorage.multiRemove(playerKeys);
  } catch {}
}
