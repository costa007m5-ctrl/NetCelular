---
name: Flix2 CDN routing and playback architecture
description: How cineveo.lat and fontedecanais streams are resolved and played in native APK vs web.
---

## Architecture (June 2026 — on-device resolution)

### Native (Android/iOS APK) — PRIMARY PATH

For native, `flix2-player.tsx` resolves the nixplay.lat redirect **on the device itself** (not via the server).
This binds any IP-based CDN token to the **device's IP**, not the server's IP.

```
rawFlix2Url (nixplay.lat)
  → device GET with FLIX2_HEADERS (browser UA + Referer)
  → redirect:follow → resp.url = final CDN URL (device-IP-bound token)
  → expo-av plays finalUrl with FLIX2_HEADERS
```

- `ctrl.abort()` immediately after `resp.url` read — cancels body download
- If device fetch fails/times out (12s) → falls through to server+proxy path
- TeraBox URLs → always fall through to server (needs xapiverse API)

### Web — always proxy (CORS)
```
rawFlix2Url → /flix2/stream-url (server) → CDN URL → /api/stream/proxy → web player
```

### Native FALLBACK (device fetch failed / TeraBox)
```
rawFlix2Url → /flix2/stream-url (server) → CDN URL
  cineveo: play direct with FLIX2_HEADERS
  fontedecanais / TeraBox: proxy via /api/stream/proxy
```

## FLIX2_HEADERS (used for all direct CDN requests)
```javascript
{
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "Referer": "https://nixplay.lat/",
  "Origin": "https://nixplay.lat",
}
```
**Why:** fontedecanais CDN (72yrci50ppqp71.com) validates Referer strictly (must be nixplay.lat).
cineveo.lat is lenient but also benefits from browser UA (Cloudflare WAF).

## CDN host helpers (flix2-player.tsx)
```javascript
const isFonteUrl = (u) => ["72yrci50ppqp71.com", "fontedecanais.me"].some(r => u.includes(r));
const isCineveoUrl = (u) => u.includes("cineveo.lat");
const isTeraboxUrl = (u) => ["terabox.com", "1024terabox.com", ...].some(h => u.includes(h));
```

## Stream proxy (stream.ts) — for web and fallback
- Proxy rewrites FLIX2_HEADERS per domain (Referer: nixplay.lat for Flix2 hosts)
- `Accept-Ranges: bytes` always advertised so ExoPlayer can seek in MP4
- HLS m3u8 manifest rewriting: segment URIs → proxy URLs (so ExoPlayer fetches with browser UA)

## CDN URL formats
- cineveo.lat: `https://vod99.cineveo.lat/m/Title.mp4?exp=...&sig=...` (time-based sig, any IP)
- fontedecanais: `http://www-fontedecanais-me.72yrci50ppqp71.com:80/movies/.../xxx.mp4?username=...&token=...` (token may be IP-bound, HTTP port 80)

`usesCleartextTraffic: true` is set in app.json — allows HTTP port 80 (fontedecanais) in APK.

## /flix2/stream-url (api-server r2.ts)
- Uses `redirect:manual` + HEAD to nixplay.lat — reads Location header without downloading body
- Server IPs may be blocked by Cloudflare CDN on HEAD follow (hence manual mode)
- nocache=1 always passed from client to bypass 20s cache
