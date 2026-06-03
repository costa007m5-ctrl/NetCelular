const { withAppBuildGradle } = require("@expo/config-plugins");

function withBuildConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (
      contents.includes("buildConfig true") ||
      contents.includes("buildConfig = true")
    ) {
      return cfg;
    }

    if (contents.includes("buildFeatures")) {
      contents = contents.replace(
        /buildFeatures\s*\{([^}]*)\}/s,
        (match, inner) =>
          `buildFeatures {${inner}        buildConfig true\n    }`
      );
    } else {
      contents = contents.replace(
        /android\s*\{/,
        `android {\n    buildFeatures {\n        buildConfig true\n    }`
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withBuildConfig;
