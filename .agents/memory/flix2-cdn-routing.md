---
name: Flix2 CDN routing and proxy architecture
description: How nixplay.lat streams are resolved and proxied; why direct ExoPlayer play fails even for cineveo.
---

## Definitive architecture (June 2026)

### Stream chain for nixplay.lat VOD

```
nixplay.lat/movie/{user}/{pass}/{id}.mp4
  → 302 → https://vod99.cineveo.lat/m/{title}?exp=...&sig=...  (time-based sig, any IP)
  OR (some items) → direct 200 from nixplay.lat
```

### Why ExoPlayer CANNOT play cineveo.lat directly

Even though cineveo.lat uses time-based signatures (any IP OK), Cloudflare WAF still
blocks ExoPlayer's TLS fingerprint. Custom headers (browser UA, Referer) do NOT help
because Cloudflare inspects the TLS handshake / JA3 fingerprint, which is different for
Android ExoPlayer vs Chrome. The result is a Cloudflare 403.

**Proof**: `curl -H "User-Agent: ExoPlayer"` gets blocked; `curl` with browser UA works
but ExoPlayer's underlying HttpURLConnection/OkHttp TLS fingerprint still gets flagged.

### Solution: always proxy through Replit server

```
native + web:
  r2Route('/flix2/stream-url?streamUrl=encodedNixplayUrl')
  → API server HEAD nixplay.lat (redirect:manual) → reads Location header → cineveo URL
  → returns { url: "https://vod99.cineveo.lat/m/...?exp=...&sig=..." }

  getProxiedStreamUrl(cineveoUrl)
  → "https://{domain}/api/stream/proxy?url=encodedCineveoUrl"

  ExoPlayer loads from proxy:
  → proxy sends GET to cineveo.lat with browser UA + Referer: https://nixplay.lat/
  → 200 video/mp4 (2.1GB), Accept-Ranges: bytes ✅
```

### flix2-player.tsx (after June 2026 fix)

- Removed device-side fetch attempt entirely
- Removed cineveo direct-play path on native  
- ALWAYS uses server resolve → proxy for both web and native
- `setVideoSourceHeaders` NOT called for proxy path (proxy handles UA itself)

### Proxy (stream.ts) headers for cineveo/nixplay

```javascript
"User-Agent": UA,  // full browser UA
"Referer": "https://nixplay.lat/",
"Origin": "https://nixplay.lat",
```

### /flix2/stream-url behavior

- Sends HEAD with `redirect: manual` + `User-Agent: Mozilla/5.0`
- nixplay.lat responds 302 → cineveo.lat URL
- Server reads Location header → returns `{ url: cineveoUrl }`
- 20s TTL cache; `?nocache=1` bypasses on retry

### Confirmed working (curl test, June 2026)

- nixplay.lat/movie/Reis007-vods/Reis12@@/8943977.mp4 → 302 → cineveo URL → 200 2.1GB video/mp4
- Proxy: GET /api/stream/proxy?url=encodedNixplayUrl → 200 video/mp4 + Accept-Ranges ✅
- Server IP: 35.196.242.179 (changes on Replit restart)

### Admin panel — IP do Servidor

`/api/server-info` (health.ts) shows current server IP (cached 60s via ipify).
Admin → Sistema → "PROXY CDN — IP DO SERVIDOR" shows IP to whitelist in provider panel.
User (Reis007-vods on nixplay.lat) does NOT need to whitelist — nixplay uses time-based
tokens for cineveo CDN (any IP) + server proxy covers both CDNs transparently.
