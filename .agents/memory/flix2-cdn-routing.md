---
name: Flix2 CDN routing and proxy architecture
description: How nixplay.lat streams are resolved and proxied; routing rules for cineveo vs fontedecanais on native vs web.
---

## Definitive architecture (June 2026, revised — CF Worker)

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
| cineveo.lat | native | **DIRECT** with browser headers | Token not IP-bound; ExoPlayer Range requests reach CDN intact |
| cineveo.lat | web | **PROXY** (Replit) | Browser CORS blocks direct CDN requests |
| fontedecanais | native | **CF WORKER** `netplay-stream-proxy.netplay.workers.dev` | Token IP-bound; Replit proxy strips Range headers; CF Worker handles both |
| fontedecanais | web | **PROXY** (Replit) | CORS + IP-bound token |

### CF Worker for fontedecanais (current solution)

Worker URL: `https://netplay-stream-proxy.netplay.workers.dev`
Deployed to account: `9827b92a6b3a621e8c6f50274e68f37b` (netplay subdomain)
Script: `artifacts/cf-worker/stream-proxy.js`

**Why CF Worker and not Replit proxy:**
- Replit's production reverse proxy strips HTTP `Range` headers from inbound requests
- ExoPlayer sends Range requests for moov-atom seek → Replit strips them → returns 200 again → abort loop
- CF Worker runs on Cloudflare's infrastructure → Range headers arrive intact
- Worker resolves nixplay.lat redirect (token binds to CF's IP) → proxies from CDN with same IP → works

**Flow:**
1. flix2-player calls `/flix2/stream-url` → gets `via="fontedecanais"` confirmation
2. For native + isFd: builds `CF_WORKER_URL/?url=<encoded rawFlix2Url>` (nixplay URL, NOT resolved CDN URL)
3. Worker resolves nixplay → CDN URL (IP-bound to CF's IP)
4. Worker proxies bytes with Range headers forwarded → ExoPlayer seeks normally

**IMPORTANT:** Pass `rawFlix2Url` (nixplay.lat URL) to the Worker — NOT the already-resolved CDN URL.
The resolved CDN URL has a token bound to the API server's IP, not CF's IP → 403.

### Why proxy fails for fontedecanais on Replit prod

Confirmed in logs: every request shows `clientRange=false` — the Replit reverse proxy strips
all `Range` headers from inbound requests before they reach Express. ExoPlayer reads moov atom,
aborts, sends `Range: bytes=N-` → stripped → server returns 200 again → loop until error.

### /flix2/stream-url — fontedecanais strategy

Server resolves nixplay→CDN once, returns `{ url: cdnUrl, via: "fontedecanais" }` (20s TTL cache).
Client reads `via` to detect fontedecanais → routes to CF Worker with original nixplay URL.
`?nocache=1` forces fresh resolution on retry.

### hubby.cx — CDN Flix 2.0 wowserver-vods (IP-bound)

Same isIpBoundCdn detection as fontedecanais → same CF Worker routing applies.
hubby.cx in FLIX2_CDN_ROOTS (stream.ts) and isIpBoundCdn block (r2.ts).

### cineveo — why direct works

Token is time+sig based (not IP-bound) → device IP is fine. ExoPlayer with custom headers:
```javascript
{ "User-Agent": "Mozilla/5.0 ...", "Referer": "https://nixplay.lat/", "Origin": "https://nixplay.lat" }
```

### ExoPlayer seeking modes

- 200 response: progressive download → fails for files >~500MB, no seeking
- 206 response: range-based → reads few KB, aborts, sends Range requests for moov atom + seeking
  (the "request aborted" in logs after 206 is NORMAL — ExoPlayer seeking to moov atom)
