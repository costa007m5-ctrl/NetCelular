import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const TB_BASE = "https://www.terabox.com";
const TB_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Referer": "https://www.terabox.com/",
  "Origin": "https://www.terabox.com",
};

function mkSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// GET /api/terabox/list?surl=XXX&dir=/path
router.get("/list", async (req, res) => {
  const { surl, dir = "/" } = req.query as Record<string, string>;
  if (!surl) {
    res.status(400).json({ error: "surl is required" });
    return;
  }

  try {
    const url = new URL(`${TB_BASE}/share/list`);
    url.searchParams.set("app_id", "250528");
    url.searchParams.set("shorturl", surl);
    url.searchParams.set("dir", dir);
    url.searchParams.set("num", "200");
    url.searchParams.set("page", "1");
    url.searchParams.set("order", "name");
    url.searchParams.set("asc", "1");
    url.searchParams.set("web", "1");
    url.searchParams.set("channel", "dubox");
    url.searchParams.set("clienttype", "0");

    const tbRes = await fetch(url.toString(), {
      headers: TB_HEADERS,
      signal: mkSignal(15000),
    });

    if (!tbRes.ok) {
      logger.warn({ status: tbRes.status, surl }, "Terabox list non-OK");
      res.status(tbRes.status).json({ error: `Terabox returned ${tbRes.status}` });
      return;
    }

    const json = await tbRes.json() as any;
    res.json(json);
  } catch (err: any) {
    logger.error({ err, surl }, "Terabox list error");
    res.status(500).json({ error: err?.message ?? "fetch failed" });
  }
});

// GET /api/terabox/info?surl=XXX  — shorturl info (root listing)
router.get("/info", async (req, res) => {
  const { surl } = req.query as Record<string, string>;
  if (!surl) {
    res.status(400).json({ error: "surl is required" });
    return;
  }

  try {
    const url = new URL(`${TB_BASE}/api/shorturlinfo`);
    url.searchParams.set("app_id", "250528");
    url.searchParams.set("shorturl", surl);
    url.searchParams.set("root", "1");

    const tbRes = await fetch(url.toString(), {
      headers: TB_HEADERS,
      signal: mkSignal(15000),
    });

    if (!tbRes.ok) {
      res.status(tbRes.status).json({ error: `Terabox returned ${tbRes.status}` });
      return;
    }

    const json = await tbRes.json() as any;
    res.json(json);
  } catch (err: any) {
    logger.error({ err, surl }, "Terabox info error");
    res.status(500).json({ error: err?.message ?? "fetch failed" });
  }
});

// GET /api/terabox/proxy-page?url=https://www.terabox.com/wap/...
// Reverse-proxy the Terabox WAP page, stripping X-Frame-Options so it
// can be embedded in an <iframe> from our domain.
router.get("/proxy-page", async (req, res) => {
  const { url } = req.query as Record<string, string>;
  if (!url || !url.startsWith("https://www.terabox.com/")) {
    res.status(400).json({ error: "url must start with https://www.terabox.com/" });
    return;
  }

  try {
    const tbRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Referer": "https://www.terabox.com/",
      },
      signal: mkSignal(20000),
      redirect: "follow",
    });

    if (!tbRes.ok) {
      res.status(tbRes.status).send(`Terabox returned ${tbRes.status}`);
      return;
    }

    const html = await tbRes.text();

    // Rewrite all terabox.com absolute paths to go through our proxy
    // so CSS/JS assets load correctly inside the iframe.
    const rewritten = html
      .replace(/(href|src|action)="(\/[^"]+)"/g, `$1="https://www.terabox.com$2"`)
      .replace(/(href|src|action)='(\/[^']+)'/g, `$1='https://www.terabox.com$2'`);

    // Forward content-type but strip framing restrictions
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", "");
    res.send(rewritten);
  } catch (err: any) {
    logger.error({ err, url }, "Terabox proxy-page error");
    res.status(500).send(`proxy error: ${err?.message ?? "fetch failed"}`);
  }
});

const XAPIVERSE_KEY = "sk_6d7363a619840df0a07afe194613bf9a";

const TB_ALIASES = ["terabox.com","1024terabox.com","1024tera.com","teraboxapp.com","terasharelink.com","4funbox.com","momerybox.com","tibibox.com","terabox.app","gibibox.com","nephobox.com"];
function normalizeTbUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (TB_ALIASES.includes(host)) { u.hostname = "1024tera.com"; return u.toString(); }
  } catch {}
  return url;
}

// GET /api/terabox/resolve?url=https://1024terabox.com/s/XXX
router.get("/resolve", async (req, res) => {
  const { url } = req.query as Record<string, string>;
  if (!url) { res.status(400).json({ error: "url param required" }); return; }

  const normalized = normalizeTbUrl(url.trim());
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30_000);
    let r: Response;
    try {
      r = await fetch("https://xapiverse.com/api/terabox-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json", "xAPIverse-Key": XAPIVERSE_KEY },
        body: JSON.stringify({ url: normalized }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(tid); }

    const data = await r.json() as any;

    if (!r.ok || data.status !== "success") {
      res.status(502).json({ error: data.message ?? data.error ?? "xAPIverse error", raw: data });
      return;
    }

    const file = data.list?.[0];
    if (!file) { res.json({ ok: false, message: "Nenhum arquivo encontrado", raw: data }); return; }

    const streams: Record<string, string> = {};
    if (file.fast_stream_url && typeof file.fast_stream_url === "object") {
      Object.assign(streams, file.fast_stream_url);
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>TeraBox Resolve</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#f1f1f1;margin:0;padding:24px}
  h1{color:#e50914;margin-bottom:4px;font-size:1.3rem}
  .card{background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #333}
  .label{color:#888;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
  .val{word-break:break-all;font-size:.9rem;margin-bottom:12px}
  a{color:#e50914;text-decoration:none} a:hover{text-decoration:underline}
  .badge{display:inline-block;background:#e50914;color:#fff;border-radius:6px;padding:2px 8px;font-size:.75rem;margin-right:6px}
  .ok{color:#22c55e;font-weight:bold;font-size:1.1rem}
  video{width:100%;border-radius:8px;margin-top:8px;background:#000}
</style></head>
<body>
<h1>🎬 TeraBox Resolve</h1>
<p style="color:#888;font-size:.85rem;margin-top:0">Link: <code>${url}</code></p>

<div class="card">
  <div class="label">Arquivo</div>
  <div class="val" style="font-size:1.05rem;font-weight:600">${file.name}</div>
  <div class="val">
    <span class="badge">${file.quality ?? "?"}</span>
    <span class="badge">${file.size_formatted ?? ""}</span>
    <span class="badge">${file.duration ?? ""}</span>
  </div>
  <p class="ok">✅ Stream HLS disponível</p>
</div>

${Object.keys(streams).length > 0 ? `
<div class="card">
  <div class="label">Streams HLS (fast_stream_url)</div>
  ${Object.entries(streams).map(([q, u]) => `
    <div class="label" style="margin-top:12px">${q}</div>
    <div class="val"><a href="${u}" target="_blank">${(u as string).slice(0,80)}…</a></div>
    <video controls preload="none">
      <source src="${u}" type="application/x-mpegURL">
      <source src="${u}">
      Seu browser não suporta HLS inline. <a href="${u}">Abrir URL</a>
    </video>
  `).join("")}
</div>` : ""}

<div class="card">
  <div class="label">stream_url (direto)</div>
  <div class="val"><a href="${file.stream_url}" target="_blank">${(file.stream_url as string ?? "").slice(0,80)}…</a></div>
</div>

<div class="card">
  <div class="label">fast_dlink (download)</div>
  <div class="val"><a href="${file.fast_dlink}" target="_blank">${(file.fast_dlink as string ?? "").slice(0,80)}…</a></div>
</div>

<div class="card">
  <div class="label">JSON completo</div>
  <pre style="font-size:.75rem;overflow:auto;max-height:300px;color:#aaa">${JSON.stringify(data, null, 2)}</pre>
</div>
</body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "fetch error" });
  }
});

export default router;
