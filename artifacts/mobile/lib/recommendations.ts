import type { ContentItem } from "@/constants/content";
import { supabase, db, isSupabaseConfigured } from "@/lib/supabase";
import { geminiPersonalize, checkGeminiAvailable } from "@/lib/gemini-client";
import { getLearnedPreferences, GENRE_NAMES } from "@/lib/smart-preferences";

export interface RecommendationSignals {
  watchedIds: Set<number>;
  likedIds: Set<number>;
  dislikedIds: Set<number>;
  watchlistIds: Set<number>;
  prefersMovies: boolean;
  prefersSeries: boolean;
  avgRatingWatched: number;
  prefersNewContent: boolean;
}

async function fetchSignals(userId: string): Promise<RecommendationSignals> {
  const defaultSignals: RecommendationSignals = {
    watchedIds: new Set(),
    likedIds: new Set(),
    dislikedIds: new Set(),
    watchlistIds: new Set(),
    prefersMovies: true,
    prefersSeries: false,
    avgRatingWatched: 7,
    prefersNewContent: true,
  };

  if (!userId || !isSupabaseConfigured) return defaultSignals;

  try {
    const [progressRes, ratingsRes, watchlistRes] = await Promise.allSettled([
      db.progress.getAll(userId),
      supabase.from("ratings").select("tmdb_id,type,liked").eq("user_id", userId),
      db.watchlist.getAll(userId),
    ]);

    const watchedIds = new Set<number>();
    let movieCount = 0;
    let tvCount = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    let recentCount = 0;
    let oldCount = 0;

    if (progressRes.status === "fulfilled" && progressRes.value) {
      for (const p of progressRes.value) {
        if (p.tmdb_id && p.progress > 0.05) {
          watchedIds.add(p.tmdb_id);
          if (p.type === "movie") movieCount++;
          else tvCount++;
        }
      }
    }

    const likedIds = new Set<number>();
    const dislikedIds = new Set<number>();

    if (ratingsRes.status === "fulfilled" && ratingsRes.value?.data) {
      for (const r of ratingsRes.value.data as Array<{ tmdb_id: number; type: string; liked: boolean }>) {
        if (r.liked) likedIds.add(r.tmdb_id);
        else dislikedIds.add(r.tmdb_id);
      }
    }

    const watchlistIds = new Set<number>();
    if (watchlistRes.status === "fulfilled" && watchlistRes.value) {
      for (const w of watchlistRes.value) {
        if (w.tmdb_id) watchlistIds.add(w.tmdb_id);
      }
    }

    const total = movieCount + tvCount;
    const prefersMovies = total === 0 ? true : movieCount >= tvCount;
    const prefersSeries = total === 0 ? false : tvCount > movieCount;

    return {
      watchedIds,
      likedIds,
      dislikedIds,
      watchlistIds,
      prefersMovies,
      prefersSeries,
      avgRatingWatched: ratingCount > 0 ? ratingSum / ratingCount : 7,
      prefersNewContent: oldCount === 0 || recentCount >= oldCount,
    };
  } catch {
    return defaultSignals;
  }
}

function scoreItem(item: ContentItem, signals: RecommendationSignals): number {
  const tmdbId = item.tmdbId ?? 0;

  if (tmdbId > 0 && signals.dislikedIds.has(tmdbId)) return -99;
  if (!item.posterPath && !item.backdropPath) return -50;

  let score = 0;

  const isMovie = item.type === "movie" || item.mediaType === "movie";

  if (signals.prefersMovies && isMovie) score += 3;
  if (signals.prefersSeries && !isMovie) score += 3;

  if (tmdbId > 0 && signals.watchlistIds.has(tmdbId)) score += 5;
  if (tmdbId > 0 && signals.likedIds.has(tmdbId)) score += 4;

  if (item.rating >= 8.0) score += 2.5;
  else if (item.rating >= 7.0) score += 1.5;
  else if (item.rating >= 6.0) score += 0.5;
  else if (item.rating > 0 && item.rating < 5.5) score -= 1;

  if (item.year >= 2022) score += 1.5;
  else if (item.year >= 2019) score += 0.5;

  score += Math.random() * 1.2;

  return score;
}

export async function computeRecommendations(
  allContent: ContentItem[],
  userId: string,
  limit = 15
): Promise<ContentItem[]> {
  const signals = await fetchSignals(userId);

  const localScored = allContent
    .filter((item) => {
      const tmdbId = item.tmdbId ?? 0;
      if (tmdbId > 0 && signals.watchedIds.has(tmdbId)) return false;
      if (!item.title) return false;
      return true;
    })
    .map((item) => ({ item, score: scoreItem(item, signals) }))
    .filter(({ score }) => score > -10)
    .sort((a, b) => b.score - a.score);

  const candidates = localScored.slice(0, Math.min(40, localScored.length));

  // Try Gemini personalization if available
  try {
    const geminiAvailable = await checkGeminiAvailable();
    if (geminiAvailable && userId && candidates.length > 0) {
      const learned = await getLearnedPreferences();
      const favoriteGenres = learned
        ? learned.genreScores.slice(0, 5).map((g) => g.name)
        : [];

      // Collect titles from user signals for Gemini context
      const likedTitles: string[] = [];
      const dislikedTitles: string[] = [];
      const watchedTitles: string[] = [];

      for (const item of allContent) {
        const id = item.tmdbId ?? 0;
        if (id > 0 && signals.likedIds.has(id)) likedTitles.push(item.title);
        else if (id > 0 && signals.dislikedIds.has(id)) dislikedTitles.push(item.title);
        else if (id > 0 && signals.watchedIds.has(id)) watchedTitles.push(item.title);
      }

      const geminiCandidates = candidates.map(({ item }) => ({
        id: String(item.tmdbId ?? item.id),
        title: item.title,
        genres: (item.genres ?? []).map((g) => GENRE_NAMES[g as number] ?? String(g)),
        type: item.type ?? "movie",
        year: item.year ?? 2020,
        rating: item.rating ?? 0,
      }));

      const result = await geminiPersonalize({
        likedTitles: likedTitles.slice(0, 10),
        dislikedTitles: dislikedTitles.slice(0, 5),
        watchedTitles: watchedTitles.slice(0, 10),
        favoriteGenres,
        prefersMovies: signals.prefersMovies,
        prefersSeries: signals.prefersSeries,
        candidates: geminiCandidates,
      });

      if (result.rankedIds.length > 0) {
        const idToItem = new Map(candidates.map(({ item }) => [String(item.tmdbId ?? item.id), item]));
        const ranked = result.rankedIds
          .map((id) => idToItem.get(id))
          .filter((item): item is ContentItem => !!item);
        // Fill any missing items at the end
        const rankedSet = new Set(result.rankedIds);
        const remaining = candidates
          .filter(({ item }) => !rankedSet.has(String(item.tmdbId ?? item.id)))
          .map(({ item }) => item);
        return [...ranked, ...remaining].slice(0, limit);
      }
    }
  } catch {
    // Fall through to local scoring
  }

  return candidates.slice(0, limit).map(({ item }) => item);
}
