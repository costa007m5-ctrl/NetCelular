---
name: Novidades preview overlay/loading gating
description: Novidades tab preview system has two content sources (real stream vs YouTube trailer) — UI state conditions must handle both.
---

The Novidades tab preview card has two mutually-exclusive ways to play a preview: `canPlayVideo` (real stream, e.g. "Todo mundo" content) and `canPlayTrailer` (YouTube trailer fallback, used for "Em breve"/upcoming items without a real stream yet).

**Why:** The play-button overlay and the native-buffering loading spinner were both originally gated only on `canPlayVideo`. That's correct for real streams, but for trailer-preview items the overlay stayed stuck on top of the video even once the trailer was ready and playing, and there was no loading spinner during trailer buffering — making trailer previews look broken/frozen even though playback was fine underneath.

**How to apply:** Any UI state (overlay visibility, spinner visibility, disabled buttons, etc.) in the preview card that reacts to "is a preview currently playing/loading" must check `canPlayVideo || canPlayTrailer` (not just `canPlayVideo`), and any UI that should hide once a preview takes over must exclude both `canPlayVideo` and `canPlayTrailer`. When adding new preview-related UI here, always trace through the trailer path in addition to the real-stream path.
