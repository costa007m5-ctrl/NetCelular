---
name: TeraBox xAPIverse integration
description: How xAPIverse API resolves TeraBox links and which URL types actually work for playback
---

## Rule
`normalizeTeraboxUrl()` must convert all TeraBox aliases to `1024tera.com` (NOT `www.terabox.com`).
xAPIverse's `/api/terabox-pro` endpoint rejects `www.terabox.com` with `INVALID_URL / code: INVALID_URL`.
Only `1024tera.com` and `teraboxapp.com` are accepted.

**Why:** Tested live — every request with `www.terabox.com` returned `{"status":"error","code":"INVALID_URL"}`. Same link on `1024tera.com` returned success with full file list.

## URL priority in /api/r2/terabox/play
Use this order — skip `stream_url`:

1. `fast_stream_url["1080p"|"720p"|"480p"|"360p"|"240p"]` — HLS m3u8 via xAPIverse CF Workers proxy (`*.workers.dev`). CORS open (`access-control-allow-origin: *`). This is the correct playable URL.
2. `fast_dlink` — direct download link, fallback only.
3. ~~`stream_url`~~ — **DO NOT USE**. Returns raw TeraBox CDN URL that requires browser cookies/CAPTCHA (`{"errmsg":"need verify_v2","errno":450005}`). Not playable directly.

**Why:** `stream_url` looks like a direct stream but the TeraBox CDN rejects unauthenticated server requests with a verification error. `fast_stream_url` m3u8s go through xAPIverse's own CF Workers proxy which handles auth internally.

## Token lifetime / HEAD check warning
xAPIverse signed tokens (`?token=...`) are short-lived. Do NOT do a HEAD/probe request before playing — it wastes the token and the subsequent GET may fail.
Play the URL immediately after receiving it from the API.

## Stream proxy allowlist
xAPIverse streams come from dynamic `*.workers.dev` subdomains (e.g. `cold-water-72f0.sibemy.workers.dev`, `iteraplay.tera-api28.workers.dev`). 
Added `if (host.endsWith(".workers.dev")) return true;` to `isAllowedHost()` in `stream.ts` to allow all CF Workers domains through the server proxy.

## How to apply
- Any time `normalizeTeraboxUrl` is called or the TeraBox play endpoint is touched, ensure the target domain is `1024tera.com`.
- In the player (`r2-player.tsx`), set `videoUrl` directly from the API response — no HEAD check, no proxy wrapping needed (CORS is open on xAPIverse CF Workers URLs).

## TeraboxWebViewResolver bugs (fixed)
- **Wrong normalize direction**: the original normalizeUrl was converting 1024tera.com → www.terabox.com. Should be the REVERSE: www.terabox.com → 1024tera.com.
- **Video URL filter**: original had `src.indexOf('terabox') < 0` which excluded Terabox CDN URLs (e.g. `d5.terabox.com`). Remove this filter — accept ANY `http` video URL.
- **Hidden WebView**: opacity 0.01 prevents user from manually clicking play. Use opacity 0.85 so the page is visible and interactive.
- **Web platform**: react-native-webview doesn't work in Chrome/web. On `Platform.OS === 'web'`, skip the resolver entirely and show "Abrir no Terabox" button with `Linking.openURL()`.
- **XHR response interception**: also intercept XHR *responses* (not just requests) to catch `fast_stream_url`/`fast_dlink` in JSON bodies.
- **Iframe blocked**: Terabox sets `X-Frame-Options: SAMEORIGIN` AND its Vue.js SPA makes direct cross-origin API calls — iframe proxy approach doesn't work even after stripping headers.
