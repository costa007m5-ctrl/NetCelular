---
name: Flix2 CDN routing and playback architecture
description: How cineveo.lat, fontedecanais, and nixplay.lat streams are resolved and played in native APK vs web.
---

## Architecture (June 2026 — cineveo direct, fontedecanais always proxy)

### Native (Android/iOS APK) — CURRENT PATH

```
rawFlix2Url (nixplay.lat or CDN URL)
  → device GET with FLIX2_HEADERS (browser UA + Referer)
  → redirect:follow → resp.url = final CDN URL

  If resp.ok AND isCineveoUrl(finalUrl):
    → expo-av plays direct with FLIX2_HEADERS (cineveo: time-based token, any IP)

  All other cases (fontedecanais, nixplay direct, 403, unknown):
    → fall through to server+proxy path
```

### Why fontedecanais ALWAYS goes through proxy (never direct on device)
- **Token is IP-bound to Replit SERVER IP** — device gets 403 even if it resolved the URL
- **HTTP port 80 cleartext**: ExoPlayer can't play HTTP in Expo Go (and even in APK it's unreliable)
- **Cloudflare WAF**: blocks ExoPlayer UA on byte-range requests even with browser UA in headers
- Fix: removed `isFd` from the direct-play condition in `loadVideoUrl()` — only `isCv` plays direct

### Server+proxy path (web / fontedecanais / TeraBox / nixplay direct / fallback)
```
rawFlix2Url → /api/r2/flix2/stream-url (server, HEAD + redirect:manual)
  302 to cineveo.lat → cineveo URL → native: play direct; web: proxy
  302 to fontedecanais → server-IP-bound token → client proxies via /api/stream/proxy
  200 (nixplay direct stream) → nixplay URL → client proxies via /api/stream/proxy
  302 to TeraBox → resolve via xAPIverse → proxy
```

## FLIX2_HEADERS (used for cineveo direct play)
```javascript
{
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
  "Referer": "https://nixplay.lat/",
  "Origin": "https://nixplay.lat",
}
```

## CDN host helpers (flix2-player.tsx)
```javascript
const isFonteUrl = (u) => ["72yrci50ppqp71.com", "fontedecanais.me"].some(r => u.includes(r));
const isCineveoUrl = (u) => u.includes("cineveo.lat");
const isTeraboxUrl = (u) => ["terabox.com", ...].some(h => u.includes(h));
```

## Stream proxy (stream.ts)
- Sends browser UA + `Referer: https://nixplay.lat/` for all Flix2/nixplay/fontedecanais hosts
- `Accept-Ranges: bytes` advertised — ExoPlayer can seek in proxied MP4
- HLS m3u8 rewriting: all segment URIs go through proxy
- nixplay.lat, fontedecanais, cineveo.lat all in ALLOWED_UPSTREAM_HOSTS + FLIX2_CDN_ROOTS

## Admin Panel — IP do Servidor
`/api/server-info` endpoint (health.ts) returns server public IP (cached 60s via api.ipify.org).
Admin "PROXY CDN — IP DO SERVIDOR" section in Sistema tab shows IP to whitelist in IPTV panel.
IP may change on Replit server restart — user must update whitelist when videos stop working.
Current known IP: 35.196.242.179 (June 2026 — will change on restarts).

## /flix2/stream-url (api-server r2.ts)
- Uses `redirect:manual` + HEAD to nixplay.lat — reads Location header
- If 302: returns CDN URL; if 200 (nixplay direct): returns nixplay URL → client proxies
- In `SERVER_ONLY_ROUTES` in r2-direct.ts → always forwarded to API server
