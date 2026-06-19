/**
 * shorts.ts — /api/shorts
 *
 * Feed de Shorts powered by TMDB + Flix 2.0 + IA de cenas.
 *
 * GET /shorts/feed?page=1&limit=20&type=all|movie|tv
 *   Retorna lista curada de itens com metadados TMDB e timestamp IA calculado.
 *   O stream URL é resolvido pelo mobile via /api/flix2/lookup (lazy, por visibilidade).
 *
 * GET /shorts/resolve?tmdbId=X&type=movie|tv&title=Y
 *   Resolve o stream URL do Flix 2.0 para um item específico e retorna
 *   a URL final + startTimeSeconds para o player.
 */

import { Router } from "express";
import { scoreScene } from "../lib/scene-scorer";
import { getIdsByType } from "../lib/redeflix-cache";

const router = Router();

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";
const FALLBACK_KEY = "8f0beb08cf016ec8de49e454e09879ec";

function getTmdbKey(): string {
  return process.env["TMDB_API_KEY"] ?? FALLBACK_KEY;
}

const GENRE_MAP: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia",
  80: "Crime", 18: "Drama", 14: "Fantasia", 27: "Terror",
  9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste",
  10759: "Ação & Aventura", 10765: "Sci-Fi & Fantasy",
  10751: "Família", 36: "História", 10762: "Infantil",
  10766: "Novela", 10767: "Talk Show", 10768: "Guerra & Política",
};

function firstGenre(ids: number[]): string {
  for (const id of ids) {
    if (GENRE_MAP[id]) return GENRE_MAP[id];
  }
  return "Filme";
}

// ── In-memory feed cache (30 min TTL) ─────────────────────────────────────────
interface FeedCacheEntry {
  items: ShortsItem[];
  cachedAt: number;
}

interface ShortsItem {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  year: number;
  rating: number;
  genreIds: number[];
  genre: string;
  runtime: number;
  startTimePct: number;
  startTimeSeconds: number;
  clipDurationSeconds: number;
  sceneLabel: string;
  availableOnFlix2: boolean;
}

const FEED_CACHE = new Map<string, FeedCacheEntry>();
const FEED_TTL_MS = 30 * 60 * 1000;

// ── TMDB helpers ───────────────────────────────────────────────────────────────

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getTmdbKey());
  url.searchParams.set("language", "pt-BR");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function fetchTmdbDetails(id: number, type: "movie" | "tv"): Promise<any> {
  try {
    return await tmdbFetch(`/${type}/${id}`);
  } catch {
    return null;
  }
}

function mapTmdbItem(raw: any, type: "movie" | "tv"): ShortsItem | null {
  if (!raw || (!raw.backdrop_path && !raw.poster_path)) return null;

  const tmdbId = raw.id;
  const title = raw.title ?? raw.name ?? "";
  const overview = raw.overview ?? "";
  const genreIds: number[] = raw.genre_ids ?? raw.genres?.map((g: any) => g.id) ?? [];
  const runtimeMinutes =
    type === "movie"
      ? (raw.runtime ?? 0)
      : (raw.episode_run_time?.[0] ?? 45);

  const score = scoreScene({ tmdbId, genreIds, overview, runtimeMinutes });

  const year =
    type === "movie"
      ? parseInt((raw.release_date ?? "2024").slice(0, 4))
      : parseInt((raw.first_air_date ?? "2024").slice(0, 4));

  return {
    id: `${type}-${tmdbId}`,
    tmdbId,
    type,
    title,
    overview,
    poster: raw.poster_path ? `${TMDB_IMG_BASE}/w342${raw.poster_path}` : null,
    backdrop: raw.backdrop_path ? `${TMDB_IMG_BASE}/w780${raw.backdrop_path}` : null,
    year: isNaN(year) ? 2024 : year,
    rating: Math.round((raw.vote_average ?? 0) * 10) / 10,
    genreIds,
    genre: firstGenre(genreIds),
    runtime: runtimeMinutes,
    ...score,
    availableOnFlix2: false,
  };
}

// ── Build feed ─────────────────────────────────────────────────────────────────

async function buildFeed(type: "all" | "movie" | "tv", limit: number): Promise<ShortsItem[]> {
  const cacheKey = `${type}-${limit}`;
  const cached = FEED_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < FEED_TTL_MS) {
    return cached.items;
  }

  // 1. Fetch TMDB content in parallel
  const fetches: Promise<any>[] = [];

  if (type === "all" || type === "movie") {
    fetches.push(
      tmdbFetch<any>("/trending/movie/week").catch(() => ({ results: [] })),
      tmdbFetch<any>("/movie/popular").catch(() => ({ results: [] })),
      tmdbFetch<any>("/movie/top_rated").catch(() => ({ results: [] })),
    );
  } else {
    fetches.push(Promise.resolve({ results: [] }), Promise.resolve({ results: [] }), Promise.resolve({ results: [] }));
  }

  if (type === "all" || type === "tv") {
    fetches.push(
      tmdbFetch<any>("/trending/tv/week").catch(() => ({ results: [] })),
      tmdbFetch<any>("/tv/popular").catch(() => ({ results: [] })),
      tmdbFetch<any>("/tv/top_rated").catch(() => ({ results: [] })),
    );
  } else {
    fetches.push(Promise.resolve({ results: [] }), Promise.resolve({ results: [] }), Promise.resolve({ results: [] }));
  }

  const [trendMovies, popMovies, topMovies, trendTv, popTv, topTv] = await Promise.all(fetches);

  // 2. Merge, deduplicate, map
  const seen = new Set<string>();
  const raw: ShortsItem[] = [];

  const addItems = (results: any[], contentType: "movie" | "tv") => {
    for (const r of results) {
      const key = `${contentType}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = mapTmdbItem(r, contentType);
      if (item && item.rating >= 5.0) raw.push(item);
    }
  };

  addItems(trendMovies?.results ?? [], "movie");
  addItems(trendTv?.results ?? [], "tv");
  addItems(popMovies?.results ?? [], "movie");
  addItems(popTv?.results ?? [], "tv");
  addItems(topMovies?.results ?? [], "movie");
  addItems(topTv?.results ?? [], "tv");

  // 3. Check Flix 2.0 availability and promote those items
  let movieFlix2Ids: Set<number> = new Set();
  let tvFlix2Ids: Set<number> = new Set();
  try {
    movieFlix2Ids = new Set(getIdsByType("movie"));
    tvFlix2Ids = new Set(getIdsByType("tv") as number[]);
  } catch {}

  for (const item of raw) {
    if (item.type === "movie" && movieFlix2Ids.has(item.tmdbId)) {
      item.availableOnFlix2 = true;
    } else if (item.type === "tv" && tvFlix2Ids.has(item.tmdbId)) {
      item.availableOnFlix2 = true;
    }
  }

  // 4. Sort: Flix 2.0 available first, then by rating
  raw.sort((a, b) => {
    if (a.availableOnFlix2 !== b.availableOnFlix2) {
      return a.availableOnFlix2 ? -1 : 1;
    }
    return b.rating - a.rating;
  });

  // 5. Shuffle within each group (available / not-available) for variety
  function shuffleGroup(arr: ShortsItem[]): ShortsItem[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const available = shuffleGroup(raw.filter((i) => i.availableOnFlix2));
  const rest = shuffleGroup(raw.filter((i) => !i.availableOnFlix2));
  const final = [...available, ...rest].slice(0, Math.max(limit, 50));

  FEED_CACHE.set(cacheKey, { items: final, cachedAt: Date.now() });
  return final;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get("/shorts/feed", async (req: any, res: any) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(30, Math.max(5, Number(req.query.limit ?? 20)));
    const type = (req.query.type ?? "all") as "all" | "movie" | "tv";

    const all = await buildFeed(type, 60);
    const offset = (page - 1) * limit;
    const pageItems = all.slice(offset, offset + limit);

    res.json({
      page,
      limit,
      total: all.length,
      hasMore: offset + limit < all.length,
      items: pageItems,
    });
  } catch (err: any) {
    req.log?.error({ err }, "shorts/feed error");
    res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

/**
 * GET /shorts/resolve?tmdbId=X&type=movie|tv&title=Y&runtime=N
 *
 * Resolve o stream URL do Flix 2.0 para um item e retorna:
 * - streamUrl: a URL do vídeo (ou null se não disponível)
 * - startTimeSeconds: calculado pela IA de cenas
 * - clipDurationSeconds: duração do short (60s)
 * - sceneLabel: label da cena
 */
router.get("/shorts/resolve", async (req: any, res: any) => {
  try {
    const tmdbId = Number(req.query.tmdbId);
    const type = String(req.query.type ?? "movie") as "movie" | "tv";
    const title = String(req.query.title ?? "");
    const runtimeMinutes = Number(req.query.runtime ?? 0);

    if (!tmdbId) {
      res.status(400).json({ error: "tmdbId required" });
      return;
    }

    // Fetch TMDB details for full metadata (genreIds, runtime)
    const details = await fetchTmdbDetails(tmdbId, type);
    const genreIds: number[] = details?.genres?.map((g: any) => g.id) ?? details?.genre_ids ?? [];
    const effectiveRuntime = runtimeMinutes > 0 ? runtimeMinutes
      : type === "movie"
        ? (details?.runtime ?? 100)
        : (details?.episode_run_time?.[0] ?? 45);

    const score = scoreScene({ tmdbId, genreIds, overview: details?.overview ?? "", runtimeMinutes: effectiveRuntime });

    // Resolve Flix 2.0 stream URL via the r2 /flix2/lookup endpoint (internal request)
    let streamUrl: string | null = null;
    try {
      const catalogType = type === "movie" ? "movies" : "series";
      // Internal call: routes are mounted at /api and r2Router at /r2
      const apiPort = process.env["PORT"] ?? "8080";
      const lookupUrl = `http://localhost:${apiPort}/api/r2/flix2/lookup?tmdbId=${tmdbId}&type=${catalogType}&title=${encodeURIComponent(title)}`;
      const lookupRes = await fetch(lookupUrl, { signal: AbortSignal.timeout(5000) });
      if (lookupRes.ok) {
        const data = await lookupRes.json() as any;
        if (data.found && data.item) {
          const item = data.item;
          // Use stream_url directly if it's a real URL (not flix2id: placeholder)
          const rawUrl = item.stream_url ?? item.url ?? "";
          if (rawUrl && !rawUrl.startsWith("flix2id:")) {
            streamUrl = rawUrl;
          } else if (item.stream_id || item.id) {
            // Build URL from stream ID using /flix2/build-url
            const streamId = String(item.stream_id ?? item.id ?? "");
            const buildUrl = `http://localhost:${apiPort}/api/r2/flix2/build-url?streamId=${streamId}&catalogType=${catalogType}`;
            const buildRes = await fetch(buildUrl, { signal: AbortSignal.timeout(3000) });
            if (buildRes.ok) {
              const built = await buildRes.json() as any;
              if (built.ok && built.flix2Url) streamUrl = built.flix2Url;
            }
          }
        }
      }
    } catch {
      // Flix 2.0 not available — short will show thumbnail
    }

    res.json({
      tmdbId,
      type,
      streamUrl,
      ...score,
    });
  } catch (err: any) {
    req.log?.error({ err }, "shorts/resolve error");
    res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

// Invalidate feed cache (admin use)
router.post("/shorts/cache/invalidate", (req: any, res: any) => {
  FEED_CACHE.clear();
  res.json({ ok: true, message: "Shorts feed cache cleared" });
});

export default router;
