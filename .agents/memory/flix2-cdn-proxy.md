---
name: Flix2 CDN proxy fix
description: Flix 2.0 CDN blocks ExoPlayer UA in signed APKs; proxy rewrites HLS manifests so ALL segment requests also use browser UA; server uses redirect:manual + nocache=1 per request.
---

## Architecture (all platforms — Android, iOS, Web)

All platforms route through the API proxy (`getProxiedStreamUrl(data.url)`). Never use raw CDN URL + expo-av headers for Android — it only covers the manifest, not segments.

### Why proxy-only works now
The proxy (`/api/stream/proxy`) now includes **HLS manifest rewriting**:
1. Detects if upstream response is an m3u8 (Content-Type or URL extension)
2. Rewrites ALL segment URIs (`.ts/.aac/.mp4`) and init-section URIs to go through the same proxy
3. Returns the rewritten manifest to the player

ExoPlayer then fetches every segment via the proxy → proxy uses browser UA → Cloudflare CDN doesn't block.

### WRONG approach (DO NOT use)
```typescript
// WRONG — custom headers on expo-av only cover manifest, NOT segment requests
// in some ExoPlayer versions/configurations:
if (Platform.OS === "android") {
  url = data.url; // raw CDN
  setVideoSourceHeaders({ "User-Agent": "...", "Referer": "..." });
}
```

### CORRECT approach
```typescript
// ALL platforms: proxy handles UA headers + HLS manifest rewriting
url = getProxiedStreamUrl(data.url);
```

## Server — /flix2/stream-url (r2.ts)

### redirect:manual (critical)
```typescript
response = await fetch(streamUrl, { method: "HEAD", redirect: "manual", ... });
const finalUrl = response.headers.get("location") || streamUrl;
```
**Why:** vod99.cineveo.lat CDN blocks server IPs on HEAD with redirect:follow (times out 8s). redirect:manual only hits nixplay.lat (fast, 302ms), reads Location header.

### nocache=1 (always pass from client)
Cache TTL is 20s. Client always passes `&nocache=1` so every call to loadVideoUrl() gets a fresh signed CDN URL. CDN signed URLs can expire in ~30-60s; stale cache causes retries to fail with expired URL.

## Server — /api/stream/proxy (stream.ts)

### Referer by domain
- Flix2 CDN domains (`FLIX2_CDN_ROOTS`): `Referer: https://nixplay.lat/`, `Origin: https://nixplay.lat`
- Drive/animezey domains: `Referer: https://animezey16082023.animezey16082023.workers.dev/`

### HLS Manifest Rewriting
`rewriteHlsManifest(body, manifestUrl, proxyBase)` handles:
- Segment URI lines (non-comment, non-tag)
- `EXT-X-KEY URI="..."` (encryption keys)
- `EXT-X-MAP URI="..."` (init segments)
- `EXT-X-MEDIA URI="..."` (alternate renditions)
- Relative URIs resolved to absolute before rewriting
- Only allowed hosts are rewritten (whitelist check)

`getProxyBase(req)` derives the public URL from `x-forwarded-host` / `x-forwarded-proto` headers — works in both Replit dev and deployed .replit.app.

## stream.ts FLIX2_CDN_ROOTS whitelist
- `72yrci50ppqp71.com` — fontedecanais CDN (dynamic subdomains)
- `fontedecanais.me`
- `cineveo.lat` — covers vod99.cineveo.lat and any subdomain
- `nixplay.lat`
