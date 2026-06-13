import { Router } from "express";
import type { Request, Response as ExpressResponse } from "express";

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
  "hubby.cx",             // Xtream Codes primary CDN (wowserver-vods)
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
 * Parse total size from Content-Range header: "bytes 0-1023/12345" → 12345
 */
function parseTotalSizeFromContentRange(contentRange: string | null): number | null {
  if (!contentRange) return null;
  const m = contentRange.match(/\/(\d+)\s*$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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
 * go through this proxy.
 */
function rewriteHlsManifest(body: string, manifestUrl: string, proxyBase: string): string {
  const lines = body.split("\n");
  const out: string[] = [];

  const uriAttrRe = /URI="([^"]+)"/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (line === "" || line.startsWith("#EXT-X-ENDLIST") || line.startsWith("#EXTM3U") || line.startsWith("#EXT-X-VERSION") || line.startsWith("#EXT-X-TARGETDURATION") || line.startsWith("#EXT-X-MEDIA-SEQUENCE") || line.startsWith("#EXT-X-PLAYLIST-TYPE") || line.startsWith("#EXT-X-ALLOW-CACHE") || line.startsWith("#EXT-X-DISCONTINUITY") || line.startsWith("#EXTINF") || line.startsWith("#EXT-X-BYTERANGE") || line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE") || line.startsWith("#EXT-X-PROGRAM-DATE-TIME") || line.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")) {
      out.push(line);
      continue;
    }

    if (line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP") || line.startsWith("#EXT-X-MEDIA") || line.startsWith("#EXT-X-I-FRAME-STREAM-INF") || line.startsWith("#EXT-X-SESSION-DATA")) {
      const rewritten = line.replace(uriAttrRe, (_match, uri) => {
        const abs = resolveUrl(uri, manifestUrl);
        if (!isAllowedHost(abs)) return `URI="${uri}"`;
        return `URI="${buildSegmentProxyUrl(abs, proxyBase)}"`;
      });
      out.push(rewritten);
      continue;
    }

    if (line.startsWith("#EXT-X-STREAM-INF") || line.startsWith("#EXT-X-I-FRAME-STREAM-INF")) {
      out.push(line);
      continue;
    }

    if (line.startsWith("#")) {
      out.push(line);
      continue;
    }

    // Non-empty, non-comment line = a URI (segment or playlist)
    const abs = resolveUrl(line, manifestUrl);
    if (isAllowedHost(abs)) {
      out.push(buildSegmentProxyUrl(abs, proxyBase));
    } else {
      out.push(line);
    }
  }

  return out.join("\n");
}

function getProxyBase(req: Request): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost:8080";
  const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
  return `${proto}://${host}/api/stream/proxy`;
}

/**
 * Build upstream headers based on URL host.
 * Flix2 CDN domains need Referer/Origin pointing at nixplay.lat.
 */
function buildUpstreamHeaders(decodedUrl: string, clientRange: string | undefined, forceRange: boolean): Record<string, string> {
  const isFlix2 = isFlix2Host(decodedUrl);
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
    "Referer": isFlix2 ? "https://nixplay.lat/" : "https://animezey16082023.animezey16082023.workers.dev/",
  };
  if (isFlix2) upstreamHeaders["Origin"] = "https://nixplay.lat";

  // Always send a Range to upstream when we want full Content-Length info.
  // ExoPlayer needs Content-Length to seek to the moov atom in MP4 files;
  // some CDNs only return Content-Length when a Range is explicitly requested.
  if (clientRange) {
    upstreamHeaders["Range"] = clientRange;
  } else if (forceRange) {
    upstreamHeaders["Range"] = "bytes=0-";
  }

  return upstreamHeaders;
}

/**
 * Forward standard response headers (Content-Type, Length, Range, etc) from upstream.
 * Always advertises Accept-Ranges: bytes so players know seeks are supported.
 */
function buildForwardHeaders(upstream: Response, urlForExt: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
  };

  const upstreamCT = upstream.headers.get("content-type");
  const contentType = upstreamCT && !upstreamCT.toLowerCase().includes("text/html")
    ? upstreamCT
    // Some CDNs return text/html or generic — infer from URL extension
    : (urlForExt.toLowerCase().includes(".m3u8") ? "application/x-mpegurl"
       : urlForExt.toLowerCase().includes(".mp4") ? "video/mp4"
       : upstreamCT ?? "application/octet-stream");
  headers["Content-Type"] = contentType;

  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");

  if (contentRange) {
    headers["Content-Range"] = contentRange;
  }

  // Prefer explicit Content-Length; fall back to derive from Content-Range when missing.
  if (contentLength) {
    headers["Content-Length"] = contentLength;
  } else if (contentRange) {
    // bytes start-end/total → length = end - start + 1
    const m = contentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      const len = end - start + 1;
      if (Number.isFinite(len) && len > 0) headers["Content-Length"] = String(len);
    }
  }

  const lastModified = upstream.headers.get("last-modified");
  if (lastModified) headers["Last-Modified"] = lastModified;

  const etag = upstream.headers.get("etag");
  if (etag) headers["ETag"] = etag;

  return headers;
}

// ── Nixplay redirect resolution cache ────────────────────────────────────────
// Caches the resolved fontedecanais CDN URL per nixplay URL (60s TTL).
// This ensures the token is always resolved by the SAME server instance that
// will proxy the stream — critical for autoscale deployments where different
// instances have different outbound IPs, and fontedecanais tokens are IP-bound.
const NIXPLAY_CDN_CACHE = new Map<string, { cdnUrl: string; cachedAt: number }>();
const NIXPLAY_CDN_TTL_MS = 55_000; // 55s — slightly under most CDN token TTLs

function isNixplayUrl(url: string): boolean {
  try { return new URL(url).hostname === "nixplay.lat"; } catch { return false; }
}

async function resolveNixplayCdn(nixplayUrl: string, signal: AbortSignal): Promise<string> {
  const cached = NIXPLAY_CDN_CACHE.get(nixplayUrl);
  if (cached && Date.now() - cached.cachedAt < NIXPLAY_CDN_TTL_MS) {
    return cached.cdnUrl;
  }
  // Follow the 302 redirect from nixplay to get the CDN URL with token
  // bound to THIS instance's outbound IP.
  const resp = await fetch(nixplayUrl, {
    method: "HEAD",
    redirect: "manual",
    signal,
    headers: {
      "User-Agent": UA,
      "Referer": "https://nixplay.lat/",
      "Origin": "https://nixplay.lat",
    },
  });
  const location = resp.headers.get("location");
  if (!location) return nixplayUrl;
  console.log(`[proxy] nixplay→CDN resolved: ${new URL(location).hostname}`);
  NIXPLAY_CDN_CACHE.set(nixplayUrl, { cdnUrl: location, cachedAt: Date.now() });
  return location;
}

// GET /stream/proxy?url=<encoded-url>
// Transparent video proxy with Range request support for native video players.
router.get("/proxy", async (req: Request, res: ExpressResponse) => {
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

  // EXPRESS 5: router.get() handles both GET and HEAD. Intercept HEAD here
  // and respond instantly — never probe the upstream CDN for HEAD requests.
  // cineveo.lat takes >10s to respond to byte-range probes which causes
  // ExoPlayer/AVPlayer to timeout and show "Erro ao reproduzir vídeo".
  if (req.method === "HEAD") {
    const isHls = decodedUrl.toLowerCase().includes(".m3u8");
    res.writeHead(200, {
      "Content-Type": isHls ? "application/x-mpegurl" : "video/mp4",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  const clientRange = req.headers["range"] as string | undefined;

  // Force a Range header to upstream when:
  //  - Client did NOT send one (e.g., ExoPlayer initial probe)
  //  - The URL is NOT an HLS manifest (m3u8 manifests are small text, no Range)
  const isHlsHint = decodedUrl.toLowerCase().includes(".m3u8");
  const forceRange = !isHlsHint;

  const upstreamHeaders = buildUpstreamHeaders(decodedUrl, clientRange, forceRange);

  const ctrl = new AbortController();
  // Increased timeout: redirect chains + slow Cloudflare CDNs can take >30s.
  const timeout = setTimeout(() => ctrl.abort(), 60_000);

  // Close upstream connection if client disconnects
  let clientClosed = false;
  req.on("close", () => { clientClosed = true; ctrl.abort(); });

  try {
    // If the URL is a nixplay.lat redirect URL, resolve it to the CDN URL
    // using THIS instance's outbound IP so the IP-bound token matches.
    let fetchUrl = decodedUrl;
    if (isNixplayUrl(decodedUrl)) {
      try {
        fetchUrl = await resolveNixplayCdn(decodedUrl, ctrl.signal);
      } catch (e) {
        console.log(`[proxy] nixplay redirect failed, using original url: ${e}`);
      }
      // Rebuild upstream headers for the resolved CDN URL (different host)
      if (fetchUrl !== decodedUrl) {
        Object.assign(upstreamHeaders, buildUpstreamHeaders(fetchUrl, clientRange, forceRange));
      }
    }

    const upstream = await fetch(fetchUrl, {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    let host = "unknown";
    try { host = new URL(fetchUrl).hostname; } catch {}
    const upCL = upstream.headers.get("content-length");
    const upCR = upstream.headers.get("content-range");
    console.log(`[proxy] ${upstream.status} host="${host}" clientRange=${!!clientRange} forced=${forceRange && !clientRange} ct="${upstream.headers.get("content-type") ?? ""}" cl="${upCL ?? "-"}" cr="${upCR ?? "-"}"`);

    if (!upstream.ok && upstream.status !== 206) {
      console.log(`[proxy] upstream error ${upstream.status} for host="${host}"`);
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}`, host, status: upstream.status });
      return;
    }

    const contentType = upstream.headers.get("content-type");

    // ── HLS manifest rewriting ────────────────────────────────────────────────
    if (!clientRange && isHlsContentType(contentType, decodedUrl)) {
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

    // ── Regular proxy (video / non-HLS / range request) ───────────────────────
    const forwardHeaders = buildForwardHeaders(upstream as unknown as Response, decodedUrl);

    // Determine status to send to client.
    //
    // HTTP spec: 206 Partial Content MUST only be sent when the client sent a
    // Range request header. If the client sent no Range header, the response
    // MUST be 200 OK — even if we forced Range: bytes=0- upstream to learn the
    // file size.
    //
    // ExoPlayer abort-loop root cause (observed in logs):
    //   Client sends GET (no Range) → proxy returns 206 → ExoPlayer treats 206
    //   without a prior Range request as an invalid server response → aborts →
    //   retries → loops until "Erro ao reproduzir vídeo".
    //
    // Correct ExoPlayer flow with 200:
    //   1. Client sends GET (no Range) → proxy returns 200 + Content-Length + Accept-Ranges
    //   2. ExoPlayer sees Accept-Ranges: bytes → knows it can seek
    //   3. ExoPlayer reads first bytes to locate moov atom
    //   4. ExoPlayer sends Range: bytes=<offset>- for moov atom → proxy returns 206
    //   5. ExoPlayer parses moov → starts playing
    //
    // When the client DID send a Range header, forward the upstream 206 + Content-Range.
    let outStatus: number;
    if (clientRange) {
      // Client asked for a range — forward 206 as-is
      outStatus = upstream.status; // 206
    } else {
      // Client asked for the full resource — must respond 200.
      // Strip Content-Range (not valid in 200 responses).
      // Content-Length is already set by buildForwardHeaders from the upstream
      // Content-Length (which equals total size when Range: bytes=0- was sent).
      outStatus = 200;
      delete forwardHeaders["Content-Range"];
    }

    res.writeHead(outStatus, forwardHeaders);

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream the body — use WHATWG ReadableStream reader for Node compat
    const reader = upstream.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          if (clientClosed) {
            try { await reader.cancel(); } catch {}
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            try { res.end(); } catch {}
            return;
          }
          const canContinue = res.write(value);
          if (!canContinue) {
            // Back-pressure: wait for drain before reading more
            await new Promise<void>((resolve) => res.once("drain", resolve));
          }
        }
      } catch (e) {
        // Reader/stream errored (typically client abort). Quietly end.
        try { res.end(); } catch {}
      }
    };

    pump();
  } catch (err: any) {
    clearTimeout(timeout);
    if (!res.headersSent) {
      if (err?.name === "AbortError") {
        // Client aborted is normal during seek/replay — log gently.
        if (!clientClosed) {
          res.status(504).json({ error: "Upstream timeout" });
        } else {
          // Client already gone — nothing to send.
          try { res.end(); } catch {}
        }
      } else {
        res.status(502).json({ error: err?.message ?? "Proxy error" });
      }
    }
  }
});

// HEAD /stream/proxy?url=<encoded-url>
// ExoPlayer/AVPlayer issue HEAD before the first GET to confirm Accept-Ranges support.
// IMPORTANT: Do NOT probe the upstream CDN here — cineveo.lat takes >15s to respond
// to byte-range probes, which causes players to timeout with a playback error.
// Instead, respond instantly with synthetic headers. The player will then issue a GET
// request which returns the real Content-Length via Content-Range in the 206 response.
router.head("/proxy", (req: Request, res: ExpressResponse) => {
  const rawUrl = (req.query["url"] as string ?? "").trim();
  if (!rawUrl) { res.status(400).end(); return; }

  let decodedUrl: string;
  try { decodedUrl = decodeURIComponent(rawUrl); } catch { decodedUrl = rawUrl; }

  if (!isAllowedHost(decodedUrl)) {
    res.status(403).end(); return;
  }

  // Determine Content-Type hint from URL extension.
  const isHls = decodedUrl.toLowerCase().includes(".m3u8");
  const ct = isHls ? "application/x-mpegurl" : "video/mp4";

  // Respond immediately — no upstream round-trip.
  // Accept-Ranges: bytes tells the player it can seek (issue Range GETs).
  // Content-Length is intentionally omitted; players that require it will
  // discover the file size from the Content-Range header in the first GET.
  res.writeHead(200, {
    "Content-Type": ct,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Cache-Control": "no-store",
  });
  res.end();
});

// GET /stream/resolve-url?url=<encoded-nixplay-url>
// Resolves a nixplay.lat redirect URL to the final CDN URL server-side,
// so the device can play the CDN URL directly without going through the proxy.
// The fontedecanais token is TIME-BASED (not IP-bound), so any device IP works.
router.get("/resolve-url", async (req: Request, res: ExpressResponse) => {
  const rawUrl = (req.query["url"] as string ?? "").trim();
  if (!rawUrl) { res.status(400).json({ error: "url param required" }); return; }
  let decodedUrl: string;
  try { decodedUrl = decodeURIComponent(rawUrl); } catch { decodedUrl = rawUrl; }

  if (!isNixplayUrl(decodedUrl)) {
    res.json({ url: decodedUrl });
    return;
  }

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10_000);
    const cdnUrl = await resolveNixplayCdn(decodedUrl, ctrl.signal);
    clearTimeout(timeout);
    res.set("Access-Control-Allow-Origin", "*");
    res.json({ url: cdnUrl });
  } catch (e: any) {
    console.log(`[resolve-url] failed: ${e?.message}`);
    res.status(502).json({ error: "Failed to resolve URL", detail: e?.message });
  }
});

// OPTIONS for CORS preflight
router.options("/proxy", (_req, res) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "Access-Control-Max-Age": "86400",
  }).sendStatus(204);
});

export default router;
