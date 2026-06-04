import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Upstream hosts that are allowed to be proxied (whitelist for security)
const ALLOWED_UPSTREAM_HOSTS = [
  "animezey16082023.animezey16082023.workers.dev",
  "animezey23112022.workers.dev",
  "1.animezey23112022.workers.dev",
  "drive.usercontent.google.com",
  "drive.google.com",
  "doc-0a-00-docs.googleusercontent.com",
  "doc-00-00-docs.googleusercontent.com",
  "lh3.googleusercontent.com",
  "xapiverse.com",
  // TeraBox CDN domains
  "www.terabox.com",
  "terabox.com",
  "teraboxapp.com",
  "1024terabox.com",
  "1024tera.com",
];

function isAllowedHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname;
    // Allow any googleusercontent.com subdomain
    if (host.endsWith(".googleusercontent.com")) return true;
    // Allow any animezey workers.dev subdomain
    if (host.endsWith(".workers.dev") && host.includes("animezey")) return true;
    // Allow any workers.dev subdomain for BHA Cloud
    if (host.endsWith(".workers.dev") && (host.includes("3112022") || host.includes("animezey"))) return true;
    // Allow TeraBox CDN (d.terabox.com, d2.terabox.com, etc.)
    if (host.endsWith(".terabox.com") || host.endsWith(".teraboxapp.com")) return true;
    // Allow any d*.baidupcs.com or d*.bdstatic.com (TeraBox/Baidu CDN)
    if (host.endsWith(".baidupcs.com") || host.endsWith(".bdstatic.com")) return true;
    return ALLOWED_UPSTREAM_HOSTS.includes(host);
  } catch {
    return false;
  }
}

// GET /stream/proxy?url=<encoded-url>
// Transparent video proxy with Range request support for native video players.
// Follows redirect chains, forwards Range headers, streams response.
router.get("/proxy", async (req: Request, res: Response) => {
  const rawUrl = (req.query["url"] as string ?? "").trim();

  if (!rawUrl) {
    res.status(400).json({ error: "url param required" });
    return;
  }

  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(rawUrl);
  } catch {
    decodedUrl = rawUrl;
  }

  if (!isAllowedHost(decodedUrl)) {
    res.status(403).json({ error: "Host not allowed" });
    return;
  }

  const rangeHeader = req.headers["range"];

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Referer": "https://animezey16082023.animezey16082023.workers.dev/",
  };

  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);

  // Close upstream connection if client disconnects
  req.on("close", () => ctrl.abort());

  try {
    const upstream = await fetch(decodedUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    // Forward key response headers
    const forwardHeaders: Record<string, string> = {
      "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    };

    const contentType = upstream.headers.get("content-type");
    if (contentType) forwardHeaders["Content-Type"] = contentType;

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) forwardHeaders["Content-Length"] = contentLength;

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) forwardHeaders["Content-Range"] = contentRange;

    const lastModified = upstream.headers.get("last-modified");
    if (lastModified) forwardHeaders["Last-Modified"] = lastModified;

    const etag = upstream.headers.get("etag");
    if (etag) forwardHeaders["ETag"] = etag;

    res.writeHead(upstream.status, forwardHeaders);

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream the body — use WHATWG ReadableStream reader for Node compat
    const reader = upstream.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        const canContinue = res.write(value);
        if (!canContinue) {
          // Back-pressure: wait for drain before reading more
          await new Promise<void>((resolve) => res.once("drain", resolve));
        }
      }
    };

    pump().catch(() => {
      try { res.end(); } catch {}
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      if (err?.name === "AbortError") {
        res.status(504).json({ error: "Upstream timeout or client disconnected" });
      } else {
        res.status(502).json({ error: err?.message ?? "Proxy error" });
      }
    }
  }
});

// OPTIONS for CORS preflight
router.options("/proxy", (_req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Max-Age": "86400",
  }).sendStatus(204);
});

export default router;
