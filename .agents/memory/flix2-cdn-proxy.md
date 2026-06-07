---
name: Flix2 CDN proxy fix
description: Flix 2.0 CDN (fontedecanais/72yrci50ppqp71.com) blocks ExoPlayer User-Agent; all Flix2 stream URLs must be proxied, same as Drive.
---

## Rule
In `r2-player.tsx`, the Flix2 stream URL returned by `/flix2/stream-url` MUST be wrapped with `getProxiedStreamUrl()` before passing to expo-av.

```typescript
// WRONG (ExoPlayer UA gets blocked by Cloudflare on CDN):
url = data.url;

// CORRECT:
url = getProxiedStreamUrl(data.url);
```

**Why:** The CDN at `www-fontedecanais-me.72yrci50ppqp71.com` (root: `72yrci50ppqp71.com`) is Cloudflare-backed and rejects ExoPlayer/Dalvik User-Agents in production APKs. The API proxy sends a browser UA, bypassing the block. This is the same root cause as the Drive APK playback fix.

## stream.ts whitelist
`FLIX2_CDN_ROOTS` added to `artifacts/api-server/src/routes/stream.ts`:
- `72yrci50ppqp71.com` — primary CDN (dynamic subdomains like `www-fontedecanais-me.*`)
- `fontedecanais.me`
- `cineveo.lat`
- `nixplay.lat`

The `isAllowedHost()` function checks `host === root || host.endsWith(\`.${root}\`)` for each root, allowing any subdomain.

**How to apply:** Any time a new Flix2 CDN domain appears in resolved stream URLs, add it to `FLIX2_CDN_ROOTS` in `stream.ts` and rebuild the API server.
