const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

function withIconBackground(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "values"
      );

      if (!fs.existsSync(resDir)) {
        fs.mkdirSync(resDir, { recursive: true });
      }

      // Write to a separate file so Expo's own colors.xml generation
      // doesn't overwrite it. Android merges all values/*.xml at build time.
      const outPath = path.join(resDir, "netplay_icon_colors.xml");
      fs.writeFileSync(
        outPath,
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="iconBackground">#000000</color>\n</resources>\n',
        "utf8"
      );

      // Also patch colors.xml if it exists and is missing iconBackground
      const colorsPath = path.join(resDir, "colors.xml");
      if (fs.existsSync(colorsPath)) {
        let content = fs.readFileSync(colorsPath, "utf8");
        if (!content.includes('name="iconBackground"')) {
          content = content.replace(
            "</resources>",
            '    <color name="iconBackground">#000000</color>\n</resources>'
          );
          fs.writeFileSync(colorsPath, content, "utf8");
        }
      }

      return cfg;
    },
  ]);
}

module.exports = withIconBackground;
