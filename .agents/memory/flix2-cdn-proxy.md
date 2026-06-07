---
name: Flix2 CDN proxy fix
description: Flix 2.0 CDN blocks ExoPlayer UA AND server IPs; /flix2/stream-url must use redirect:manual to avoid CDN IP block; APK then proxies the resolved URL via /api/stream/proxy.
---

## Rule 1 — APK client side (r2-player.tsx)
The Flix2 stream URL returned by `/flix2/stream-url` MUST be wrapped with `getProxiedStreamUrl()` before passing to expo-av.

```typescript
// WRONG (ExoPlayer UA gets blocked by Cloudflare on CDN):
url = data.url;

// CORRECT:
url = getProxiedStreamUrl(data.url);
```

**Why:** The CDN (vod99.cineveo.lat, fontedecanais CDN, 72yrci50ppqp71.com) is Cloudflare-backed and rejects ExoPlayer/Dalvik User-Agents in production APKs. The API proxy sends a browser UA, bypassing the block.

## Rule 2 — Server side /flix2/stream-url (r2.ts)
The redirect from nixplay.lat MUST be resolved with `redirect: "manual"`, NOT `redirect: "follow"`.

```typescript
// WRONG — times out (8s) because vod99.cineveo.lat blocks server IPs on HEAD:
response = await fetch(streamUrl, { method: "HEAD", redirect: "follow", ... });
const finalUrl = response.url || streamUrl;

// CORRECT — instant (302ms): only hits nixplay.lat, reads Location header:
response = await fetch(streamUrl, { method: "HEAD", redirect: "manual", ... });
const finalUrl = response.headers.get("location") || streamUrl;
```

**Why:** vod99.cineveo.lat (Cloudflare CDN) blocks server IPs on HEAD requests — the same pattern as the Drive Animezey Worker (error 1102). With `redirect:"follow"` the server tries to connect to the CDN directly, times out, and returns 500. With `redirect:"manual"` the server only makes one request to nixplay.lat (which is fast) and extracts the CDN URL from the Location header. The APK then proxies that URL through `/api/stream/proxy` which sends a browser UA.

**How to apply:** Any time a new Flix2 CDN domain appears and streaming breaks in the APK:
1. Check if `/flix2/stream-url` is timing out → if yes, the CDN blocks server HEADs
2. The `redirect:"manual"` fix handles any CDN — no code change needed for new domains
3. Only update `FLIX2_CDN_ROOTS` in `stream.ts` if the new CDN domain is blocking the PROXY too

## stream.ts whitelist (FLIX2_CDN_ROOTS)
- `72yrci50ppqp71.com` — fontedecanais CDN (dynamic subdomains)
- `fontedecanais.me`
- `cineveo.lat` — covers vod99.cineveo.lat and any subdomain
- `nixplay.lat`

The `isAllowedHost()` checks `host === root || host.endsWith(".${root}")` — subdomain wildcard.
