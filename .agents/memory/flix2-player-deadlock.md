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

## getProxiedStreamUrl web bug (proxyAvailable always false on web)

`getProxiedStreamUrl` in `gdrive-index.ts` had `if (Platform.OS === "web") return rawUrl;` — returning the raw URL unchanged on web. This made `proxiedUrl === resolvedUrl`, so `proxyAvailable = false` for every web request, always throwing the fontedecanais proxy error in Chrome.

Fix: `const base = Platform.OS === "web" ? "/api" : getApiBaseLib();` — web uses `/api` (relative to current domain) as the proxy base.

Similarly, old APK builds where `getApiBase()` returned null (stale/missing domain) would also get `proxyAvailable = false`. Fixed by hardcoding `PRODUCTION_DOMAIN` as the final fallback in `getApiBase()` so it never returns null.

## Express 5 HEAD request routing (critical gotcha)

In Express 5, `router.get(path, handler)` also handles HEAD requests — unlike Express 4 where GET-only meant GET-only. This means:
- A separately registered `router.head(path, handler)` is **never reached** if `router.get()` for the same path is registered first
- The GET handler runs for HEAD requests, including any slow upstream fetch calls

**Why it matters for video proxy:** The GET handler's upstream `fetch()` call to cineveo.lat takes >10s, causing ExoPlayer/AVPlayer to timeout with "Erro ao reproduzir vídeo" when they send a HEAD probe before the first GET.

**Fix:** Add `if (req.method === "HEAD")` check **inside the GET handler** right after `isAllowedHost()` validation, respond with synthetic headers instantly, and `return`. Do NOT rely on a separate `router.head()` — it won't be reached.

```typescript
if (req.method === "HEAD") {
  const isHls = decodedUrl.toLowerCase().includes(".m3u8");
  res.writeHead(200, {
    "Content-Type": isHls ? "application/x-mpegurl" : "video/mp4",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    ...
  });
  res.end();
  return;
}
```

## cineveo vs fontedecanais proxy rule

Also fixed the proxy guard:
- **fontedecanais** (token IP-bound to Replit server): proxy is REQUIRED, throw if unavailable
- **cineveo** (time-based signature, any IP): proxy preferred but direct fallback allowed

**Why:** Both CDN types come from `/flix2/stream-url`. Old code threw for BOTH when proxy unavailable, which caused errors for cineveo in edge cases.

**How to apply:** In `loadVideoUrl()`, check `isFontedecanais` before throwing the "proxy unavailable" error.
