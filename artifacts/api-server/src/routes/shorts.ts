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
import { isFlixAvailable, isFlixCacheWarm } from "./r2";

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
  sceneIndex: number;
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

// Quantas cenas distintas gerar por conteúdo no feed.
// Filmes populares e séries rendem mais cenas; títulos menores ficam com 2.
const SCENES_PER_ITEM = 3;

/**
 * Gera múltiplos ShortsItem a partir de um único item TMDB.
 * Cada item representa uma cena distinta do mesmo conteúdo —
 * timestamp diferente, duração diferente, label diferente.
 * Isso evita repetição no feed e aumenta a variedade sem precisar
 * de mais conteúdos distintos.
 */
function mapTmdbItemMultiScene(raw: any, type: "movie" | "tv"): ShortsItem[] {
  if (!raw || (!raw.backdrop_path && !raw.poster_path)) return [];

  const tmdbId = raw.id;
  const title = raw.title ?? raw.name ?? "";
  const overview = raw.overview ?? "";
  const genreIds: number[] = raw.genre_ids ?? raw.genres?.map((g: any) => g.id) ?? [];
  const runtimeMinutes =
    type === "movie"
      ? (raw.runtime ?? 0)
      : (raw.episode_run_time?.[0] ?? 45);

  const year =
    type === "movie"
      ? parseInt((raw.release_date ?? "2024").slice(0, 4))
      : parseInt((raw.first_air_date ?? "2024").slice(0, 4));

  const poster = raw.poster_path ? `${TMDB_IMG_BASE}/w342${raw.poster_path}` : null;
  const backdrop = raw.backdrop_path ? `${TMDB_IMG_BASE}/w780${raw.backdrop_path}` : null;
  const rating = Math.round((raw.vote_average ?? 0) * 10) / 10;
  const genre = firstGenre(genreIds);
  const safeYear = isNaN(year) ? 2024 : year;

  const items: ShortsItem[] = [];

  for (let sceneIndex = 0; sceneIndex < SCENES_PER_ITEM; sceneIndex++) {
    const score = scoreScene({ tmdbId, genreIds, overview, runtimeMinutes, sceneIndex });

    items.push({
      id: `${type}-${tmdbId}-s${sceneIndex}`,
      tmdbId,
      type,
      title,
      overview,
      poster,
      backdrop,
      year: safeYear,
      rating,
      genreIds,
      genre,
      runtime: runtimeMinutes,
      ...score,
      availableOnFlix2: false,
    });
  }

  return items;
}

// ── Genre boost (personalization) ──────────────────────────────────────────────
// Reorders an already-built feed so items whose genres overlap with the user's
// preferred genres bubble to the top. Applied on top of the cached base feed
// (no cache bust needed — boost is per-request and very cheap O(n log n)).
function applyGenreBoost(items: ShortsItem[], preferGenres: number[]): ShortsItem[] {
  if (preferGenres.length === 0) return items;
  const prefSet = new Set(preferGenres);

  return items.slice().sort((a, b) => {
    // Score = number of overlapping genres (more overlap = higher score)
    const sA = a.genreIds.filter((id) => prefSet.has(id)).length;
    const sB = b.genreIds.filter((id) => prefSet.has(id)).length;
    if (sA !== sB) return sB - sA;
    // Tie-break: Flix 2.0 available first, then by rating
    if (a.availableOnFlix2 !== b.availableOnFlix2) return a.availableOnFlix2 ? -1 : 1;
    return b.rating - a.rating;
  });
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

  // Only include content with original_language in this set for catalog matching
  // The Flix 2.0 catalog (Brazilian IPTV) is primarily en/pt content
  const ALLOWED_LANGS = new Set(["en", "pt", "es"]);

  if (type === "all" || type === "movie") {
    fetches.push(
      tmdbFetch<any>("/trending/movie/week", { region: "BR" }).catch(() => ({ results: [] })),
      tmdbFetch<any>("/movie/popular", { region: "BR" }).catch(() => ({ results: [] })),
      tmdbFetch<any>("/movie/top_rated", { region: "BR" }).catch(() => ({ results: [] })),
    );
  } else {
    fetches.push(Promise.resolve({ results: [] }), Promise.resolve({ results: [] }), Promise.resolve({ results: [] }));
  }

  if (type === "all" || type === "tv") {
    fetches.push(
      tmdbFetch<any>("/trending/tv/week", { region: "BR" }).catch(() => ({ results: [] })),
      tmdbFetch<any>("/tv/popular", { region: "BR" }).catch(() => ({ results: [] })),
      tmdbFetch<any>("/tv/top_rated", { region: "BR" }).catch(() => ({ results: [] })),
    );
  } else {
    fetches.push(Promise.resolve({ results: [] }), Promise.resolve({ results: [] }), Promise.resolve({ results: [] }));
  }

  const [trendMovies, popMovies, topMovies, trendTv, popTv, topTv] = await Promise.all(fetches);

  // 2. Merge, deduplicate, map — cada conteúdo gera SCENES_PER_ITEM cenas distintas
  const seen = new Set<string>();
  const raw: ShortsItem[] = [];

  const addItems = (results: any[], contentType: "movie" | "tv") => {
    for (const r of results) {
      // Skip non-Latin content (Bollywood, Korean, Chinese, etc.)
      // These are almost never in the PT-BR Flix 2.0 catalog by title
      if (!ALLOWED_LANGS.has(r.original_language)) continue;
      const key = `${contentType}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const scenes = mapTmdbItemMultiScene(r, contentType);
      for (const scene of scenes) {
        if (scene.rating >= 5.0) raw.push(scene);
      }
    }
  };

  addItems(trendMovies?.results ?? [], "movie");
  addItems(trendTv?.results ?? [], "tv");
  addItems(popMovies?.results ?? [], "movie");
  addItems(popTv?.results ?? [], "tv");
  addItems(topMovies?.results ?? [], "movie");
  addItems(topTv?.results ?? [], "tv");

  // 3. Check Flix 2.0 availability using the in-memory title index (FLIX2_INDEX_CACHE).
  // isFlixAvailable() checks both TMDB-ID key and normalized-title key — covers all items
  // even when the Xtream provider doesn't send tmdb_id in the catalog response.
  const cacheIsWarm = isFlixCacheWarm();

  for (const item of raw) {
    item.availableOnFlix2 = isFlixAvailable(item.tmdbId, item.title, item.type);
  }

  // 4. Sort: Flix 2.0 available first, then by rating
  raw.sort((a, b) => {
    if (a.availableOnFlix2 !== b.availableOnFlix2) {
      return a.availableOnFlix2 ? -1 : 1;
    }
    return b.rating - a.rating;
  });

  // 5. Shuffle within each group for variety
  function shuffleGroup(arr: ShortsItem[]): ShortsItem[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const available = shuffleGroup(raw.filter((i) => i.availableOnFlix2));
  // When cache is cold, fall back to all items so the screen isn't empty
  const final = (cacheIsWarm ? available : shuffleGroup(raw)).slice(0, Math.max(limit, 50));

  FEED_CACHE.set(cacheKey, { items: final, cachedAt: Date.now() });
  return final;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

router.get("/shorts/feed", async (req: any, res: any) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(30, Math.max(5, Number(req.query.limit ?? 20)));
    const type = (req.query.type ?? "all") as "all" | "movie" | "tv";

    // Optional personalization: comma-separated TMDB genre IDs from client watch history
    const preferGenresParam = String(req.query.preferGenres ?? "").trim();
    const preferGenres: number[] = preferGenresParam
      ? preferGenresParam.split(",").map(Number).filter((n) => !isNaN(n) && n > 0)
      : [];

    const all = await buildFeed(type, 60);

    // Apply genre boost (cheap sort on top of cached base feed)
    const ordered = applyGenreBoost(all, preferGenres);

    const offset = (page - 1) * limit;
    const pageItems = ordered.slice(offset, offset + limit);

    res.json({
      page,
      limit,
      total: ordered.length,
      hasMore: offset + limit < ordered.length,
      items: pageItems,
      personalized: preferGenres.length > 0,
      preferGenres,
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

    const sceneIndex = Math.max(0, Number(req.query.sceneIndex ?? 0));
    const score = scoreScene({ tmdbId, genreIds, overview: details?.overview ?? "", runtimeMinutes: effectiveRuntime, sceneIndex });

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

// ── Stream proxy — serves hubby.cx/fontedecanais video over HTTPS ──────────────
// Browsers block HTTPS pages from loading HTTP video (mixed content).
// This proxy fetches the video server-side (Node ignores HTTPS→HTTP redirects)
// and serves it back over HTTPS, forwarding Range headers for seeking.
router.get("/shorts/stream-proxy", async (req: any, res: any) => {
  const url = String(req.query.url ?? "").trim();
  if (!url || !/^https:\/\/hubby\.cx\//i.test(url)) {
    res.status(400).json({ error: "url must start with https://hubby.cx/" });
    return;
  }

  try {
    const ctrl = new AbortController();
    const reqTimer = setTimeout(() => ctrl.abort(), 30_000);

    const upHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
    };
    // Forward Range header for video seeking
    const rangeHeader = req.headers["range"];
    if (rangeHeader) upHeaders["Range"] = rangeHeader;

    const upstream = await fetch(url, {
      signal: ctrl.signal,
      headers: upHeaders,
      // Node fetch follows redirects including HTTPS→HTTP, unlike browsers
    });

    clearTimeout(reqTimer);

    // Forward relevant response headers
    const status = upstream.status; // usually 200 or 206 (partial)
    res.status(status);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Accept-Ranges", "bytes");

    const ct = upstream.headers.get("content-type");
    if (ct) res.set("Content-Type", ct);
    else res.set("Content-Type", "video/mp4");

    const cl = upstream.headers.get("content-length");
    if (cl) res.set("Content-Length", cl);

    const cr = upstream.headers.get("content-range");
    if (cr) res.set("Content-Range", cr);

    // Stream body
    if (!upstream.body) { res.end(); return; }
    const reader = (upstream.body as any).getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const ok = res.write(Buffer.from(value));
          // Back-pressure: wait for drain if buffer is full
          if (!ok) await new Promise<void>((r) => res.once("drain", r));
        }
        res.end();
      } catch {
        res.end();
      }
    };
    pump();
  } catch {
    if (!res.headersSent) res.status(502).json({ error: "upstream error" });
  }
});

// ── Trending by genre ───────────────────────────────────────────────────────────
// Returns top-trending TMDB items for a specific genre, used by the
// "Trending por Gênero" carrossel card injected inside the Shorts feed.

interface TrendingGenreItem {
  id: string;
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  year: number;
  genreIds: number[];
}

const TRENDING_GENRE_CACHE = new Map<string, { items: TrendingGenreItem[]; cachedAt: number }>();
const TRENDING_GENRE_TTL_MS = 60 * 60 * 1000; // 1 h

async function buildTrendingGenre(genreId: number, limit: number): Promise<TrendingGenreItem[]> {
  const cacheKey = `${genreId}-${limit}`;
  const cached = TRENDING_GENRE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < TRENDING_GENRE_TTL_MS) return cached.items;

  const params = {
    with_genres: String(genreId),
    sort_by: "popularity.desc",
    region: "BR",
    "vote_count.gte": "50",
    page: "1",
  };

  const [movRes, tvRes] = await Promise.all([
    tmdbFetch<any>("/discover/movie", params).catch(() => ({ results: [] })),
    tmdbFetch<any>("/discover/tv", params).catch(() => ({ results: [] })),
  ]);

  const seen = new Set<string>();
  const items: TrendingGenreItem[] = [];

  const add = (results: any[], type: "movie" | "tv") => {
    for (const r of results) {
      if (!r.poster_path && !r.backdrop_path) continue;
      const key = `${type}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = r.title ?? r.name ?? "";
      const year = parseInt((r.release_date ?? r.first_air_date ?? "2024").slice(0, 4));
      items.push({
        id: key,
        tmdbId: r.id,
        type,
        title,
        poster: r.poster_path ? `${TMDB_IMG_BASE}/w342${r.poster_path}` : null,
        backdrop: r.backdrop_path ? `${TMDB_IMG_BASE}/w300${r.backdrop_path}` : null,
        rating: Math.round((r.vote_average ?? 0) * 10) / 10,
        year: isNaN(year) ? 2024 : year,
        genreIds: r.genre_ids ?? [],
      });
    }
  };

  add(movRes.results ?? [], "movie");
  add(tvRes.results ?? [], "tv");

  // Sort by rating for within-genre quality ordering
  items.sort((a, b) => b.rating - a.rating);
  const final = items.slice(0, Math.max(limit, 12));
  TRENDING_GENRE_CACHE.set(cacheKey, { items: final, cachedAt: Date.now() });
  return final;
}

router.get("/shorts/trending-genre", async (req: any, res: any) => {
  try {
    const genreId = Number(req.query.genreId);
    const limit = Math.min(20, Math.max(6, Number(req.query.limit ?? 12)));

    if (!genreId || isNaN(genreId)) {
      res.status(400).json({ error: "genreId required" });
      return;
    }

    const items = await buildTrendingGenre(genreId, limit);
    res.json({ genreId, genreName: GENRE_MAP[genreId] ?? "Popular", items });
  } catch (err: any) {
    req.log?.error({ err }, "shorts/trending-genre error");
    res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

// Invalidate feed cache (admin use)
router.post("/shorts/cache/invalidate", (req: any, res: any) => {
  FEED_CACHE.clear();
  TRENDING_GENRE_CACHE.clear();
  res.json({ ok: true, message: "Shorts feed cache cleared" });
});

// ── Top 10 Em Alta Agora ────────────────────────────────────────────────────
// Returns the weekly Top 10 trending titles (movies + TV combined).
// Also powers the push notification system: every 6 hours the server
// compares the current Top 10 with the last known snapshot and sends
// a push notification for each new entrant (max 3 per cycle).

interface Top10Item {
  tmdbId: number;
  type: "movie" | "tv";
  title: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  year: number;
  genre: string;
}

let _top10Snapshot: Top10Item[] = [];
let _top10Cache: { items: Top10Item[]; cachedAt: number } | null = null;
const TOP10_TTL_MS = 3 * 60 * 60 * 1000; // 3 h

async function buildTop10(): Promise<Top10Item[]> {
  if (_top10Cache && Date.now() - _top10Cache.cachedAt < TOP10_TTL_MS) {
    return _top10Cache.items;
  }

  const [movRes, tvRes] = await Promise.all([
    tmdbFetch<any>("/trending/movie/week").catch(() => ({ results: [] })),
    tmdbFetch<any>("/trending/tv/week").catch(() => ({ results: [] })),
  ]);

  // Interleave movies + TV to produce a mixed Top 10 by popularity rank
  const movies: any[] = movRes.results ?? [];
  const tvs: any[] = tvRes.results ?? [];

  const seen = new Set<string>();
  const combined: Array<{ raw: any; type: "movie" | "tv"; rank: number }> = [];

  const maxLen = Math.max(movies.length, tvs.length);
  for (let i = 0; i < maxLen; i++) {
    if (movies[i]) combined.push({ raw: movies[i], type: "movie", rank: i });
    if (tvs[i])    combined.push({ raw: tvs[i],    type: "tv",    rank: i });
  }

  // Sort by rank then pick the first 10 unique
  combined.sort((a, b) => a.rank - b.rank);

  const items: Top10Item[] = [];
  for (const { raw, type } of combined) {
    if (items.length >= 10) break;
    if (!raw.poster_path && !raw.backdrop_path) continue;
    const key = `${type}-${raw.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = raw.title ?? raw.name ?? "";
    const year = parseInt((raw.release_date ?? raw.first_air_date ?? "2024").slice(0, 4));
    items.push({
      tmdbId: raw.id,
      type,
      title,
      poster: raw.poster_path ? `${TMDB_IMG_BASE}/w342${raw.poster_path}` : null,
      backdrop: raw.backdrop_path ? `${TMDB_IMG_BASE}/w780${raw.backdrop_path}` : null,
      rating: Math.round((raw.vote_average ?? 0) * 10) / 10,
      year: isNaN(year) ? 2024 : year,
      genre: firstGenre(raw.genre_ids ?? []),
    });
  }

  _top10Cache = { items, cachedAt: Date.now() };
  return items;
}

router.get("/shorts/top10", async (_req: any, res: any) => {
  try {
    const items = await buildTop10();
    res.json({ ok: true, items, total: items.length, cachedAt: _top10Cache?.cachedAt ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

// ── Auto notify: detect Top 10 changes and push to all users ─────────────────
async function checkTop10AndNotify(): Promise<void> {
  try {
    const current = await buildTop10();
    if (_top10Snapshot.length === 0) {
      _top10Snapshot = current;
      console.log("[top10-notify] Snapshot inicial registrado:", current.length, "itens");
      return;
    }

    const prevIds = new Set(_top10Snapshot.map((i) => `${i.type}-${i.tmdbId}`));
    const newEntrants = current.filter((i) => !prevIds.has(`${i.type}-${i.tmdbId}`));

    if (newEntrants.length === 0) {
      console.log("[top10-notify] Top 10 sem mudanças");
      return;
    }

    console.log(`[top10-notify] ${newEntrants.length} novos entrants detectados`);
    _top10Snapshot = current;

    const { sendToAll, addPushLog } = await import("../lib/push-notifications.js");

    for (const item of newEntrants.slice(0, 3)) {
      const pushTitle = `🔥 Novo no Top 10`;
      const pushBody  = `"${item.title}" entrou no Top 10 da semana nos Shorts!`;
      const data = {
        type: "shorts_top10",
        tmdbId: String(item.tmdbId),
        contentType: item.type,
        contentTitle: item.title,
        screen: "shorts",
      };

      try {
        const result = await sendToAll(
          pushTitle,
          pushBody,
          data,
          item.backdrop ?? item.poster ?? undefined,
        );
        addPushLog({
          title: pushTitle,
          body: pushBody,
          source: "auto:top10",
          sent: result.sent,
          failed: result.failed,
          total: result.sent + result.failed,
        });
        console.log(`[top10-notify] Push enviado: "${item.title}" — sent=${result.sent}`);
      } catch (e) {
        console.error("[top10-notify] Erro ao enviar push:", e);
      }
    }
  } catch (e) {
    console.error("[top10-notify] Erro geral:", e);
  }
}

// Run initial snapshot after 30s, then check every 6 hours
setTimeout(checkTop10AndNotify, 30_000);
setInterval(checkTop10AndNotify, 6 * 60 * 60 * 1000);

// Manual trigger (admin) — useful for testing or forcing a check
router.post("/shorts/notify-top10", async (req: any, res: any) => {
  const adminKey = process.env["ADMIN_API_KEY"] ?? "";
  const provided  = (req.headers["x-admin-key"] as string | undefined) ?? req.query.admin_key ?? "";
  if (adminKey && provided !== adminKey) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const before = (_top10Snapshot ?? []).map((i) => i.title);
    await checkTop10AndNotify();
    const after = (_top10Snapshot ?? []).map((i) => i.title);
    res.json({ ok: true, before, after });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Internal error" });
  }
});

export default router;
