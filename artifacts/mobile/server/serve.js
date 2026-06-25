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
let _portWatchTimer = null;

// When another autoscale instance already owns :8080, we don't restart our
// own api-server. Instead we watch every 20s; if the port drops we take over.
function startPortWatcher() {
  if (_portWatchTimer || _shuttingDown) return;
  console.log(`[api-server] Monitorando porta ${API_PORT} — assumirá se a instância principal cair`);
  _portWatchTimer = setInterval(() => {
    if (_shuttingDown || _apiChild) {
      clearInterval(_portWatchTimer);
      _portWatchTimer = null;
      return;
    }
    isPortInUse(API_PORT).then((inUse) => {
      if (!inUse) {
        clearInterval(_portWatchTimer);
        _portWatchTimer = null;
        console.log(`[api-server] Porta ${API_PORT} liberada — iniciando servidor local...`);
        spawnApiServer();
      }
    });
  }, 20000);
}

function killPortSync(port) {
  // Pure /proc approach — works on Linux/NixOS without lsof.
  // 1. Find the socket inode for the port from /proc/net/tcp & /proc/net/tcp6.
  // 2. Scan /proc/<pid>/fd/ for a symlink pointing at socket:[inode].
  // 3. Send SIGKILL to that pid (skipping our own process).
  try {
    const portHex = port.toString(16).toUpperCase().padStart(4, "0");
    let inode = null;
    for (const file of ["/proc/net/tcp6", "/proc/net/tcp"]) {
      try {
        const lines = fs.readFileSync(file, "utf8").split("\n").slice(1);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10) continue;
          const localAddr = parts[1] || "";
          const colonIdx = localAddr.lastIndexOf(":");
          if (colonIdx < 0) continue;
          const portPart = localAddr.slice(colonIdx + 1).toUpperCase();
          if (portPart === portHex) { inode = parts[9]; break; }
        }
        if (inode && inode !== "0") break;
      } catch {}
    }
    if (!inode || inode === "0") return false;

    const socketLink = `socket:[${inode}]`;
    const procEntries = fs.readdirSync("/proc").filter((e) => /^\d+$/.test(e));
    for (const pid of procEntries) {
      if (pid === String(process.pid)) continue;
      try {
        const fds = fs.readdirSync(`/proc/${pid}/fd`);
        for (const fd of fds) {
          try {
            if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === socketLink) {
              try {
                process.kill(Number(pid), "SIGKILL");
                console.log(`[api-server] Matou processo órfão na porta ${port} (pid=${pid})`);
              } catch {}
              return true;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return false;
}

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

    // code=0 means the api-server detected EADDRINUSE and exited gracefully —
    // another autoscale instance already owns the port.
    // Don't restart; proxy to the running instance and watch for takeover.
    if (code === 0) {
      isPortInUse(API_PORT).then((inUse) => {
        if (inUse) {
          console.log(`[api-server] Outra instância servindo na porta ${API_PORT} — proxy ativo, monitorando...`);
          startPortWatcher();
        } else {
          // Port is free despite clean exit (e.g. hot-reload, intentional stop) — restart.
          spawnApiServer();
        }
      });
      return;
    }

    // Non-zero exit: restart after delay, killing any orphan first.
    console.error(`[api-server] Saiu (code=${code} signal=${signal}) — reiniciando em 3s`);
    setTimeout(() => {
      isPortInUse(API_PORT).then((inUse) => {
        if (inUse) {
          console.log(`[api-server] Porta ${API_PORT} ocupada por órfão — liberando...`);
          killPortSync(API_PORT);
          setTimeout(spawnApiServer, 1000);
        } else {
          spawnApiServer();
        }
      });
    }, 3000);
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

// Sobe o API server apenas se a porta NÃO estiver em uso.
// Em deployment autoscale, o api-server roda como artifact separado — não matar.
isPortInUse(API_PORT).then((inUse) => {
  if (inUse) {
    // Porta ocupada: pode ser o artifact do api-server no deployment autoscale,
    // ou outra instância. Apenas monitorar — NÃO matar nem reiniciar.
    console.log(`[api-server] Porta ${API_PORT} ocupada — usando instância existente (modo deployment).`);
    startPortWatcher();
  } else {
    spawnApiServer();
  }
});

// ── Auto-build mobile bundle se static-build não existir ────────────────────────
(function autoTriggerMobileBuild() {
  const hasStaticBuild = fs.existsSync(path.join(STATIC_ROOT, "ios", "manifest.json"));
  if (hasStaticBuild) {
    console.log("[mobile-build] static-build encontrado — pulando build.");
    return;
  }

  const buildScript = path.resolve(__dirname, "..", "scripts", "build.js");
  if (!fs.existsSync(buildScript)) {
    console.warn("[mobile-build] scripts/build.js não encontrado — pulando build automático.");
    return;
  }

  console.log("[mobile-build] static-build não encontrado — iniciando build mobile em background...");
  console.log("[mobile-build] Isso pode levar 10-15 minutos. O app ficará disponível após a conclusão.");

  const buildEnv = Object.assign({}, process.env, {
    EXPO_PUBLIC_DOMAIN: process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN || "",
    EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID || "",
  });

  const buildChild = spawn(process.execPath, [buildScript], {
    cwd: path.resolve(__dirname, ".."),
    env: buildEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  buildChild.stdout && buildChild.stdout.on("data", (d) => process.stdout.write(`[mobile-build] ${d}`));
  buildChild.stderr && buildChild.stderr.on("data", (d) => process.stderr.write(`[mobile-build] ${d}`));

  buildChild.on("exit", (code) => {
    if (code === 0) {
      console.log("[mobile-build] Build concluído com sucesso! Escaneie o QR code no app Expo Go.");
    } else {
      console.error(`[mobile-build] Build falhou (code=${code}). Verifique os logs acima.`);
    }
  });

  buildChild.unref();
})();

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

  // Proxy /api and /api/* → API server (porta 8080)
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return proxyToApi(req, res);
  }

  // Dev proxy: forward Metro bundle / asset requests to Metro dev server (port 18115)
  // Triggered when the file doesn't exist in dist (i.e. dist only has the placeholder index.html).
  const METRO_DEV_PORT = 18115;
  const isMetroRequest = pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/_expo/") ||
    pathname.startsWith("/__expo/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/hot" ||
    pathname.startsWith("/symbolicate");
  if (isMetroRequest) {
    const fileInDist = path.join(WEB_ROOT, path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ""));
    const existsInDist = fs.existsSync(fileInDist) && !fs.statSync(fileInDist).isDirectory();
    if (!existsInDist) {
      const proxyReq = http.request({
        hostname: "localhost",
        port: METRO_DEV_PORT,
        path: req.url,
        method: req.method,
        headers: Object.assign({}, req.headers, { host: `localhost:${METRO_DEV_PORT}` }),
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });
      proxyReq.on("error", () => {
        res.writeHead(502);
        res.end("Metro dev server unavailable");
      });
      req.pipe(proxyReq, { end: true });
      return;
    }
  }

  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      if (hasWebBuild) return serveWebApp("/index.html", res);
      // No static web build: proxy root to Metro dev server so Chrome sees the live app
      const metroReq = http.request({
        hostname: "localhost",
        port: METRO_DEV_PORT,
        path: req.url,
        method: req.method,
        headers: Object.assign({}, req.headers, { host: `localhost:${METRO_DEV_PORT}` }),
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });
      metroReq.on("error", () => {
        // Metro not ready yet — show landing page as fallback
        serveLandingPage(req, res, landingPageTemplate, appName);
      });
      req.pipe(metroReq, { end: true });
      return;
    }
  }

  if (hasWebBuild) return serveWebApp(pathname, res);
  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`[serve] Port ${port} already in use — another instance is serving. Exiting gracefully.`);
    process.exit(0);
  } else {
    throw err;
  }
});
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
