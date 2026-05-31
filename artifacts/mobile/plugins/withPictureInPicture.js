const { withAndroidManifest, withMainActivity } = require("@expo/config-plugins");

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

function withPiPMainActivity(config) {
  return withMainActivity(config, (mod) => {
    let contents = mod.modResults.contents;

    const pipImports = [
      "import android.app.PictureInPictureParams",
      "import android.os.Build",
      "import android.util.Rational",
    ];

    pipImports.forEach((imp) => {
      if (!contents.includes(imp)) {
        contents = contents.replace(
          /^(import com\.facebook\.react\.ReactActivity)/m,
          `${imp}\n$1`
        );
      }
    });

    const onUserLeaveHint = `
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val params = PictureInPictureParams.Builder()
          .setAspectRatio(Rational(16, 9))
          .build()
        enterPictureInPictureMode(params)
      } catch (_: Exception) {}
    }
  }
`;

    if (!contents.includes("onUserLeaveHint")) {
      const insertTarget = "override fun onBackPressed";
      if (contents.includes(insertTarget)) {
        contents = contents.replace(insertTarget, onUserLeaveHint + "\n  " + insertTarget);
      } else {
        const lastBrace = contents.lastIndexOf("}");
        contents = contents.substring(0, lastBrace) + onUserLeaveHint + "\n" + contents.substring(lastBrace);
      }
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

function withPictureInPicture(config) {
  config = withPiPManifest(config);
  config = withPiPMainActivity(config);
  return config;
}

module.exports = withPictureInPicture;
