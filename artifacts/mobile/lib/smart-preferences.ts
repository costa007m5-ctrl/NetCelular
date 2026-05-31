import AsyncStorage from "@react-native-async-storage/async-storage";

const LEARNED_KEY = "netplay_learned_prefs_v1";
const MANUAL_KEY = "netplay_preferences";
const GENRE_CACHE_PREFIX = "netplay_gcache_";

const TMDB_API_KEY = "8f0beb08cf016ec8de49e454e09879ec";

export const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 10770: "TV Movie",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
};

export interface GenreScore {
  id: number;
  name: string;
  score: number;
  count: number;
}

export interface LearnedPreferences {
  genreScores: GenreScore[];
  contentTypeScores: Record<string, number>;
  watchedCount: number;
  lastUpdated: string;
}

export interface ManualPreferences {
  genres: number[];
  contentTypes: string[];
  decades: string[];
  movies: number[];
  series: number[];
}

async function fetchGenresForItem(tmdbId: number, type: "movie" | "tv"): Promise<number[]> {
  const cacheKey = `${GENRE_CACHE_PREFIX}${type}_${tmdbId}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=pt-BR`
    );
    const data = await res.json();
    const genres: number[] = data.genre_ids ?? data.genres?.map((g: any) => g.id) ?? [];
    if (genres.length) await AsyncStorage.setItem(cacheKey, JSON.stringify(genres));
    return genres;
  } catch {
    return [];
  }
}

export async function learnFromWatchedItem(
  tmdbId: number,
  type: "movie" | "tv",
  genreIds: number[],
  progress = 0.1
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LEARNED_KEY);
    const prefs: LearnedPreferences = raw
      ? JSON.parse(raw)
      : { genreScores: [], contentTypeScores: {}, watchedCount: 0, lastUpdated: "" };

    const weight = Math.min(Math.max(progress, 0.1) + 0.15, 1.0);
    for (const gId of genreIds) {
      const ex = prefs.genreScores.find((g) => g.id === gId);
      if (ex) { ex.score += weight; ex.count += 1; }
      else prefs.genreScores.push({ id: gId, name: GENRE_NAMES[gId] ?? String(gId), score: weight, count: 1 });
    }
    const ctKey = type === "movie" ? "Filmes" : "Séries";
    prefs.contentTypeScores[ctKey] = (prefs.contentTypeScores[ctKey] ?? 0) + 1;
    prefs.watchedCount = (prefs.watchedCount ?? 0) + 1;
    prefs.lastUpdated = new Date().toISOString();
    prefs.genreScores.sort((a, b) => b.score - a.score);
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(prefs));
  } catch {}
}

export async function analyzeWatchHistory(
  items: Array<{ tmdb_id: number; type: string; progress?: number }>
): Promise<void> {
  if (!items.length) return;
  try {
    const scoreMap: Record<number, { score: number; count: number }> = {};
    const ctScores: Record<string, number> = {};
    const BATCH = 4;
    const limited = items.slice(0, 40);

    for (let i = 0; i < limited.length; i += BATCH) {
      const batch = limited.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (item) => {
          const t = item.type === "movie" ? "movie" : "tv";
          const genres = await fetchGenresForItem(item.tmdb_id, t);
          const weight = Math.min(Math.max(item.progress ?? 0.1, 0.1) + 0.15, 1.0);
          for (const gId of genres) {
            if (!scoreMap[gId]) scoreMap[gId] = { score: 0, count: 0 };
            scoreMap[gId].score += weight;
            scoreMap[gId].count += 1;
          }
          const ctKey = t === "movie" ? "Filmes" : "Séries";
          ctScores[ctKey] = (ctScores[ctKey] ?? 0) + 1;
        })
      );
      if (i + BATCH < limited.length) await new Promise((r) => setTimeout(r, 150));
    }

    const genreScores: GenreScore[] = Object.entries(scoreMap)
      .map(([id, { score, count }]) => ({
        id: Number(id), name: GENRE_NAMES[Number(id)] ?? String(id), score, count,
      }))
      .sort((a, b) => b.score - a.score);

    const learned: LearnedPreferences = {
      genreScores,
      contentTypeScores: ctScores,
      watchedCount: items.length,
      lastUpdated: new Date().toISOString(),
    };
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
  } catch {}
}

export async function getLearnedPreferences(): Promise<LearnedPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(LEARNED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function getManualPreferences(): Promise<ManualPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(MANUAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveManualPreferences(prefs: ManualPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(MANUAL_KEY, JSON.stringify(prefs));
  } catch {}
}

export async function getMergedPreferences(): Promise<ManualPreferences | null> {
  try {
    const [manual, learned] = await Promise.all([
      getManualPreferences(),
      getLearnedPreferences(),
    ]);
    if (!manual && !learned) return null;

    const manualGenres: number[] = manual?.genres ?? [];
    const learnedGenres = (learned?.genreScores ?? [])
      .slice(0, 10)
      .map((g) => g.id)
      .filter((id) => !manualGenres.includes(id));

    const fillCount = Math.max(0, 8 - manualGenres.length);
    const mergedGenres = [...manualGenres, ...learnedGenres.slice(0, fillCount)];

    let contentTypes = manual?.contentTypes ?? [];
    if (!contentTypes.length && learned?.contentTypeScores) {
      contentTypes = Object.entries(learned.contentTypeScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([k]) => k);
    }

    return {
      genres: mergedGenres,
      contentTypes,
      decades: manual?.decades ?? [],
      movies: manual?.movies ?? [],
      series: manual?.series ?? [],
    };
  } catch { return null; }
}

export async function clearLearnedPreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEARNED_KEY);
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(GENRE_CACHE_PREFIX));
    if (cacheKeys.length) await AsyncStorage.multiRemove(cacheKeys);
  } catch {}
}
