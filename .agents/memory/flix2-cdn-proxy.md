---
name: Flix2 CDN proxy fix
description: Flix 2.0 CDNs have different Referer requirements; fontedecanais (72yrci50ppqp71.com) strictly validates Referer and blocks anything that isn't nixplay.lat; proxy must send correct Referer per CDN domain.
---

## Root Cause (diagnosed July 2026)

Flix2 content comes from multiple CDN providers with different Referer validation strictness:

| CDN | Domain | Referer validation | Example content |
|---|---|---|---|
| cineveo.lat | `vod99.cineveo.lat` | Lenient (any Referer) | Mestres do Universo |
| fontedecanais | `www-fontedecanais-me.72yrci50ppqp71.com:80` | Strict (must be nixplay.lat) | O Rei Leão |

**Why Expo Go worked but APK failed**: Expo Go opens the stream URL in a browser-like context with the correct Referer from the link origin. The proxy was sending `Referer: animezey...` for all domains — fontedecanais CDN blocked this. cineveo.lat was lenient so some content worked.

**Why some content worked in APK with raw URL + expo-av headers**: expo-av headers set `Referer: nixplay.lat` directly on the request. If expo-av propagated them properly, it worked. If not (or HLS), it failed. Unreliable approach.

## Architecture (all platforms — Android, iOS, Web)

All platforms route through the API proxy (`getProxiedStreamUrl(data.url)`). The proxy handles Referer correctly per CDN domain.

### CRITICAL — Proxy Referer per domain (stream.ts)
```typescript
// isFlix2Host() checks if URL hostname matches FLIX2_CDN_ROOTS
"Referer": isFlix2Host(decodedUrl) ? "https://nixplay.lat/" : "https://animezey16082023.animezey16082023.workers.dev/",
// Also add Origin for Flix2:
if (isFlix2Host(decodedUrl)) upstreamHeaders["Origin"] = "https://nixplay.lat";
```
**Why:** fontedecanais CDN (72yrci50ppqp71.com) validates Referer strictly. Sending the wrong Referer returns 403/block. cineveo.lat is lenient. Both need browser UA.

## FLIX2_CDN_ROOTS (fontedecanais + cineveo domains)
- `72yrci50ppqp71.com` — fontedecanais CDN; HTTP port 80; uses username+token auth
- `fontedecanais.me`
- `cineveo.lat` — covers vod99.cineveo.lat; HTTPS; uses exp+sig tokens
- `nixplay.lat`

**Note on URL formats:**
- cineveo.lat: `https://vod99.cineveo.lat/m/Title.mp4?exp=...&sig=...` (time-based sig, any IP)
- fontedecanais: `http://www-fontedecanais-me.72yrci50ppqp71.com:80/movies/.../xxx.mp4?username=...&token=...` (IP-bound token, HTTP port 80)

`usesCleartextTraffic: true` is set in app.json so HTTP port 80 is allowed in APK.

## Server — /flix2/stream-url (r2.ts)
redirect:manual on nixplay.lat → reads Location header → returns CDN URL.
nocache=1 always passed from client to bypass 20s cache (CDN signed URLs can expire).

## HLS manifest rewriting (stream.ts)
Proxy also rewrites HLS m3u8 segment URLs to go through proxy. Handles future HLS content.
Most current Flix2 content appears to be MP4 (not HLS), but the rewriting is in place as a safety net.
