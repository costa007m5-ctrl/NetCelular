---
name: Flix2 CDN proxy fix
description: Flix 2.0 CDN blocks ExoPlayer UA in signed APKs; Android uses raw CDN URL + browser headers on expo-av source; server uses redirect:manual to resolve nixplay redirect without hitting CDN IP.
---

## Rule 1 — Android APK client side (r2-player.tsx)

For Android, use the RAW CDN URL directly on expo-av `source` with browser UA headers.
Do NOT use `getProxiedStreamUrl()` on Android for Flix 2.0.

```typescript
// WRONG — proxy covers manifest but ExoPlayer fetches HLS segments directly → UA blocked:
url = getProxiedStreamUrl(data.url);  // Android

// CORRECT — browser headers applied to ALL requests (manifest + every HLS segment):
if (Platform.OS === "android") {
  url = data.url;  // raw CDN URL
  setVideoSourceHeaders({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
    "Referer": "https://nixplay.lat/",
    "Origin": "https://nixplay.lat",
  });
} else {
  url = getProxiedStreamUrl(data.url);  // web/iOS: still use proxy
}
```

And pass headers to the Video source:
```tsx
source={videoSourceHeaders ? { uri: videoUrl, headers: videoSourceHeaders } : { uri: videoUrl }}
```

**Why:** The CDN (vod99.cineveo.lat, fontedecanais CDN) is Cloudflare-backed and rejects ExoPlayer/Dalvik
User-Agents in production Codemagic APKs. The stream is often HLS (m3u8). A proxy only covers the
manifest request — ExoPlayer then fetches segment (.ts) URLs DIRECTLY, bypassing the proxy, and those
direct requests get blocked. Setting `headers` on the expo-av source propagates browser UA to ALL
ExoPlayer requests (manifest + segments). Expo Go works because its UA isn't flagged by the CDN WAF,
but signed production APKs are.

## Rule 2 — Server side /flix2/stream-url (r2.ts)
The redirect from nixplay.lat MUST be resolved with `redirect: "manual"`, NOT `redirect: "follow"`.

```typescript
// WRONG — times out (8s) because vod99.cineveo.lat blocks server IPs on HEAD:
response = await fetch(streamUrl, { method: "HEAD", redirect: "follow", ... });

// CORRECT — instant (302ms): only hits nixplay.lat, reads Location header:
response = await fetch(streamUrl, { method: "HEAD", redirect: "manual", ... });
const finalUrl = response.headers.get("location") || streamUrl;
```

**Why:** vod99.cineveo.lat (Cloudflare CDN) blocks server IPs on HEAD requests. `redirect:"manual"` only
hits nixplay.lat and extracts the CDN URL from Location header. CDN streaming itself is then handled by
the device directly (Android) or by the proxy (web/iOS).

## stream.ts whitelist (FLIX2_CDN_ROOTS) — still needed for web/iOS proxy
- `72yrci50ppqp71.com` — fontedecanais CDN (dynamic subdomains)
- `fontedecanais.me`
- `cineveo.lat` — covers vod99.cineveo.lat and any subdomain
- `nixplay.lat`

The `isAllowedHost()` checks `host === root || host.endsWith(".${root}")` — subdomain wildcard.

## State tracking in r2-player.tsx
- `videoSourceHeaders` state (Record<string,string>|null): set to browser headers for Android Flix2, null otherwise
- Reset to null in the `setVideoUrl(null)` block at start of each `loadVideoUrl()` call
