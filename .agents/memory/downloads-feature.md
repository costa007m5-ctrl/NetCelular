---
name: Downloads feature
description: How the offline download feature is structured and where the entry points are
---

# Downloads Feature

`lib/downloads.ts` — core manager using AsyncStorage (`netplay_downloads_v1`), 20-day expiry, methods: getAll/download/remove/isDownloaded/daysRemaining/formatSize.

`app/(tabs)/downloads.tsx` — the existing tab screen was upgraded from hardcoded SAMPLE_DOWNLOADS to real downloadsManager data. Shows storage bar, settings toggles, real downloaded items with expiry countdown, delete/clear-all.

`app/detail.tsx` — download button added to action row (4th slot, replacing "Não gostei"). Shows green check-circle + "Baixado" when already downloaded; tapping a downloaded item prompts removal.

**Why:** The profile already linked to `/(tabs)/downloads`; a separate standalone `app/downloads.tsx` would have been unreachable. Always check existing tab files before creating new routes.

**How to apply:** To add download UI elsewhere, import `{ downloadsManager }` from `@/lib/downloads` and call `download()`, `isDownloaded()`, or `remove()`.
