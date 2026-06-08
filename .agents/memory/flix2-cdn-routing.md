---
name: Flix2 CDN routing and proxy architecture
description: How nixplay.lat streams are resolved and proxied; routing rules for cineveo vs fontedecanais on native vs web.
---

## Definitive architecture (June 2026, revised)

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
| cineveo.lat | native | **DIRECT** with browser headers | Token not IP-bound; proxy through Cloudflare causes ExoPlayer to abort (see below) |
| cineveo.lat | web | **PROXY** | Browser CORS blocks direct CDN requests |
| fontedecanais | native | **PROXY** | Token IS IP-bound to Replit server IP; device IP ≠ server IP |
| fontedecanais | web | **PROXY** | CORS + IP-bound token |

### Why PROXY fails for cineveo on native (ExoPlayer)

The proxy chain is `ExoPlayer → Cloudflare → Replit API server → cineveo`.

ExoPlayer sends an initial `GET` (no Range header). The proxy:
1. Fetches from cineveo using `Range: bytes=0-` → gets `206` with 2.2 GB body
2. Returns `200 OK, Content-Length: 2199061564, Accept-Ranges: bytes` to ExoPlayer
3. Starts streaming 2.2 GB through Cloudflare

**ExoPlayer aborts after ~900ms** — 4 retries, never sends any Range requests.

Root cause: The proxy takes ~900ms just to get first bytes from cineveo. Cloudflare
buffers/transforms the large streaming response in a way that ExoPlayer cannot parse
(no Range requests arrive at all after the initial 900ms abort). The response status
(`200` vs `206`) doesn't matter — the abort pattern persists regardless.

### Why DIRECT works for cineveo on native

cineveo token is time+sig based — **not IP-bound** → device IP is fine.
ExoPlayer (via expo-av) plays the URL directly with custom headers:
```javascript
videoSourceHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "Referer": "https://nixplay.lat/",
  "Origin": "https://nixplay.lat",
}
```
ExoPlayer sends `Range: bytes=0-` to cineveo directly, then seeked to moov atom
(e.g. `Range: bytes=2192310272-2199061563` for a 2.2 GB file) → completed ✓

Note: Earlier claim that "Cloudflare WAF blocks ExoPlayer TLS fingerprint" was WRONG.
cineveo does NOT block ExoPlayer TLS. Direct play works with browser UA headers.

### /flix2/stream-url behavior

- Sends HEAD with `redirect: manual` + `User-Agent: Mozilla/5.0`
- nixplay.lat responds 302 → cineveo.lat URL
- For fontedecanais: returns the original nixplay URL (not the fontedecanais URL)
  so the proxy can follow the redirect server-side with the correct IP
- 20s TTL cache; `?nocache=1` bypasses on retry

### Proxy (stream.ts) headers for cineveo/nixplay

```javascript
"User-Agent": UA,  // full browser UA
"Referer": "https://nixplay.lat/",
"Origin": "https://nixplay.lat",
```

### HTTP status fix (stream.ts, June 2026)

RFC 7233: servers MUST NOT return 206 unless client sent Range header.
- `clientRange=false` + upstream 206 → proxy returns `200 OK, Content-Length: full` (no Content-Range)
- `clientRange=true` → proxy forwards `206 + Content-Range` unchanged

### Confirmed working (dev logs, June 2026)

- Web browser: clientRange=true → proxy → cineveo 206 → request completed ✓
- Native ExoPlayer: direct cineveo URL + headers → Range requests directly to CDN ✓
  - Observed: `Range: bytes=2192310272-2199061563/2199061564` (moov seek) → completed ✓
