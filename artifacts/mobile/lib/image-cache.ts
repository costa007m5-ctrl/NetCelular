const TMDB_BASE = "https://image.tmdb.org/t/p";

type ImageSize =
  | "w45" | "w92" | "w154" | "w185" | "w300" | "w342" | "w500" | "w780" | "w1280"
  | "h632" | "original";

export function tmdbPoster(path: string | null | undefined, size: ImageSize = "w500"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${TMDB_BASE}/${size}${path}`;
}

export function tmdbBackdrop(path: string | null | undefined, size: ImageSize = "w1280"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${TMDB_BASE}/${size}${path}`;
}

export function tmdbProfile(path: string | null | undefined, size: ImageSize = "w185"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${TMDB_BASE}/${size}${path}`;
}

export function tmdbLogo(path: string | null | undefined, size: ImageSize = "w300"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${TMDB_BASE}/${size}${path}`;
}

/** Safely get a poster or backdrop, preferring backdrop for wide layouts */
export function tmdbImage(
  posterPath: string | null | undefined,
  backdropPath: string | null | undefined,
  prefer: "poster" | "backdrop" = "poster",
  size?: ImageSize
): string {
  if (prefer === "backdrop") {
    return tmdbBackdrop(backdropPath, size ?? "w1280") || tmdbPoster(posterPath, size ?? "w500");
  }
  return tmdbPoster(posterPath, size ?? "w500") || tmdbBackdrop(backdropPath, size ?? "w780");
}
