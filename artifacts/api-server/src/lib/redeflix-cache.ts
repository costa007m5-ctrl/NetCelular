import { notifyNewContent } from "./push-notifications.js";

const LISTS: Record<string, string> = {
  movie:  "https://redeflixapi.store/list-movie-ids.txt",
  tv:     "https://redeflixapi.store/list-tv-ids.txt",
  anime:  "https://redeflixapi.store/list-anime-ids.txt",
  dorama: "https://redeflixapi.store/list-dorama-ids.txt",
};

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";

export type ContentType = "movie" | "tv" | "anime" | "dorama";

interface CatalogSnapshot {
  byType: Record<ContentType, number[]>;
  allIds: Set<number>;
  lastUpdated: string;
  nextUpdate: string;
  newSinceLastCheck: number[];
}

let snapshot: CatalogSnapshot = {
  byType: { movie: [], tv: [], anime: [], dorama: [] },
  allIds: new Set(),
  lastUpdated: new Date(0).toISOString(),
  nextUpdate: new Date(0).toISOString(),
  newSinceLastCheck: [],
};

let isFirstLoad = true;

function parseIds(txt: string): number[] {
  return txt
    .split("\n")
    .map((l) => parseInt(l.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

async function fetchList(type: ContentType): Promise<number[]> {
  try {
    const res = await fetch(LISTS[type], { headers: { Accept: "text/plain" } });
    if (!res.ok) return [];
    return parseIds(await res.text());
  } catch {
    return [];
  }
}

async function fetchSampleTitle(newIds: number[], movieIds: Set<number>, tvIds: Set<number>): Promise<string | null> {
  const id = newIds[0];
  if (!id) return null;
  try {
    const type = tvIds.has(id) ? "tv" : "movie";
    const url =
      type === "tv"
        ? `${TMDB_BASE}/tv/${id}?api_key=${TMDB_KEY}&language=pt-BR`
        : `${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=pt-BR`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; name?: string };
    return data.title ?? data.name ?? null;
  } catch {
    return null;
  }
}

async function refresh(): Promise<void> {
  const prevAll = snapshot.allIds;

  const [movie, tv, anime, dorama] = await Promise.all([
    fetchList("movie"),
    fetchList("tv"),
    fetchList("anime"),
    fetchList("dorama"),
  ]);

  const allIds = new Set<number>([...movie, ...tv, ...anime, ...dorama]);

  const newSinceLastCheck = [...allIds].filter((id) => !prevAll.has(id));

  const now = new Date();
  snapshot = {
    byType: { movie, tv, anime, dorama },
    allIds,
    lastUpdated: now.toISOString(),
    nextUpdate: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    newSinceLastCheck,
  };

  console.log(
    `[redeflix-cache] refreshed — movie:${movie.length} tv:${tv.length} anime:${anime.length} dorama:${dorama.length} | new:${newSinceLastCheck.length}`
  );

  if (!isFirstLoad && newSinceLastCheck.length > 0) {
    const movieSet = new Set(movie);
    const tvSet    = new Set(tv);
    const sampleTitle = await fetchSampleTitle(newSinceLastCheck, movieSet, tvSet);
    notifyNewContent(newSinceLastCheck.length, sampleTitle).catch(() => {});
  }
  isFirstLoad = false;
}

export function getCatalog(): Omit<CatalogSnapshot, "allIds"> & { allIds: number[] } {
  return {
    byType: snapshot.byType,
    allIds: [...snapshot.allIds],
    lastUpdated: snapshot.lastUpdated,
    nextUpdate: snapshot.nextUpdate,
    newSinceLastCheck: snapshot.newSinceLastCheck,
  };
}

export function isAvailable(id: number): boolean {
  return snapshot.allIds.has(id);
}

export function getIdsByType(type: ContentType): number[] {
  return snapshot.byType[type] ?? [];
}

export function startCache(): void {
  refresh();
  setInterval(refresh, 60 * 60 * 1000);
}
