---
name: Replit production proxy strips Range headers
description: Replit's reverse proxy strips HTTP Range headers from inbound requests in production; ExoPlayer abort-loops when video proxy relies on Range.
---

## Rule
Never proxy video streams through the Replit API server for native ExoPlayer playback. Replit's production reverse proxy strips HTTP `Range` headers from inbound requests before they reach the app server.

**Why:** ExoPlayer's flow for faststart MP4:
1. Sends GET (no Range) → reads moov atom (first 1-2 MB) → closes connection
2. Sends GET (Range: bytes=N-) to seek to video data → **Replit strips Range** → server sees non-Range GET → returns 200 with full file again
3. ExoPlayer repeats 3-4 times → "Erro ao reproduzir vídeo"

**Evidence from logs:** All production proxy requests show `clientRange=false` regardless of what ExoPlayer sends. Local dev server correctly receives Range headers (`clientRange=true` when curl sends Range header).

**How to apply:**
- For native (Android/iOS): always use the CDN URL **directly** from the device with browser headers (`User-Agent`, `Referer`, `Origin`). ExoPlayer sends Range requests directly to the CDN — no Replit proxy in the path.
- For web: proxy is fine (browser doesn't use Range in the same way, and CORS requires a proxy anyway).
- Both fontedecanais and cineveo CDN tokens are time-based (not IP-bound) → device can access directly.
- `android:usesCleartextTraffic: true` is already set in app.json for HTTP CDN URLs.
