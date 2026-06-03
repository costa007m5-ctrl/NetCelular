const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withBuildConfig(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;

      const gradlePath = path.join(projectRoot, "app", "build.gradle");
      const gradleKtsPath = path.join(projectRoot, "app", "build.gradle.kts");

      let filePath = null;
      let isKts = false;

      if (fs.existsSync(gradlePath)) {
        filePath = gradlePath;
        isKts = false;
      } else if (fs.existsSync(gradleKtsPath)) {
        filePath = gradleKtsPath;
        isKts = true;
      }

      if (!filePath) {
        console.warn("[withBuildConfig] Could not find app/build.gradle or app/build.gradle.kts");
        return cfg;
      }

      let contents = fs.readFileSync(filePath, "utf8");

      const alreadySet =
        contents.includes("buildConfig = true") ||
        contents.includes("buildConfig true");

      if (alreadySet) {
        console.log("[withBuildConfig] buildConfig already enabled, skipping.");
        return cfg;
      }

      const buildConfigLine = isKts
        ? "        buildConfig = true"
        : "        buildConfig true";

      if (contents.includes("buildFeatures")) {
        contents = contents.replace(
          /buildFeatures\s*\{([^}]*)\}/s,
          (match, inner) => {
            return `buildFeatures {${inner}${buildConfigLine}\n    }`;
          }
        );
        console.log("[withBuildConfig] Added buildConfig inside existing buildFeatures block.");
      } else {
        const buildFeaturesBlock = isKts
          ? `    buildFeatures {\n        buildConfig = true\n    }`
          : `    buildFeatures {\n        buildConfig true\n    }`;

        contents = contents.replace(
          /android\s*\{/,
          `android {\n${buildFeaturesBlock}`
        );
        console.log("[withBuildConfig] Added new buildFeatures block with buildConfig.");
      }

      fs.writeFileSync(filePath, contents);
      return cfg;
    },
  ]);
}

module.exports = withBuildConfig;
