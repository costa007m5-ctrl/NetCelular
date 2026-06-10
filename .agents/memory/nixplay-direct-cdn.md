---
name: nixplay.lat CDN routing
description: nixplay.lat URLs on native Android must go via CF Worker — nixplay redirects to HTTP fontedecanais CDN, which is blocked by Android network security policy even with usesCleartextTraffic.
---

# nixplay.lat CDN routing (definitive)

## The rule
`nixplay.lat` URLs on **native Android/iOS** → **CF Worker** (`netplay-stream-proxy.netplay.workers.dev`).
**NOT direct play.** Direct play was tried and causes cleartext HTTP error in production APKs.

**Why:**
- nixplay.lat redirects (302) to `http://www.fontedecanais-me.72yrci50ppqp71.com/...` (HTTP, not HTTPS)
- ExoPlayer follows the redirect, Android's network security policy blocks cleartext HTTP
- Even with `android:usesCleartextTraffic=true` in manifest, the policy applies to the redirect target domain
- CF Worker resolves the redirect server-side and serves HTTPS to ExoPlayer → no cleartext issue

**How to apply (flix2-player.tsx):**
```
if (Platform.OS !== "web" && (isNixplayDirect(rawFlix2Url) || isCineveoUrl(rawFlix2Url))) {
  const workerUrl = `${CF_WORKER_URL}/?url=${encodeURIComponent(rawFlix2Url)}`;
  setVideoUrl(workerUrl);
}
```
Both nixplay.lat and cineveo.lat go via CF Worker. fontedecanais direct CDN URLs go direct.

## CDN type labels
- `"nixplay"` — nixplay.lat via CF Worker
- `"cineveo"` — cineveo.lat via CF Worker
- `"fontedecanais"` — direct fontedecanais URL (play direct with browser UA headers)

## OTA publish from Replit (grupo-streaming-brasil-net token)
The EXPO_TOKEN may be for `grupo-streaming-brasil-net` while app.json has netplaybr projectId.
To publish OTA to the OLD project (user's installed APK):
1. Temporarily swap app.json owner+projectId to old values
2. `eas update --branch production --skip-bundler --platform android --non-interactive`
3. Restore app.json to netplaybr values

**Two-step bundle pattern:**
```bash
# Build bundle first
cd artifacts/mobile && npx expo export --platform android --output-dir dist

# Publish (reuse bundle)
GIT_INDEX_FILE=/tmp/eas-tmp-index EXPO_TOKEN=$EXPO_TOKEN eas update \
  --branch production --non-interactive --skip-bundler --platform android \
  --message "..."
```
`GIT_INDEX_FILE=/tmp/eas-tmp-index` — bypasses Replit git lock restriction for EAS CLI.
