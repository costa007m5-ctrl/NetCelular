---
name: API domain Supabase trap
description: The Supabase app_config table stores the API domain and can override EXPO_PUBLIC_DOMAIN, causing "Access Denied: VOD API Gateway" if the stored value is stale or wrong.
---

## The Rule
Never let Supabase's `app_config.api_domain` silently override the baked-in `EXPO_PUBLIC_DOMAIN` environment variable. `EXPO_PUBLIC_DOMAIN` is always fresher because it's injected at Metro bundle time from `$REPLIT_DEV_DOMAIN`.

**Why:** The Replit dev domain changes on every session restart. If the Supabase value is from a previous session (or worse, a wrong value like `nixplay.lat`), all API calls from the mobile app go to the wrong server and receive "Access Denied: VOD API Gateway" from that server's gateway — not from our code.

**How to apply:**
- In `initApiDomain()` (`lib/api.ts`): check `process.env.EXPO_PUBLIC_DOMAIN` FIRST. If it's set, use it, save it to AsyncStorage, and push it to Supabase for other devices — then return early without fetching Supabase.
- Only fall back to Supabase/AsyncStorage when `EXPO_PUBLIC_DOMAIN` is absent (i.e., a static build without env var baked in).
- To diagnose: `curl https://pjzfsbdcjyhcoptbrlhh.supabase.co/rest/v1/app_config?key=eq.api_domain&select=value&limit=1` with the anon key from `lib/api.ts`.
- To fix: POST to same endpoint with `Prefer: resolution=merge-duplicates` and `{"key":"api_domain","value":"$REPLIT_DEV_DOMAIN"}`.

## Context
- `getApiBase()` priority: `_dynamicDomain` → `EXPO_PUBLIC_DOMAIN` → `apiDomain` from `app.json`
- `initApiDomain()` sets `_dynamicDomain` from Supabase/AsyncStorage at app startup
- The "Access Denied: VOD API Gateway" text is the raw response body from the wrong server (e.g., nixplay.lat CDN), thrown by `forwardToServer()` when `res.ok` is false
