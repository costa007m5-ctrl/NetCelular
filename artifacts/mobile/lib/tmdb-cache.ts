const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memCache = new Map<string, CacheEntry<any>>();

function isExpired(entry: CacheEntry<any>): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

export function getCached<T>(key: string): T | null {
  const entry = memCache.get(key);
  if (!entry || isExpired(entry)) {
    if (entry) memCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  memCache.set(key, { data, timestamp: Date.now() });
}

export function invalidate(key: string): void {
  memCache.delete(key);
}

export function invalidateAll(): void {
  memCache.clear();
}

export function cacheSize(): number {
  return memCache.size;
}

/** Fetch with caching: returns cached if fresh, else fetches and caches */
export async function fetchCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = CACHE_TTL_MS
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;
  const data = await fetcher();
  memCache.set(key, { data, timestamp: Date.now() });
  return data;
}

/** TMDB-specific cache keys */
export const cacheKey = {
  movie: (id: number) => `tmdb_movie_${id}`,
  tv: (id: number) => `tmdb_tv_${id}`,
  season: (id: number, season: number) => `tmdb_tv_${id}_s${season}`,
  search: (query: string, page: number) => `tmdb_search_${query}_p${page}`,
  trending: (type: string, window: string) => `tmdb_trending_${type}_${window}`,
  discover: (type: string, genres: string) => `tmdb_discover_${type}_g${genres}`,
  credits: (type: string, id: number) => `tmdb_credits_${type}_${id}`,
  images: (type: string, id: number) => `tmdb_images_${type}_${id}`,
  providers: (type: string, id: number) => `tmdb_providers_${type}_${id}`,
  similar: (type: string, id: number) => `tmdb_similar_${type}_${id}`,
  recommendations: (type: string, id: number) => `tmdb_recs_${type}_${id}`,
  collection: (id: number) => `tmdb_collection_${id}`,
};
