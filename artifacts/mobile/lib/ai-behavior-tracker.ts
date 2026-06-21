import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/lib/supabase";

const TRACKER_KEY = "netplay_ai_behavior_v1";
const MAX_EVENTS  = 200;
const SYNC_DEBOUNCE_MS = 8000;
const SYNC_EVERY_N_EVENTS = 10;

export type BehaviorEvent =
  | { type: "open";   tmdbId: number; title: string; contentType: string; genres: number[]; ts: number }
  | { type: "watch";  tmdbId: number; progress: number; ts: number }
  | { type: "like";   tmdbId: number; liked: boolean; ts: number }
  | { type: "search"; query: string; ts: number }
  | { type: "tab";    tab: string; ts: number };

export interface BehaviorProfile {
  topGenres: number[];
  topTitles: string[];
  recentSearches: string[];
  prefersMovies: boolean;
  prefersSeries: boolean;
  prefersAnime: boolean;
  likedIds: number[];
  dislikedIds: number[];
  watchedIds: number[];
  tabFrequency: Record<string, number>;
  totalEvents: number;
}

let _events: BehaviorEvent[] = [];
let _loaded = false;
let _userId: string | null = null;
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _eventsSinceLastSync = 0;

export function setBehaviorUserId(userId: string | null): void {
  _userId = userId;
}

async function ensureLoaded(): Promise<void> {
  if (_loaded) return;
  try {
    const raw = await AsyncStorage.getItem(TRACKER_KEY);
    _events = raw ? (JSON.parse(raw) as BehaviorEvent[]) : [];
  } catch {
    _events = [];
  }
  _loaded = true;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(TRACKER_KEY, JSON.stringify(_events.slice(-MAX_EVENTS)));
  } catch {}
}

function scheduleSyncToSupabase(): void {
  if (!_userId) return;
  _eventsSinceLastSync++;
  if (_eventsSinceLastSync < SYNC_EVERY_N_EVENTS) return;

  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    syncBehaviorToSupabase(_userId!).catch(() => {});
  }, SYNC_DEBOUNCE_MS);
}

function addEvent(event: BehaviorEvent): void {
  _events.push(event);
  if (_events.length > MAX_EVENTS * 1.2) {
    _events = _events.slice(-MAX_EVENTS);
  }
  persist();
  scheduleSyncToSupabase();
}

export async function trackOpen(tmdbId: number, title: string, contentType: string, genres: number[] = []): Promise<void> {
  await ensureLoaded();
  addEvent({ type: "open", tmdbId, title, contentType, genres, ts: Date.now() });
}

export async function trackWatch(tmdbId: number, progress: number): Promise<void> {
  await ensureLoaded();
  addEvent({ type: "watch", tmdbId, progress, ts: Date.now() });
}

export async function trackLike(tmdbId: number, liked: boolean): Promise<void> {
  await ensureLoaded();
  addEvent({ type: "like", tmdbId, liked, ts: Date.now() });
}

export async function trackSearch(query: string): Promise<void> {
  if (!query || query.trim().length < 2) return;
  await ensureLoaded();
  addEvent({ type: "search", query: query.trim().slice(0, 100), ts: Date.now() });
}

export async function trackTab(tab: string): Promise<void> {
  await ensureLoaded();
  addEvent({ type: "tab", tab, ts: Date.now() });
}

export async function getBehaviorProfile(): Promise<BehaviorProfile> {
  await ensureLoaded();

  const genreCount: Record<number, number>   = {};
  const titlesSeen:  Map<number, string>      = new Map();
  const searches:    string[]                  = [];
  const likedIds:    number[]                  = [];
  const dislikedIds: number[]                  = [];
  const watchedIds:  number[]                  = [];
  const tabFreq:     Record<string, number>    = {};
  let   movieOpens  = 0;
  let   tvOpens     = 0;
  let   animeOpens  = 0;

  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - NINETY_DAYS;

  for (const ev of _events) {
    if (ev.ts < cutoff) continue;

    if (ev.type === "open") {
      titlesSeen.set(ev.tmdbId, ev.title);
      for (const g of ev.genres) {
        genreCount[g] = (genreCount[g] ?? 0) + 1;
      }
      const ct = ev.contentType.toLowerCase();
      if (ct === "movie" || ct === "filme") movieOpens++;
      else if (ct === "anime") animeOpens++;
      else tvOpens++;
    }

    if (ev.type === "watch" && ev.progress > 0.1) {
      if (!watchedIds.includes(ev.tmdbId)) watchedIds.push(ev.tmdbId);
    }

    if (ev.type === "like") {
      if (ev.liked) {
        if (!likedIds.includes(ev.tmdbId)) likedIds.push(ev.tmdbId);
      } else {
        if (!dislikedIds.includes(ev.tmdbId)) dislikedIds.push(ev.tmdbId);
      }
    }

    if (ev.type === "search") {
      if (!searches.includes(ev.query)) searches.push(ev.query);
    }

    if (ev.type === "tab") {
      tabFreq[ev.tab] = (tabFreq[ev.tab] ?? 0) + 1;
    }
  }

  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => Number(id));

  const topTitles = [...titlesSeen.values()].slice(-15);

  const total = movieOpens + tvOpens + animeOpens;
  const prefersMovies  = total === 0 ? true  : movieOpens  >= tvOpens && movieOpens  >= animeOpens;
  const prefersSeries  = total === 0 ? false : tvOpens     >  movieOpens;
  const prefersAnime   = total === 0 ? false : animeOpens  >  movieOpens && animeOpens > tvOpens;

  return {
    topGenres,
    topTitles,
    recentSearches: searches.slice(-10).reverse(),
    prefersMovies,
    prefersSeries,
    prefersAnime,
    likedIds: likedIds.slice(-20),
    dislikedIds: dislikedIds.slice(-10),
    watchedIds: watchedIds.slice(-30),
    tabFrequency: tabFreq,
    totalEvents: _events.length,
  };
}

export async function syncBehaviorToSupabase(userId: string): Promise<void> {
  try {
    const profile = await getBehaviorProfile();
    await db.aiProfile.upsert(userId, {
      top_genres:      profile.topGenres,
      top_titles:      profile.topTitles,
      recent_searches: profile.recentSearches,
      prefers_movies:  profile.prefersMovies,
      prefers_series:  profile.prefersSeries,
      prefers_anime:   profile.prefersAnime,
      liked_ids:       profile.likedIds,
      disliked_ids:    profile.dislikedIds,
      watched_ids:     profile.watchedIds,
      tab_frequency:   profile.tabFrequency,
      total_events:    profile.totalEvents,
    });
    _eventsSinceLastSync = 0;
  } catch {}
}

export async function loadBehaviorFromSupabase(userId: string): Promise<void> {
  try {
    await ensureLoaded();
    if (_events.length >= 20) return;

    const remote = await db.aiProfile.get(userId);
    if (!remote || remote.total_events === 0) return;

    const now = Date.now();
    const syntheticEvents: BehaviorEvent[] = [];

    for (const title of remote.top_titles) {
      syntheticEvents.push({ type: "open", tmdbId: 0, title, contentType: remote.prefers_anime ? "anime" : remote.prefers_series ? "tv" : "movie", genres: remote.top_genres.slice(0, 3), ts: now - 1000 });
    }
    for (const id of remote.liked_ids) {
      syntheticEvents.push({ type: "like", tmdbId: id, liked: true, ts: now - 2000 });
    }
    for (const id of remote.disliked_ids) {
      syntheticEvents.push({ type: "like", tmdbId: id, liked: false, ts: now - 2000 });
    }
    for (const id of remote.watched_ids) {
      syntheticEvents.push({ type: "watch", tmdbId: id, progress: 0.5, ts: now - 3000 });
    }
    for (const q of remote.recent_searches) {
      syntheticEvents.push({ type: "search", query: q, ts: now - 4000 });
    }

    const existingIds = new Set(_events.map((e) => `${e.type}-${(e as any).tmdbId ?? (e as any).query ?? (e as any).tab}`));
    const newEvents = syntheticEvents.filter((e) => !existingIds.has(`${e.type}-${(e as any).tmdbId ?? (e as any).query ?? (e as any).tab}`));

    if (newEvents.length > 0) {
      _events = [...newEvents, ..._events].slice(-MAX_EVENTS);
      await persist();
    }
  } catch {}
}

export async function clearBehaviorData(userId?: string): Promise<void> {
  _events = [];
  _eventsSinceLastSync = 0;
  try { await AsyncStorage.removeItem(TRACKER_KEY); } catch {}
  if (userId) {
    try { await db.aiProfile.delete(userId); } catch {}
  }
}
