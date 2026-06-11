---
name: Flix2 CDN routing and proxy architecture
description: How nixplay.lat streams are resolved and proxied; routing rules for nixplay/cineveo/fontedecanais on native vs web.
---

## Definitive architecture (June 2026 — nixplay+cineveo via CF Worker)

### Stream chain for nixplay.lat VOD

```
nixplay.lat/movie/{user}/{pass}/{id}.mp4
  → 302 → https://vod99.cineveo.lat/m/{title}?exp=...&sig=...  (time-based sig, any IP)
  OR → http://www-fontedecanais-me.72yrci50ppqp71.com:80/...?token=...  (IP-bound token)
  OR (some items) → direct 200 from nixplay.lat
```

### Routing rules (flix2-player.tsx)

| CDN | Platform | Strategy | Why |
|-----|----------|----------|-----|
| nixplay.lat URL | native | **CF WORKER** | 302 → HTTP fontedecanais; ExoPlayer blocks HTTPS→HTTP; token IP-bound to device → CDN rejects; CF Worker resolves+proxies with CF IP |
| cineveo.lat URL | native | **CF WORKER** | Referer/Origin must be set server-side; CDN rejects without them |
| fontedecanais direct URL | native | **DIRECT** with browser headers | Already-resolved URL; token bound to whoever resolved it |
| any | web | **PROXY** (Replit) | CORS blocks direct media requests from browser |

### Why nixplay.lat CANNOT use WebViewVideoPlayer in APK

WebViewVideoPlayer was the previous approach but fails in the APK:
- nixplay.lat redirects to `http://fontedecanais` (HTTP, not HTTPS)
- Even with mixedContentMode="always", the token generated is IP-bound to the **device's IP**
- The fontedecanais CDN blocks mobile/carrier IPs → 403

### CF Worker for nixplay + cineveo (current solution)

Worker URL: `https://netplay-stream-proxy.netplay.workers.dev`
Deployed to account: `9827b92a6b3a621e8c6f50274e68f37b` (netplay subdomain)
Script: `artifacts/cf-worker/stream-proxy.js`

**Flow for nixplay.lat URLs:**
1. flix2-player passes nixplay URL to `CF_WORKER_URL/?url=<encoded nixplayUrl>`
2. CF Worker detects `nixplay.lat` hostname → calls `resolveNixplay()` (HEAD with redirect:manual)
3. Worker gets fontedecanais Location header → token IP-bound to CF's edge IP
4. Worker fetches fontedecanais CDN from same CF IP → token valid
5. Worker streams bytes with Range headers → ExoPlayer seeks normally

**CRITICAL:** Always pass `rawFlix2Url` (nixplay.lat URL) to Worker — NOT the already-resolved CDN URL.
If you pass the pre-resolved CDN URL: token is bound to whoever resolved it (Replit IP or another CF edge) → likely 403.

### Why Replit proxy fails for fontedecanais

Confirmed in logs: Replit's production reverse proxy strips all `Range` headers from inbound requests
(`clientRange=false` in every log). ExoPlayer Range seek loop → abort.

### hubby.cx — CDN Flix 2.0 (IP-bound)

Same as fontedecanais. isIpBoundCdn detection → CF Worker routing. hubby.cx in FLIX2_CDN_ROOTS.

### ExoPlayer seeking modes

- 200 response: progressive download → fails for files >~500MB, no seeking
- 206 response: range-based → reads few KB moov atom, aborts, sends Range requests for seeking
  (the "request aborted" in logs after 206 is NORMAL — ExoPlayer moov-atom seeking)
