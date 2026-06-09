/**
 * Netplay Stream Proxy — Cloudflare Worker
 *
 * Proxies fontedecanais (IP-bound token) and other CDN video sources,
 * correctly forwarding Range headers so ExoPlayer can seek.
 *
 * Endpoint: GET /?url=<encoded-nixplay-or-cdn-url>
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FLIX2_REFERER = "https://nixplay.lat/";
const FLIX2_ORIGIN  = "https://nixplay.lat";

const FLIX2_CDN_ROOTS = [
  "72yrci50ppqp71.com",
  "fontedecanais.me",
  "cineveo.lat",
  "nixplay.lat",
  "hubby.cx",
];

function isFlix2Host(hostname) {
  return FLIX2_CDN_ROOTS.some((r) => hostname === r || hostname.endsWith("." + r));
}

function isNixplayHost(hostname) {
  return hostname === "nixplay.lat";
}

async function resolveNixplay(nixplayUrl) {
  const resp = await fetch(nixplayUrl, {
    method: "HEAD",
    redirect: "manual",
    headers: {
      "User-Agent": UA,
      "Referer": FLIX2_REFERER,
      "Origin": FLIX2_ORIGIN,
      "Accept": "*/*",
    },
  });
  const location = resp.headers.get("location");
  if (location) {
    console.log("[worker] nixplay resolved to:", new URL(location).hostname);
    return location;
  }
  return nixplayUrl;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const encodedUrl = url.searchParams.get("url");
    if (!encodedUrl) {
      return new Response(JSON.stringify({ error: "url param required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let targetUrl;
    try {
      targetUrl = decodeURIComponent(encodedUrl);
    } catch {
      targetUrl = encodedUrl;
    }

    let cdnUrl = targetUrl;
    try {
      const hostname = new URL(targetUrl).hostname;
      if (isNixplayHost(hostname)) {
        cdnUrl = await resolveNixplay(targetUrl);
      }
    } catch {
      // keep original
    }

    let cdnHostname = "";
    try {
      cdnHostname = new URL(cdnUrl).hostname;
    } catch {}

    const isFlix2 = isFlix2Host(cdnHostname);

    const upstreamHeaders = {
      "User-Agent": UA,
      "Accept": "*/*",
      "Accept-Encoding": "identity",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    };

    if (isFlix2) {
      upstreamHeaders["Referer"] = FLIX2_REFERER;
      upstreamHeaders["Origin"]  = FLIX2_ORIGIN;
    }

    const clientRange = request.headers.get("Range");
    if (clientRange) {
      upstreamHeaders["Range"] = clientRange;
    } else {
      upstreamHeaders["Range"] = "bytes=0-";
    }

    const isHead = request.method === "HEAD";

    let upstream;
    try {
      upstream = await fetch(cdnUrl, {
        method: isHead ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (!upstream.ok && upstream.status !== 206) {
      return new Response(
        JSON.stringify({ error: `Upstream returned ${upstream.status}`, host: cdnHostname }),
        {
          status: upstream.status,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "no-store");

    const ct = upstream.headers.get("content-type");
    if (ct) responseHeaders.set("Content-Type", ct);
    else if (cdnUrl.includes(".mp4")) responseHeaders.set("Content-Type", "video/mp4");
    else if (cdnUrl.includes(".m3u8")) responseHeaders.set("Content-Type", "application/x-mpegurl");

    const cl = upstream.headers.get("content-length");
    if (cl) responseHeaders.set("Content-Length", cl);

    const cr = upstream.headers.get("content-range");
    if (cr) responseHeaders.set("Content-Range", cr);

    const lastMod = upstream.headers.get("last-modified");
    if (lastMod) responseHeaders.set("Last-Modified", lastMod);

    const etag = upstream.headers.get("etag");
    if (etag) responseHeaders.set("ETag", etag);

    const outStatus = clientRange ? upstream.status : 200;

    if (isHead) {
      return new Response(null, { status: outStatus, headers: responseHeaders });
    }

    return new Response(upstream.body, { status: outStatus, headers: responseHeaders });
  },
};
