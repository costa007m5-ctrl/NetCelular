---
name: Chromecast/AirPlay integration
description: How real Chromecast casting was wired into CastModal, and why it can't be tested in Replit's Expo Go preview.
---

`react-native-google-cast` provides real Chromecast support, but it must never be `require()`'d while running in Expo Go — its native module isn't linked there and importing it can throw at module-eval time, not just at call time.

**Why:** Replit's mobile preview (`serve.js`/`build.js`) only ever produces an Expo Go-compatible bundle. There is no way to test real Chromecast/AirPlay inside the Replit preview — it only works in a custom EAS dev/production build installed on a real device.

**How to apply:** Gate the `require()` itself (not just the call) behind `Platform.OS !== "web" && Constants.appOwnership !== "expo"` (see `artifacts/mobile/lib/chromecast.ts`). Consuming components (e.g. `CastModal.tsx`) should surface a `whyChromecastUnavailable()` string to the user instead of a generic "unsupported" message, so they understand it's a build limitation, not a bug. Always communicate to the user that they must generate a real EAS build to test/use this feature.
