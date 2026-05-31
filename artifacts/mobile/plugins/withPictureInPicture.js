const { withAndroidManifest, withMainActivity } = require("@expo/config-plugins");

function addManifestChanges(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    app.$["android:usesCleartextTraffic"] = "true";

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

function addPipToMainActivity(config) {
  return withMainActivity(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes("PictureInPictureParams")) {
      contents = contents.replace(
        /^(package [^\n]+\n)/m,
        "$1\nimport android.app.PictureInPictureParams\nimport android.os.Build\nimport java.io.File\n"
      );
    }

    if (!contents.includes("onUserLeaveHint")) {
      contents = contents.replace(
        "class MainActivity : ReactActivity() {",
        `class MainActivity : ReactActivity() {

  override fun onUserLeaveHint() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val flagFile = File(cacheDir, "pip_active.txt")
        val shouldPip = flagFile.exists() && flagFile.readText().trim() == "1"
        if (shouldPip) {
          val params = PictureInPictureParams.Builder().build()
          enterPictureInPictureMode(params)
        }
      }
    } catch (_: Exception) {}
    super.onUserLeaveHint()
  }`
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withPictureInPicture(config) {
  config = addManifestChanges(config);
  config = addPipToMainActivity(config);
  return config;
};
