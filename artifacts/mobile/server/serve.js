/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → landing page HTML
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const STATIC_ROOT   = path.resolve(__dirname, "..", "static-build");
const WEB_ROOT      = path.resolve(__dirname, "..", "dist");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const webIndexPath = path.join(WEB_ROOT, "index.html");
const hasWebBuild  = fs.existsSync(webIndexPath);

function serveWebApp(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(WEB_ROOT, safePath);

  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const noCache = !ext || ext === ".html" || ext === ".json";
    const headers = { "content-type": contentType };
    if (noCache) {
      headers["cache-control"] = "no-cache, no-store, must-revalidate";
    }
    const content = fs.readFileSync(filePath);
    res.writeHead(200, headers);
    res.end(content);
    return;
  }

  const content = fs.readFileSync(webIndexPath);
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache, no-store, must-revalidate",
  });
  res.end(content);
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

// ── API Server: sobe automaticamente como processo filho ───────────────────────
const API_PORT = parseInt(process.env.API_PORT || "8080", 10);

const net = require("net");

function isPortInUse(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => { s.destroy(); resolve(false); });
  });
}

let _apiChild = null;
let _shuttingDown = false;

function spawnApiServer() {
  if (_shuttingDown) return;

  const apiDist = path.resolve(__dirname, "..", "..", "api-server", "dist", "index.mjs");
  if (!fs.existsSync(apiDist)) {
    console.warn("[api-server] dist não encontrado em:", apiDist, "— proxy pode falhar.");
    return;
  }

  const child = spawn(process.execPath, ["--enable-source-maps", apiDist], {
    env: Object.assign({}, process.env, { PORT: String(API_PORT) }),
    stdio: ["ignore", "pipe", "pipe"],
  });

  _apiChild = child;

  child.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));

  child.on("exit", (code, signal) => {
    _apiChild = null;
    if (_shuttingDown) return;
    console.error(`[api-server] Saiu (code=${code} signal=${signal}) — reiniciando em 3s`);
    setTimeout(spawnApiServer, 3000);
  });

  console.log(`[api-server] Iniciado na porta ${API_PORT}`);
}

// Graceful shutdown: matar o processo filho antes de sair
// Sem isso, o filho fica como órfão segurando a porta e causa EADDRINUSE no restart
function shutdown(signal) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`[serve] ${signal} recebido — encerrando...`);
  if (_apiChild) {
    try { _apiChild.kill("SIGTERM"); } catch {}
    // Força SIGKILL após 5s se o filho não sair
    setTimeout(() => {
      try { _apiChild && _apiChild.kill("SIGKILL"); } catch {}
      process.exit(0);
    }, 5000).unref();
    _apiChild.on("exit", () => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Sobe o API server somente se a porta não estiver já em uso
// (em desenvolvimento o workflow do API server ocupa a porta; em produção não)
isPortInUse(API_PORT).then((inUse) => {
  if (inUse) {
    console.log(`[api-server] Porta ${API_PORT} já ocupada — usando servidor existente.`);
  } else {
    spawnApiServer();
  }
});

// ── Proxy: encaminha /api/* para o API server (porta 8080) ─────────────────────

function proxyToApi(req, res) {
  const options = {
    hostname: "localhost",
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: `localhost:${API_PORT}` }),
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // CORS headers para requests do browser
    const headers = Object.assign({}, proxyRes.headers, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
    });
    res.writeHead(proxyRes.statusCode || 502, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy] API server error:", err.message);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "API server indisponível", message: err.message }));
  });

  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  // Preflight CORS
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // Proxy /api/ → API server (porta 8080)
  if (pathname.startsWith("/api/")) {
    return proxyToApi(req, res);
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      if (hasWebBuild) return serveWebApp("/index.html", res);
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  if (hasWebBuild) return serveWebApp(pathname, res);
  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
