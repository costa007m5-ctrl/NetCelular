const { withDangerousMod } = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

function withIconBackground(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const valuesDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "values"
      );

      if (!fs.existsSync(valuesDir)) {
        fs.mkdirSync(valuesDir, { recursive: true });
      }

      const colorsPath = path.join(valuesDir, "colors.xml");

      if (!fs.existsSync(colorsPath)) {
        fs.writeFileSync(
          colorsPath,
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="iconBackground">#000000</color>\n</resources>\n`,
          "utf8"
        );
        return cfg;
      }

      let content = fs.readFileSync(colorsPath, "utf8");

      if (content.includes('name="iconBackground"')) {
        return cfg;
      }

      content = content.replace(
        "</resources>",
        '    <color name="iconBackground">#000000</color>\n</resources>'
      );

      fs.writeFileSync(colorsPath, content, "utf8");
      return cfg;
    },
  ]);
}

module.exports = withIconBackground;
