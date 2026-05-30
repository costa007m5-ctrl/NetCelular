---
name: Supabase migration
description: Convex was fully replaced by Supabase for all data persistence in the NETPLAY app.
---

## What changed
- Deleted: `artifacts/mobile/convex/` directory and `lib/convex-client.ts`
- Removed: `convex` package from `package.json`
- All screens (login, list, detail, player, index, admin) now use `db` from `lib/supabase.ts`
- ConvexProvider removed from `_layout.tsx`

## Auth approach
Custom hash-based auth: password hashed client-side (SHA-256 + salt) then stored in `public.users.password_hash`. NOT using Supabase Auth — using anon key + user_id filtering.

## Tables needed (SQL in supabase-schema.sql)
- `public.users` — id, email, name, password_hash, role, avatar_letter
- `public.watchlist` — user_id, tmdb_id, type, title, poster_path, backdrop_path
- `public.watch_progress` — user_id, tmdb_id, type, progress, season, episode
- `public.ratings` — user_id, tmdb_id, type, liked

**Why:** RLS policies are set to allow anon access to all tables; security enforced via user_id filtering in queries.

## Status
SQL must be run in Supabase Dashboard → SQL Editor before the app's auth/data features work.
