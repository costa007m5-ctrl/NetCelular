---
name: nixplay.lat CDN routing
description: nixplay.lat blocks Replit datacenter IPs with 401. Fix: resolve redirect ON DEVICE using React Native fetch (mobile IP not blocked). response.url gives final fontedecanais URL after redirect. ExoPlayer plays fontedecanais directly (no cross-scheme redirect needed).
---

# nixplay.lat CDN routing (definitive)

## Root cause
- `nixplay.lat/movie/{user}/{pass}/{id}.mp4` → 302 → `http://fontedecanais...` CDN
- Replit server IP = datacenter IP → nixplay returns **401** (IP blocked)
- ExoPlayer: even if it reaches nixplay, it blocks cross-scheme HTTPS→HTTP redirect
- CF Worker: returns 403 for nixplay.lat (only handles cineveo)
- Server proxy: also blocked (same datacenter IP)

## The fix (client-side redirect resolution)
React Native `fetch` on Android:
- Follows redirects including HTTPS→HTTP (unlike ExoPlayer)  
- Mobile device IP is NOT blocked by nixplay
- `response.url` = final URL after all redirects = fontedecanais CDN URL
- Pass fontedecanais URL directly to ExoPlayer → no redirect needed

## Implementation (flix2-player.tsx)
```
fetch(nixplayUrl, { method:'GET', headers: FLIX2_HEADERS, Range:'bytes=0-0' })
  → response.url = fontedecanais URL
  → setVideoUrl(response.url)    // ExoPlayer plays direct, no redirect
```
Server call `/flix2/stream-url` is a fallback only (rarely succeeds due to IP block).

## Routing table (nativo Android/iOS)
| URL | Strategy |
|---|---|
| `nixplay.lat` | Client-side fetch → response.url → play fontedecanais direct |
| `nixplay.lat` (client fetch fails) | Server `/flix2/stream-url` fallback |
| `cineveo.lat` | CF Worker (Referer/Origin server-side) |
| fontedecanais direct URL | Direct play with browser UA headers |
| Web | Replit proxy |

## CF Worker behavior
- `netplay-stream-proxy.netplay.workers.dev` → 403 for nixplay.lat
- Works only for cineveo.lat

## OTA publish (requires EXPO_TOKEN secret in Replit)
Pattern when EXPO_TOKEN is for `grupo-streaming-brasil-net` but app.json has netplaybr projectId:
1. Temporarily swap app.json owner+projectId to old values (sed -i)
2. `npx expo export --platform android --output-dir dist`
3. `GIT_INDEX_FILE=/tmp/eas-tmp-index EXPO_TOKEN=$EXPO_TOKEN eas update --branch production --non-interactive --skip-bundler --platform android --message "..."`
4. Restore app.json to netplaybr values (sed -i)
