// Polyfill for Node 18 compat (Array.prototype.toReversed added in Node 18.16+)
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

// Only watch the shared lib folder (not the entire monorepo root).
// Watching the whole monorepo caused Metro to react to API server changes,
// triggering unnecessary hot-reloads and slow restarts.
config.watchFolders = [
  path.resolve(monorepoRoot, "lib"),
];

// Tell Metro where to find node_modules (project-level and workspace-level)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

module.exports = config;
