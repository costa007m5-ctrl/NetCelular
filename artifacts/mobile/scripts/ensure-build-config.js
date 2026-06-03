#!/usr/bin/env node
/**
 * ensure-build-config.js
 * 
 * Garante que buildFeatures { buildConfig true } está no android/app/build.gradle.
 * Deve ser executado APÓS expo prebuild.
 * 
 * Uso no Codemagic (como script após Expo Prebuild):
 *   node artifacts/mobile/scripts/ensure-build-config.js
 * 
 * Ou via npm script:
 *   pnpm --filter @workspace/mobile ensure:buildconfig
 */

const fs = require("fs");
const path = require("path");

// Resolve o caminho do android/ a partir deste script
const scriptDir = path.dirname(path.resolve(__filename));
const mobileRoot = path.resolve(scriptDir, "..");
const buildGradlePath = path.join(mobileRoot, "android", "app", "build.gradle");
const buildGradleKtsPath = path.join(mobileRoot, "android", "app", "build.gradle.kts");

let filePath = null;
let isKts = false;

if (fs.existsSync(buildGradlePath)) {
  filePath = buildGradlePath;
} else if (fs.existsSync(buildGradleKtsPath)) {
  filePath = buildGradleKtsPath;
  isKts = true;
}

if (!filePath) {
  console.log("[ensure-build-config] android/app/build.gradle not found — skipping (prebuild may not have run yet)");
  process.exit(0);
}

let contents = fs.readFileSync(filePath, "utf8");

if (contents.includes("buildConfig true") || contents.includes("buildConfig = true")) {
  console.log("[ensure-build-config] ✓ buildConfig already enabled in", filePath);
  process.exit(0);
}

const line = isKts ? "buildConfig = true" : "buildConfig true";

if (contents.includes("buildFeatures")) {
  contents = contents.replace(
    /buildFeatures\s*\{([^}]*)\}/s,
    (match, inner) => `buildFeatures {${inner}        ${line}\n    }`
  );
  console.log("[ensure-build-config] ✓ Added buildConfig inside existing buildFeatures block");
} else {
  contents = contents.replace(
    /android\s*\{/,
    `android {\n    buildFeatures {\n        ${line}\n    }`
  );
  console.log("[ensure-build-config] ✓ Injected buildFeatures { buildConfig true } into android {}");
}

fs.writeFileSync(filePath, contents);

// Verify
const updated = fs.readFileSync(filePath, "utf8");
if (!updated.includes("buildConfig true") && !updated.includes("buildConfig = true")) {
  console.error("[ensure-build-config] ✗ FAILED to inject buildConfig — check the build.gradle format");
  process.exit(1);
}

console.log("[ensure-build-config] ✓ build.gradle patched successfully at:", filePath);
