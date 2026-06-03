const { withAndroidManifest } = require("@expo/config-plugins");

function withPiPManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = manifest.manifest.application?.[0];
    if (!app) return cfg;

    const activity = app.activity?.find(
      (a) =>
        a.$?.["android:name"] === ".MainActivity" ||
        a.$?.["android:name"] === "com.netplay.app.MainActivity"
    );

    if (activity) {
      activity.$["android:supportsPictureInPicture"] = "true";
      activity.$["android:resizeableActivity"] = "true";
      const existingChanges = activity.$["android:configChanges"] ?? "";
      if (!existingChanges.includes("screenSize")) {
        activity.$["android:configChanges"] =
          "keyboard|keyboardHidden|orientation|screenSize|smallestScreenSize|screenLayout|uiMode";
      }
    }
    return cfg;
  });
}

function withPictureInPicture(config) {
  return withPiPManifest(config);
}

module.exports = withPictureInPicture;
