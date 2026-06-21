const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

function getKey(): string | null {
  return process.env["GEMINI_API_KEY"] ?? null;
}

export function isGeminiAvailable(): boolean {
  return !!getKey();
}

async function callGemini(prompt: string): Promise<string> {
  const key = getKey();
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const res = await fetch(`${GEMINI_BASE}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini error ${res.status}: ${body}`);
  }

  const data = await res.json() as any;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export interface SmartSearchResult {
  expandedQuery: string;
  englishQuery: string;
  intent: "movie" | "series" | "anime" | "any";
  suggestions: string[];
  corrected: boolean;
}

export async function smartSearch(rawQuery: string): Promise<SmartSearchResult> {
  const prompt = `You are a search assistant for a Brazilian streaming platform with movies, series, and anime.
The user typed: "${rawQuery}"

Tasks:
1. Fix any spelling/typing errors in the query (it may be in Portuguese or English).
2. Identify what type of content the user wants: "movie", "series", "anime", or "any".
3. Provide the best Portuguese search term.
4. Provide the best English search term (for TMDB API which works better in English).
5. Suggest up to 3 related search terms in Portuguese.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "expandedQuery": "<best Portuguese search term, corrected>",
  "englishQuery": "<best English search term>",
  "intent": "<movie|series|anime|any>",
  "suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "corrected": <true if spelling was fixed, false otherwise>
}`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as SmartSearchResult;
    return {
      expandedQuery: parsed.expandedQuery || rawQuery,
      englishQuery: parsed.englishQuery || rawQuery,
      intent: parsed.intent || "any",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
      corrected: !!parsed.corrected,
    };
  } catch {
    return {
      expandedQuery: rawQuery,
      englishQuery: rawQuery,
      intent: "any",
      suggestions: [],
      corrected: false,
    };
  }
}

export interface PersonalizationInput {
  likedTitles: string[];
  dislikedTitles: string[];
  watchedTitles: string[];
  favoriteGenres: string[];
  prefersMovies: boolean;
  prefersSeries: boolean;
  candidates: Array<{ id: string; title: string; genres: string[]; type: string; year: number; rating: number }>;
}

export interface PersonalizationResult {
  rankedIds: string[];
  reasoning: string;
}

export async function personalizeContent(input: PersonalizationInput): Promise<PersonalizationResult> {
  const { likedTitles, dislikedTitles, watchedTitles, favoriteGenres, prefersMovies, prefersSeries, candidates } = input;

  if (candidates.length === 0) return { rankedIds: [], reasoning: "No candidates" };

  const contentType = prefersMovies ? "filmes" : prefersSeries ? "séries" : "filmes e séries";
  const prompt = `You are a content recommendation engine for a Brazilian streaming platform.

User profile:
- Prefers: ${contentType}
- Favorite genres: ${favoriteGenres.join(", ") || "not specified"}
- Liked: ${likedTitles.slice(0, 10).join(", ") || "none"}
- Disliked: ${dislikedTitles.slice(0, 5).join(", ") || "none"}
- Recently watched: ${watchedTitles.slice(0, 10).join(", ") || "none"}

Content candidates to rank (JSON array):
${JSON.stringify(candidates.map(c => ({ id: c.id, title: c.title, genres: c.genres, type: c.type, year: c.year, rating: c.rating })))}

Task: Rank these candidates from best to worst match for this user. Consider:
- Genre alignment with user preferences
- Content type preference (movies vs series)
- Avoid content similar to disliked items
- Prioritize highly-rated and recent content
- Exclude content the user already watched

Respond ONLY with valid JSON, no markdown:
{
  "rankedIds": ["<id1>", "<id2>", ...],
  "reasoning": "<one sentence explanation in Portuguese>"
}`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as PersonalizationResult;
    return {
      rankedIds: Array.isArray(parsed.rankedIds) ? parsed.rankedIds : [],
      reasoning: parsed.reasoning || "Recomendações baseadas no seu gosto",
    };
  } catch {
    return {
      rankedIds: candidates.map(c => c.id),
      reasoning: "Recomendações baseadas no seu histórico",
    };
  }
}

export interface HomeFeedInput {
  topGenres: number[];
  topTitles: string[];
  recentSearches: string[];
  prefersMovies: boolean;
  prefersSeries: boolean;
  prefersAnime: boolean;
  likedIds: number[];
  dislikedIds: number[];
  watchedIds: number[];
  candidates: Array<{ id: string; title: string; genreIds: number[]; type: string; year: number; rating: number }>;
}

export interface HomeFeedResult {
  rankedIds: string[];
  rowLabel: string;
  rowSubtitle: string;
}

const GENRE_MAP: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 53: "Thriller",
  10752: "Guerra", 37: "Faroeste",
};

export async function personalizeHomeFeed(input: HomeFeedInput): Promise<HomeFeedResult> {
  const fallback: HomeFeedResult = {
    rankedIds: input.candidates.map(c => c.id),
    rowLabel: "Para Você",
    rowSubtitle: "Baseado no seu histórico",
  };

  if (input.candidates.length === 0) return fallback;

  const genreNames = input.topGenres.slice(0, 5).map(id => GENRE_MAP[id] ?? `Gênero ${id}`);
  const contentPref = input.prefersAnime ? "animes" : input.prefersSeries ? "séries" : "filmes";

  const prompt = `You are a personalization engine for NETPLAY, a Brazilian streaming app.

User profile:
- Favorite genres (TMDB IDs → names): ${genreNames.join(", ") || "unknown"}
- Content preference: ${contentPref}
- Recently watched titles: ${input.topTitles.slice(0, 8).join(", ") || "none"}
- Recent searches: ${input.recentSearches.slice(0, 5).join(", ") || "none"}
- Already watched IDs (exclude these): ${input.watchedIds.slice(0, 20).join(", ") || "none"}

Candidates to rank (JSON):
${JSON.stringify(input.candidates.slice(0, 35).map(c => ({ id: c.id, title: c.title, genres: c.genreIds.map(g => GENRE_MAP[g] ?? g), type: c.type, year: c.year, rating: c.rating })))}

Tasks:
1. Rank the candidates from best to worst match for this user.
2. Generate a short row label (2-4 words in Portuguese, e.g. "Porque você ama Terror").
3. Generate a subtitle (max 40 chars in Portuguese, e.g. "Escolhido com base no seu gosto").

Rules:
- Exclude IDs in "Already watched IDs"
- Prioritize genre alignment and high ratings
- Row label should feel personal and specific, not generic

Respond ONLY with valid JSON, no markdown:
{
  "rankedIds": ["<id1>", "<id2>", ...],
  "rowLabel": "<short personal label>",
  "rowSubtitle": "<subtitle>"
}`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as HomeFeedResult;
    return {
      rankedIds: Array.isArray(parsed.rankedIds) ? parsed.rankedIds : fallback.rankedIds,
      rowLabel: parsed.rowLabel || fallback.rowLabel,
      rowSubtitle: parsed.rowSubtitle || fallback.rowSubtitle,
    };
  } catch {
    return fallback;
  }
}

export async function generateSearchSuggestions(userHistory: string[], favoriteGenres: string[]): Promise<string[]> {
  if (!isGeminiAvailable()) return [];

  const prompt = `You are a recommendation assistant for a Brazilian streaming platform.

User's recent searches or watches: ${userHistory.slice(0, 8).join(", ") || "none"}
Favorite genres: ${favoriteGenres.join(", ") || "not specified"}

Generate 6 personalized search suggestions in Portuguese that this user would likely enjoy.
These should be specific titles, genres, or themes — short and clickable (1-4 words each).

Respond ONLY with valid JSON array of strings, no markdown:
["suggestion1", "suggestion2", "suggestion3", "suggestion4", "suggestion5", "suggestion6"]`;

  try {
    const raw = await callGemini(prompt);
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}
