import app from "./app";
import { logger } from "./lib/logger";
import { warmAllCatalogCaches } from "./routes/r2";

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
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Pre-warm the Flix 2.0 catalog cache in background after server is up.
  // Covers all pages: series (377), animes (~849), movies (821).
  // Once warm, /flix2/search finds any title instantly with full coverage.
  warmAllCatalogCaches().catch(() => {});
});
