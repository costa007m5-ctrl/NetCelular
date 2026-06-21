import { Router } from "express";
import { d1Query, d1Run, isD1Configured } from "../lib/d1.js";
import { logger } from "../lib/logger.js";

const router = Router();

interface Comment {
  id: string;
  tmdb_id: number;
  user_id: string;
  user_name: string;
  avatar_letter: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

// In-memory fallback when D1 is not configured
const memStore = new Map<number, Comment[]>();

function memGet(tmdbId: number): Comment[] {
  return (memStore.get(tmdbId) ?? []).slice().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function memAdd(c: Comment): void {
  const list = memStore.get(c.tmdb_id) ?? [];
  list.push(c);
  memStore.set(c.tmdb_id, list);
}

function memDelete(id: string, userId: string): boolean {
  for (const [tmdbId, list] of memStore.entries()) {
    const idx = list.findIndex((c) => c.id === id && c.user_id === userId);
    if (idx !== -1) {
      list.splice(idx, 1);
      memStore.set(tmdbId, list);
      return true;
    }
  }
  return false;
}

// ── Init D1 table (runs once at startup if D1 is configured) ──────────────────
async function ensureTable(): Promise<void> {
  if (!isD1Configured()) return;
  try {
    await d1Run(`
      CREATE TABLE IF NOT EXISTS shorts_comments (
        id TEXT PRIMARY KEY,
        tmdb_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        avatar_letter TEXT NOT NULL DEFAULT 'U',
        avatar_url TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await d1Run(`CREATE INDEX IF NOT EXISTS idx_shorts_comments_tmdb ON shorts_comments(tmdb_id)`);
    // Migration: add avatar_url column if it doesn't exist
    await d1Run(`ALTER TABLE shorts_comments ADD COLUMN IF NOT EXISTS avatar_url TEXT`).catch(() => {});
  } catch (e) {
    logger.warn({ err: e }, "shorts-comments: could not ensure D1 table");
  }
}

ensureTable().catch(() => {});

// ── GET /shorts/comments?tmdbId=X&limit=50 ────────────────────────────────────
router.get("/shorts/comments", async (req, res) => {
  const tmdbId = Number(req.query["tmdbId"]);
  if (!tmdbId || isNaN(tmdbId)) {
    res.status(400).json({ error: "tmdbId obrigatório" });
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 50));

  try {
    if (isD1Configured()) {
      const rows = await d1Query<Comment>(
        `SELECT id, tmdb_id, user_id, user_name, avatar_letter, avatar_url, content, created_at
         FROM shorts_comments
         WHERE tmdb_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [tmdbId, limit]
      );
      res.json({ ok: true, comments: rows });
    } else {
      res.json({ ok: true, comments: memGet(tmdbId).slice(0, limit) });
    }
  } catch (e: any) {
    logger.error({ err: e }, "shorts-comments GET error");
    res.status(500).json({ error: "Erro ao buscar comentários" });
  }
});

// ── POST /shorts/comments ─────────────────────────────────────────────────────
router.post("/shorts/comments", async (req, res) => {
  const { tmdbId, userId, userName, avatarLetter, avatarUrl, content } = req.body ?? {};

  if (!tmdbId || !userId || !content?.trim()) {
    res.status(400).json({ error: "tmdbId, userId e content são obrigatórios" });
    return;
  }
  if (content.trim().length > 500) {
    res.status(400).json({ error: "Comentário muito longo (max 500 caracteres)" });
    return;
  }

  const comment: Comment = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tmdb_id: Number(tmdbId),
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
        `INSERT INTO shorts_comments (id, tmdb_id, user_id, user_name, avatar_letter, avatar_url, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [comment.id, comment.tmdb_id, comment.user_id, comment.user_name, comment.avatar_letter, comment.avatar_url, comment.content, comment.created_at]
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

export default router;
