---
name: Home posters TMDB URL fix
description: Why content card posters were blank in CodeMagic production builds.
---

## The problem
The local `toContent()` helper function defined inside `index.tsx`'s personalized content `useEffect` was using raw TMDB API response fields:
```js
posterPath: item.poster_path ?? "",      // "/abc.jpg"  ← broken
backdropPath: item.backdrop_path ?? "",  // "/xyz.jpg"  ← broken
```
These are relative paths. Image components require full URLs.

## The fix
Prepend the TMDB image base URLs explicitly inside the local helper:
```js
const TMDB_P = "https://image.tmdb.org/t/p/w500";
const TMDB_B = "https://image.tmdb.org/t/p/w1280";
posterPath: item.poster_path ? `${TMDB_P}${item.poster_path}` : "",
backdropPath: item.backdrop_path ? `${TMDB_B}${item.backdrop_path}` : "",
```

**Why:** The shared `tmdbItemToContent()` from lib/api.ts uses `TMDB_IMG()` to prepend, but local `toContent()` variants do not. In dev the images may appear cached/coincidentally, but in fresh production builds (CodeMagic) they show blank because no valid URI is provided.

**How to apply:** Any inline `toContent` or item mapping that reads TMDB API data must explicitly construct full URLs for image fields.
