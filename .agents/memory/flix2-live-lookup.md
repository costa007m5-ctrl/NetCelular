---
name: Flix 2.0 live lookup in detail screen
description: How /flix2/lookup works, its 4-path architecture, and why partial cache is critical for mid-warm-up lookups.
---

## Architecture

`detail.tsx` calls `/flix2/lookup?tmdbId=X&type=all|movies&title=Y` in "Fase 2" (background, after registry loads).

Result is used to inject virtual RegistryItems:
- `fi.stream_url` → single movie item (season=null, episode=null)
- `fi.episodes[]` → one RegistryItem per episode (for series/tv)
- Fallback: calls `/flix2/series-episodes?seriesId=X`

For TV: `flix2Type = "all"` (not "movies"). For movies: `flix2Type = "movies"`.

## 4-Path Lookup (in order)

**Path 1**: R2 index file (`__flix2-index-{type}.json`) — instant, only has stream_url directly. Skips entries starting with "flix2id:".

**Path 2a**: `FULL_CATALOG_CACHE` — instant, covers ALL pages, only available once warm-up finishes (~2-5min post-startup).

**Path 2b**: `WARM_PARTIAL_CACHE` — available MID-warm-up; grows by 15-page batches. Allows The Rookie (page ~150 of 377) to be found even before warm-up completes, as long as that page range is loaded.

**Path 3**: Live page scan — fallback when cache is idle or partial didn't have it yet. Limited to 200 pages for series/animes, 50 for movies.

## Type order for "all"
`typesToCheck = ["series", "animes", "movies"]` — series checked first so TV shows find their match before the slower movies cache warms up.

**Why:** movies have 821 pages and warm last. Checking movies first (old behavior) caused 10-15s slow scans for TV shows before series cache was checked.

## WARM_PARTIAL_CACHE details

`WARM_PARTIAL_CACHE` is set to `allItems` (reference) after each 15-page batch in `warmCatalogType`. Deleted when `FULL_CATALOG_CACHE` is set (full warm done). Stores non-deduped raw items. Safe for concurrent reads (Node.js single-threaded).

**Why:** Without partial cache, lookups during the ~2-5min warm-up window fell through to the 15-20s slow scan, causing "Conteúdo indisponível" on the detail screen while Fase 2 was running.
