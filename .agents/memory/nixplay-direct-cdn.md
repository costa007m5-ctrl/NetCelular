---
name: nixplay.lat CDN routing
description: nixplay.lat URLs redirect (302) to http:// fontedecanais CDN. Cross-scheme HTTPS→HTTP redirect is blocked by ExoPlayer even with usesCleartextTraffic. Fix: resolve redirect server-side via /flix2/stream-url, play fontedecanais URL directly. Fallback: proxy via /api/stream/proxy when resolution fails.
---

# nixplay.lat CDN routing (definitive)

## The problem
- `nixplay.lat/movie/{user}/{pass}/{id}.mp4` → 302 → `http://fontedecanais-me.72yrci50ppqp71.com/...`
- ExoPlayer follows the redirect but Android blocks the cross-scheme HTTPS→HTTP transition
- `android:usesCleartextTraffic="true"` does NOT help with cross-scheme redirects — only direct HTTP requests
- CF Worker (`netplay-stream-proxy.netplay.workers.dev`) returns 403 for nixplay.lat URLs (Worker only handles cineveo)

## The fix (OTA-deliverable)
1. **API server** (`/flix2/stream-url`): HEAD request to nixplay must use full browser UA + `Referer: https://nixplay.lat/` + `Origin: https://nixplay.lat`. Using only `"Mozilla/5.0"` causes nixplay to return 401 instead of 302.
2. **flix2-player.tsx**: for `isNixplayDirect(rawFlix2Url)` on native, call `/flix2/stream-url` to get the resolved fontedecanais URL, then pass it **directly** to ExoPlayer with browser UA headers. No cross-scheme redirect → `usesCleartextTraffic` allows the direct HTTP request.
3. **Fallback**: if `/flix2/stream-url` returns the same URL unchanged (resolution still failed), route through `getProxiedStreamUrl()` → `/api/stream/proxy` which handles the full redirect chain server-side.

## Routing table (nativo Android/iOS)
| URL | Strategy |
|---|---|
| `nixplay.lat` | Call `/flix2/stream-url` → resolve → play fontedecanais direct |
| `nixplay.lat` (resolution failed) | `getProxiedStreamUrl()` → `/api/stream/proxy` fallback |
| `cineveo.lat` | CF Worker (Referer/Origin server-side) |
| fontedecanais direct URL | Direct play with browser UA headers |
| Web | Replit proxy |

## Why server can resolve but ExoPlayer can't
- nixplay stream URLs have credentials in the path: `/movie/{user}/{pass}/{id}.mp4`
- Server HEAD with `redirect: manual` gets the 302 Location header
- Returns the `http://fontedecanais...` URL to the client
- Client gives that URL directly to ExoPlayer — no redirect needed
- `usesCleartextTraffic: true` in AndroidManifest allows direct HTTP (not cross-scheme redirect)

## CF Worker behavior
- `netplay-stream-proxy.netplay.workers.dev` → 403 for nixplay.lat (not configured for it)
- Works only for cineveo.lat (sets Referer/Origin server-side)
- fontedecanais CDN blocks Cloudflare IPs → Worker also can't proxy fontedecanais

## OTA publish from Replit (requires EXPO_TOKEN secret)
Pattern when EXPO_TOKEN is for `grupo-streaming-brasil-net` but app.json has netplaybr projectId:
1. Temporarily swap app.json owner+projectId to old values (sed -i)
2. `npx expo export --platform android --output-dir dist`
3. `GIT_INDEX_FILE=/tmp/eas-tmp-index EXPO_TOKEN=$EXPO_TOKEN eas update --branch production --non-interactive --skip-bundler --platform android --message "..."`
4. Restore app.json to netplaybr values (sed -i)
