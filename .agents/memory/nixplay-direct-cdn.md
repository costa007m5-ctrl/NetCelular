---
name: nixplay.lat direct CDN routing
description: nixplay.lat/movie/ and /series/ URLs must go via CF Worker on native APK — ExoPlayer UA blocked by Cloudflare + HTTPS→HTTP redirect blocked on release APKs.
---

# nixplay.lat direct CDN routing

## The rule (updated June 2026 — DIRECT play, no proxy)
`nixplay.lat/movie/...` and `/series/...` URLs on **native Android APKs** play **DIRECTLY** on the device with browser User-Agent + Referer headers passed via `expo-av` source.headers. No CF Worker, no proxy, no server.

**Why direct works now:**
- `expo-av` (expo-av ≥16) passes `headers` from the source object directly to ExoPlayer's `DefaultDataSource` via `httpHeaders`
- Browser UA bypasses Cloudflare WAF: `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."`
- Referer: `"https://nixplay.lat/"` satisfies hotlink checks

**How to apply (flix2-player.tsx):**
`isNixplayDirect` detects `hostname === "nixplay.lat"`. Routing condition:
```
if (Platform.OS !== "web" && isNixplayDirect(rawFlix2Url)) {
  setVideoSourceHeaders(FLIX2_HEADERS);  // UA + Referer + Origin
  setVideoUrl(rawFlix2Url);              // direct MP4/HLS URL
}
```
FLIX2_HEADERS = `{ "User-Agent": "Mozilla/5.0...", "Referer": "https://nixplay.lat/", "Origin": "https://nixplay.lat" }`

**cineveo.lat:** still goes via CF Worker (Referer must be set server-side for CDN to accept)
**Web:** proxy via Replit `/api/stream/proxy` (CORS blocks direct)

## EAS OTA publish from Replit main agent

Two-step pattern (bundle first, then publish with --skip-bundler):
```bash
# Step 1: let it export (takes ~2 min, may timeout but that's ok — dist/ is cached)
cd artifacts/mobile && EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest update --branch production --message "..." --non-interactive

# Step 2: if step 1 timed out before publishing, reuse cached dist
EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 npx eas-cli@latest update --branch production --message "..." --non-interactive --skip-bundler
```

**Why `EAS_SKIP_AUTO_FINGERPRINT=1`:** Replit blocks destructive git ops in main agent. EAS auto-fingerprint calls `git stash` internally → blocked. Skipping has no impact on OTA delivery.

**Why `--skip-bundler` on step 2:** Metro bundle is already in `dist/` from step 1. Reusing it saves ~90s and avoids another timeout.
