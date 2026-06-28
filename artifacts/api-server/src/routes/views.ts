import { Router } from "express";

const router = Router();

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_KEY =
  process.env["SUPABASE_SERVICE_KEY"] ??
  process.env["SUPABASE_ANON_KEY"] ??
  "";

const sbHeaders = () =>
  SUPABASE_KEY
    ? {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "return=minimal",
      }
    : null;

/**
 * POST /content/view
 * Record a content play event.
 * Body: { tmdbId: number, type: "movie"|"tv", title: string }
 * Optional header: x-supabase-token (Supabase JWT to associate with user)
 */
router.post("/content/view", async (req: any, res: any) => {
  try {
    const { tmdbId, type, title } = req.body ?? {};
    if (!type || !title) return res.status(400).json({ ok: false, error: "type and title required" });

    const contentType = type === "tv" ? "tv" : "movie";
    const numericId = Number(tmdbId ?? 0);
    const headers = sbHeaders();
    if (!headers) return res.json({ ok: true, stored: false });

    let userId: string | null = null;
    const supaToken = req.headers["x-supabase-token"];
    if (supaToken) {
      try {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${supaToken}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          userId = userData.id ?? null;
        }
      } catch {}
    }

    const payload: Record<string, any> = {
      tmdb_id: numericId,
      content_type: contentType,
      title: String(title).slice(0, 200),
    };
    if (userId) payload.user_id = userId;

    await fetch(`${SUPABASE_URL}/rest/v1/content_views`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });

    res.json({ ok: true, stored: true });
  } catch (e) {
    res.json({ ok: false, error: String(e) });
  }
});

/**
 * GET /content/top10?type=movie|tv&days=7
 * Returns top 10 most-watched content in the last N days based on real play events.
 * Falls back to empty list if table doesn't exist yet.
 */
router.get("/content/top10", async (req: any, res: any) => {
  try {
    const contentType = req.query.type === "tv" ? "tv" : "movie";
    const days = Math.min(30, Math.max(1, Number(req.query.days ?? 7)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const headers = sbHeaders();
    if (!headers) return res.json({ ok: true, items: [], days, type: contentType });

    const url =
      `${SUPABASE_URL}/rest/v1/content_views` +
      `?content_type=eq.${contentType}` +
      `&viewed_at=gte.${encodeURIComponent(since)}` +
      `&select=tmdb_id,title` +
      `&limit=2000`;

    const sbRes = await fetch(url, { headers });
    if (!sbRes.ok) return res.json({ ok: true, items: [], days, type: contentType });

    const rows: Array<{ tmdb_id: number; title: string }> = await sbRes.json();

    const counts = new Map<number, { title: string; viewCount: number }>();
    for (const row of rows) {
      const id = Number(row.tmdb_id ?? 0);
      if (id <= 0) continue;
      const entry = counts.get(id);
      if (entry) entry.viewCount++;
      else counts.set(id, { title: row.title ?? "", viewCount: 1 });
    }

    const top10 = [...counts.entries()]
      .map(([tmdbId, data]) => ({ tmdbId, title: data.title, viewCount: data.viewCount }))
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10);

    res.json({ ok: true, items: top10, days, type: contentType, total: rows.length });
  } catch (e) {
    res.json({ ok: true, items: [], error: String(e) });
  }
});

export default router;
