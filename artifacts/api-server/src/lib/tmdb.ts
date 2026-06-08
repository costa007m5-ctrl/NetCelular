const TMDB_BASE = "https://api.themoviedb.org/3";
const LANGUAGE = "pt-BR";

function getKey(): string {
  const key = process.env["TMDB_API_KEY"];
  if (!key) throw new Error("TMDB_API_KEY environment variable is not set");
  return key;
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getKey());
  url.searchParams.set("language", LANGUAGE);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = buildUrl(path, params);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  media_type?: string;
}

export interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  media_type?: string;
}

export interface TmdbPage<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
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

export const tmdb = {
  trending: {
    all: (timeWindow: "day" | "week" = "week") =>
      tmdbFetch<TmdbPage<TmdbMovie & TmdbTv>>(`/trending/all/${timeWindow}`),
    movies: (timeWindow: "day" | "week" = "week") =>
      tmdbFetch<TmdbPage<TmdbMovie>>(`/trending/movie/${timeWindow}`),
    tv: (timeWindow: "day" | "week" = "week") =>
      tmdbFetch<TmdbPage<TmdbTv>>(`/trending/tv/${timeWindow}`),
  },

  movie: {
    popular: (page = 1) => tmdbFetch<TmdbPage<TmdbMovie>>("/movie/popular", { page: String(page) }),
    topRated: (page = 1) => tmdbFetch<TmdbPage<TmdbMovie>>("/movie/top_rated", { page: String(page) }),
    details: (id: number) =>
      tmdbFetch<TmdbMovie>(`/movie/${id}`, { append_to_response: "credits,similar,videos" }),
    similar: (id: number) => tmdbFetch<TmdbPage<TmdbMovie>>(`/movie/${id}/similar`),
  },

  tv: {
    popular: () => tmdbFetch<TmdbPage<TmdbTv>>("/tv/popular"),
    topRated: () => tmdbFetch<TmdbPage<TmdbTv>>("/tv/top_rated"),
    details: (id: number) =>
      tmdbFetch<TmdbTv>(`/tv/${id}`, { append_to_response: "credits,similar,videos" }),
    similar: (id: number) => tmdbFetch<TmdbPage<TmdbTv>>(`/tv/${id}/similar`),
    season: (id: number, seasonNum: number) =>
      tmdbFetch<TmdbSeason>(`/tv/${id}/season/${seasonNum}`),
  },

  search: {
    multi: (query: string, page = 1) =>
      tmdbFetch<TmdbPage<(TmdbMovie | TmdbTv) & { media_type: string }>>("/search/multi", {
        query,
        page: String(page),
        include_adult: "false",
      }),
    movies: (query: string, page = 1) =>
      tmdbFetch<TmdbPage<TmdbMovie>>("/search/movie", { query, page: String(page) }),
    tv: (query: string, page = 1) =>
      tmdbFetch<TmdbPage<TmdbTv>>("/search/tv", { query, page: String(page) }),
    collections: (query: string, page = 1) =>
      tmdbFetch<TmdbPage<{ id: number; name: string; poster_path: string | null; backdrop_path: string | null; overview: string }>>(
        "/search/collection",
        { query, page: String(page) }
      ),
  },

  genres: {
    movies: () => tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/movie/list"),
    tv: () => tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/tv/list"),
  },

  watchProviders: {
    movie: (id: number) =>
      tmdbFetch<{ results: Record<string, { flatrate?: { logo_path: string; provider_id: number; provider_name: string }[]; rent?: any[]; buy?: any[] }> }>(
        `/movie/${id}/watch/providers`
      ),
    tv: (id: number) =>
      tmdbFetch<{ results: Record<string, { flatrate?: { logo_path: string; provider_id: number; provider_name: string }[]; rent?: any[]; buy?: any[] }> }>(
        `/tv/${id}/watch/providers`
      ),
  },

  discover: {
    movies: (genreId?: number, page = 1, providerId?: number, keywordId?: number) => {
      const params: Record<string, string> = { page: String(page), include_adult: "false", sort_by: "popularity.desc" };
      if (providerId) { params.with_watch_providers = String(providerId); params.watch_region = "BR"; }
      if (genreId) params.with_genres = String(genreId);
      if (keywordId) params.with_keywords = String(keywordId);
      return tmdbFetch<TmdbPage<TmdbMovie>>("/discover/movie", params);
    },
    tv: (genreId?: number, page = 1, providerId?: number, keywordId?: number) => {
      const params: Record<string, string> = { page: String(page), include_adult: "false", sort_by: "popularity.desc" };
      if (providerId) { params.with_watch_providers = String(providerId); params.watch_region = "BR"; }
      if (genreId) params.with_genres = String(genreId);
      if (keywordId) params.with_keywords = String(keywordId);
      return tmdbFetch<TmdbPage<TmdbTv>>("/discover/tv", params);
    },
  },

  collection: {
    details: (id: number) =>
      tmdbFetch<{
        id: number;
        name: string;
        overview: string;
        poster_path: string | null;
        backdrop_path: string | null;
        parts: (TmdbMovie & { media_type?: string })[];
      }>(`/collection/${id}`),
  },

  images: {
    logos: async (type: "collection" | "tv" | "movie", id: number): Promise<{ file_path: string; iso_639_1: string | null; vote_average: number }[]> => {
      const key = process.env["TMDB_API_KEY"];
      if (!key) return [];
      const url = `${TMDB_BASE}/${type}/${id}/images?api_key=${key}&include_image_language=en,pt,null`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: any = await res.json();
      return data.logos ?? [];
    },
  },

  redeflix: {
    movieUrl: (tmdbId: number) => `https://redeflixapi.store/filme/${tmdbId}`,
    tvUrl: (tmdbId: number, season: number, episode: number) =>
      `https://redeflixapi.store/serie/${tmdbId}/${season}/${episode}`,
    listMovieIds: () =>
      fetch("https://redeflixapi.store/list-movie-ids.txt").then((r) => r.text()),
    listTvIds: () =>
      fetch("https://redeflixapi.store/list-tv-ids.txt").then((r) => r.text()),
    listAnimeIds: () =>
      fetch("https://redeflixapi.store/list-anime-ids.txt").then((r) => r.text()),
    listDoramaIds: () =>
      fetch("https://redeflixapi.store/list-dorama-ids.txt").then((r) => r.text()),
    parseIds: (txt: string) =>
      txt.split("\n").map((l) => l.trim()).filter(Boolean).map(Number).filter(Boolean),
  },
};
