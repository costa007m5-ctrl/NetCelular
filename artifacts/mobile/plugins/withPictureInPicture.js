const { withAndroidManifest } = require("@expo/config-plugins");

function withPictureInPicture(config) {
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
      const existingChanges = activity.$["android:configChanges"] ?? "";
      if (!existingChanges.includes("screenSize")) {
        activity.$["android:configChanges"] =
          "keyboard|keyboardHidden|orientation|screenSize|smallestScreenSize|screenLayout|uiMode";
      }
    }
    return cfg;
  });
}

module.exports = withPictureInPicture;
