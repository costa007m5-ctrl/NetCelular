---
name: Canais tab hard error coupling
description: The Canais (TV) tab loads two independent data sources — live IPTV channels and the TVmaze-based TV guide — that must not share a single error gate.
---

`canais.tsx` fetches two logically separate things: `liveTvApi.getChannels()` (live IPTV channel list, third-party source that can be flaky) and the TVmaze-based TV guide/schedule (`tvChannels`, `tvGuideLoading`, fetched separately for the "Grade de Programação" section).

**Why:** The screen used to have one shared `if (error) return <FullScreenError/>` gate keyed only on the live-channels fetch failing. If the IPTV channel source had a hiccup, the entire tab — including the unrelated, independently-working TV guide — went dark with a "Sem sinal" full-screen error. This looked like "the whole TV tab is broken" to the user even when only one sub-feature was down.

**How to apply:** Only show a full-screen error when *all* data sources for the screen have failed (check across both `error`/`channels.length` and the guide's own loading/data state). Otherwise render the page normally and show a small inline notice only in the section whose data is actually missing, so unrelated sections keep working. Apply this pattern to any screen on this tab that aggregates multiple independent API calls.
