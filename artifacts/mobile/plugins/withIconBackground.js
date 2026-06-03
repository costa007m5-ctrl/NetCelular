const { withAndroidColors } = require("@expo/config-plugins");

function withIconBackground(config) {
  return withAndroidColors(config, (cfg) => {
    const colors = cfg.modResults.resources.color ?? [];

    const exists = colors.some((c) => c.$?.name === "iconBackground");
    if (!exists) {
      colors.push({
        $: { name: "iconBackground" },
        _: "#000000",
      });
    } else {
      const entry = colors.find((c) => c.$?.name === "iconBackground");
      if (entry) entry._ = "#000000";
    }

    cfg.modResults.resources.color = colors;
    return cfg;
  });
}

module.exports = withIconBackground;
