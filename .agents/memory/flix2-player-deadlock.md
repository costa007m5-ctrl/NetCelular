---
name: Flix2 player 80% deadlock fix
description: Root cause and fix for flix2-player.tsx stuck at 80% loading forever.
---

## The bug

`flix2-player.tsx` had a deadlock between the loading phase and the Video component mount:

- `<Video>` was only rendered when `phase === "ready"` (line ~761)
- `transitionToReady()` was only called from `onLoad` / `onPlaybackStatusUpdate` — callbacks of the Video component
- Result: Video never mounts → callbacks never fire → `transitionToReady` never called → fake progress animation freezes at 80% forever

## The fix

Mount `<Video>` as soon as `videoUrl` is set (not gated on `phase === "ready"`). Hide it visually during loading with `opacity: 0` style, and use `shouldPlay={phase === "ready"}` so audio doesn't play before the loading screen completes.

```jsx
{videoUrl && Video ? (
  <Video
    source={{ uri: videoUrl }}
    style={[StyleSheet.absoluteFill, phase !== "ready" && { opacity: 0 }]}
    shouldPlay={phase === "ready"}
    onLoad={onVideoLoad}
    onPlaybackStatusUpdate={onPlaybackStatusUpdate}
    ...
  />
) : null}
```

The loading screen JSX comes AFTER the Video in render order, so it overlays the hidden video — pointer events are handled by the loading screen correctly.

## cineveo vs fontedecanais proxy rule

Also fixed the proxy guard:
- **fontedecanais** (token IP-bound to Replit server): proxy is REQUIRED, throw if unavailable
- **cineveo** (time-based signature, any IP): proxy preferred but direct fallback allowed

**Why:** Both CDN types come from `/flix2/stream-url`. Old code threw for BOTH when proxy unavailable, which caused errors for cineveo in edge cases.

**How to apply:** In `loadVideoUrl()`, check `isFontedecanais` before throwing the "proxy unavailable" error.
