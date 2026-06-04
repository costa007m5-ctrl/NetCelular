import { Router } from "express";

const router = Router();
const EMBED_BASE = "https://embed.embedplayer.site";
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36";

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
        "User-Agent": UA,
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
      headers: { "User-Agent": UA },
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
        "User-Agent": UA,
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
      headers: { "User-Agent": UA, "Referer": `${EMBED_BASE}/` },
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

// ── Resolve stream: extract m3u8 server-side ────────────────────────────────
// Fetches the embed page, extracts idS, POSTs to /stream, returns m3u8 URL.
router.get("/resolve-stream", async (req, res) => {
  const type = (req.query["type"] as string) || "tv";
  const id = (req.query["id"] as string || "").trim();
  const season = (req.query["season"] as string || "1").trim();
  const episode = (req.query["episode"] as string || "1").trim();
  const lang = (req.query["lang"] as string || "dub").trim();

  if (!id) return res.json({ m3u8: null, error: "No ID provided" });

  const embedUrl = type === "tv"
    ? `${EMBED_BASE}/tv/${id}/${season}/${episode}/${lang}`
    : `${EMBED_BASE}/${id}`;

  const baseHeaders = {
    "User-Agent": UA,
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Referer": `${EMBED_BASE}/`,
  };

  try {
    // Step 1: Fetch embed page HTML
    const pageResp = await fetch(embedUrl, {
      headers: { ...baseHeaders, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8" },
      signal: AbortSignal.timeout(12000),
    });
    const html = await pageResp.text();

    // Step 2: Extract idS — it's an HTML attribute on .player_select_item div
    // Format: <div class="player_select_item" idS="HEXHASH">
    const idSPatterns = [
      /\bidS="([a-fA-F0-9]{8,})"/,                    // HTML attribute hex (primary)
      /\bidS='([a-fA-F0-9]{8,})'/,
      /\bidS="([a-zA-Z0-9_\-]{8,})"/,                 // HTML attribute alphanumeric
      /\bidS='([a-zA-Z0-9_\-]{8,})'/,
      /idS\s*=\s*["']([a-zA-Z0-9_\-]{8,})["']/i,
      /var\s+idS\s*=\s*["']([a-zA-Z0-9_\-]{8,})["']/,
      /"idS"\s*:\s*"([a-zA-Z0-9_\-]{8,})"/,           // JSON property
      /['"]([\w]{32,})['"]/,                           // long hash fallback
    ];

    let idS: string | null = null;
    for (const p of idSPatterns) {
      const m = html.match(p);
      if (m?.[1] && m[1].length >= 8) { idS = m[1]; break; }
    }

    if (!idS) {
      // Return embedUrl so client can load the page directly in WebView as fallback
      return res.json({ m3u8: null, iframeUrl: null, embedUrl, error: "idS not found in embed page" });
    }

    // Step 3: POST to /stream
    // GStream.run() sends: { idS: idS, ref: document.referrer }
    const streamResp = await fetch(`${EMBED_BASE}/stream`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": EMBED_BASE,
        "Referer": embedUrl,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      body: `idS=${encodeURIComponent(idS)}&ref=`,
      signal: AbortSignal.timeout(12000),
    });

    const streamText = await streamResp.text();
    let streamData: any = null;
    try { streamData = JSON.parse(streamText); } catch { /* not JSON */ }

    // Step 4: Parse GStream response structure:
    // { resources: { iframe: bool, sources: [{file, label, type}] }, details: { uniqid } }
    let m3u8: string | null = null;
    let iframeUrl: string | null = null;

    if (streamData?.resources) {
      const sources: any[] = streamData.resources.sources || [];
      if (!streamData.resources.iframe) {
        // Direct JWPlayer sources — look for m3u8
        for (const s of sources) {
          if (s?.file && s.file.includes(".m3u8")) { m3u8 = s.file; break; }
          if (s?.file && !m3u8) m3u8 = s.file; // grab any file as fallback
        }
      } else {
        // Iframe source — return the iframe URL
        iframeUrl = sources[0]?.file || null;
      }
    } else {
      // Fallback: scan raw response for any m3u8 URL
      const matches = streamText.match(/https?:[^"' \n]+\.m3u8[^"' \n]*/g);
      if (matches?.[0]) m3u8 = matches[0];
    }

    res.json({
      m3u8,
      idS,
      embedUrl,
      iframeUrl,
    });
  } catch (err: any) {
    res.status(500).json({ m3u8: null, error: err.message ?? String(err) });
  }
});

export default router;
