import { Platform } from "react-native";

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "pt-BR";

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (Platform.OS === "web") return "/api";
  if (domain) return `https://${domain}/api`;
  return null as any;
}

const API_BASE = getApiBase();

function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", TMDB_LANG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(tmdbUrl(path, params));
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("No API server configured");
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function apiFetchOrDirect<T>(apiPath: string, directFn: () => Promise<T>): Promise<T> {
  if (API_BASE) {
    try { return await apiFetch<T>(apiPath); } catch {}
  }
  return directFn();
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
    trending: async (): Promise<{ all: TmdbItem[]; movies: TmdbItem[]; tv: TmdbItem[] }> => {
      return apiFetchOrDirect("/tmdb/trending", async () => {
        const [all, movies, tv] = await Promise.all([
          tmdbFetch<{ results: TmdbItem[] }>("/trending/all/week"),
          tmdbFetch<{ results: TmdbItem[] }>("/trending/movie/week"),
          tmdbFetch<{ results: TmdbItem[] }>("/trending/tv/week"),
        ]);
        return { all: all.results, movies: movies.results, tv: tv.results };
      });
    },

    popularMovies: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/popular/movies", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/movie/popular").then((r) => r.results)
      );
    },

    popularTv: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/popular/tv", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/tv/popular").then((r) => r.results)
      );
    },

    topMovies: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/top/movies", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/movie/top_rated").then((r) => r.results)
      );
    },

    topTv: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/top/tv", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/tv/top_rated").then((r) => r.results)
      );
    },

    search: async (q: string, type: "multi" | "movie" | "tv" = "multi", page = 1): Promise<TmdbSearchResult> => {
      const path = type === "multi" ? "/search/multi" : type === "movie" ? "/search/movie" : "/search/tv";
      return apiFetchOrDirect(`/tmdb/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`, () =>
        tmdbFetch<TmdbSearchResult>(path, { query: q, include_adult: "false", page: String(page) })
      );
    },

    movie: async (id: number): Promise<TmdbItem> => {
      return apiFetchOrDirect(`/tmdb/movie/${id}`, () =>
        tmdbFetch<TmdbItem>(`/movie/${id}`, { append_to_response: "credits,similar,videos" })
      );
    },

    movieSimilar: async (id: number): Promise<TmdbItem[]> => {
      return apiFetchOrDirect(`/tmdb/movie/${id}/similar`, () =>
        tmdbFetch<{ results: TmdbItem[] }>(`/movie/${id}/similar`).then((r) => r.results)
      );
    },

    tv: async (id: number): Promise<TmdbItem> => {
      return apiFetchOrDirect(`/tmdb/tv/${id}`, () =>
        tmdbFetch<TmdbItem>(`/tv/${id}`, { append_to_response: "credits,similar,videos" })
      );
    },

    tvSimilar: async (id: number): Promise<TmdbItem[]> => {
      return apiFetchOrDirect(`/tmdb/tv/${id}/similar`, () =>
        tmdbFetch<{ results: TmdbItem[] }>(`/tv/${id}/similar`).then((r) => r.results)
      );
    },

    tvSeason: async (id: number, seasonNum: number): Promise<TmdbSeason> => {
      return apiFetchOrDirect(`/tmdb/tv/${id}/season/${seasonNum}`, () =>
        tmdbFetch<TmdbSeason>(`/tv/${id}/season/${seasonNum}`)
      );
    },

    genres: async (): Promise<{ movies: { id: number; name: string }[]; tv: { id: number; name: string }[] }> => {
      return apiFetchOrDirect("/tmdb/genres", async () => {
        const [movies, tv] = await Promise.all([
          tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/movie/list"),
          tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/tv/list"),
        ]);
        return { movies: movies.genres, tv: tv.genres };
      });
    },

    discover: async (type: "movie" | "tv", genreId: number, page = 1): Promise<TmdbSearchResult> => {
      const path = type === "movie" ? "/discover/movie" : "/discover/tv";
      return apiFetchOrDirect(`/tmdb/discover?type=${type}&genre_id=${genreId}&page=${page}`, () =>
        tmdbFetch<TmdbSearchResult>(path, {
          with_genres: String(genreId),
          page: String(page),
          include_adult: "false",
          sort_by: "popularity.desc",
        })
      );
    },

    providers: async (type: "movie" | "tv", id: number) => {
      try {
        return await apiFetchOrDirect(`/tmdb/${type}/${id}/providers`, async () => {
          const data = await tmdbFetch<{ results: Record<string, any> }>(`/${type}/${id}/watch/providers`).catch(() => null);
          return data?.results?.["BR"] ?? null;
        });
      } catch {
        return null;
      }
    },

    checkAvailable: async (type: "movie" | "tv", id: number, season = 1, episode = 1): Promise<{ available: boolean }> => {
      try {
        return await apiFetchOrDirect(
          `/tmdb/redeflix/available?type=${type}&id=${id}&season=${season}&episode=${episode}`,
          async () => {
            if (Platform.OS === "web") return { available: true };
            const url = type === "tv"
              ? `https://redeflixapi.store/serie/${id}/${season}/${episode}`
              : `https://redeflixapi.store/filme/${id}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(url, { method: "HEAD", signal: controller.signal });
            clearTimeout(timer);
            return { available: res.status !== 404 && res.status < 500 };
          }
        );
      } catch {
        return { available: true };
      }
    },

    popularPeople: async (): Promise<any[]> => {
      return tmdbFetch<{ results: any[] }>("/person/popular").then((r) => r.results);
    },

    searchPeople: async (q: string): Promise<any[]> => {
      return tmdbFetch<{ results: any[] }>("/search/person", { query: q, include_adult: "false" }).then((r) => r.results);
    },

    streaming: async (providerId: number, type: "movie" | "tv", page = 1): Promise<TmdbSearchResult> => {
      const path = type === "movie" ? "/discover/movie" : "/discover/tv";
      return apiFetchOrDirect(`/tmdb/streaming?provider_id=${providerId}&type=${type}&page=${page}`, () =>
        tmdbFetch<TmdbSearchResult>(path, {
          with_watch_providers: String(providerId),
          watch_region: "BR",
          page: String(page),
          include_adult: "false",
          sort_by: "popularity.desc",
        })
      );
    },

    streamingGenre: async (providerId: number, type: "movie" | "tv", genreId?: number, page = 1): Promise<TmdbSearchResult> => {
      const genreParam = genreId ? `&genre_id=${genreId}` : "";
      const path = type === "movie" ? "/discover/movie" : "/discover/tv";
      const params: Record<string, string> = {
        with_watch_providers: String(providerId),
        watch_region: "BR",
        page: String(page),
        include_adult: "false",
        sort_by: "popularity.desc",
      };
      if (genreId) params.with_genres = String(genreId);
      return apiFetchOrDirect(`/tmdb/streaming-genre?provider_id=${providerId}&type=${type}&page=${page}${genreParam}`, () =>
        tmdbFetch<TmdbSearchResult>(path, params)
      );
    },

    keywordDiscover: async (keywordId: number, type: "movie" | "tv", page = 1): Promise<TmdbSearchResult> => {
      const path = type === "movie" ? "/discover/movie" : "/discover/tv";
      return apiFetchOrDirect(`/tmdb/discover-keyword?keyword_id=${keywordId}&type=${type}&page=${page}`, () =>
        tmdbFetch<TmdbSearchResult>(path, {
          with_keywords: String(keywordId),
          page: String(page),
          include_adult: "false",
        })
      );
    },

    collection: async (id: number) => {
      return apiFetchOrDirect(`/tmdb/collection/${id}`, () =>
        tmdbFetch<any>(`/collection/${id}`)
      );
    },

    franchiseLogo: async (type: "collection" | "tv" | "movie", id: number): Promise<{ logo_path: string | null }> => {
      try {
        return await apiFetchOrDirect(`/tmdb/franchise-logo?type=${type}&id=${id}`, async () => {
          const res = await fetch(`${TMDB_BASE}/${type}/${id}/images?api_key=${TMDB_KEY}&include_image_language=en,pt,null`).catch(() => null);
          if (!res?.ok) return { logo_path: null };
          const data: any = await res.json();
          const logos: any[] = data.logos ?? [];
          const best = logos.sort((a, b) => b.vote_average - a.vote_average)[0];
          return { logo_path: best?.file_path ?? null };
        });
      } catch {
        return { logo_path: null };
      }
    },

    nowPlaying: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/now-playing", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/movie/now_playing").then((r) => r.results)
      );
    },

    upcoming: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/upcoming", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/movie/upcoming").then((r) => r.results)
      );
    },

    onTheAir: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/on-the-air", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/tv/on_the_air").then((r) => r.results)
      );
    },

    airingToday: async (): Promise<TmdbItem[]> => {
      return apiFetchOrDirect("/tmdb/airing-today", () =>
        tmdbFetch<{ results: TmdbItem[] }>("/tv/airing_today").then((r) => r.results)
      );
    },

    popularCollections: async (page = 1) => {
      return apiFetchOrDirect(`/tmdb/popular-collections?page=${page}`, () =>
        tmdbFetch<{ results: any[]; page: number; total_pages: number }>("/collection/popular" as any, { page: String(page) })
          .catch(() => ({ results: [], page: 1, total_pages: 1 }))
      );
    },

    searchCollections: async (q: string, page = 1) => {
      return apiFetchOrDirect(`/tmdb/search-collections?q=${encodeURIComponent(q)}&page=${page}`, () =>
        tmdbFetch<any>("/search/collection", { query: q, page: String(page) })
      );
    },
  },

  redeflix: {
    url: (type: "movie" | "tv", id: number, season = 1, episode = 1): string => {
      if (type === "tv") return `https://redeflixapi.store/serie/${id}/${season}/${episode}`;
      return `https://redeflixapi.store/filme/${id}`;
    },

    listIds: async (type: "movie" | "tv" | "anime" | "dorama"): Promise<number[]> => {
      try {
        const base = getApiBase();
        const res = await fetch(`${base}/tmdb/redeflix/list-ids?type=${type}`);
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
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
