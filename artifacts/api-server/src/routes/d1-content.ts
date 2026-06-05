import { Router } from "express";
import { d1Query, d1Run, isD1Configured } from "../lib/d1";
import { requireAdminKey } from "../middleware/auth.js";

const router = Router();

// ── Guard: retorna 503 se D1 não estiver configurado ──────────────────────────
router.use((_req, res, next) => {
  if (!isD1Configured()) {
    res.status(503).json({ error: "D1 não configurado. Defina CF_ACCOUNT_ID, CF_D1_DATABASE_ID e CF_API_TOKEN." });
    return;
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/content — lista catálogo com filtros
// Query params: type, featured, top10, search, limit, offset
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { type, featured, top10, search, limit = "20", offset = "0" } = req.query as Record<string, string>;
    const conditions: string[] = ["status = 'active'"];
    const params: (string | number | null)[] = [];

    if (type === "movie" || type === "tv") {
      conditions.push("type = ?");
      params.push(type);
    }
    if (featured === "1" || featured === "true") {
      conditions.push("is_featured = 1");
    }
    if (top10 === "1" || top10 === "true") {
      conditions.push("is_top10 = 1");
    }
    if (search && search.trim()) {
      conditions.push("(title LIKE ? OR original_title LIKE ?)");
      const q = `%${search.trim()}%`;
      params.push(q, q);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = top10 === "1" || top10 === "true"
      ? "ORDER BY top10_rank ASC, rating DESC"
      : "ORDER BY created_at DESC, rating DESC";

    const lim = Math.min(Math.max(1, Number(limit) || 20), 100);
    const off = Math.max(0, Number(offset) || 0);
    params.push(lim, off);

    const rows = await d1Query(
      `SELECT id, tmdb_id, type, title, original_title, poster_path, backdrop_path,
              release_year, rating, genres, runtime, total_seasons,
              is_featured, is_top10, top10_rank, status
       FROM content ${where} ${orderBy} LIMIT ? OFFSET ?`,
      params
    );

    const parsed = rows.map((r: any) => ({
      ...r,
      genres: safeParseJson(r.genres, []),
    }));

    res.json({ results: parsed, count: parsed.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/content/:id — detalhe de um conteúdo
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const byTmdb = req.query.by === "tmdb";

    const rows = await d1Query(
      `SELECT * FROM content WHERE ${byTmdb ? "tmdb_id" : "id"} = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }

    const content: any = rows[0];
    content.genres = safeParseJson(content.genres, []);
    res.json(content);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/content/:id/sources — fontes de vídeo
// Query params: season, episode
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/sources", async (req, res) => {
  try {
    const contentId = Number(req.params.id);
    const { season, episode, by } = req.query as Record<string, string>;
    const byTmdb = by === "tmdb";

    let resolvedId = contentId;
    if (byTmdb) {
      const rows = await d1Query<{ id: number }>("SELECT id FROM content WHERE tmdb_id = ? LIMIT 1", [contentId]);
      if (!rows.length) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
      resolvedId = rows[0].id;
    }

    const conditions = ["content_id = ?", "is_active = 1"];
    const params: (string | number | null)[] = [resolvedId];

    if (season !== undefined && season !== "") {
      conditions.push("(season_number = ? OR season_number IS NULL)");
      params.push(Number(season));
    }
    if (episode !== undefined && episode !== "") {
      conditions.push("(episode_number = ? OR episode_number IS NULL)");
      params.push(Number(episode));
    }

    const rows = await d1Query(
      `SELECT id, source_type, source_url, quality, language, label, priority,
              season_number, episode_number
       FROM content_sources
       WHERE ${conditions.join(" AND ")}
       ORDER BY priority DESC, id ASC`,
      params
    );

    res.json({ results: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/content/:id/seasons — temporadas de uma série
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/seasons", async (req, res) => {
  try {
    const contentId = Number(req.params.id);
    const rows = await d1Query(
      `SELECT id, season_number, name, poster_path, episode_count, air_date
       FROM seasons WHERE content_id = ? ORDER BY season_number ASC`,
      [contentId]
    );
    res.json({ results: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/content/:id/seasons/:season/episodes — episódios de uma temporada
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id/seasons/:season/episodes", async (req, res) => {
  try {
    const contentId = Number(req.params.id);
    const seasonNum = Number(req.params.season);
    const rows = await d1Query(
      `SELECT id, episode_number, name, overview, still_path, runtime, air_date
       FROM episodes
       WHERE content_id = ? AND season_number = ?
       ORDER BY episode_number ASC`,
      [contentId, seasonNum]
    );
    res.json({ results: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// WRITE ENDPOINTS (admin)
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /api/content — adicionar conteúdo ────────────────────────────────
router.post("/", requireAdminKey, async (req, res) => {
  try {
    const {
      tmdb_id, type, title, original_title, overview,
      poster_path, backdrop_path, release_year,
      rating = 0, vote_count = 0, genres = [],
      runtime, total_seasons,
      is_featured = 0, is_top10 = 0, top10_rank,
    } = req.body;

    if (!type || !title) {
      res.status(400).json({ error: "type e title são obrigatórios" });
      return;
    }

    const { last_row_id } = await d1Run(
      `INSERT INTO content
         (tmdb_id, type, title, original_title, overview, poster_path, backdrop_path,
          release_year, rating, vote_count, genres, runtime, total_seasons,
          is_featured, is_top10, top10_rank)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tmdb_id) DO UPDATE SET
         title = excluded.title,
         overview = excluded.overview,
         poster_path = excluded.poster_path,
         backdrop_path = excluded.backdrop_path,
         rating = excluded.rating,
         genres = excluded.genres,
         is_featured = excluded.is_featured,
         is_top10 = excluded.is_top10,
         top10_rank = excluded.top10_rank,
         updated_at = datetime('now')`,
      [
        tmdb_id ?? null, type, title, original_title ?? null, overview ?? null,
        poster_path ?? null, backdrop_path ?? null,
        release_year ?? null, Number(rating), Number(vote_count),
        JSON.stringify(Array.isArray(genres) ? genres : []),
        runtime ?? null, total_seasons ?? null,
        is_featured ? 1 : 0, is_top10 ? 1 : 0, top10_rank ?? null,
      ]
    );

    res.status(201).json({ id: last_row_id, ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/content/batch — importar vários conteúdos de uma vez ─────────
router.post("/batch", requireAdminKey, async (req, res) => {
  try {
    const { items } = req.body as { items: any[] };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items[] obrigatório" });
      return;
    }
    let inserted = 0;
    for (const item of items) {
      const {
        tmdb_id, type, title, original_title, overview,
        poster_path, backdrop_path, release_year,
        rating = 0, vote_count = 0, genres = [],
        runtime, total_seasons, is_featured = 0, is_top10 = 0, top10_rank,
      } = item;
      if (!type || !title) continue;
      await d1Run(
        `INSERT INTO content
           (tmdb_id, type, title, original_title, overview, poster_path, backdrop_path,
            release_year, rating, vote_count, genres, runtime, total_seasons,
            is_featured, is_top10, top10_rank)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tmdb_id) DO UPDATE SET
           title = excluded.title, overview = excluded.overview,
           poster_path = excluded.poster_path, backdrop_path = excluded.backdrop_path,
           rating = excluded.rating, genres = excluded.genres,
           updated_at = datetime('now')`,
        [
          tmdb_id ?? null, type, title, original_title ?? null, overview ?? null,
          poster_path ?? null, backdrop_path ?? null, release_year ?? null,
          Number(rating), Number(vote_count),
          JSON.stringify(Array.isArray(genres) ? genres : []),
          runtime ?? null, total_seasons ?? null,
          is_featured ? 1 : 0, is_top10 ? 1 : 0, top10_rank ?? null,
        ]
      );
      inserted++;
    }
    res.json({ ok: true, inserted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/content/:id/sources — adicionar fonte de vídeo ──────────────
router.post("/:id/sources", requireAdminKey, async (req, res) => {
  try {
    const contentId = Number(req.params.id);
    const {
      season_number, episode_number,
      source_type, source_url,
      quality = "HD", language = "pt-BR",
      label, priority = 0,
    } = req.body;

    if (!source_type || !source_url) {
      res.status(400).json({ error: "source_type e source_url são obrigatórios" });
      return;
    }

    const { last_row_id } = await d1Run(
      `INSERT INTO content_sources
         (content_id, season_number, episode_number, source_type, source_url,
          quality, language, label, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contentId,
        season_number ?? null, episode_number ?? null,
        source_type, source_url,
        quality, language,
        label ?? null, Number(priority),
      ]
    );

    res.status(201).json({ id: last_row_id, ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/content/:id/sources/:sourceId — remover fonte ────────────
router.delete("/:id/sources/:sourceId", requireAdminKey, async (req, res) => {
  try {
    const contentId = Number(req.params.id);
    const sourceId = Number(req.params.sourceId);
    const { changes } = await d1Run(
      "DELETE FROM content_sources WHERE id = ? AND content_id = ?",
      [sourceId, contentId]
    );
    if (!changes) { res.status(404).json({ error: "Fonte não encontrada" }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/content/:id — remover conteúdo ────────────────────────────
router.delete("/:id", requireAdminKey, async (req, res) => {
  try {
    const { changes } = await d1Run("DELETE FROM content WHERE id = ?", [Number(req.params.id)]);
    if (!changes) { res.status(404).json({ error: "Conteúdo não encontrado" }); return; }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/content/:id/seasons/:season/episodes — adicionar episódios ──
router.post("/:id/seasons/:season/episodes", requireAdminKey, async (req, res) => {
  try {
    const contentId = Number(req.params.id);
    const seasonNum = Number(req.params.season);
    const { episodes } = req.body as { episodes: any[] };

    if (!Array.isArray(episodes) || episodes.length === 0) {
      res.status(400).json({ error: "episodes[] obrigatório" });
      return;
    }

    // Garante que a temporada existe
    await d1Run(
      `INSERT OR IGNORE INTO seasons (content_id, season_number, episode_count)
       VALUES (?, ?, ?)`,
      [contentId, seasonNum, episodes.length]
    );

    let inserted = 0;
    for (const ep of episodes) {
      const { episode_number, name, overview, still_path, runtime, air_date, tmdb_id } = ep;
      if (!episode_number) continue;
      await d1Run(
        `INSERT INTO episodes
           (content_id, season_number, episode_number, name, overview, still_path, runtime, air_date, tmdb_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(content_id, season_number, episode_number) DO UPDATE SET
           name = excluded.name, overview = excluded.overview,
           still_path = excluded.still_path, runtime = excluded.runtime`,
        [
          contentId, seasonNum, Number(episode_number),
          name ?? null, overview ?? null, still_path ?? null,
          runtime ?? null, air_date ?? null, tmdb_id ?? null,
        ]
      );
      inserted++;
    }

    res.status(201).json({ ok: true, inserted });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
function safeParseJson(val: any, fallback: any) {
  try { return typeof val === "string" ? JSON.parse(val) : (val ?? fallback); } catch { return fallback; }
}

export default router;
