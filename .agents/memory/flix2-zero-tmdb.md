---
name: Flix2 tmdb_id=0 items
description: Fixes applied to make items without a TMDB ID visible and playable.
---

# Flix 2.0 items with tmdb_id=0

Items like "The Rookie" have `tmdb_id=0` in the Flix 2.0 API (no TMDB mapping). Three code points were dropping them silently.

## Fixes applied

### 1. Server catalog dedup (`r2.ts` — `catalog-full` endpoint)
- Old: `!id` check dropped tmdb_id=0 items during dedup
- New: dual Sets — `seenTmdb` for valid IDs, `seenFlix2` as fallback key (`flix2-${item.id}` or `title:${title}`)

### 2. Mobile catalog filter (`(tabs)/index.tsx` — `applyCatalog`)
- Old: `i.tmdb_id > 0` excluded all items without TMDB
- New: `hasId(i)` helper accepts items with valid flix2 `id` and `title`

### 3. Server `flix2/lookup` endpoint
- Old: `if (!id) return` prevented title-only search
- New: requires either `id > 0` OR `normTitle` present; `matchItem()` skips tmdb_id match when `id=0`

### 4. Mobile detail screen early return (`detail.tsx`)
- Old: `if (!tmdbId) { setR2Loading(false); return; }` blocked all source loading
- New: only returns early if BOTH tmdbId=0 AND title is empty
- TMDB-specific useEffects have their own `if (!tmdbId) return` guards — unaffected

### 5. Mobile detail loading state
- Old: "Load details" useEffect returned early for tmdbId=0, leaving `loading=true` forever
- New: `if (!tmdbId) { setLoading(false); return; }`
