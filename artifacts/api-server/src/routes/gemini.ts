import { Router } from "express";
import { smartSearch, personalizeContent, generateSearchSuggestions, isGeminiAvailable } from "../lib/gemini";
import { rateLimitByIp } from "../middleware/auth";

const router = Router();

const geminiLimit = rateLimitByIp(30, 60_000);

router.get("/gemini/status", (_req, res) => {
  res.json({ available: isGeminiAvailable() });
});

router.post("/gemini/search", geminiLimit, async (req, res) => {
  const { query } = req.body as { query?: string };

  if (!query || typeof query !== "string" || query.trim().length < 2) {
    res.status(400).json({ error: "query is required (min 2 chars)" });
    return;
  }

  if (!isGeminiAvailable()) {
    res.status(503).json({ error: "Gemini not configured", expandedQuery: query, englishQuery: query, intent: "any", suggestions: [], corrected: false });
    return;
  }

  try {
    const result = await smartSearch(query.trim().slice(0, 200));
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message, expandedQuery: query, englishQuery: query, intent: "any", suggestions: [], corrected: false });
  }
});

router.post("/gemini/personalize", geminiLimit, async (req, res) => {
  const body = req.body as {
    likedTitles?: string[];
    dislikedTitles?: string[];
    watchedTitles?: string[];
    favoriteGenres?: string[];
    prefersMovies?: boolean;
    prefersSeries?: boolean;
    candidates?: Array<{ id: string; title: string; genres: string[]; type: string; year: number; rating: number }>;
  };

  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    res.status(400).json({ error: "candidates array is required" });
    return;
  }

  if (!isGeminiAvailable()) {
    res.json({ rankedIds: body.candidates.map(c => c.id), reasoning: "IA não configurada" });
    return;
  }

  try {
    const result = await personalizeContent({
      likedTitles: body.likedTitles ?? [],
      dislikedTitles: body.dislikedTitles ?? [],
      watchedTitles: body.watchedTitles ?? [],
      favoriteGenres: body.favoriteGenres ?? [],
      prefersMovies: body.prefersMovies ?? true,
      prefersSeries: body.prefersSeries ?? false,
      candidates: body.candidates.slice(0, 40),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message, rankedIds: body.candidates.map(c => c.id), reasoning: "Erro ao personalizar" });
  }
});

router.post("/gemini/suggestions", geminiLimit, async (req, res) => {
  const { userHistory, favoriteGenres } = req.body as { userHistory?: string[]; favoriteGenres?: string[] };

  if (!isGeminiAvailable()) {
    res.json({ suggestions: [] });
    return;
  }

  try {
    const suggestions = await generateSearchSuggestions(userHistory ?? [], favoriteGenres ?? []);
    res.json({ suggestions });
  } catch {
    res.json({ suggestions: [] });
  }
});

export default router;
