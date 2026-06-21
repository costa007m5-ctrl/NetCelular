import { r2Base } from "@/lib/r2-direct";

function apiBase(): string {
  const base = r2Base();
  return base ? `${base}` : "";
}

export interface SmartSearchResult {
  expandedQuery: string;
  englishQuery: string;
  intent: "movie" | "series" | "anime" | "any";
  suggestions: string[];
  corrected: boolean;
}

export interface PersonalizationResult {
  rankedIds: string[];
  reasoning: string;
}

let _geminiAvailable: boolean | null = null;

export async function checkGeminiAvailable(): Promise<boolean> {
  if (_geminiAvailable !== null) return _geminiAvailable;
  try {
    const res = await fetch(`${apiBase()}/api/gemini/status`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) { _geminiAvailable = false; return false; }
    const data = await res.json() as { available: boolean };
    _geminiAvailable = data.available ?? false;
    return _geminiAvailable;
  } catch {
    _geminiAvailable = false;
    return false;
  }
}

export async function geminiSmartSearch(query: string): Promise<SmartSearchResult> {
  const fallback: SmartSearchResult = { expandedQuery: query, englishQuery: query, intent: "any", suggestions: [], corrected: false };
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${apiBase()}/api/gemini/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return fallback;
    return await res.json() as SmartSearchResult;
  } catch {
    return fallback;
  }
}

export async function geminiPersonalize(input: {
  likedTitles: string[];
  dislikedTitles: string[];
  watchedTitles: string[];
  favoriteGenres: string[];
  prefersMovies: boolean;
  prefersSeries: boolean;
  candidates: Array<{ id: string; title: string; genres: string[]; type: string; year: number; rating: number }>;
}): Promise<PersonalizationResult> {
  const fallback: PersonalizationResult = { rankedIds: input.candidates.map(c => c.id), reasoning: "" };
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${apiBase()}/api/gemini/personalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return fallback;
    return await res.json() as PersonalizationResult;
  } catch {
    return fallback;
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

export async function geminiPersonalizeHome(input: HomeFeedInput): Promise<HomeFeedResult> {
  const fallback: HomeFeedResult = { rankedIds: input.candidates.map(c => c.id), rowLabel: "Para Você", rowSubtitle: "Baseado no seu gosto" };
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${apiBase()}/api/gemini/personalize-home`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return fallback;
    return await res.json() as HomeFeedResult;
  } catch {
    return fallback;
  }
}

export async function geminiSuggestions(userHistory: string[], favoriteGenres: string[]): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${apiBase()}/api/gemini/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userHistory, favoriteGenres }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json() as { suggestions: string[] };
    return data.suggestions ?? [];
  } catch {
    return [];
  }
}
