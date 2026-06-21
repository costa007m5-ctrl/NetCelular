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
