const { withAppBuildGradle } = require("@expo/config-plugins");

function withBuildConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Ensure buildFeatures { buildConfig true } is set in the android block
    if (!contents.includes("buildConfig true") && !contents.includes("buildConfig = true")) {
      // Insert buildFeatures block right after "android {" opening
      contents = contents.replace(
        /android\s*\{/,
        `android {\n    buildFeatures {\n        buildConfig true\n    }`
      );
      cfg.modResults.contents = contents;
    }

    return cfg;
  });
}

module.exports = withBuildConfig;
