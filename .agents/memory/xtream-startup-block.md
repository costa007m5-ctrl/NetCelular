---
name: Xtream startup IP block fix
description: Production server's concurrent warmCatalogType calls fail on first startup due to Xtream blocking simultaneous connections; retry + XTREAM_RAW_CACHE fallback pattern.
---

## Rule
`warmCatalogType("movies")` and `warmCatalogType("series")` fail silently in production on startup (Xtream/hubby.cx blocks or drops concurrent server-IP connections). Only `animes` (run sequentially 30s later) succeeds.

**Why:** Replit production IPs get rate-limited or refused by Xtream on the first burst of parallel connections. The sequential animes warm succeeds because the block lifts after ~30s.

**How to apply:**
1. `warmCatalogType` catch block schedules retries at 15s/30s/45s intervals (up to 3).
2. `whats-new` and `cinema-2026` endpoints use `XTREAM_RAW_CACHE.get(type)?.items` as fallback when `FULL_CATALOG_CACHE` is empty — raw cache gets populated by any `xtreamFetchAll` call (e.g. from catalog-full requests by the Home tab).
3. Mobile `fetchWhatsNew` retries on `warming=true` even when `total > 0` — otherwise, animes having items prevents retry while movies/series stay empty.
