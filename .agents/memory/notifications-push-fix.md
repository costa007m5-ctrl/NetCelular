---
name: Notifications push token fix
description: Why push notifications only reached admin device and how to fix it.
---

## The problem
`registerPushToken()` in `auth-context.tsx` was only called in `onAuthStateChange` (fires on new logins), NOT on initial `getSession()` (restoring existing sessions). So users who were already logged in never re-registered their token.

Also, `registerPushToken()` silently bails if permissions are not "granted". But `requestPermissionsAndSetup()` (which triggers the system permission dialog) was never called in the auth flow.

## The fix
In `auth-context.tsx`, both `getSession()` and `onAuthStateChange` now call:
```js
requestPermissionsAndSetup()
  .then((granted) => { if (granted) registerPushToken(u.id).catch(() => {}); })
```

**Why:** Ensures every user on every login/app-open gets their token saved to Supabase push_tokens table. Without this, only the admin who happened to trigger the permissions dialog got their token saved.

**How to apply:** Any time auth token registration is added to a new auth flow, always call requestPermissionsAndSetup() first.
