import { listFolder, isFolder, DRIVE_ROOTS, DriveItem } from "./gdrive-index";
import type { ContentItem } from "@/constants/content";

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";

// TMDB genre IDs → Portuguese names
export const GENRE_MAP: Record<number, string> = {
  28: "Ação",
  12: "Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  99: "Documentário",
  18: "Drama",
  10751: "Família",
  14: "Fantasia",
  36: "História",
  27: "Terror",
  10402: "Música",
  9648: "Mistério",
  10749: "Romance",
  878: "Ficção Científica",
  53: "Suspense",
  10752: "Guerra",
  37: "Faroeste",
  10759: "Ação e Aventura",
  10762: "Kids",
  10765: "Sci-Fi & Fantasia",
  10766: "Novela",
  10764: "Reality",
};

export type CatalogItem = ContentItem & {
  drive: 0 | 1;
  drivePath: string;
  driveLink: string;
  genreIds: number[];
};

// --- Module-level caches ---
const tmdbCache = new Map<string, CatalogItem | null>();
let catalogCache: CatalogItem[] | null = null;
let scanPromise: Promise<CatalogItem[]> | null = null;

// Categories to scan (skip Outros / Livros)
const SCAN_CATEGORIES: Array<{ drive: 0 | 1; category: string }> = [
  { drive: 0, category: "Animes" },
  { drive: 0, category: "Desenhos" },
  { drive: 0, category: "Filmes" },
  { drive: 0, category: "Novelas" },
  { drive: 1, category: "Filmes" },
  { drive: 1, category: "Séries" },
];

// Search TMDB for one folder name
async function searchTmdb(
  folderName: string,
  drive: 0 | 1,
  drivePath: string
): Promise<CatalogItem | null> {
  const cacheKey = folderName.toLowerCase().trim();
  if (tmdbCache.has(cacheKey)) return tmdbCache.get(cacheKey) ?? null;

  try {
    const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(folderName)}&language=pt-BR&page=1`;
    const res = await fetch(url);
    if (!res.ok) {
      tmdbCache.set(cacheKey, null);
      return null;
    }
    const data = await res.json();
    const results: any[] = (data.results ?? []).filter(
      (r: any) => r.media_type === "movie" || r.media_type === "tv"
    );
    if (results.length === 0) {
      tmdbCache.set(cacheKey, null);
      return null;
    }

    const r = results[0];
    const genreIds: number[] = r.genre_ids ?? [];
    const genres = genreIds
      .map((id) => GENRE_MAP[id])
      .filter((g): g is string => Boolean(g));

    const item: CatalogItem = {
      id: `catalog-${drive}-${r.id}`,
      tmdbId: r.id,
      title: r.title ?? r.name ?? folderName,
      originalTitle: r.original_title ?? r.original_name,
      year:
        parseInt(
          (r.release_date ?? r.first_air_date ?? "0").slice(0, 4)
        ) || 0,
      rating: Math.round((r.vote_average ?? 0) * 10) / 10,
      posterPath: r.poster_path
        ? `https://image.tmdb.org/t/p/w342${r.poster_path}`
        : "",
      backdropPath: r.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${r.backdrop_path}`
        : "",
      description: r.overview ?? "",
      genres,
      genreIds,
      type: r.media_type === "tv" ? "series" : "movie",
      mediaType: r.media_type === "tv" ? "tv" : "movie",
      drive,
      drivePath,
      driveLink: "",
    };

    tmdbCache.set(cacheKey, item);
    return item;
  } catch {
    tmdbCache.set(cacheKey, null);
    return null;
  }
}

// Run concurrent TMDB searches in batches
async function batchSearch(
  folders: Array<{ name: string; drive: 0 | 1; path: string }>,
  onProgress?: (loaded: number, total: number) => void
): Promise<CatalogItem[]> {
  const BATCH = 10;
  const results: CatalogItem[] = [];
  let loaded = 0;
  const total = folders.length;

  for (let i = 0; i < folders.length; i += BATCH) {
    const batch = folders.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((f) => searchTmdb(f.name, f.drive, f.path))
    );
    for (const item of batchResults) {
      if (item) results.push(item);
    }
    loaded += batch.length;
    onProgress?.(loaded, total);
  }

  return results;
}

// Main scan: collect folders from all categories then TMDB-match
export async function runDriveScan(
  onProgress?: (loaded: number, total: number) => void
): Promise<CatalogItem[]> {
  if (catalogCache) return catalogCache;
  if (scanPromise) return scanPromise;

  scanPromise = (async () => {
    // Step 1: collect folder names from all categories (parallel)
    const folderList: Array<{ name: string; drive: 0 | 1; path: string }> = [];

    await Promise.all(
      SCAN_CATEGORIES.map(async ({ drive, category }) => {
        const listing = await listFolder(drive, category);
        if (!listing) return;
        const folders = listing.data.files.filter(isFolder);
        for (const f of folders) {
          folderList.push({
            name: f.name,
            drive,
            path: `${category}/${f.name}`,
          });
        }
      })
    );

    // Step 2: deduplicate by lowercase name
    const seen = new Set<string>();
    const unique = folderList.filter((f) => {
      const k = f.name.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Step 3: TMDB search in batches
    const items = await batchSearch(unique, onProgress);

    // Sort by title
    items.sort((a, b) => a.title.localeCompare(b.title, "pt", { sensitivity: "base" }));

    catalogCache = items;
    return items;
  })();

  return scanPromise;
}

// Group items by genre, sorted by count descending
export function groupByGenre(
  items: CatalogItem[]
): Array<{ genre: string; items: CatalogItem[] }> {
  const map = new Map<string, CatalogItem[]>();

  for (const item of items) {
    const genreList = item.genres.length > 0 ? item.genres : ["Outros"];
    for (const genre of genreList) {
      if (!map.has(genre)) map.set(genre, []);
      map.get(genre)!.push(item);
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([genre, items]) => ({ genre, items }));
}

// Get cached items for a specific genre (used by acervo-genre screen)
export function getCachedItemsByGenre(genre: string): CatalogItem[] {
  if (!catalogCache) return [];
  if (genre === "_all") return catalogCache;
  return catalogCache.filter((item) => {
    if (item.genres.length === 0 && genre === "Outros") return true;
    return item.genres.includes(genre);
  });
}

// Invalidate cache (e.g. on pull-to-refresh)
export function clearCatalogCache() {
  catalogCache = null;
  scanPromise = null;
  tmdbCache.clear();
}
