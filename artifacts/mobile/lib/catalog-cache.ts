import AsyncStorage from "@react-native-async-storage/async-storage";

// TTL normal (cache de 1-2 páginas da home) — 2 horas
const TTL_MS = 2 * 60 * 60 * 1000;
// TTL estendido para catálogo completo (prefetch background) — 6 horas
export const FULL_TTL_MS = 6 * 60 * 60 * 1000;

interface CacheEntry {
  raw:    any[];
  ts:     number;
  full?:  boolean;  // true = veio do prefetch completo (catalog-full)
}

function key(type: string) {
  return `flix2_catalog_v2_${type}`;
}

export async function getCached(type: string): Promise<any[] | null> {
  try {
    const val = await AsyncStorage.getItem(key(type));
    if (!val) return null;
    const entry: CacheEntry = JSON.parse(val);
    const ttl = entry.full ? FULL_TTL_MS : TTL_MS;
    if (Date.now() - entry.ts > ttl) return null;
    return entry.raw;
  } catch {
    return null;
  }
}

/** Salva com TTL padrão (2h) — usado para fetches de 1–2 páginas. */
export async function setCached(type: string, raw: any[]): Promise<void> {
  try {
    const entry: CacheEntry = { raw, ts: Date.now(), full: false };
    await AsyncStorage.setItem(key(type), JSON.stringify(entry));
  } catch {}
}

/**
 * Salva com TTL estendido (6h) e marca como catálogo completo.
 * Usado pelo prefetch em segundo plano (catalog-full).
 */
export async function setCachedFull(type: string, raw: any[]): Promise<void> {
  try {
    const entry: CacheEntry = { raw, ts: Date.now(), full: true };
    await AsyncStorage.setItem(key(type), JSON.stringify(entry));
  } catch {}
}

/** Retorna true se o cache atual é um catálogo completo (prefetchado). */
export async function isCachedFull(type: string): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(key(type));
    if (!val) return false;
    const entry: CacheEntry = JSON.parse(val);
    return entry.full === true && (Date.now() - entry.ts < FULL_TTL_MS);
  } catch {
    return false;
  }
}

/** Retorna a contagem de itens em cache (sem verificar TTL). */
export async function getCacheItemCount(type: string): Promise<number> {
  try {
    const val = await AsyncStorage.getItem(key(type));
    if (!val) return 0;
    const entry: CacheEntry = JSON.parse(val);
    return entry.raw?.length ?? 0;
  } catch {
    return 0;
  }
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

export async function getCacheTimestamp(type = "movies"): Promise<number | null> {
  try {
    const val = await AsyncStorage.getItem(key(type));
    if (!val) return null;
    const entry: CacheEntry = JSON.parse(val);
    return entry.ts ?? null;
  } catch {
    return null;
  }
}
