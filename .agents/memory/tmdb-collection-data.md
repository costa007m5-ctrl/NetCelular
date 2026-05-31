---
name: TMDB collection data in franchise.tsx
description: How synopsis, year range, and total hours are fetched and displayed for TMDB collections
---

# TMDB Collection Data

Three state vars added to `franchise.tsx`: `collectionOverview`, `collectionYearRange`, `collectionTotalHours`.

In the `isTmdbCollection` fetch branch, after getting `api.tmdb.collection(tmdbColId)`:
- `overview` comes directly from the API response
- `yearRange` is computed from `parts[].release_date` (min–max years)
- `totalHours` is estimated as `Math.round(parts.length * 105 / 60)` (avg 105 min/film)

`dynamicFranchise` object references these state vars instead of hardcoded empty strings/0.

**Why:** The TMDB collection API returns `overview` and `parts[]` with release dates; computing yearRange client-side avoids extra API calls.
