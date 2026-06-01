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

export default router;
