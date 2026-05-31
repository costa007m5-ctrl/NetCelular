---
name: Novidades tab and redeflixapi list endpoints
description: How the Novidades tab fetches content and where it sits in the tab bar
---

## Tab bar position
Novidades is the **2nd visible tab** (after Início) in both ClassicTabLayout and NativeTabLayout.
The old "channels/TV" tab is now hidden (`href: null`) — still accessible via `router.push("/channels")`.

## Content source
Content comes from redeflixapi.store text file list endpoints (NOT TMDB new-content endpoints):
- `https://redeflixapi.store/list-movie-ids.txt`
- `https://redeflixapi.store/list-tv-ids.txt`
- `https://redeflixapi.store/list-anime-ids.txt`
- `https://redeflixapi.store/list-dorama-ids.txt`

Each file returns TMDB IDs, one per line, **newest first**.

## API method
`api.redeflix.listIds(type: "movie" | "tv" | "anime" | "dorama"): Promise<number[]>`
Added to the `redeflix` object in `lib/api.ts`.

## Load strategy
1. Fetch all 4 ID lists in parallel
2. Take first 12 IDs from each
3. For anime/dorama: infer type by checking if ID appears in the known TV or movie ID sets; default to TV
4. Fetch TMDB details in parallel (`api.tmdb.movie(id)` or `api.tmdb.tv(id)`)
5. TV series response includes `last_episode_to_air` — used for "Novos Episódios" section

## Sections
- Hero banner (rotating, 5s interval) — first 4 movies + first 2 series
- Filter pills: Todos / Filmes / Séries / Animes / Doramas
- 🎬 Novos Filmes (movies)
- 📺 Novas Séries (tv)
- 🔴 Novos Episódios (tv series with `last_episode_to_air` populated)
- 🎌 Animes
- 🌸 Doramas

**Why:** The redeflixapi.store list endpoints represent actual content added to the platform (newest first), so using them gives accurate "what's new" results vs TMDB's generic new-content endpoints which don't reflect the flix API catalog.
