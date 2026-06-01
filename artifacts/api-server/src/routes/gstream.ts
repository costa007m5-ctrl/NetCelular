import { Router } from "express";

const router = Router();
const EMBED_BASE = "https://embed.embedplayer.site";

router.get("/catalog", async (req, res) => {
  const type = (req.query["type"] as string) || "filmes";
  try {
    let body: string;
    if (type === "filmes") {
      body = "list=filmes&public=true";
    } else if (type === "animes") {
      body = "list=series&type=anime&public=true";
    } else {
      body = "list=series&type=serie&public=true";
    }
    const response = await fetch(`${EMBED_BASE}/getData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": `${EMBED_BASE}/public/series`,
        "User-Agent": "Mozilla/5.0",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    const start = text.indexOf("[");
    if (start < 0) return res.json([]);
    const arr = JSON.parse(text.slice(start, text.lastIndexOf("]") + 1));
    res.json(arr);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch catalog" });
  }
});

router.get("/check-movie", async (req, res) => {
  const id = (req.query["id"] as string || "").trim();
  if (!id) return res.json({ movie: false, error: "No ID provided" });
  try {
    const response = await fetch(`${EMBED_BASE}/dooplay?movie=${id}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(7000),
    });
    const json = await response.json();
    res.json({ movie: !!json?.movie, id, url: json?.movie ? `${EMBED_BASE}/${id}` : null });
  } catch {
    res.status(500).json({ movie: false, error: "Request failed" });
  }
});

router.get("/check-tv", async (req, res) => {
  const id = (req.query["id"] as string || "").trim();
  const season = (req.query["season"] as string || "1").trim();
  const episode = (req.query["episode"] as string || "1").trim();
  if (!id) return res.json({ dub: false, leg: false, error: "No ID provided" });
  try {
    const response = await fetch(`${EMBED_BASE}/tv/${id}/${season}/${episode}/lang`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": `${EMBED_BASE}/`,
      },
      signal: AbortSignal.timeout(8000),
    });
    const json = await response.json().catch(() => null);
    if (!json || (json.dub === undefined && json.leg === undefined)) {
      return res.json({ dub: false, leg: false, available: false });
    }
    res.json({
      dub: !!json.dub,
      leg: !!json.leg,
      available: !!(json.dub || json.leg),
      dubUrl: `${EMBED_BASE}/tv/${id}/${season}/${episode}/dub`,
      legUrl: `${EMBED_BASE}/tv/${id}/${season}/${episode}/leg`,
    });
  } catch {
    res.status(500).json({ dub: false, leg: false, available: false, error: "Request failed" });
  }
});

router.get("/status", async (req, res) => {
  const t = Date.now();
  try {
    const response = await fetch(`${EMBED_BASE}/tv/1396/1/1/lang`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": `${EMBED_BASE}/`,
      },
      signal: AbortSignal.timeout(7000),
    });
    const json = await response.json().catch(() => null);
    const latency = Date.now() - t;
    const online = !!(json?.dub !== undefined || json?.leg !== undefined);
    res.json({ online, latency });
  } catch {
    res.json({ online: false, latency: null });
  }
});

export default router;
