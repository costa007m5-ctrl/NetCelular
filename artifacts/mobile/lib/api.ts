import { Platform } from "react-native";
import Constants from "expo-constants";


export const COUNTRY_LANG: Record<string, string> = {
  BR: "pt",
  US: "en",
  KR: "ko",
  JP: "ja",
  GB: "en",
  FR: "fr",
  IT: "it",
  ES: "es",
};

const STORAGE_KEY = "@netplay_api_domain";
const SUPABASE_URL = "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemZzYmRjanloY29wdGJybGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTA4MjUsImV4cCI6MjA5NTY2NjgyNX0.SB-NiDEKp4RtVr9MSv255IPWoU2rp7td7b5ejccBG8Q";

// Domínio de produção permanente — sempre usado como fallback final se nenhum outro funcionar.
// Este domínio é estável (não muda entre sessões Replit como os domínios dev).
const PRODUCTION_DOMAIN = "net-celular--happylion157.replit.app";

let _dynamicDomain: string | null = null;

async function _fetchDomainFromSupabase(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_config?key=eq.api_domain&select=value&limit=1`,
      {
        signal: ctrl.signal,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    clearTimeout(tid);
    if (!res.ok) return null;
    const data: Array<{ value: string }> = await res.json();
    if (data.length > 0 && data[0].value?.trim()) return data[0].value.trim();
  } catch {}
  return null;
}

async function _saveDomainToSupabase(domain: string): Promise<void> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
    method: "POST",
    signal: ctrl.signal,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: "api_domain", value: domain }),
  });
  clearTimeout(tid);
}

async function _checkDomainAlive(domain: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`https://${domain}/api/healthz`, { signal: ctrl.signal });
    clearTimeout(tid);
    return res.ok;
  } catch {
    return false;
  }
}

export async function initApiDomain(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;

    // 1. EXPO_PUBLIC_DOMAIN baked in at build time — but verify it's reachable first.
    // Dev domains (e.g. *.janeway.replit.dev) change every session; production .replit.app domains
    // are stable. If the baked domain is dead (stale dev domain), fall through to Supabase.
    // Strip protocol prefix (https:// or http://) and trailing slashes — the domain var must
    // be a bare hostname (e.g. "net-celular--calm-eagle677.replit.app"), not a full URL.
    const rawEnv = process.env.EXPO_PUBLIC_DOMAIN?.trim();
    const fromEnv = rawEnv ? rawEnv.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";
    if (fromEnv) {
      const alive = await _checkDomainAlive(fromEnv);
      if (alive) {
        _dynamicDomain = fromEnv;
        await AsyncStorage.setItem(STORAGE_KEY, fromEnv);
        _saveDomainToSupabase(fromEnv).catch(() => {});
        return;
      }
      // Domain baked in is unreachable (stale dev domain) — fall through to Supabase
    }

    // 2. Fallback: try Supabase (centrally stored) then local AsyncStorage
    const [fromSupabase, fromStorage] = await Promise.all([
      _fetchDomainFromSupabase(),
      AsyncStorage.getItem(STORAGE_KEY),
    ]);

    // IMPORTANT: verify Supabase/AsyncStorage domains are alive before using them.
    // A stale domain (e.g., from a previous Replit session) silently routes all API
    // calls to the wrong server, which returns "Access Denied: VOD API Gateway".
    // Both sources are checked in parallel, but we use the first alive one found.
    const candidates = [fromSupabase, fromStorage?.trim() || null, PRODUCTION_DOMAIN].filter(Boolean) as string[];
    let resolved: string | null = null;
    for (const candidate of candidates) {
      const alive = await _checkDomainAlive(candidate);
      if (alive) { resolved = candidate; break; }
    }
    if (!resolved) resolved = PRODUCTION_DOMAIN;

    _dynamicDomain = resolved;
    await AsyncStorage.setItem(STORAGE_KEY, resolved);
    // Keep Supabase up-to-date with the working domain so other devices pick it up.
    if (resolved !== fromSupabase) {
      _saveDomainToSupabase(resolved).catch(() => {});
    }
  } catch {}
}

export async function setApiDomain(domain: string): Promise<void> {
  const clean = domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  try {
    const AsyncStorage = require("@react-native-async-storage/async-storage").default;
    if (clean) {
      await AsyncStorage.setItem(STORAGE_KEY, clean);
      await _saveDomainToSupabase(clean);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
  _dynamicDomain = clean || null;
}

export function getApiDomainDisplay(): string {
  if (_dynamicDomain) return _dynamicDomain;
  if (Platform.OS === "web") return "(web — /api)";
  return (
    process.env.EXPO_PUBLIC_DOMAIN ||
    (Constants.expoConfig?.extra as any)?.apiDomain ||
    "(não configurado)"
  );
}

export function getApiBase(): string {
  if (Platform.OS === "web") return "/api";
  const domain =
    _dynamicDomain ||
    process.env.EXPO_PUBLIC_DOMAIN ||
    (Constants.expoConfig?.extra as any)?.apiDomain ||
    PRODUCTION_DOMAIN;
  return `https://${domain}/api`;
}

// ─── TMDB ────────────────────────────────────────────────────────────────────
// All TMDB calls are routed through the API server (/api/tmdb/...).
// The TMDB_API_KEY lives only on the server — never in client code.

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error("No API server configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${base}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as any).error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
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
  original_language?: string;
  vote_count?: number;
  popularity?: number;
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

export interface TmdbPersonResult {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  known_for: TmdbItem[];
}

export interface TmdbPerson {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  also_known_as: string[];
}

export const api = {
  tmdb: {
    trending: (): Promise<{ all: TmdbItem[]; movies: TmdbItem[]; tv: TmdbItem[] }> =>
      apiFetch("/tmdb/trending"),

    popularMovies: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/popular/movies"),

    popularTv: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/popular/tv"),

    topMovies: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/top/movies"),

    topTv: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/top/tv"),

    search: (q: string, type: "multi" | "movie" | "tv" = "multi", page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`),

    movie: (id: number): Promise<TmdbItem> =>
      apiFetch(`/tmdb/movie/${id}`),

    movieSimilar: (id: number): Promise<TmdbItem[]> =>
      apiFetch(`/tmdb/movie/${id}/similar`),

    tv: (id: number): Promise<TmdbItem> =>
      apiFetch(`/tmdb/tv/${id}`),

    tvSimilar: (id: number): Promise<TmdbItem[]> =>
      apiFetch(`/tmdb/tv/${id}/similar`),

    tvSeason: (id: number, seasonNum: number): Promise<TmdbSeason> =>
      apiFetch(`/tmdb/tv/${id}/season/${seasonNum}`),

    genres: (): Promise<{ movies: { id: number; name: string }[]; tv: { id: number; name: string }[] }> =>
      apiFetch("/tmdb/genres"),

    discover: (type: "movie" | "tv", genreId: number, page = 1, sortBy = "popularity.desc", genreIds?: string): Promise<TmdbSearchResult> => {
      let url = `/tmdb/discover?type=${type}&page=${page}&sort_by=${encodeURIComponent(sortBy)}`;
      if (genreIds) url += `&genre_ids=${encodeURIComponent(genreIds)}`;
      else url += `&genre_id=${genreId}`;
      return apiFetch(url);
    },

    person: (id: number): Promise<TmdbPerson> =>
      apiFetch(`/tmdb/person/${id}`),

    searchPerson: (name: string): Promise<TmdbPersonResult[]> =>
      apiFetch(`/tmdb/search-person?q=${encodeURIComponent(name)}`),

    personMovies: (id: number): Promise<TmdbItem[]> =>
      apiFetch(`/tmdb/person/${id}/movie_credits`),

    personTv: (id: number): Promise<TmdbItem[]> =>
      apiFetch(`/tmdb/person/${id}/tv_credits`),

    discoverByCountry: (type: "movie" | "tv", countryCode: string, page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/discover-country?type=${type}&country=${countryCode}&page=${page}`),

    discoverByLang: (type: "movie" | "tv", lang: string, genreId: number, page = 1, sortBy = "popularity.desc"): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/discover-lang?type=${type}&lang=${lang}&genre_id=${genreId}&page=${page}&sort_by=${encodeURIComponent(sortBy)}`),

    providers: async (type: "movie" | "tv", id: number) => {
      try { return await apiFetch(`/tmdb/${type}/${id}/providers`); } catch { return null; }
    },

    checkAvailable: async (type: "movie" | "tv", id: number, season = 1, episode = 1): Promise<{ available: boolean }> => {
      try {
        return await apiFetch(`/tmdb/redeflix/available?type=${type}&id=${id}&season=${season}&episode=${episode}`);
      } catch {
        return { available: true };
      }
    },

    popularPeople: (): Promise<any[]> =>
      apiFetch("/tmdb/popular-people"),

    searchPeople: (q: string): Promise<any[]> =>
      apiFetch(`/tmdb/search-person?q=${encodeURIComponent(q)}`),

    streaming: (providerId: number, type: "movie" | "tv", page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/streaming?provider_id=${providerId}&type=${type}&page=${page}`),

    streamingGenre: (providerId: number, type: "movie" | "tv", genreId?: number, page = 1): Promise<TmdbSearchResult> => {
      const genreParam = genreId ? `&genre_id=${genreId}` : "";
      return apiFetch(`/tmdb/streaming-genre?provider_id=${providerId}&type=${type}&page=${page}${genreParam}`);
    },

    keywordDiscover: (keywordId: number, type: "movie" | "tv", page = 1): Promise<TmdbSearchResult> =>
      apiFetch(`/tmdb/discover-keyword?keyword_id=${keywordId}&type=${type}&page=${page}`),

    collection: (id: number) =>
      apiFetch(`/tmdb/collection/${id}`),

    franchiseLogo: async (type: "collection" | "tv" | "movie", id: number): Promise<{ logo_path: string | null }> => {
      try { return await apiFetch(`/tmdb/franchise-logo?type=${type}&id=${id}`); }
      catch { return { logo_path: null }; }
    },

    nowPlaying: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/now-playing"),

    upcoming: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/upcoming"),

    onTheAir: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/on-the-air"),

    airingToday: (): Promise<TmdbItem[]> =>
      apiFetch("/tmdb/airing-today"),

    popularCollections: (page = 1) =>
      apiFetch(`/tmdb/popular-collections?page=${page}`),

    searchCollections: (q: string, page = 1) =>
      apiFetch(`/tmdb/search-collections?q=${encodeURIComponent(q)}&page=${page}`),
  },

};

export const TMDB_IMG = (path: string | null, size: "w185" | "w300" | "w342" | "w500" | "w780" | "w1280" | "original" = "w342") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export function tmdbItemToContent(item: TmdbItem) {
  const isMovie = (item.media_type === "movie" || !!item.title);
  return {
    id: String(item.id),
    tmdbId: item.id,
    title: item.title ?? item.name ?? "Sem título",
    year: Number((item.release_date ?? item.first_air_date ?? "2024").slice(0, 4)),
    releaseDate: item.release_date ?? item.first_air_date ?? "",
    rating: Math.round(item.vote_average * 10) / 10,
    posterPath: TMDB_IMG(item.poster_path, "w342") ?? "",
    backdropPath: TMDB_IMG(item.backdrop_path, "w780") ?? "",
    description: item.overview,
    genres: item.genres?.map((g) => g.name) ?? [],
    type: (isMovie ? "movie" : "series") as "movie" | "series",
    mediaType: (isMovie ? "movie" : "tv") as "movie" | "tv",
  };
}

// ─── TV Guide API ─────────────────────────────────────────────────────────────
// Routes: /api/tv/...  (TVmaze schedule + TMDB discovery)

export const tvApi = {
  getChannels: () =>
    apiFetch<{ ok: boolean; channels: any[] }>("/tv/channels"),

  getGuide: (date?: string) => {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return apiFetch<{ ok: boolean; date: string; byNetwork: Record<string, any> }>(
      `/tv/guide?date=${d}`
    );
  },

  getChannelSchedule: (channelId: string, date?: string) => {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return apiFetch<{ ok: boolean; episodes: any[]; channel: any }>(
      `/tv/channel/${channelId}/schedule?date=${d}`
    );
  },

  getChannelContent: (channelId: string) =>
    apiFetch<{ ok: boolean; shows: any[]; movies: any[]; channel: any }>(
      `/tv/channel/${channelId}/content`
    ),

  getPremieres: () =>
    apiFetch<{ ok: boolean; series: any[]; movies: any[] }>("/tv/premieres"),

  getChannelPremieres: (channelId: string) =>
    apiFetch<{ ok: boolean; series: any[]; movies: any[] }>(`/tv/channel/${channelId}/premieres`),

  getChannelCarousels: (channelId: string) =>
    apiFetch<{
      ok: boolean;
      seriesCarousels: Array<{ id: string; title: string; items: any[] }>;
      movieCarousels: Array<{ id: string; title: string; items: any[] }>;
    }>(`/tv/channel/${channelId}/carousels`),

  getShow: (showId: string | number) =>
    apiFetch<any>(`/tv/show/${showId}`),

  getTodaySchedule: (date?: string) => {
    const d = date ?? new Date().toISOString().slice(0, 10);
    return apiFetch<{
      ok: boolean;
      date: string;
      byChannel: Record<string, TodayEpisode[]>;
      channels: any[];
    }>(`/tv/schedule/today?date=${d}`);
  },
};

export interface TodayEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  airtime: string;
  airstamp: string;
  runtime: number;
  status: "past" | "live" | "upcoming";
  show: {
    id: number;
    name: string;
    genres: string[];
    image: { medium: string; original: string } | null;
    summary: string;
    rating: number | null;
  };
}
