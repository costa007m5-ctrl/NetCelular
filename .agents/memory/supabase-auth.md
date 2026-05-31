---
name: Supabase Auth migration
description: Auth migrated from custom hash (public.users + SHA-256) to Supabase Auth built-in. Public.users still used for profile data (name, role, avatar_letter, banner).
---

## Rule
Use `supabase.auth.signUp/signInWithPassword/signOut/updateUser` for all authentication. Never use custom password hashing.

## How it works
- `auth-context.tsx` listens to `supabase.auth.onAuthStateChange()` and fetches profile from `public.users` by UUID
- `login.tsx` calls `supabase.auth.signUp()` + `db.users.upsertProfile()` for register, `supabase.auth.signInWithPassword()` for login
- Password change in profile.tsx: re-auth with `signInWithPassword`, then `supabase.auth.updateUser({ password })`
- Forgot password: `supabase.auth.resetPasswordForEmail(email, { redirectTo: 'mobile://reset-password' })`

## DB requirements
`password_hash` column in `public.users` must be nullable (run: `ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL`).
RLS policies must include `authenticated` role (see supabase-schema.sql).

**Why:** Supabase Auth handles token refresh, session persistence, and password security properly. The custom hash approach had cross-platform inconsistencies and no real password reset flow.
