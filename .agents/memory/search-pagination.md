---
name: Search pagination in api.ts and franchise search fallback
description: How to fetch multiple pages from TMDB search to avoid truncated franchise content lists
---

# Search Pagination

`api.tmdb.search(q, type, page)` — the `page` parameter (default 1) was added to both the direct TMDB path and the API server path (`/tmdb/search?q=...&page=N`). The API server already supported `page` via `req.query.page`.

In `franchise.tsx` search fallback: fetches pages 1, 2, 3 with `Promise.allSettled` to get ~60 results instead of the old hardcoded `.slice(0, 15)`.

**Why:** The 15-item slice was the root cause of "ver mais" collections ending early for franchises using the search fallback path.

**How to apply:** When any search-based list feels short, check for `.slice()` or single-page fetches in the load function.
