---
name: Flix2 CDN routing and playback architecture
description: How cineveo.lat, fontedecanais, and nixplay.lat streams are resolved and played in native APK vs web.
---

## Architecture (June 2026 — on-device resolution with proxy fallback)

### Native (Android/iOS APK) — PRIMARY PATH

For native, `flix2-player.tsx` tries to resolve the nixplay.lat redirect **on the device itself** first.
This binds any IP-based CDN token to the **device's IP**, not the server's IP.

```
rawFlix2Url (nixplay.lat)
  → device GET with FLIX2_HEADERS (browser UA + Referer)
  → redirect:follow → resp.url = final CDN URL
  → if resp.ok AND (isFonteUrl OR isCineveoUrl): expo-av plays finalUrl with FLIX2_HEADERS
  → else (nixplay.lat direct stream / 403 / TeraBox): fall through to server+proxy path
```

**Critical guard (must have both conditions):**
- `resp.ok` — the CDN must return 2xx, not 403/error
- `isFd || isCv` — URL must have redirected to a real CDN (fontedecanais or cineveo)

If the URL is still `nixplay.lat` after following redirects (direct Xtream Codes stream, no CDN redirect),
or if the CDN returns 403 (pre-resolved server-IP-bound token), fall through to server+proxy path.

### Web — always proxy (CORS)
```
rawFlix2Url → /flix2/stream-url (server) → CDN URL → /api/stream/proxy → web player
```

### Native FALLBACK (device fetch didn't land on known CDN / 403 / TeraBox)
```
rawFlix2Url → /r2/flix2/stream-url (server, redirect:manual HEAD)
  → CDN URL (cineveo.lat, fontedecanais, or nixplay direct)
    cineveo: play direct with FLIX2_HEADERS
    fontedecanais / nixplay.lat direct / TeraBox: proxy via /api/stream/proxy
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
- nixplay.lat IS in ALLOWED_UPSTREAM_HOSTS and FLIX2_CDN_ROOTS — proxy handles direct streams

## CDN URL formats
- cineveo.lat: `https://vod99.cineveo.lat/m/Title.mp4?exp=...&sig=...` (time-based sig, any IP)
- fontedecanais: `http://www-fontedecanais-me.72yrci50ppqp71.com:80/movies/.../xxx.mp4?username=...&token=...` (token IP-bound to Replit server, HTTP port 80)
- nixplay.lat direct: `https://nixplay.lat/movie/user/pass/id.mp4` (Xtream Codes, streams directly — always proxy)

`usesCleartextTraffic: true` is set in app.json — allows HTTP port 80 (fontedecanais) in APK.

## /flix2/stream-url (api-server r2.ts)
- Uses `redirect:manual` + HEAD to nixplay.lat — reads Location header without downloading body
- If 302 to CDN: returns CDN URL (client plays direct for cineveo, proxies for fontedecanais)
- If 200 (nixplay direct stream): returns nixplay.lat URL → client always proxies it
- `/flix2/stream-url` is in `SERVER_ONLY_ROUTES` in r2-direct.ts — always forwarded to API server

## Bug fixed (June 2026)
Old code: native fast path checked only `finalUrl && !isTeraboxUrl(finalUrl)` → played directly even for:
  - nixplay.lat direct streams (no CDN redirect) — ExoPlayer blocked by Cloudflare WAF
  - 403 responses (pre-resolved server-IP-bound tokens) — ExoPlayer fails silently

Fix: now requires `resp.ok && (isFd || isCv)` for direct play. Any other case falls through to proxy.
