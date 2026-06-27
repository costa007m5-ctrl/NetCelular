import { Router } from "express";
import { tmdb } from "../lib/tmdb";

const router = Router();
const TMDB_FALLBACK = "8f0beb08cf016ec8de49e454e09879ec";
const getKey = () => process.env.TMDB_API_KEY ?? TMDB_FALLBACK;

const handle = (fn: (req: any, res: any) => Promise<any>) =>
  async (req: any, res: any) => {
    try {
      const data = await fn(req, res);
      res.json(data);
    } catch (err: any) {
      req.log.error({ err }, "TMDB route error");
      res.status(500).json({ error: err?.message ?? "Internal error" });
    }
  };

router.get("/trending", handle(async (_req) => {
  const [all, movies, tv] = await Promise.all([
    tmdb.trending.all("week"),
    tmdb.trending.movies("week"),
    tmdb.trending.tv("week"),
  ]);
  return { all: all.results, movies: movies.results, tv: tv.results };
}));

router.get("/popular/movies", handle(async () => {
  const data = await tmdb.movie.popular();
  return data.results;
}));

router.get("/popular/tv", handle(async () => {
  const data = await tmdb.tv.popular();
  return data.results;
}));

router.get("/top/movies", handle(async () => {
  const data = await tmdb.movie.topRated();
  return data.results;
}));

router.get("/top/tv", handle(async () => {
  const data = await tmdb.tv.topRated();
  return data.results;
}));

router.get("/search", handle(async (req) => {
  const q = String(req.query.q ?? "");
  const type = String(req.query.type ?? "multi");
  const page = Number(req.query.page ?? 1);
  if (!q.trim()) return { results: [] };

  if (type === "movie") {
    const data = await tmdb.search.movies(q, page);
    return data;
  } else if (type === "tv") {
    const data = await tmdb.search.tv(q, page);
    return data;
  }
  const data = await tmdb.search.multi(q, page);
  return data;
}));

router.get("/movie/:id", handle(async (req) => {
  const id = Number(req.params.id);
  return tmdb.movie.details(id);
}));

router.get("/movie/:id/similar", handle(async (req) => {
  const id = Number(req.params.id);
  const data = await tmdb.movie.similar(id);
  return data.results;
}));

router.get("/tv/:id", handle(async (req) => {
  const id = Number(req.params.id);
  return tmdb.tv.details(id);
}));

router.get("/tv/:id/similar", handle(async (req) => {
  const id = Number(req.params.id);
  const data = await tmdb.tv.similar(id);
  return data.results;
}));

router.get("/tv/:id/season/:seasonNum", handle(async (req) => {
  const id = Number(req.params.id);
  const seasonNum = Number(req.params.seasonNum);
  return tmdb.tv.season(id, seasonNum);
}));

router.get("/tv/:id/season/:seasonNum/episode/:episodeNum", handle(async (req) => {
  const id = Number(req.params.id);
  const seasonNum = Number(req.params.seasonNum);
  const episodeNum = Number(req.params.episodeNum);
  return tmdb.tv.episode(id, seasonNum, episodeNum);
}));

router.get("/streaming", handle(async (req) => {
  const providerId = Number(req.query.provider_id ?? 0);
  const type = String(req.query.type ?? "movie");
  const page = Number(req.query.page ?? 1);
  if (!providerId) return { results: [], total_pages: 0, total_results: 0, page: 1 };
  if (type === "tv") return tmdb.discover.tv(undefined, page, providerId);
  return tmdb.discover.movies(undefined, page, providerId);
}));

router.get("/discover", handle(async (req) => {
  const type = String(req.query.type ?? "movie");
  const genreId = req.query.genre_id ? Number(req.query.genre_id) : undefined;
  const genreIds = req.query.genre_ids ? String(req.query.genre_ids) : undefined;
  const page = Number(req.query.page ?? 1);
  if (type === "tv") {
    return tmdb.discover.tv(genreId, page, undefined, undefined, genreIds);
  }
  return tmdb.discover.movies(genreId, page, undefined, undefined, genreIds);
}));

router.get("/streaming-genre", handle(async (req) => {
  const providerId = Number(req.query.provider_id ?? 0);
  const type = String(req.query.type ?? "movie");
  const genreId = req.query.genre_id ? Number(req.query.genre_id) : undefined;
  const page = Number(req.query.page ?? 1);
  if (!providerId) return { results: [], total_pages: 0, total_results: 0, page: 1 };
  if (type === "tv") return tmdb.discover.tv(genreId, page, providerId);
  return tmdb.discover.movies(genreId, page, providerId);
}));

router.get("/discover-keyword", handle(async (req) => {
  const type = String(req.query.type ?? "movie");
  const keywordId = Number(req.query.keyword_id ?? 0);
  const page = Number(req.query.page ?? 1);
  if (!keywordId) return { results: [], total_pages: 0, total_results: 0, page: 1 };
  if (type === "tv") return tmdb.discover.tv(undefined, page, undefined, keywordId);
  return tmdb.discover.movies(undefined, page, undefined, keywordId);
}));

router.get("/collection/:id", handle(async (req) => {
  const id = Number(req.params.id);
  const data = await tmdb.collection.details(id);
  data.parts.sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
  return data;
}));

router.get("/movie/:id/providers", handle(async (req) => {
  const id = Number(req.params.id);
  const data = await tmdb.watchProviders.movie(id);
  return data?.results?.BR ?? null;
}));

router.get("/tv/:id/providers", handle(async (req) => {
  const id = Number(req.params.id);
  const data = await tmdb.watchProviders.tv(id);
  return data?.results?.BR ?? null;
}));

router.post("/batch-providers", handle(async (req) => {
  const items: { id: number; type: "movie" | "tv" }[] = req.body?.items ?? [];
  if (!items.length) return { exclusive: [] };

  const CONCURRENCY = 8;
  const exclusive: number[] = [];

  async function checkOne(item: { id: number; type: "movie" | "tv" }) {
    try {
      const data = await (item.type === "tv"
        ? tmdb.watchProviders.tv(item.id)
        : tmdb.watchProviders.movie(item.id));
      const br = data?.results?.BR;
      if (!br || (!br.flatrate?.length && !br.ads?.length && !br.free?.length)) {
        exclusive.push(item.id);
      }
    } catch {
      // If TMDB fails, don't mark as exclusive
    }
  }

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(checkOne));
  }

  return { exclusive };
}));

router.get("/redeflix/available", handle(async (req) => {
  const type = String(req.query.type ?? "movie");
  const id = Number(req.query.id ?? 0);
  const season = Number(req.query.season ?? 1);
  const episode = Number(req.query.episode ?? 1);
  const url =
    type === "tv"
      ? `https://redeflixapi.store/serie/${id}/${season}/${episode}`
      : `https://redeflixapi.store/filme/${id}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    const hasContent = res.ok && text.length > 500;
    return { available: hasContent };
  } catch {
    return { available: false };
  }
}));

router.get("/franchise-logo", handle(async (req) => {
  const type = String(req.query.type ?? "") as "collection" | "tv" | "movie";
  const id = Number(req.query.id ?? 0);
  if (!type || !id) return { logo_path: null };
  const logos = await tmdb.images.logos(type, id);
  const enLogos = logos.filter((l) => l.iso_639_1 === "en").sort((a, b) => b.vote_average - a.vote_average);
  const best = enLogos[0] ?? logos[0] ?? null;
  return { logo_path: best?.file_path ?? null };
}));

// Rotating search terms to browse TMDB collections broadly
const COLLECTION_SEARCH_TERMS = [
  "saga", "collection", "trilogy", "universe", "chronicles",
  "the", "man", "super", "dark", "star", "iron", "black",
  "dead", "time", "fire", "night", "war", "world", "blood",
  "king", "dragon", "magic", "hero", "evil", "last", "lost",
  "mission", "fast", "ring", "potter", "avengers", "batman",
  "spider", "x-men", "thor", "captain", "jurassic", "matrix",
  "alien", "terminator", "indiana", "james bond", "rocky",
  "die hard", "mad max", "rambo", "transformers", "conjuring",
  "halloween", "saw", "paranormal", "resident evil", "purge",
  "ocean", "bourne", "taken", "expendables", "mummy",
  "chronicles", "frozen", "shrek", "minions", "despicable",
  "toy story", "cars", "kung fu", "incredibles", "finding",
  "naruto", "dragon ball", "bleach", "one piece", "attack",
  "demon", "hunter", "sword", "evangelion", "fullmetal",
];

router.get("/popular-collections", handle(async (req) => {
  const page = Number(req.query.page ?? 1);
  const termIdx = (page - 1) % COLLECTION_SEARCH_TERMS.length;
  const termPage = Math.floor((page - 1) / COLLECTION_SEARCH_TERMS.length) + 1;
  const term = COLLECTION_SEARCH_TERMS[termIdx];
  const data = await tmdb.search.collections(term, termPage);
  return {
    results: data.results.slice(0, 30),
    page,
    total_pages: Math.min(data.total_pages * COLLECTION_SEARCH_TERMS.length, 999),
  };
}));

router.get("/search-collections", handle(async (req) => {
  const q = String(req.query.q ?? "");
  const page = Number(req.query.page ?? 1);
  if (!q.trim()) return { results: [], total_pages: 0, page: 1 };
  const data = await tmdb.search.collections(q, page);
  return data;
}));

router.get("/genres", handle(async () => {
  const [movies, tv] = await Promise.all([
    tmdb.genres.movies(),
    tmdb.genres.tv(),
  ]);
  return { movies: movies.genres, tv: tv.genres };
}));

router.get("/now-playing", handle(async () => {
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${key}&language=pt-BR`);
  const data: any = await res.json();
  return data.results ?? [];
}));

router.get("/upcoming", handle(async () => {
  const key = getKey();
  // Fetch 3 pages of upcoming movies + 2 pages of upcoming TV series (discover)
  const today = new Date().toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  const [p1, p2, p3, tv1, tv2] = await Promise.allSettled([
    fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${key}&language=pt-BR&page=1`).then(r => r.json()),
    fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${key}&language=pt-BR&page=2`).then(r => r.json()),
    fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${key}&language=pt-BR&page=3`).then(r => r.json()),
    fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${key}&language=pt-BR&first_air_date.gte=${today}&first_air_date.lte=${in90}&sort_by=first_air_date.asc&page=1`).then(r => r.json()),
    fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${key}&language=pt-BR&first_air_date.gte=${today}&first_air_date.lte=${in90}&sort_by=first_air_date.asc&page=2`).then(r => r.json()),
  ]);
  const movies: any[] = [
    ...((p1 as any).value?.results ?? []),
    ...((p2 as any).value?.results ?? []),
    ...((p3 as any).value?.results ?? []),
  ];
  const tvItems: any[] = [
    ...((tv1 as any).value?.results ?? []).map((i: any) => ({ ...i, media_type: "tv", release_date: i.first_air_date })),
    ...((tv2 as any).value?.results ?? []).map((i: any) => ({ ...i, media_type: "tv", release_date: i.first_air_date })),
  ];
  // Deduplicate by id+type, sort by release date
  const seen = new Set<string>();
  const all: any[] = [];
  for (const item of [...movies, ...tvItems]) {
    const k = `${item.media_type ?? "movie"}:${item.id}`;
    if (!seen.has(k)) { seen.add(k); all.push(item); }
  }
  all.sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
  return all;
}));

router.get("/on-the-air", handle(async () => {
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/tv/on_the_air?api_key=${key}&language=pt-BR`);
  const data: any = await res.json();
  return data.results ?? [];
}));

router.get("/airing-today", handle(async () => {
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/tv/airing_today?api_key=${key}&language=pt-BR`);
  const data: any = await res.json();
  return data.results ?? [];
}));

router.get("/popular-people", handle(async () => {
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/person/popular?api_key=${key}&language=pt-BR`);
  const data: any = await res.json();
  return data.results ?? [];
}));

router.get("/search-person", handle(async (req) => {
  const q = String(req.query.q ?? "");
  if (!q.trim()) return [];
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${key}&language=pt-BR&query=${encodeURIComponent(q)}&include_adult=false`);
  const data: any = await res.json();
  return data.results ?? [];
}));

router.get("/person/:id", handle(async (req) => {
  const id = Number(req.params.id);
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/person/${id}?api_key=${key}&language=pt-BR&append_to_response=movie_credits,tv_credits,images`);
  return res.json();
}));

router.get("/person/:id/movie_credits", handle(async (req) => {
  const id = Number(req.params.id);
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/person/${id}/movie_credits?api_key=${key}&language=pt-BR`);
  const data: any = await res.json();
  return (data.cast ?? []).sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0));
}));

router.get("/person/:id/tv_credits", handle(async (req) => {
  const id = Number(req.params.id);
  const key = getKey();
  const res = await fetch(`https://api.themoviedb.org/3/person/${id}/tv_credits?api_key=${key}&language=pt-BR`);
  const data: any = await res.json();
  return (data.cast ?? []).sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0));
}));

router.get("/discover-country", handle(async (req) => {
  const type    = String(req.query.type ?? "movie");
  const country = String(req.query.country ?? "US");
  const page    = Number(req.query.page ?? 1);
  const LANG_MAP: Record<string, string> = { BR: "pt", US: "en", KR: "ko", JP: "ja", GB: "en", FR: "fr", IT: "it", ES: "es" };
  const lang = LANG_MAP[country] ?? "en";
  const path = type === "tv" ? "tv" : "movie";
  const key  = getKey();
  const res  = await fetch(`https://api.themoviedb.org/3/discover/${path}?api_key=${key}&language=pt-BR&with_original_language=${lang}&page=${page}&include_adult=false&sort_by=popularity.desc`);
  return res.json();
}));

router.get("/discover-lang", handle(async (req) => {
  const type    = String(req.query.type ?? "movie");
  const lang    = String(req.query.lang ?? "en");
  const genreId = Number(req.query.genre_id ?? 0);
  const page    = Number(req.query.page ?? 1);
  const sortBy  = String(req.query.sort_by ?? "popularity.desc");
  const path    = type === "tv" ? "tv" : "movie";
  const key     = getKey();
  let url = `https://api.themoviedb.org/3/discover/${path}?api_key=${key}&language=pt-BR&with_original_language=${lang}&page=${page}&include_adult=false&sort_by=${encodeURIComponent(sortBy)}`;
  if (genreId > 0) url += `&with_genres=${genreId}`;
  const res = await fetch(url);
  return res.json();
}));

router.get("/redeflix/ids", handle(async () => {
  const [movieIds, tvIds] = await Promise.all([
    tmdb.redeflix.listMovieIds(),
    tmdb.redeflix.listTvIds(),
  ]);
  return {
    movieIds: tmdb.redeflix.parseIds(movieIds).slice(0, 100),
    tvIds: tmdb.redeflix.parseIds(tvIds).slice(0, 100),
  };
}));

router.get("/redeflix/list-ids", async (req: any, res: any) => {
  const type = String(req.query.type ?? "movie");
  try {
    let txt = "";
    if (type === "movie") txt = await tmdb.redeflix.listMovieIds();
    else if (type === "tv") txt = await tmdb.redeflix.listTvIds();
    else if (type === "anime") txt = await tmdb.redeflix.listAnimeIds();
    else if (type === "dorama") txt = await tmdb.redeflix.listDoramaIds();
    else { res.json([]); return; }
    res.json(tmdb.redeflix.parseIds(txt));
  } catch (err: any) {
    req.log.error({ err }, "redeflix list-ids error");
    res.json([]);
  }
});

// ── GET /find/:imdb_id — converte ID IMDB → dados TMDB (movie_results / tv_results)
router.get("/find/:imdb_id", handle(async (req) => {
  const imdbId = String(req.params.imdb_id ?? "").trim();
  if (!imdbId) throw new Error("imdb_id obrigatório");
  const key = getKey();
  const r = await fetch(
    `https://api.themoviedb.org/3/find/${imdbId}?api_key=${key}&external_source=imdb_id&language=pt-BR`
  );
  if (!r.ok) throw new Error(`TMDB find falhou: ${r.status}`);
  return r.json();
}));

router.get("/redeflix/url", (req, res) => {
  const type = String(req.query.type ?? "movie");
  const id = String(req.query.id ?? "");
  const season = Number(req.query.season ?? 1);
  const episode = Number(req.query.episode ?? 1);

  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  const url =
    type === "tv"
      ? tmdb.redeflix.tvUrl(Number(id), season, episode)
      : tmdb.redeflix.movieUrl(Number(id));

  res.json({ url });
});

export default router;
