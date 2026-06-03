const { withDangerousMod, withAndroidColors } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

// Approach 1: withAndroidColors (proper Expo mod pipeline)
function addColorViaAndroidColors(config) {
  return withAndroidColors(config, (cfg) => {
    const res = cfg.modResults.resources;
    // resources can be empty string "" when colors.xml doesn't exist yet
    if (!res || typeof res !== "object") {
      cfg.modResults.resources = { color: [] };
    }
    if (!Array.isArray(cfg.modResults.resources.color)) {
      cfg.modResults.resources.color = [];
    }
    const already = cfg.modResults.resources.color.some(
      (c) => c && c.$ && c.$.name === "iconBackground"
    );
    if (!already) {
      cfg.modResults.resources.color.push({
        $: { name: "iconBackground" },
        _: "#000000",
      });
    }
    return cfg;
  });
}

// Approach 2: withDangerousMod — creates a separate values XML file AND
// rewrites ic_launcher*.xml to use @drawable/ic_launcher_background
// so it never needs @color/iconBackground at all.
function patchViaFilesystem(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const platformRoot = cfg.modRequest.platformProjectRoot; // .../android
      const resDir = path.join(platformRoot, "app", "src", "main", "res");

      // ── 1. Write a dedicated color file ────────────────────────────
      const valuesDir = path.join(resDir, "values");
      fs.mkdirSync(valuesDir, { recursive: true });

      const colorXml =
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        "<resources>\n" +
        '    <color name="iconBackground">#000000</color>\n' +
        "</resources>\n";

      fs.writeFileSync(
        path.join(valuesDir, "netplay_icon_colors.xml"),
        colorXml,
        "utf8"
      );

      // Patch colors.xml too if it exists
      const colorsPath = path.join(valuesDir, "colors.xml");
      if (fs.existsSync(colorsPath)) {
        let c = fs.readFileSync(colorsPath, "utf8");
        if (!c.includes('name="iconBackground"')) {
          c = c.replace(
            "</resources>",
            '    <color name="iconBackground">#000000</color>\n</resources>'
          );
          fs.writeFileSync(colorsPath, c, "utf8");
        }
      }

      // ── 2. Create a drawable background so ic_launcher.xml can use
      //        @drawable/ic_launcher_background instead of @color/iconBackground
      const drawableDir = path.join(resDir, "drawable");
      fs.mkdirSync(drawableDir, { recursive: true });
      const drawableXml =
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<shape xmlns:android="http://schemas.android.com/apk/res/android">\n' +
        '    <solid android:color="#000000"/>\n' +
        "</shape>\n";
      fs.writeFileSync(
        path.join(drawableDir, "ic_launcher_background.xml"),
        drawableXml,
        "utf8"
      );

      // ── 3. Patch ic_launcher*.xml files to avoid @color/iconBackground ──
      const mipmapDir = path.join(resDir, "mipmap-anydpi-v26");
      if (fs.existsSync(mipmapDir)) {
        ["ic_launcher.xml", "ic_launcher_round.xml"].forEach((fname) => {
          const fpath = path.join(mipmapDir, fname);
          if (fs.existsSync(fpath)) {
            let xml = fs.readFileSync(fpath, "utf8");
            if (xml.includes("@color/iconBackground")) {
              xml = xml.replace(
                /@color\/iconBackground/g,
                "@drawable/ic_launcher_background"
              );
              fs.writeFileSync(fpath, xml, "utf8");
            }
          }
        });
      }

      return cfg;
    },
  ]);
}

function withIconBackground(config) {
  config = addColorViaAndroidColors(config);
  config = patchViaFilesystem(config);
  return config;
}

module.exports = withIconBackground;
