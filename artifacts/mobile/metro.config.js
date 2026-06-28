if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return [...this].reverse();
  };
}

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Block directories that should not be watched by Metro:
// - .local: skill dirs created/deleted by Replit's agent tooling
// - .config/npe: global npm install dir lives inside workspace on Replit,
//   causing ENOENT crashes when Metro tries to watch temp pnpm dirs inside it
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockDirs = [
  path.resolve(monorepoRoot, ".local"),
  path.resolve(monorepoRoot, ".config"),
  path.resolve(monorepoRoot, ".cache"),
];
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...blockDirs.map((d) => new RegExp(`^${escapeRegex(d)}(/.*)?$`)),
];

module.exports = config;
