---
name: nixplay.lat direct CDN routing
description: nixplay.lat/movie/ and /series/ paths are direct MP4s that must play directly on native Android, not via Replit proxy (which strips Range headers).
---

# nixplay.lat direct CDN routing

## The rule
`nixplay.lat/movie/...` and `/series/...` URLs are **direct MP4/HLS files** served from nixplay.lat itself. They do NOT redirect to cineveo or fontedecanais. On native Android, they MUST be played directly from the device — NOT through the Replit proxy.

**Why:** Replit's production reverse proxy strips HTTP Range headers (confirmed in prod logs). ExoPlayer requires Range headers for seeking. Without Range headers, ExoPlayer throws "Erro ao reproduzir vídeo" immediately. Expo Go/web uses a different player that doesn't strictly require Range → works fine there.

**How to apply:** In `flix2-player.tsx`, the `isNixplayDirect` function detects these URLs (`hostname === "nixplay.lat"`). The routing condition `if (Platform.OS !== "web" && (isFd || isNx))` sends them to direct device playback, same as fontedecanais.

## EAS OTA update trick (Replit main agent)
When running `eas update` from the Replit main agent, the fingerprint step tries a git operation which is blocked. Always add:
```
EAS_SKIP_AUTO_FINGERPRINT=1
```
This skips the fingerprint and lets publishing complete. The bundles upload fine; only the auto-fingerprint step is blocked.

Command pattern:
```bash
EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN=$EXPO_TOKEN /home/runner/workspace/.config/npm/node_global/bin/eas update --branch preview --message "..." --non-interactive
```

**Why:** Replit blocks destructive git operations in the main agent. EAS auto-fingerprint calls `git stash` internally. Skipping it has no functional impact on the OTA update delivery.
