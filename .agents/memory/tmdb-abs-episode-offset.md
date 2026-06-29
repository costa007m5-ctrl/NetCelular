---
name: TMDB absolute episode numbering vs Xtream relative numbering
description: Some series (e.g. One Piece) have TMDB episode_number as absolute across seasons while Xtream uses relative (per-season) numbering; detail.tsx must apply cumulative offset when matching.
---

## The rule

TMDB uses **absolute episode numbering** for some long-running series (One Piece, Naruto, Dragon Ball, etc.). Season 2 episode 1 gets `episode_number = 62` (total episodes up to S1 end + 1). The Xtream/Flix2 provider uses **relative episode numbering** — season 2 episode 1 always has `episode = 1`.

**Why:** The filter `flix2SpecificEps.some(i => Number(i.episode) === ep.episode_number)` always fails for seasons > 1 when TMDB uses absolute numbers, because `1` never equals `62`.

## How to apply

In `detail.tsx` render (inside the episode tab IIFE), after computing `flix2SpecificEps`:

1. Compute cumulative offset: `tmdbAbsOffset = sum of seasons[1..selectedSeason-1].episode_count`
2. Detect mismatch: `useAbsOffset = tmdbAbsOffset > 0 && flix2MaxEp > 0 && tmdbMinEp > flix2MaxEp`
3. Convert: `toFlix2Ep = (n) => useAbsOffset ? n - tmdbAbsOffset : n`
4. Apply in: `displayedEpisodes` filter, `flixEpForRow` lookup, and `goToFlix2Player` call (pass `flix2EpNum` not `ep.episode_number`)

The detection heuristic (`tmdbMinEp > flix2MaxEp`) is safe: it only activates when TMDB's lowest episode number in the season is higher than the highest Xtream episode number for that season — conclusive proof of absolute vs relative mismatch.

## Root cause of the race condition that triggered the bug

1. `loadEps()` (async) and the synthetic extension (sync start) both fire when `selectedSeason` changes.
2. Synthetic extension runs first (synchronous) with the OLD `episodeList` (S1 data, ep_numbers 1..63).
3. `existingNums = {1..63}` → S2 flix2 eps (1..16) are already "seen" → nothing added.
4. `loadEps()` then completes → `setEpisodeList([62..77])` (TMDB S2 absolute) replaces state.
5. Synthetic extension does NOT re-run (no dependency changed again).
6. `episodeList = [62..77]`, flix2 S2 = {1..16} → 0 matches → "Nenhum episódio encontrado".

The offset fix resolves this at the **display layer** without needing to fix the race condition.
