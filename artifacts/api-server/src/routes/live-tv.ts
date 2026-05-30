import { Router } from "express";

const router = Router();
const EMBEDTV_BASE = "http://embedtv.lat/api";

let channelsCache: { data: any; ts: number } | null = null;
let epgsCache: { data: any; ts: number } | null = null;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

router.get("/channels", async (req, res) => {
  try {
    const now = Date.now();
    if (channelsCache && now - channelsCache.ts < CACHE_TTL) {
      res.json(channelsCache.data);
      return;
    }
    const resp = await fetch(`${EMBEDTV_BASE}/channels`);
    if (!resp.ok) throw new Error(`Upstream error ${resp.status}`);
    const data = await resp.json();
    channelsCache = { data, ts: now };
    res.json(data);
  } catch (err: any) {
    (req as any).log?.error({ err }, "live-tv channels error");
    res.status(502).json({ error: err?.message ?? "Failed to fetch channels" });
  }
});

router.get("/epgs", async (req, res) => {
  try {
    const now = Date.now();
    if (epgsCache && now - epgsCache.ts < CACHE_TTL) {
      res.json(epgsCache.data);
      return;
    }
    const resp = await fetch(`${EMBEDTV_BASE}/epgs_full`);
    if (!resp.ok) throw new Error(`Upstream error ${resp.status}`);
    const data = await resp.json();
    epgsCache = { data, ts: now };
    res.json(data);
  } catch (err: any) {
    (req as any).log?.error({ err }, "live-tv epgs error");
    res.status(502).json({ error: err?.message ?? "Failed to fetch EPGs" });
  }
});

export default router;
