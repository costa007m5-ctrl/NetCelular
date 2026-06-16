import app from "./app";
import { logger } from "./lib/logger";
import { warmAllCatalogCaches, warmAllVeoCaches } from "./routes/r2";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    const nodeErr = err as NodeJS.ErrnoException;

    if (nodeErr.code === "EADDRINUSE") {
      // Another instance (autoscale container) is already serving this port.
      // Exit with code=0 so serve.js does NOT restart us immediately.
      // serve.js will proxy /api/* to the running instance on :8080 and
      // will start its own server if that port ever drops.
      logger.warn(
        { port },
        "Port already in use — another instance is serving. Exiting gracefully.",
      );
      process.exit(0);
    }

    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Pre-warm the Flix 2.0 catalog cache in background after server is up.
  // Covers all pages: series (377), animes (~849), movies (821).
  // Once warm, /flix2/search finds any title instantly with full coverage.
  warmAllCatalogCaches().catch(() => {});
  warmAllVeoCaches().catch(() => {});

  // Auto-refresh every 30 minutes so new series/episodes and movies are detected.
  // Without this, the cache just expires passively and new content stays invisible
  // until someone happens to trigger a request that bypasses the expired cache.
  const WARM_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(() => {
    logger.info("Auto-refresh: re-warming Flix 2.0 catalog cache (30 min cycle)");
    warmAllCatalogCaches().catch((e) => {
      logger.warn({ err: e }, "Auto-refresh: warm cycle failed");
    });
  }, WARM_INTERVAL_MS);
});
