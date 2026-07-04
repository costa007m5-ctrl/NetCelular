import { Router, type IRouter } from "express";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT EDITS — admin-only poster/banner/info overrides applied to ANY card
// (Flix2, R2, or TMDB-native items), keyed by the mobile app's item id.
// Persisted to data/content-edits.json
// ─────────────────────────────────────────────────────────────────────────────

interface ContentEdit {
  key: string;
  tmdbId?: number;
  tmdbType?: "movie" | "tv";
  title?: string;
  posterPath?: string;
  backdropPath?: string;
  overview?: string;
  year?: number;
  rating?: number;
  updatedAt: number;
}

const EDITS_FILE = path.join(process.cwd(), "data", "content-edits.json");
const CONTENT_EDITS = new Map<string, ContentEdit>();

(function loadEdits() {
  try {
    if (existsSync(EDITS_FILE)) {
      const arr: ContentEdit[] = JSON.parse(readFileSync(EDITS_FILE, "utf-8"));
      for (const e of arr) CONTENT_EDITS.set(String(e.key), e);
      console.log(`[content-edits] loaded ${CONTENT_EDITS.size} edits`);
    }
  } catch {}
})();

function saveEdits() {
  try {
    mkdirSync(path.dirname(EDITS_FILE), { recursive: true });
    writeFileSync(EDITS_FILE, JSON.stringify([...CONTENT_EDITS.values()], null, 2));
  } catch (e) {
    console.error("[content-edits] save error", e);
  }
}

// GET /content-edits — bulk fetch for the mobile app to merge into any rendered card
router.get("/content-edits", (_req, res) => {
  const edits: Record<string, ContentEdit> = {};
  for (const [k, v] of CONTENT_EDITS) edits[k] = v;
  res.json({ ok: true, count: CONTENT_EDITS.size, edits });
});

// GET /content-edits/:key — single lookup
router.get("/content-edits/:key", (req, res) => {
  const edit = CONTENT_EDITS.get(String(req.params.key));
  if (!edit) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }
  res.json({ ok: true, edit });
});

// POST /content-edits — upsert an override for a given item key
router.post("/content-edits", (req, res) => {
  const { key, tmdbId, tmdbType, title, posterPath, backdropPath, overview, year, rating } =
    req.body ?? {};
  if (!key) {
    res.status(400).json({ ok: false, error: "key required" });
    return;
  }
  const existing = CONTENT_EDITS.get(String(key)) ?? ({} as ContentEdit);
  const edit: ContentEdit = {
    ...existing,
    key: String(key),
    ...(tmdbId != null ? { tmdbId: Number(tmdbId) } : {}),
    ...(tmdbType ? { tmdbType: tmdbType as "movie" | "tv" } : {}),
    ...(title !== undefined ? { title: title || undefined } : {}),
    ...(posterPath !== undefined ? { posterPath: posterPath || undefined } : {}),
    ...(backdropPath !== undefined ? { backdropPath: backdropPath || undefined } : {}),
    ...(overview !== undefined ? { overview: overview || undefined } : {}),
    ...(year != null ? { year: Number(year) } : {}),
    ...(rating != null ? { rating: Number(rating) } : {}),
    updatedAt: Date.now(),
  };
  CONTENT_EDITS.set(String(key), edit);
  saveEdits();
  res.json({ ok: true, edit });
});

// DELETE /content-edits/:key — remove an override
router.delete("/content-edits/:key", (req, res) => {
  const key = String(req.params.key ?? "");
  if (!key) {
    res.status(400).json({ ok: false, error: "key required" });
    return;
  }
  const existed = CONTENT_EDITS.delete(key);
  if (existed) saveEdits();
  res.json({ ok: true, removed: existed });
});

export default router;
