const { withAndroidManifest, withMainActivity, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

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
        "$1\nimport android.app.PictureInPictureParams\nimport android.os.Build\n"
      );
    }

    if (!contents.includes("onUserLeaveHint")) {
      contents = contents.replace(
        "class MainActivity : ReactActivity() {",
        `class MainActivity : ReactActivity() {

  override fun onUserLeaveHint() {
    try {
      if (PipModule.isPipActive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        enterPictureInPictureMode(PictureInPictureParams.Builder().build())
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

function withPipNativeFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const srcDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        "com",
        "netplay",
        "app"
      );

      if (!fs.existsSync(srcDir)) return cfg;

      fs.writeFileSync(
        path.join(srcDir, "PipModule.kt"),
        `package com.netplay.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PipModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    @JvmStatic var isPipActive = false
  }

  override fun getName(): String = "PipModule"

  @ReactMethod
  fun setActive(active: Boolean) {
    isPipActive = active
  }
}`
      );

      fs.writeFileSync(
        path.join(srcDir, "PipPackage.kt"),
        `package com.netplay.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PipPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(PipModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}`
      );

      const mainAppPath = path.join(srcDir, "MainApplication.kt");
      if (fs.existsSync(mainAppPath)) {
        let contents = fs.readFileSync(mainAppPath, "utf-8");
        if (!contents.includes("PipPackage")) {
          contents = contents.replace(
            /(val packages = PackageList\(this\)\.packages)/,
            "$1\n        packages.add(PipPackage())"
          );
          fs.writeFileSync(mainAppPath, contents);
        }
      }

      return cfg;
    },
  ]);
}

module.exports = function withPictureInPicture(config) {
  config = addManifestChanges(config);
  config = addPipToMainActivity(config);
  config = withPipNativeFiles(config);
  return config;
};
