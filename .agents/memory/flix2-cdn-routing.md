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
| cineveo.lat | native | **DIRECT** with browser headers | Token not IP-bound; proxy through Cloudflare causes ExoPlayer to abort |
| cineveo.lat | web | **PROXY** | Browser CORS blocks direct CDN requests |
| fontedecanais | native | **PROXY** (resolved CDN URL) | Token IS IP-bound to Replit server IP; device IP ≠ server IP |
| fontedecanais | web | **PROXY** (resolved CDN URL) | CORS + IP-bound token |

### /flix2/stream-url — fontedecanais strategy (CURRENT, June 2026)

**Old strategy (broken):** returned original nixplay URL with `via="fontedecanais-passthrough"`.
Proxy would follow nixplay→fontedecanais redirect on EVERY Range request → new token each time.
ExoPlayer aborts initial connection, makes moov-atom Range request ~1-2s later → token mismatch or
server briefly unavailable → "Erro ao reproduzir vídeo".

**New strategy (fixed):** resolve the nixplay→fontedecanais redirect ONCE server-side.
Return the resolved CDN URL with `via="fontedecanais"`. Cache with 20s TTL.
Proxy uses the SAME IP-bound token for all Range requests from ExoPlayer → stable.
On retry, client sends `nocache=1` → fresh token generated.

```typescript
// r2.ts isIpBoundCdn block now returns:
const result = { url: finalUrl, via: "fontedecanais" };  // finalUrl = resolved CDN URL
STREAM_URL_CACHE.set(streamUrl, { result, cachedAt: Date.now() });
```

### /flix2/stream-url — cineveo behavior

- Sends HEAD with `redirect: manual` + `User-Agent: Mozilla/5.0`
- nixplay.lat responds 302 → cineveo.lat URL (time-based token, any IP)
- Returns cineveo URL directly; client plays without proxy on native
- 20s TTL cache; `?nocache=1` bypasses on retry

### Why PROXY fails for cineveo on native (ExoPlayer)

The proxy chain is `ExoPlayer → Cloudflare → Replit API server → cineveo`.
ExoPlayer aborts after ~900ms — Cloudflare buffers/transforms the large streaming response.
Root cause is Cloudflare interference, not token issues.

### Why DIRECT works for cineveo on native

cineveo token is time+sig based — **not IP-bound** → device IP is fine.
ExoPlayer with custom headers:
```javascript
{ "User-Agent": "Mozilla/5.0 ...", "Referer": "https://nixplay.lat/", "Origin": "https://nixplay.lat" }
```

### hubby.cx — CDN Flix 2.0 wowserver-vods (IP-bound)

- Same isIpBoundCdn detection as fontedecanais
- Returns resolved CDN URL with `via="fontedecanais"` (same strategy)
- hubby.cx in FLIX2_CDN_ROOTS (stream.ts) and isIpBoundCdn block (r2.ts)

### Proxy (stream.ts) headers for nixplay/fontedecanais

```javascript
"User-Agent": UA,  // full browser UA
"Referer": "https://nixplay.lat/",
"Origin": "https://nixplay.lat",
```
When clientRange absent, proxy forces `Range: bytes=0-` upstream → gets 206+Content-Range.
Forwards 206 to ExoPlayer → ExoPlayer uses range-based seeking mode (not progressive download).

### ExoPlayer seeking modes

- 200 response: progressive download → fails for files >~500MB, no seeking
- 206 response: range-based → reads few KB, aborts, sends Range requests for moov atom + seeking
  (the "request aborted" in logs after 206 is NORMAL — ExoPlayer seeking to moov atom)

### killPortSync in serve.js

Uses /proc/net/tcp (not lsof — lsof not available on Replit NixOS).
Finds socket inode for port, scans /proc/PID/fd/ for socket:[inode] symlink, SIGKILLs that PID.
