// Cliente para o catálogo D1 (via API server NETPLAY)
// Todas as chamadas passam por /api/content no api-server

const API_BASE = process.env["EXPO_PUBLIC_API_URL"] ?? `https://${process.env["EXPO_PUBLIC_REPL_ID"]}.${process.env["EXPO_PUBLIC_DOMAIN"] ?? ""}`;

function apiUrl(path: string) {
  return `${API_BASE}/api/content${path}`;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface D1Content {
  id: number;
  tmdb_id: number | null;
  type: "movie" | "tv";
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_year: number | null;
  rating: number;
  genres: string[];
  runtime: number | null;
  total_seasons: number | null;
  is_featured: number;
  is_top10: number;
  top10_rank: number | null;
  status: "active" | "inactive" | "coming_soon";
}

export interface D1Source {
  id: number;
  source_type: "r2" | "terabox" | "m3u8" | "embed" | "hls";
  source_url: string;
  quality: "SD" | "HD" | "FHD" | "4K" | "AUTO";
  language: string;
  label: string | null;
  priority: number;
  season_number: number | null;
  episode_number: number | null;
}

export interface D1Episode {
  id: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  still_path: string | null;
  runtime: number | null;
  air_date: string | null;
}

export interface D1Season {
  id: number;
  season_number: number;
  name: string | null;
  poster_path: string | null;
  episode_count: number;
  air_date: string | null;
}

// ─── Read API ────────────────────────────────────────────────────────────────

export const d1Content = {
  /** Lista catálogo. Filtros: type, featured, top10, search, limit, offset */
  list(params?: {
    type?: "movie" | "tv";
    featured?: boolean;
    top10?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ results: D1Content[]; count: number }> {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.featured) q.set("featured", "1");
    if (params?.top10) q.set("top10", "1");
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    const qs = q.toString();
    return apiFetch(`/?${qs}`);
  },

  /** Busca conteúdo por ID interno do D1 ou por tmdb_id */
  get(id: number, byTmdb = false): Promise<D1Content> {
    return apiFetch(`/${id}${byTmdb ? "?by=tmdb" : ""}`);
  },

  /** Fontes de vídeo de um conteúdo (pode filtrar por temporada/episódio) */
  sources(
    id: number,
    opts?: { season?: number; episode?: number; byTmdb?: boolean }
  ): Promise<{ results: D1Source[] }> {
    const q = new URLSearchParams();
    if (opts?.season != null) q.set("season", String(opts.season));
    if (opts?.episode != null) q.set("episode", String(opts.episode));
    if (opts?.byTmdb) q.set("by", "tmdb");
    const qs = q.toString();
    return apiFetch(`/${id}/sources${qs ? `?${qs}` : ""}`);
  },

  /** Temporadas de uma série */
  seasons(id: number): Promise<{ results: D1Season[] }> {
    return apiFetch(`/${id}/seasons`);
  },

  /** Episódios de uma temporada */
  episodes(id: number, season: number): Promise<{ results: D1Episode[] }> {
    return apiFetch(`/${id}/seasons/${season}/episodes`);
  },

  // ─── Write API (admin) ──────────────────────────────────────────────────

  /** Adiciona ou atualiza um conteúdo (upsert por tmdb_id) */
  upsert(data: Partial<D1Content> & { type: string; title: string }): Promise<{ id: number; ok: boolean }> {
    return apiFetch("/", { method: "POST", body: JSON.stringify(data) });
  },

  /** Importa vários conteúdos de uma vez */
  batchUpsert(items: (Partial<D1Content> & { type: string; title: string })[]): Promise<{ ok: boolean; inserted: number }> {
    return apiFetch("/batch", { method: "POST", body: JSON.stringify({ items }) });
  },

  /** Adiciona uma fonte de vídeo a um conteúdo */
  addSource(
    contentId: number,
    source: Omit<D1Source, "id"> & { season_number?: number | null; episode_number?: number | null }
  ): Promise<{ id: number; ok: boolean }> {
    return apiFetch(`/${contentId}/sources`, { method: "POST", body: JSON.stringify(source) });
  },

  /** Remove uma fonte de vídeo */
  removeSource(contentId: number, sourceId: number): Promise<{ ok: boolean }> {
    return apiFetch(`/${contentId}/sources/${sourceId}`, { method: "DELETE" });
  },

  /** Adiciona episódios a uma temporada */
  addEpisodes(
    contentId: number,
    season: number,
    episodes: Partial<D1Episode>[]
  ): Promise<{ ok: boolean; inserted: number }> {
    return apiFetch(`/${contentId}/seasons/${season}/episodes`, {
      method: "POST",
      body: JSON.stringify({ episodes }),
    });
  },

  /** Remove um conteúdo (e suas fontes e episódios) */
  delete(id: number): Promise<{ ok: boolean }> {
    return apiFetch(`/${id}`, { method: "DELETE" });
  },
};

// ─── Helper: converte D1Content para o formato ContentItem do app ────────────

export function d1ToContentItem(item: D1Content) {
  const TMDB_BASE = "https://image.tmdb.org/t/p";
  return {
    id: String(item.tmdb_id ?? item.id),
    tmdbId: item.tmdb_id ?? item.id,
    title: item.title,
    year: item.release_year ?? 0,
    rating: item.rating,
    posterPath: item.poster_path ? `${TMDB_BASE}/w500${item.poster_path}` : "",
    backdropPath: item.backdrop_path ? `${TMDB_BASE}/w1280${item.backdrop_path}` : "",
    description: item.overview ?? "",
    genres: item.genres ?? [],
    type: item.type === "tv" ? ("series" as const) : ("movie" as const),
    mediaType: item.type as "movie" | "tv",
  };
}
