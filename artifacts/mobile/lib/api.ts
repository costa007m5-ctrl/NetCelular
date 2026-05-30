import { Platform } from "react-native";

function getBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (Platform.OS === "web") return "/api";
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
}

const BASE = getBase();

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface TmdbItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  media_type?: string;
}

export interface TmdbSearchResult {
  results: TmdbItem[];
  total_results: number;
  total_pages: number;
  page: number;
}

export const api = {
  tmdb: {
    trending: (): Promise<{ all: TmdbItem[]; movies: TmdbItem[]; tv: TmdbItem[] }> =>
      apiFetch("/tmdb/trending"),

    popularMovies: (): Promise<TmdbItem[]> => apiFetch("/tmdb/popular/movies"),
    popularTv: (): Promise<TmdbItem[]> => apiFetch("/tmdb/popular/tv"),
    topMovies: (): Promise<TmdbItem[]> => apiFetch("/tmdb/top/movies"),
    topTv: (): Promise<TmdbItem[]> => apiFetch("/tmdb/top/tv"),

    search: (q: string, type: "multi" | "movie" | "tv" = "multi"): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`),

    movie: (id: number): Promise<TmdbItem> => apiFetch(`/tmdb/movie/${id}`),
    movieSimilar: (id: number): Promise<TmdbItem[]> => apiFetch(`/tmdb/movie/${id}/similar`),

    tv: (id: number): Promise<TmdbItem> => apiFetch(`/tmdb/tv/${id}`),
    tvSimilar: (id: number): Promise<TmdbItem[]> => apiFetch(`/tmdb/tv/${id}/similar`),

    genres: (): Promise<{ movies: { id: number; name: string }[]; tv: { id: number; name: string }[] }> =>
      apiFetch("/tmdb/genres"),
  },

  redeflix: {
    url: (type: "movie" | "tv", id: number, season = 1, episode = 1): string => {
      if (type === "tv") return `https://redeflixapi.store/serie/${id}/${season}/${episode}`;
      return `https://redeflixapi.store/filme/${id}`;
    },
  },
};

export const TMDB_IMG = (path: string | null, size: "w500" | "w1280" | "original" = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export function tmdbItemToContent(item: TmdbItem) {
  const isMovie = (item.media_type === "movie" || !!item.title);
  return {
    id: String(item.id),
    tmdbId: item.id,
    title: item.title ?? item.name ?? "Sem título",
    year: Number((item.release_date ?? item.first_air_date ?? "2024").slice(0, 4)),
    rating: Math.round(item.vote_average * 10) / 10,
    posterPath: TMDB_IMG(item.poster_path, "w500") ?? "",
    backdropPath: TMDB_IMG(item.backdrop_path, "w1280") ?? "",
    description: item.overview,
    genres: item.genres?.map((g) => g.name) ?? [],
    type: (isMovie ? "movie" : "series") as "movie" | "series",
    mediaType: isMovie ? "movie" : "tv",
  };
}
