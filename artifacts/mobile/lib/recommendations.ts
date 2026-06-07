import type { ContentItem } from "@/constants/content";
import { supabase, db, isSupabaseConfigured } from "@/lib/supabase";

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

  const scored = allContent
    .filter((item) => {
      const tmdbId = item.tmdbId ?? 0;
      if (tmdbId > 0 && signals.watchedIds.has(tmdbId)) return false;
      if (!item.title) return false;
      return true;
    })
    .map((item) => ({ item, score: scoreItem(item, signals) }))
    .filter(({ score }) => score > -10)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ item }) => item);
}
