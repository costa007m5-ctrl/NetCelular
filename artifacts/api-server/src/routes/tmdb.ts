import { Router } from "express";
import { tmdb } from "../lib/tmdb";

const router = Router();

const handle = (fn: (req: any, res: any) => Promise<any>) =>
  async (req: any, res: any) => {
    try {
      if (!process.env["TMDB_API_KEY"]) {
        res.status(503).json({ error: "TMDB_API_KEY not configured" });
        return;
      }
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

router.get("/discover", handle(async (req) => {
  const type = String(req.query.type ?? "movie");
  const genreId = req.query.genre_id ? Number(req.query.genre_id) : undefined;
  const page = Number(req.query.page ?? 1);
  if (type === "tv") {
    return tmdb.discover.tv(genreId, page);
  }
  return tmdb.discover.movies(genreId, page);
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

router.get("/genres", handle(async () => {
  const [movies, tv] = await Promise.all([
    tmdb.genres.movies(),
    tmdb.genres.tv(),
  ]);
  return { movies: movies.genres, tv: tv.genres };
}));

router.get("/redeflix/ids", handle(async () => {
  const [movieIds, tvIds] = await Promise.all([
    tmdb.redeflix.listMovieIds(),
    tmdb.redeflix.listTvIds(),
  ]);
  const parseIds = (txt: string) =>
    txt.split("\n").map((l) => l.trim()).filter(Boolean).map(Number).filter(Boolean);

  return {
    movieIds: parseIds(movieIds).slice(0, 100),
    tvIds: parseIds(tvIds).slice(0, 100),
  };
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
