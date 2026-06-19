---
name: Shorts tab stream pipeline
description: How the Shorts TikTok-style feed resolves and plays Flix2 videos on web and native.
---

## Architecture

1. **Feed** (`GET /api/shorts/feed`) — TMDB trending, filtered to `pt`/`en`/`es` languages, `region=BR`, cached 30min.
2. **Resolve** (`shorts.tsx` useEffect) — calls `GET /api/r2/flix2/lookup?tmdbId=X&title=Y` for each visible item.
3. **Proxy** (`GET /api/shorts/stream-proxy?url=hubby.cx/...`) — server-side fetch follows HTTPS→HTTP redirect; streams MP4 bytes back over HTTPS.

## Key fixes

- **`enrichItem()` in r2.ts `/flix2/lookup`**: when a found item has `stream_url: null/""` and type=`"filme"`, builds URL as `${FLIX2_SERVER}/movie/${FLIX2_USER}/${FLIX2_PASS}/${item.id}.${ext}`. Applied on ALL return paths (Path 2a warm, 2b partial, 3 raw).
- **Resolver WebView (hidden)**: `ShortVideoCard` uses same pattern as `flix2-player.tsx` — a 0x0 WebView loads the hubby.cx URL; `onShouldStartLoadWithRequest` captures the 302 redirect to fontedecanais before the WebView navigates. This resolves the CDN URL on the device (device IP is accepted; datacenter IPs are blocked).
- **WebView props must match flix2-player**: `mixedContentMode="always"`, `userAgent=BROWSER_UA`, `domStorageEnabled`, `originWhitelist={["*"]}`, `setSupportMultipleWindows={false}`, `source={{ html, baseUrl }}` — all required for APK video playback.
- **Web uses `getProxiedStreamUrl()`** from `lib/gdrive-index.ts` → `/api/stream/proxy?url=...` (same proxy as flix2-player). NOT the custom `/api/shorts/stream-proxy` endpoint.
- **`fetchShortsFeed` fixed**: replaced `AbortSignal.timeout()` (crashes Hermes) with `AbortController+setTimeout`.

## Route mount structure

- `app.use("/api", router)` → `router.use("/r2", r2Router)` → Flix2 routes at `/api/r2/flix2/lookup`
- `router.use(shortsRouter)` (no prefix) → shorts routes at `/api/shorts/feed`, `/api/shorts/stream-proxy`

## Flix2 catalog notes

- Most catalog items have `tmdb_id: 0` → title matching is primary path
- `type: "filme"` for movies, `type: "serie"` for series
- Series `stream_url` is intentionally left null (episodes needed separately; shorts.tsx filters them out)
- Proxy validation: only allows `https://hubby.cx/` URLs to prevent open proxy abuse

## Running processes

- Two `index.mjs` processes can appear if both `Start application` and `API Server` workflows start simultaneously. Kill both with `pkill -f "dist/index.mjs"` and restart `Start application` workflow to get a clean single instance.

**Why:** Replit's production proxy strips Range headers, so server-side proxying works for linear playback (Shorts clips) but not for seeks. Native (Expo Go / APK) uses the raw hubby.cx URL directly — no proxy needed.
