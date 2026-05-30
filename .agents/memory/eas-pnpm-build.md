---
name: EAS Build pnpm configuration
description: pnpm settings required for EAS Android builds with Expo SDK 54 to pass Gradle
---

## Rules

1. **`node-linker=hoisted` is required in `artifacts/mobile/.npmrc`**  
   pnpm's default isolated/symlinked node_modules makes Gradle fail to resolve native module paths. Hoisted mode creates a flat node_modules that Gradle can resolve.

2. **EAS uses pnpm v8 (lockfileVersion `6.0`)**  
   The local `artifacts/mobile/pnpm-lock.yaml` must be `lockfileVersion: '6.0'`. Regenerate it with `pnpm@8` (install via `npm install -g pnpm@8`, run `pnpm install --no-frozen-lockfile` with `COREPACK_ENABLE_STRICT=0` from `artifacts/mobile`, then restore `pnpm@10.26.1`).

3. **SDK 54 compatible native package versions** (from bundledNativeModules.json):
   - `react-native-reanimated: ~4.1.1`
   - `react-native-keyboard-controller: 1.18.5`
   - `react-native-worklets: 0.5.1`

**Why:** EAS Build CI runs `pnpm install --frozen-lockfile` in `artifacts/mobile`. pnpm v8 rejects lockfileVersion 9.0 as incompatible. pnpm's default symlinked node_modules causes Gradle `ExternalNativeBuild` to fail with "unknown error" because Gradle doesn't follow pnpm symlinks when resolving native source paths.

**How to apply:** Any time the mobile lockfile needs updating (package version changes), switch to pnpm v8, regenerate, then restore pnpm v10.
