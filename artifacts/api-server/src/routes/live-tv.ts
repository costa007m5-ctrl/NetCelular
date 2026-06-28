import { Router } from "express";

const router = Router();
const EMBEDTV_BASE = "https://embedtv.lat/api";

interface CacheEntry { data: any; ts: number }

let channelsCache: CacheEntry | null = null;
let epgsCache:    CacheEntry | null = null;
let jogosCache:   CacheEntry | null = null;
const CACHE_TTL  = 3 * 60 * 1000;   // 3 min — fresh window
const STALE_TTL  = 30 * 60 * 1000;  // 30 min — serve stale instead of 502

async function fetchWithStale<T>(
  url: string,
  cache: CacheEntry | null,
  setCache: (c: CacheEntry) => void,
  logTag: string,
  req: any,
  res: any
): Promise<void> {
  const now = Date.now();

  // Return fresh cache immediately
  if (cache && now - cache.ts < CACHE_TTL) {
    res.json(cache.data);
    return;
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error(`Upstream error ${resp.status}`);
    const data = await resp.json();
    setCache({ data, ts: now });
    res.json(data);
  } catch (err: any) {
    req.log?.error({ err }, `live-tv ${logTag} error`);

    // Serve stale data if available and not too old
    if (cache && now - cache.ts < STALE_TTL) {
      res.set("X-Cache", "STALE").json(cache.data);
      return;
    }

    res.status(502).json({ error: err?.message ?? `Failed to fetch ${logTag}` });
  }
}

router.get("/channels", async (req, res) => {
  await fetchWithStale(
    `${EMBEDTV_BASE}/channels`,
    channelsCache,
    (c) => { channelsCache = c; },
    "channels",
    req, res
  );
});

router.get("/epgs", async (req, res) => {
  await fetchWithStale(
    `${EMBEDTV_BASE}/epgs_full`,
    epgsCache,
    (c) => { epgsCache = c; },
    "epgs",
    req, res
  );
});

router.get("/jogos", async (req, res) => {
  await fetchWithStale(
    `${EMBEDTV_BASE}/jogos`,
    jogosCache,
    (c) => { jogosCache = c; },
    "jogos",
    req, res
  );
});

export default router;
