/**
 * shorts-top-week.ts — "Top Shorts da Semana"
 *
 * Fetches TMDB trending-this-week from the API server proxy, merges movies + TV
 * into a single ranked list (top 10), and caches the result keyed by ISO week
 * in AsyncStorage so it only re-fetches once per week (or on first load).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "./api";
import type { ContentItem } from "@/constants/content";

const CACHE_KEY_PREFIX = "netplay_top_shorts_week_v1:";
const FETCH_TIMEOUT_MS = 7_000;

const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";

function getISOWeekKey(): string {
  const d = new Date();
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((thursday.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function tmdbItemToContent(item: any, rank: number): ContentItem {
  const isMovie = item.media_type === "movie" || item.title != null;
  const posterPath = item.poster_path ? `${TMDB_POSTER}${item.poster_path}` : "";
  const backdropPath = item.backdrop_path
    ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
    : posterPath;
  const title = item.title ?? item.name ?? "—";
  const year = Number(
    (item.release_date ?? item.first_air_date ?? "2024").slice(0, 4)
  );
  return {
    id: `top-short-week-${rank}-${item.id}`,
    tmdbId: item.id,
    title,
    year,
    rating: Math.round((item.vote_average ?? 0) * 10) / 10,
    communityScore: item.vote_count ?? 0,
    posterPath,
    backdropPath,
    description: item.overview ?? "",
    genres: (item.genre_ids ?? []) as number[],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
    exclusive: false,
  };
}

export async function fetchTopShortsWeek(): Promise<ContentItem[]> {
  const weekKey = getISOWeekKey();
  const cacheKey = CACHE_KEY_PREFIX + weekKey;

  // Return cached data if still within this ISO week
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as ContentItem[];
      if (parsed.length > 0) return parsed;
    }
  } catch {}

  // Fetch fresh from API proxy
  try {
    const base = getApiBase();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`${base}/tmdb/trending`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as { all?: any[]; movies?: any[]; tv?: any[] };

    // Merge movies + TV, deduplicate by id, sort by popularity descending
    const movies = (data.movies ?? data.all ?? []).map((it: any) => ({ ...it, media_type: "movie" }));
    const tv     = (data.tv ?? []).map((it: any) => ({ ...it, media_type: "tv" }));
    const merged = [...movies, ...tv]
      .filter((it) => it.poster_path)
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

    // Deduplicate by TMDB id
    const seen  = new Set<number>();
    const dedup = merged.filter((it) => {
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });

    const top10 = dedup.slice(0, 10).map((it, i) => tmdbItemToContent(it, i + 1));

    if (top10.length > 0) {
      AsyncStorage.setItem(cacheKey, JSON.stringify(top10)).catch(() => {});
    }

    return top10;
  } catch {
    return [];
  }
}
