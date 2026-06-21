import { Router } from "express";
import { d1Query, d1Run, isD1Configured } from "../lib/d1.js";
import { logger } from "../lib/logger.js";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";

const router = Router();

interface Comment {
  id: string;
  post_id: string;
  tmdb_id: number;
  user_id: string;
  user_name: string;
  avatar_letter: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

// In-memory fallback when D1 is not configured — keyed by post_id (unique per feed slot)
const memStore = new Map<string, Comment[]>();

function memGet(postId: string): Comment[] {
  return (memStore.get(postId) ?? []).slice().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function memAdd(c: Comment): void {
  const list = memStore.get(c.post_id) ?? [];
  list.push(c);
  memStore.set(c.post_id, list);
}

function memDelete(id: string, userId: string): boolean {
  for (const [postId, list] of memStore.entries()) {
    const idx = list.findIndex((c) => c.id === id && c.user_id === userId);
    if (idx !== -1) {
      list.splice(idx, 1);
      memStore.set(postId, list);
      return true;
    }
  }
  return false;
}

// ── Init D1 table ──────────────────────────────────────────────────────────────
async function ensureTable(): Promise<void> {
  if (!isD1Configured()) return;
  try {
    await d1Run(`
      CREATE TABLE IF NOT EXISTS shorts_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        tmdb_id INTEGER NOT NULL DEFAULT 0,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        avatar_letter TEXT NOT NULL DEFAULT 'U',
        avatar_url TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await d1Run(`CREATE INDEX IF NOT EXISTS idx_sc_post ON shorts_comments(post_id)`);
    // Migrations for existing deployments
    await d1Run(`ALTER TABLE shorts_comments ADD COLUMN IF NOT EXISTS post_id TEXT NOT NULL DEFAULT ''`).catch(() => {});
    await d1Run(`ALTER TABLE shorts_comments ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "shorts-comments: could not ensure D1 table");
  }
}

ensureTable().catch(() => {});

// ── GET /shorts/comments?postId=movie-123-s0&limit=50 ─────────────────────────
router.get("/shorts/comments", async (req, res) => {
  const postId = String(req.query["postId"] ?? "").trim();
  if (!postId) {
    res.status(400).json({ error: "postId obrigatório" });
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 50));

  try {
    if (isD1Configured()) {
      const rows = await d1Query<Comment>(
        `SELECT id, post_id, tmdb_id, user_id, user_name, avatar_letter, avatar_url, content, created_at
         FROM shorts_comments
         WHERE post_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [postId, limit]
      );
      res.json({ ok: true, comments: rows });
    } else {
      res.json({ ok: true, comments: memGet(postId).slice(0, limit) });
    }
  } catch (e: any) {
    logger.error({ err: e }, "shorts-comments GET error");
    res.status(500).json({ error: "Erro ao buscar comentários" });
  }
});

// ── GET /shorts/comments/by-user/:userId ─────────────────────────────────────
router.get("/shorts/comments/by-user/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    res.status(400).json({ error: "userId obrigatório" });
    return;
  }
  const limit = Math.min(50, Math.max(1, Number(req.query["limit"]) || 20));
  try {
    let comments: Comment[] = [];
    let count = 0;
    if (isD1Configured()) {
      const rows = await d1Query<Comment>(
        `SELECT id, post_id, tmdb_id, user_id, user_name, avatar_letter, avatar_url, content, created_at
         FROM shorts_comments
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, limit]
      );
      comments = rows ?? [];
      const cnt = await d1Query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM shorts_comments WHERE user_id = ?`, [userId]
      );
      count = cnt?.[0]?.cnt ?? 0;
    } else {
      let all: Comment[] = [];
      for (const [, list] of (global as any).__memStore ?? []) {
        all = all.concat((list as Comment[]).filter((c: any) => c.user_id === userId));
      }
      count = all.length;
      comments = all.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    }
    res.json({ ok: true, count, comments });
  } catch (e: any) {
    logger.error({ err: e }, "shorts-comments by-user GET error");
    res.status(500).json({ error: "Erro ao buscar comentários do usuário" });
  }
});

// ── POST /shorts/comments ─────────────────────────────────────────────────────
router.post("/shorts/comments", async (req, res) => {
  const { postId, tmdbId, userId, userName, avatarLetter, avatarUrl, content } = req.body ?? {};

  if (!postId || !userId || !content?.trim()) {
    res.status(400).json({ error: "postId, userId e content são obrigatórios" });
    return;
  }
  if (content.trim().length > 500) {
    res.status(400).json({ error: "Comentário muito longo (max 500 caracteres)" });
    return;
  }

  const comment: Comment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    post_id: String(postId),
    tmdb_id: Number(tmdbId ?? 0),
    user_id: String(userId),
    user_name: String(userName ?? "Usuário").slice(0, 60),
    avatar_letter: String(avatarLetter ?? "U").slice(0, 1).toUpperCase(),
    avatar_url: typeof avatarUrl === "string" && avatarUrl.startsWith("http") ? avatarUrl : null,
    content: content.trim(),
    created_at: new Date().toISOString(),
  };

  try {
    if (isD1Configured()) {
      await d1Run(
        `INSERT INTO shorts_comments (id, post_id, tmdb_id, user_id, user_name, avatar_letter, avatar_url, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [comment.id, comment.post_id, comment.tmdb_id, comment.user_id, comment.user_name, comment.avatar_letter, comment.avatar_url, comment.content, comment.created_at]
      );
    } else {
      memAdd(comment);
    }
    res.json({ ok: true, comment });
  } catch (e: any) {
    logger.error({ err: e }, "shorts-comments POST error");
    res.status(500).json({ error: "Erro ao salvar comentário" });
  }
});

// ── DELETE /shorts/comments/:id ───────────────────────────────────────────────
router.delete("/shorts/comments/:id", async (req, res) => {
  const { id } = req.params;
  const userId = String(req.query["userId"] ?? "");

  if (!id || !userId) {
    res.status(400).json({ error: "id e userId são obrigatórios" });
    return;
  }

  try {
    if (isD1Configured()) {
      const result = await d1Run(
        `DELETE FROM shorts_comments WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
      if (result.changes === 0) {
        res.status(404).json({ error: "Comentário não encontrado" });
        return;
      }
    } else {
      if (!memDelete(id, userId)) {
        res.status(404).json({ error: "Comentário não encontrado" });
        return;
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    logger.error({ err: e }, "shorts-comments DELETE error");
    res.status(500).json({ error: "Erro ao remover comentário" });
  }
});

// ── TMDB genre id → Portuguese name ──────────────────────────────────────────
const GENRE_PT: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 53: "Suspense",
  10752: "Guerra", 37: "Western",
};

// ── GET /shorts/user-profile/:userId ─────────────────────────────────────────
router.get("/shorts/user-profile/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    res.status(400).json({ error: "userId obrigatório" });
    return;
  }

  const sbHeaders = SUPABASE_KEY
    ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    : null;

  try {
    // ── 1. User row ────────────────────────────────────────────────────────
    let userRow: { name?: string; avatar_letter?: string; avatar_url?: string | null; created_at?: string } | null = null;
    if (sbHeaders) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=name,avatar_letter,avatar_url,created_at&limit=1`,
        { headers: sbHeaders }
      );
      if (r.ok) { const rows = await r.json() as typeof userRow[]; userRow = rows?.[0] ?? null; }
    }

    // ── 2. Comment count ───────────────────────────────────────────────────
    let commentCount = 0;
    if (isD1Configured()) {
      const rows = await d1Query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM shorts_comments WHERE user_id = ?`, [userId]
      );
      commentCount = rows?.[0]?.cnt ?? 0;
    } else {
      let cnt = 0;
      for (const [, list] of (global as any).__memStore ?? []) {
        cnt += (list as Comment[]).filter((c: any) => c.user_id === userId).length;
      }
      commentCount = cnt;
    }

    // ── 3. Watch progress (top 6 by updated_at) ───────────────────────────
    type WatchRow = { tmdb_id: number; type: string; title: string; poster_path: string; progress: number };
    let topWatched: WatchRow[] = [];
    let watchedCount = 0;
    if (sbHeaders) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/watch_progress?user_id=eq.${encodeURIComponent(userId)}&select=tmdb_id,type,title,poster_path,progress&order=updated_at.desc&limit=20`,
        { headers: sbHeaders }
      );
      if (r.ok) {
        const rows = (await r.json()) as WatchRow[];
        watchedCount = rows.length;
        topWatched = rows.slice(0, 6);
      }
    }
    const totalHours = Math.round((watchedCount * 92) / 60);

    // ── 4. AI profile (top genre) ──────────────────────────────────────────
    let topGenre: string | null = null;
    if (sbHeaders) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_ai_profile?user_id=eq.${encodeURIComponent(userId)}&select=top_genres&limit=1`,
        { headers: sbHeaders }
      );
      if (r.ok) {
        const rows = (await r.json()) as Array<{ top_genres?: number[] }>;
        const g = rows?.[0]?.top_genres?.[0];
        if (g) topGenre = GENRE_PT[g] ?? null;
      }
    }

    // ── 5. Watchlist count ─────────────────────────────────────────────────
    let watchlistCount = 0;
    if (sbHeaders) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/watchlist?user_id=eq.${encodeURIComponent(userId)}&select=tmdb_id&limit=1000`,
        { headers: sbHeaders }
      );
      if (r.ok) { const rows = (await r.json()) as any[]; watchlistCount = rows.length; }
    }

    // ── 6. Visibility preferences ──────────────────────────────────────────
    const defaultVisibility = { showEstatisticas: true, showMaisAssistidos: true, showMinhaLista: true, showConquistas: true };
    let visibility = defaultVisibility;
    if (sbHeaders) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_settings?user_id=eq.${encodeURIComponent(userId)}&select=profile_visibility&limit=1`,
        { headers: sbHeaders }
      );
      if (r.ok) {
        const rows = (await r.json()) as Array<{ profile_visibility?: string | null }>;
        const raw = rows?.[0]?.profile_visibility;
        if (raw) { try { visibility = { ...defaultVisibility, ...JSON.parse(raw) }; } catch {} }
      }
    }

    res.json({
      ok: true,
      profile: {
        name: userRow?.name ?? null,
        avatar_letter: userRow?.avatar_letter ?? null,
        avatar_url: userRow?.avatar_url ?? null,
        member_since: userRow?.created_at ?? null,
        comment_count: commentCount,
        watched_count: watchedCount,
        total_hours: totalHours,
        watchlist_count: watchlistCount,
        top_genre: topGenre,
        top_watched: topWatched,
        visibility,
      },
    });
  } catch (e: any) {
    logger.error({ err: e }, "shorts user-profile GET error");
    res.status(500).json({ error: "Erro ao buscar perfil" });
  }
});

export default router;
