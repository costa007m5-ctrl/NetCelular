---
name: EAS Build lockfile config
description: How the mobile artifact handles lockfiles for EAS builds vs local pnpm workspace dev
---

EAS builds for the mobile artifact use **npm** (`package-lock.json` in `artifacts/mobile/`), NOT pnpm.

**Why:** This is a pnpm v10 monorepo (lockfileVersion 9.0). EAS build servers have historically run pnpm v8 (lockfileVersion 6.0) which ignores v9 lockfiles as "not compatible". Without a pnpm lockfile, EAS falls back to yarn (which also has no lockfile). Using npm avoids the pnpm version mismatch entirely — EAS runs `npm ci` which is universally stable.

**How to apply:**
- `artifacts/mobile/package-lock.json` must exist (committed) — this is the EAS lockfile
- `artifacts/mobile/` must NOT have `pnpm-lock.yaml` or `yarn.lock` (would override npm detection)
- `artifacts/mobile/package.json` must NOT have `"packageManager"` field (removed to avoid EAS corepack confusion)
- The root `pnpm-lock.yaml` is for local dev only (pnpm workspace)
- If you add/remove/update packages in mobile, regenerate with: `cd artifacts/mobile && npm install --package-lock-only --legacy-peer-deps`
- Also keep `newArchEnabled: true` in `app.json` — required for react-native-reanimated v4.x
