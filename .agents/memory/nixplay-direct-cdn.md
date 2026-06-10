---
name: nixplay.lat direct CDN routing
description: nixplay.lat/movie/ and /series/ URLs must go via CF Worker on native APK — ExoPlayer UA blocked by Cloudflare + HTTPS→HTTP redirect blocked on release APKs.
---

# nixplay.lat direct CDN routing

## The rule (updated June 2026)
`nixplay.lat/movie/...` and `/series/...` URLs on **native Android APKs** must be routed via the **CF Worker** (`netplay-stream-proxy.netplay.workers.dev`), same as cineveo.lat.

**Why direct fails on APKs:**
1. ExoPlayer UA is blocked by nixplay.lat's Cloudflare WAF in production APKs (works in Expo Go because Expo Go uses a different UA)
2. nixplay.lat does a 302 redirect to fontedecanais via HTTP; Android blocks HTTPS→HTTP cross-scheme redirects in release APKs even with `usesCleartextTraffic=true`
3. Replit proxy strips Range headers → ExoPlayer can't seek

**How to apply (flix2-player.tsx):**
`isNixplayDirect` detects `hostname === "nixplay.lat"`. Routing condition:
```
if (Platform.OS !== "web" && (isCineveoUrl(rawFlix2Url) || isNixplayDirect(rawFlix2Url)))
  → CF Worker: `CF_WORKER_URL/?url=${encodeURIComponent(rawFlix2Url)}`
```
Worker resolves the nixplay redirect server-side (Cloudflare IP not blocked), proxies bytes with Range headers intact.

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
