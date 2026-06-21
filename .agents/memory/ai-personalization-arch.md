---
name: AI Personalization Architecture
description: Gemini-powered cross-tab personalization system — behavior tracker, home feed AI row, novidades filtering, profile AI card.
---

## System Components

### 1. `artifacts/mobile/lib/ai-behavior-tracker.ts`
- Tracks: `trackOpen`, `trackWatch`, `trackLike`, `trackSearch`, `trackTab`
- Stores events in AsyncStorage (`netplay_ai_behavior_v1`), max 200 events
- Exports `getBehaviorProfile()` → compact profile (topGenres, topTitles, prefersMovies/Series/Anime, likedIds, watchedIds, recentSearches)
- `clearBehaviorData()` for user reset

### 2. API Server — Gemini Home Feed
- `artifacts/api-server/src/lib/gemini.ts` → `personalizeHomeFeed(HomeFeedInput)` → `HomeFeedResult` {rankedIds, rowLabel, rowSubtitle}
- Route: POST `/api/gemini/personalize-home` (rate-limited 30/min)
- Gemini ranks candidates + generates personal label ("Porque você ama Terror") + subtitle
- Falls back gracefully if GEMINI_API_KEY not set

### 3. Mobile Gemini Client
- `artifacts/mobile/lib/gemini-client.ts` → `geminiPersonalizeHome(HomeFeedInput)`
- 10s timeout, falls back to original order on error

### 4. Home Screen (`index.tsx`)
- Imports: `trackOpen`, `trackTab`, `getBehaviorProfile`, `geminiPersonalizeHome`
- State: `aiRowItems`, `aiRowLabel`, `aiRowSubtitle`
- Effect: after `computeRecommendations` resolves → calls `getBehaviorProfile` → calls `geminiPersonalizeHome` → updates AI row
- Section 6.5: "IA ✦" badge, INDIGO color, dynamic label from Gemini
- `goTo` callback calls `trackOpen` on every content navigation

### 5. Novidades Screen (`novidades.tsx`)
- Imports: `getMergedPreferences`, `getBehaviorProfile`, `trackOpen`
- State: `paraVoce`, `paraVoceLabel`
- Effect: after data loads, scores all new content by genre overlap with user preferences
- Shows "Lançamentos para Você" / "Lançamentos de {Genre}" row with "IA ✦" badge (min 4 items)

### 6. Profile Screen (`profile.tsx`)
- Imports: `getBehaviorProfile`, `clearBehaviorData`, `BehaviorProfile`
- State: `behaviorProfile`
- Loads in useEffect alongside smart-preferences
- Shows "GEMINI AI — APRENDENDO" card in preferences modal (dark indigo #1a0a2e) with:
  - Event count, content type preference pills, liked/search counts
  - Recent titles list
  - "Limpar dados da IA" button

## Key Decisions
**Why:** All behavior tracking is local-first (AsyncStorage, no network), non-blocking, and async. Gemini is only called after local scoring already has recommendations ready. Falls back to local scores if Gemini unavailable (no API key) or times out.

**How to apply:** The AI row only shows when >= 4 ranked items are available. Novidades "Para Você" only shows when >= 4 genre-matched items found. Both degrade gracefully to existing rows.
