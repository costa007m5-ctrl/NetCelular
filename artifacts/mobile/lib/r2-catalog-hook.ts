/**
 * lib/r2-catalog-hook.ts
 * Hook compartilhado — busca o catálogo R2/Drive e converte para ContentItem[].
 * Cache em nível de módulo (30 min) — todos os tabs compartilham o mesmo fetch.
 */
import { useState, useEffect } from "react";
import { r2Route } from "./r2-direct";
import type { ContentItem } from "@/constants/content";

const TMDB_POSTER   = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w780";
const TTL_MS        = 30 * 60 * 1000;

interface TmdbInfo {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
}

interface CatalogEntry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  seasons: { number: number; prefix: string; label: string }[];
  tmdb: TmdbInfo | null;
}

function entryToContent(entry: CatalogEntry): ContentItem {
  const t = entry.tmdb;
  const isTv =
    entry.type === "tv" ||
    (entry.seasons && entry.seasons.length > 0) ||
    t?.media_type === "tv";
  const rawYear = (t?.release_date ?? t?.first_air_date ?? "2024").slice(0, 4);
  const year = parseInt(rawYear, 10);
  return {
    id: `r2-${entry.key}`,
    tmdbId: t?.id ?? 0,
    title: t?.title ?? entry.name,
    year: isNaN(year) ? 2024 : year,
    rating: t?.vote_average ?? 0,
    posterPath:   t?.poster_path   ? `${TMDB_POSTER}${t.poster_path}`   : "",
    backdropPath: t?.backdrop_path ? `${TMDB_BACKDROP}${t.backdrop_path}` : "",
    description: t?.overview ?? "",
    genres: [],
    type:      isTv ? "series" : "movie",
    mediaType: isTv ? "tv"     : "movie",
  };
}

// ─── Module-level shared cache + in-flight deduplication ─────────────────────

let _cache: { movies: ContentItem[]; series: ContentItem[]; builtAt: number } | null = null;
let _pending: Promise<{ movies: ContentItem[]; series: ContentItem[] }> | null = null;

export async function fetchR2Items(): Promise<{ movies: ContentItem[]; series: ContentItem[] }> {
  if (_cache && Date.now() - _cache.builtAt < TTL_MS) {
    return { movies: _cache.movies, series: _cache.series };
  }
  if (_pending) return _pending;

  _pending = (async () => {
    try {
      const res = await r2Route<{ catalog: CatalogEntry[] }>("/catalog");
      const entries: CatalogEntry[] = res?.catalog ?? [];

      // Only show entries that have TMDB metadata (i.e. poster/backdrop available)
      const valid = entries.filter((e) => e.tmdb?.poster_path || e.tmdb?.backdrop_path);

      const movies = valid
        .filter((e) => e.type === "movie" || (e.type === "unknown" && e.tmdb?.media_type === "movie"))
        .map(entryToContent);

      const series = valid
        .filter(
          (e) =>
            e.type === "tv" ||
            (e.seasons && e.seasons.length > 0) ||
            (e.type === "unknown" && e.tmdb?.media_type === "tv"),
        )
        .map(entryToContent);

      _cache = { movies, series, builtAt: Date.now() };
      return { movies, series };
    } catch {
      return { movies: [], series: [] };
    } finally {
      _pending = null;
    }
  })();

  return _pending;
}

/** Invalida o cache (chame após adicionar novos itens ao Drive) */
export function invalidateR2Cache(): void {
  _cache = null;
  _pending = null;
}

// ─── React Hook ───────────────────────────────────────────────────────────────

export function useR2Catalog() {
  const [r2Movies, setR2Movies] = useState<ContentItem[]>(_cache?.movies ?? []);
  const [r2Series, setR2Series] = useState<ContentItem[]>(_cache?.series ?? []);
  const [r2Loading, setR2Loading] = useState<boolean>(!_cache);
  const [r2Error,   setR2Error]  = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    // If we already have a warm cache, reflect it immediately
    if (_cache) {
      setR2Movies(_cache.movies);
      setR2Series(_cache.series);
      setR2Loading(false);
    }

    fetchR2Items()
      .then(({ movies, series }) => {
        if (cancelled) return;
        setR2Movies(movies);
        setR2Series(series);
        setR2Loading(false);
        setR2Error(false);
      })
      .catch(() => {
        if (!cancelled) {
          setR2Loading(false);
          setR2Error(true);
        }
      });

    return () => { cancelled = true; };
  }, []);

  const r2All = [...r2Movies, ...r2Series];

  return { r2Movies, r2Series, r2All, r2Loading, r2Error };
}
