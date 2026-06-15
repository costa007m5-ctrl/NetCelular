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

export default router;
