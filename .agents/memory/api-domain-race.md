---
name: API domain race condition
description: getApiBase() uses stale EXPO_PUBLIC_DOMAIN before initApiDomain() finishes — cinema/shorts/episodes all fail on first load in APK.
---

## Rule
Initialize `_dynamicDomain = PRODUCTION_DOMAIN` (not null) in `lib/api.ts`.

## Why
`getApiBase()` is synchronous: `_dynamicDomain || process.env.EXPO_PUBLIC_DOMAIN || ... || PRODUCTION_DOMAIN`.
`initApiDomain()` is async and called fire-and-forget in `_layout.tsx`.
If any screen fetches data in the first 3-9 seconds after launch (before initApiDomain completes), `_dynamicDomain` is null so getApiBase() falls through to `EXPO_PUBLIC_DOMAIN` — which in the APK is the stale dev domain baked at build time (`*.riker.replit.dev`). All API calls fail silently.

## How to apply
- In `lib/api.ts`: `let _dynamicDomain: string | null = PRODUCTION_DOMAIN;`
- In all data-fetching functions (cinema, shorts, admin episodes): add retry with 3-5s delay on network error — helps existing APKs that don't have the init fix.
- Update Supabase `app_config.api_domain` to PRODUCTION_DOMAIN so initApiDomain() finds it quickly (< 5s vs 6-9s with dead dev domain timeout first).
- `EXPO_PUBLIC_DOMAIN` in `.replit` should be the production domain, not a dev domain. Dev domains change every Replit session and break any APK that bakes them in.
