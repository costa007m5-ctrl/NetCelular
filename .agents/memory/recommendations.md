---
name: Recommendations system
description: How the personalized recommendations row on the home screen works.
---

# Personalized Recommendations

## Implementation

`lib/recommendations.ts` — pure async function `computeRecommendations(allContent, userId, limit)`

### Signal collection (`fetchSignals`)
- `db.progress.getAll(userId)` → watched tmdbIds (progress > 5%), movie vs TV count
- `supabase.from("ratings").select(...)` → liked/disliked tmdbIds (no `db.ratings.getAll` helper exists — query direct)
- `db.watchlist.getAll(userId)` → watchlist tmdbIds (priority boost)

### Scoring (`scoreItem`)
- Skip: watched items (tmdbId in watchedIds), disliked, no poster
- +3 preferred type (movie vs TV based on history)
- +5 in watchlist but not watched
- +4 liked item
- +2.5 rating ≥ 8.0, +1.5 ≥ 7.0, +0.5 ≥ 6.0
- +1.5 year ≥ 2022, +0.5 year ≥ 2019
- +0–1.2 random jitter to vary results

### Home screen integration
- State: `recommendations: ContentItem[]` in HomeScreen
- Effect runs after `movies/series/animes` are loaded (useEffect deps)
- Section inserted between "Continue Assistindo" and "Em Alta Agora" (uses PosterRow + purple accent)
- Section hidden when empty (no user history = no recommendations shown)

**Why:** Users with history get personalized picks; users without history see nothing (no confusing empty row). Background computation doesn't block UI.
