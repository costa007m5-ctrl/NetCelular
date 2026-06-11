---
name: WebView blob video bug
description: Android system WebView fails to play video from blob/createObjectURL URLs in production APKs; use direct v.src= instead.
---

# WebView blob video playback — production APK bug

## The bug
`MEDIA_ELEMENT_ERROR: Format error` in production APK (EAS build) when:
1. WebViewVideoPlayer fetches video with custom headers
2. Creates `URL.createObjectURL(blob)` from the response
3. Sets `v.src = blobUrl`

Works fine in Expo Go (uses SDK's embedded WebView), fails in production APK (uses Android system WebView).

## Root cause
Android system WebView does not support seeking in blob-backed `<video>` sources:
- Large MP4s: tries to buffer the entire file into memory → OOM or Format error
- No Range request support through blob URLs
- System WebView ≠ Expo Go's bundled WebView

## The fix
Use `v.src = directUrl` directly. The WebView component's `userAgent` prop already sets a browser UA on **all** requests, including `<video>` element fetches. No blob trick needed.

```javascript
// WRONG — fails on production APK
fetch(url, { headers })
  .then(r => r.blob())
  .then(blob => { v.src = URL.createObjectURL(blob); });

// CORRECT — WebView UA handles browser UA requirement automatically
v.src = url;
v.load();
v.play().catch(function(){});
```

**Why:** `userAgent` prop on `<WebView>` sets the UA for ALL network requests made by that WebView instance, including `<video>` fetches — so headers don't need to be force-injected.
