---
name: EAS Android build fix
description: Root causes and fixes for "Gradle build failed with unknown error" in NETPLAY EAS preview builds.
---

## The problem
Both EAS preview APK builds (builds 777f4b16 and b36659eb) failed at "Run gradlew" with "Gradle build failed with unknown error" (1m 30s, 2 warnings).

## What was NOT the cause
- NDK version: worklets 0.5.x and 0.8.x both use `rootProject.ext.ndkVersion` (not hardcoded NDK 21).
- pnpm `.ignored_` packages: same versions, expected workspace behavior, not scanned by Expo autolinking.
- Duplicate expo versions in devDeps/deps: pnpm resolves to single version (54.0.35).

## Root causes fixed

### 1. `expo-router/unstable-native-tabs` in `(tabs)/_layout.tsx`
The layout imported `NativeTabLayout`, `Icon`, `Label` from `expo-router/unstable-native-tabs`. This experimental feature uses `react-native-screens` BottomTabs Fabric components which require specific codegen outputs. Removed entirely. Now only `ClassicTabLayout` with standard `expo-router`'s `<Tabs>` is used.

### 2. Non-standard package versions
The second build also had worklets 0.8.3, reanimated 4.3.1, keyboard-controller 1.21.8 (wrong — these were updated for a false NDK theory). Reverted to Expo SDK 54 expected versions:
- `react-native-worklets`: `~0.5.1` (installed 0.5.2)
- `react-native-reanimated`: `~4.1.1` (installed 4.1.7)
- `react-native-keyboard-controller`: `~1.18.5` (installed 1.18.6)

### 3. package.json had split devDependencies/dependencies
`expo ~54.0.27` in devDeps AND `expo ~54.0.35` in deps caused 32 `.ignored_` package directories. Consolidated to single `dependencies` section.

## `expo-symbols` fix (iOS only)
`expo-symbols` has no android/ folder. Changed from top-level import to lazy iOS-only require:
```ts
let SymbolView = null;
if (Platform.OS === "ios") {
  SymbolView = require("expo-symbols").SymbolView;
}
```
Metro tree-shakes this on Android (inlines `Platform.OS === "ios"` → false).

**Why:** `expo-symbols` autolinking might try to register an Android module that doesn't exist, causing build failure. Lazy load prevents this.

## After fix
Run `pnpm install --no-frozen-lockfile` then `npx expo prebuild --platform android --clean` before each EAS build to keep the Android project in sync.
