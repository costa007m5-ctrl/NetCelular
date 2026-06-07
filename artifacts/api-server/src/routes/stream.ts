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
  // Flix 2.0 / nixplay.lat CDN domains
  "nixplay.lat",
  "vod99.cineveo.lat",
  "cineveo.lat",
];

// Flix 2.0 CDN root domains (subdomains/dynamic hostnames allowed)
const FLIX2_CDN_ROOTS = [
  "72yrci50ppqp71.com",   // www-fontedecanais-me.72yrci50ppqp71.com
  "fontedecanais.me",
  "cineveo.lat",
  "nixplay.lat",
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
    // Allow Flix 2.0 CDN roots (including dynamic subdomain hostnames like www-fontedecanais-me.72yrci50ppqp71.com)
    for (const root of FLIX2_CDN_ROOTS) {
      if (host === root || host.endsWith(`.${root}`)) return true;
    }
    return ALLOWED_UPSTREAM_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function isFlix2Host(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname;
    for (const root of FLIX2_CDN_ROOTS) {
      if (host === root || host.endsWith(`.${root}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isHlsContentType(contentType: string | null, url: string): boolean {
  if (!contentType) return url.includes(".m3u8");
  const ct = contentType.toLowerCase();
  return (
    ct.includes("application/x-mpegurl") ||
    ct.includes("application/vnd.apple.mpegurl") ||
    ct.includes("audio/mpegurl") ||
    ct.includes("audio/x-mpegurl") ||
    // Some CDNs return octet-stream for m3u8
    (ct.includes("application/octet-stream") && url.includes(".m3u8"))
  );
}

/**
 * Build a self-referencing proxy URL so that HLS segment requests also go through this proxy.
 * `baseProxyUrl` is the public URL of this server (e.g. https://xxx.replit.app/api/stream/proxy).
 * If we don't know it, fall back to using a relative path that the client can resolve.
 */
function buildSegmentProxyUrl(segmentAbsoluteUrl: string, proxyBase: string): string {
  return `${proxyBase}?url=${encodeURIComponent(segmentAbsoluteUrl)}`;
}

/**
 * Resolve a possibly-relative URI against a base URL.
 */
function resolveUrl(uri: string, base: string): string {
  try {
    return new URL(uri, base).toString();
  } catch {
    return uri;
  }
}

/**
 * Rewrite an HLS manifest (m3u8) so that all segment and init-section URIs
 * go through this proxy. This ensures ExoPlayer fetches every .ts/.aac/.mp4
 * segment with browser UA headers — not directly to the CDN.
 *
 * Handles:
 *   - Segment URI lines (non-comment, non-tag lines)
 *   - EXT-X-KEY URI="..." attributes (encryption keys)
 *   - EXT-X-MAP URI="..." attributes (initialization segments)
 *   - EXT-X-MEDIA URI="..." attributes (alternate rendition playlists)
 *   - Nested m3u8 variant playlists (master → media playlists)
 */
function rewriteHlsManifest(body: string, manifestUrl: string, proxyBase: string): string {
  const lines = body.split("\n");
  const out: string[] = [];

  // Regex to match URI="..." in EXT-X-* tags
  const uriAttrRe = /URI="([^"]+)"/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // Comment / empty → pass through as-is
    if (line === "" || line.startsWith("#EXT-X-ENDLIST") || line.startsWith("#EXTM3U") || line.startsWith("#EXT-X-VERSION") || line.startsWith("#EXT-X-TARGETDURATION") || line.startsWith("#EXT-X-MEDIA-SEQUENCE") || line.startsWith("#EXT-X-PLAYLIST-TYPE") || line.startsWith("#EXT-X-ALLOW-CACHE") || line.startsWith("#EXT-X-DISCONTINUITY") || line.startsWith("#EXTINF") || line.startsWith("#EXT-X-BYTERANGE") || line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE") || line.startsWith("#EXT-X-PROGRAM-DATE-TIME") || line.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")) {
      out.push(line);
      continue;
    }

    // Tags that have URI="..." attributes to rewrite
    if (line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP") || line.startsWith("#EXT-X-MEDIA") || line.startsWith("#EXT-X-I-FRAME-STREAM-INF") || line.startsWith("#EXT-X-SESSION-DATA")) {
      const rewritten = line.replace(uriAttrRe, (_match, uri) => {
        const abs = resolveUrl(uri, manifestUrl);
        if (!isAllowedHost(abs)) return `URI="${uri}"`;
        return `URI="${buildSegmentProxyUrl(abs, proxyBase)}"`;
      });
      out.push(rewritten);
      continue;
    }

    // EXT-X-STREAM-INF is followed by a URI on the next line (variant playlist)
    if (line.startsWith("#EXT-X-STREAM-INF") || line.startsWith("#EXT-X-I-FRAME-STREAM-INF")) {
      out.push(line);
      // Rewrite the URI="..." inside the tag too (for I-FRAME-STREAM-INF)
      continue;
    }

    // Any other # tag — pass through
    if (line.startsWith("#")) {
      out.push(line);
      continue;
    }

    // Non-empty, non-comment line = a URI (segment or playlist)
    const abs = resolveUrl(line, manifestUrl);
    if (isAllowedHost(abs)) {
      out.push(buildSegmentProxyUrl(abs, proxyBase));
    } else {
      // Unknown host — pass through unchanged (won't be proxied)
      out.push(line);
    }
  }

  return out.join("\n");
}

/**
 * Derive the public proxy base URL from the incoming Express request.
 * Works both in dev (Replit preview proxy) and in deployed .replit.app environments.
 */
function getProxyBase(req: Request): string {
  // x-forwarded-host is set by Replit's reverse proxy
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost:8080";
  const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
  // The proxy endpoint is at /api/stream/proxy
  return `${proto}://${host}/api/stream/proxy`;
}

// GET /stream/proxy?url=<encoded-url>
// Transparent video proxy with Range request support for native video players.
// For HLS manifests (m3u8): rewrites all segment/init URLs to go through this proxy,
// so ExoPlayer fetches EVERY request (manifest + segments) with browser UA — bypassing
// CDN Cloudflare WAF blocks that target ExoPlayer/Dalvik User-Agents.
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
    let host = "unknown";
    try { host = new URL(decodedUrl).hostname; } catch {}
    console.log(`[proxy] BLOCKED host="${host}" url="${decodedUrl.slice(0, 120)}"`);
    res.status(403).json({ error: "Host not allowed", host });
    return;
  }

  const rangeHeader = req.headers["range"];

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    // Use Flix2-specific Referer for Flix2 CDN domains; fallback to animezey for Drive
    "Referer": isFlix2Host(decodedUrl) ? "https://nixplay.lat/" : "https://animezey16082023.animezey16082023.workers.dev/",
  };

  if (isFlix2Host(decodedUrl)) {
    upstreamHeaders["Origin"] = "https://nixplay.lat";
  }

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

    let host = "unknown";
    try { host = new URL(decodedUrl).hostname; } catch {}
    console.log(`[proxy] ${upstream.status} host="${host}" range=${!!rangeHeader} ct="${upstream.headers.get("content-type") ?? ""}" url="${decodedUrl.slice(0, 100)}"`);

    if (!upstream.ok && upstream.status !== 206) {
      console.log(`[proxy] upstream error ${upstream.status} for host="${host}"`);
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}`, host, status: upstream.status });
      return;
    }

    const contentType = upstream.headers.get("content-type");

    // ── HLS manifest rewriting ────────────────────────────────────────────────
    // When the upstream returns an HLS manifest (m3u8), we rewrite all segment URIs
    // so they go through this proxy. This ensures ExoPlayer fetches segments with
    // browser UA headers — the only way to guarantee Cloudflare CDN doesn't block them
    // regardless of how expo-av handles custom headers internally on Android.
    // Range requests are NOT for m3u8 manifests (they're small text files), so we
    // only do this rewriting on non-Range requests for HLS content.
    if (!rangeHeader && isHlsContentType(contentType, decodedUrl)) {
      const body = await upstream.text();
      const proxyBase = getProxyBase(req);
      const rewritten = rewriteHlsManifest(body, decodedUrl, proxyBase);

      res.writeHead(200, {
        "Content-Type": "application/x-mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      });
      res.end(rewritten);
      return;
    }

    // ── Regular proxy (non-HLS or range request) ──────────────────────────────
    // Forward key response headers.
    // IMPORTANT: Replit's reverse proxy strips Range headers before they reach Express,
    // so we can't reliably support Range requests. We advertise Accept-Ranges: none
    // so video players (ExoPlayer/AVPlayer) use progressive download instead of
    // Range-based seeking. This avoids a confusing loop where the player sends Range,
    // gets a full 200 back (instead of 206 partial), and errors out.
    // Exception: if we actually received a Range header, the CDN returned 206, and we
    // should forward that correctly (rare — only if Replit forwards Range on some paths).
    const forwardHeaders: Record<string, string> = {
      "Accept-Ranges": rangeHeader ? (upstream.headers.get("accept-ranges") ?? "bytes") : "none",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    };

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
