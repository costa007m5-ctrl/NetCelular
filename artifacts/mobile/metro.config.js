// Polyfill for Node 18 compat (Array.prototype.toReversed added in Node 18.16+)
if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}

const { getDefaultConfig } = require("expo/metro-config");
module.exports = getDefaultConfig(__dirname);
