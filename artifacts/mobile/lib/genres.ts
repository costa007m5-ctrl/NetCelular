export const MOVIE_GENRES: Record<number, string> = {
  28: "Ação",
  12: "Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  99: "Documentário",
  18: "Drama",
  10751: "Família",
  14: "Fantasia",
  36: "História",
  27: "Terror",
  10402: "Música",
  9648: "Mistério",
  10749: "Romance",
  878: "Ficção Científica",
  10770: "Telefilme",
  53: "Thriller",
  10752: "Guerra",
  37: "Faroeste",
};

export const TV_GENRES: Record<number, string> = {
  10759: "Ação & Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  99: "Documentário",
  18: "Drama",
  10751: "Família",
  10762: "Kids",
  9648: "Mistério",
  10763: "Notícias",
  10764: "Reality",
  10765: "Sci-Fi & Fantasia",
  10766: "Novela",
  10767: "Talk Show",
  10768: "Guerra & Política",
  37: "Faroeste",
};

export function getGenreName(id: number, type: "movie" | "tv" = "movie"): string {
  if (type === "tv") return TV_GENRES[id] ?? MOVIE_GENRES[id] ?? String(id);
  return MOVIE_GENRES[id] ?? TV_GENRES[id] ?? String(id);
}

export function genreIdsToNames(ids: (number | string)[], type: "movie" | "tv" = "movie"): string[] {
  return ids.map((id) => getGenreName(Number(id), type));
}

export function genreNamesToIds(names: string[]): number[] {
  const allGenres: Record<string, number> = {};
  const all = { ...MOVIE_GENRES, ...TV_GENRES };
  for (const [id, name] of Object.entries(all)) {
    allGenres[name.toLowerCase()] = Number(id);
  }
  return names
    .map((n) => allGenres[n.toLowerCase()])
    .filter(Boolean) as number[];
}
