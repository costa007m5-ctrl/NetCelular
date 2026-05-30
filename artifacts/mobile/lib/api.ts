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

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string;
  vote_average: number;
  runtime: number | null;
}

export interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  episode_count: number;
  poster_path: string | null;
  air_date: string;
  episodes?: TmdbEpisode[];
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
    tvSeason: (id: number, seasonNum: number): Promise<TmdbSeason> =>
      apiFetch(`/tmdb/tv/${id}/season/${seasonNum}`),

    genres: (): Promise<{ movies: { id: number; name: string }[]; tv: { id: number; name: string }[] }> =>
      apiFetch("/tmdb/genres"),

    discover: (type: "movie" | "tv", genreId: number, page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/discover?type=${type}&genre_id=${genreId}&page=${page}`),

    providers: (type: "movie" | "tv", id: number): Promise<{ flatrate?: { logo_path: string; provider_id: number; provider_name: string }[] } | null> =>
      apiFetch(`/tmdb/${type}/${id}/providers`).catch(() => null),

    checkAvailable: (type: "movie" | "tv", id: number, season = 1, episode = 1): Promise<{ available: boolean }> =>
      apiFetch(`/tmdb/redeflix/available?type=${type}&id=${id}&season=${season}&episode=${episode}`).catch(() => ({ available: true })),

    streaming: (providerId: number, type: "movie" | "tv", page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/streaming?provider_id=${providerId}&type=${type}&page=${page}`),

    streamingGenre: (providerId: number, type: "movie" | "tv", genreId?: number, page = 1): Promise<TmdbSearchResult> => {
      const genreParam = genreId ? `&genre_id=${genreId}` : "";
      return apiFetch(`/tmdb/streaming-genre?provider_id=${providerId}&type=${type}&page=${page}${genreParam}`);
    },

    keywordDiscover: (keywordId: number, type: "movie" | "tv", page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/discover-keyword?keyword_id=${keywordId}&type=${type}&page=${page}`),

    collection: (id: number): Promise<{
      id: number;
      name: string;
      overview: string;
      poster_path: string | null;
      backdrop_path: string | null;
      parts: TmdbItem[];
    }> => apiFetch(`/tmdb/collection/${id}`),

    franchiseLogo: (type: "collection" | "tv" | "movie", id: number): Promise<{ logo_path: string | null }> =>
      apiFetch(`/tmdb/franchise-logo?type=${type}&id=${id}`).catch(() => ({ logo_path: null })),
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
