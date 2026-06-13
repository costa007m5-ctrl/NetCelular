---
name: TMDB server-only integration
description: All TMDB API calls route through the Express server proxy; the API key never lives in client code.
---

## Rule
`lib/api.ts` must NOT contain any TMDB API key or direct TMDB fetch calls. All `api.tmdb.*` methods call `apiFetch("/tmdb/...")` only.

**Why:** The hardcoded key was exposed in the Expo JS bundle (readable by anyone). The server holds `TMDB_API_KEY` as an env var and proxies all requests.

## Server routes (routes/tmdb.ts)
Full list of proxied routes: trending, popular/movies, popular/tv, top/movies, top/tv, search, movie/:id, movie/:id/similar, tv/:id, tv/:id/similar, tv/:id/season/:seasonNum, collection/:id, discover, streaming, streaming-genre, discover-keyword, discover-country, discover-lang, genres, movie/:id/providers, tv/:id/providers, franchise-logo, popular-collections, search-collections, redeflix/available, redeflix/ids, redeflix/list-ids, redeflix/url, now-playing, upcoming, on-the-air, airing-today, popular-people, search-person, person/:id, person/:id/movie_credits, person/:id/tv_credits.

## Cinema 2026 enrichment (routes/r2.ts)
`Tmdb2026Entry` stores `{ date, ptTitle, enTitle, vote, backdropPath, posterPath, overview }` from TMDB Discover API.
The `cinema-2026` endpoint injects TMDB images/synopsis into each matched Xtream item via `TMDB_IMG_SRV()`.

## Expo export workaround
When both `Start application` and `artifacts/mobile: expo` workflows run simultaneously, plain `expo export` fails (Metro port conflict, exit -1, no output). Fix: `METRO_PORT=19116 expo export --platform web --output-dir dist`.
