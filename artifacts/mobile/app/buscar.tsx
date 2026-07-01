import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import NetplayLoaderV29 from "@/components/NetplayLoaderV29";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { ContentItem } from "@/constants/content";
import { r2Base } from "@/lib/r2-direct";
import { useR2Catalog } from "@/lib/r2-catalog-hook";
import { getCached } from "@/lib/catalog-cache";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { geminiSmartSearch, geminiSuggestions, checkGeminiAvailable } from "@/lib/gemini-client";

const HISTORY_KEY = "buscar_history_v1";
const MAX_HISTORY  = 8;

async function loadHistory(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(HISTORY_KEY)) ?? "[]"); }
  catch { return []; }
}
async function saveHistory(history: string[]): Promise<void> {
  try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  catch {}
}
function addToHistory(prev: string[], q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed || trimmed.length < 2) return prev;
  const next = [trimmed, ...prev.filter(h => h.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_HISTORY);
  saveHistory(next);
  return next;
}

// ─── Fuzzy search utilities ───────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const val = a[i - 1] === b[j - 1]
        ? dp[j - 1]
        : 1 + Math.min(dp[j], prev, dp[j - 1]);
      dp[j - 1] = prev;
      prev = val;
    }
    dp[n] = prev;
  }
  return dp[n];
}

function fuzzyScore(title: string, query: string): number {
  const nt = normalize(title);
  const nq = normalize(query);
  if (!nq) return 0;
  if (nt === nq) return 100;
  if (nt.startsWith(nq)) return 92;
  if (nt.includes(nq)) return 84;

  const tWords = nt.split(" ");
  const qWords = nq.split(" ").filter(w => w.length > 1);
  if (qWords.length === 0) return 0;

  // Word-level fuzzy: each query word matches a title word (prefix OR edit dist ≤ 1)
  const hits = qWords.filter(qw =>
    tWords.some(tw => tw.startsWith(qw) || (qw.length >= 4 && levenshtein(qw, tw.slice(0, qw.length + 1)) <= 1))
  ).length;

  if (hits === qWords.length) return 76;
  if (hits >= Math.ceil(qWords.length * 0.6)) return 55 + (hits / qWords.length) * 18;

  // Whole-string Levenshtein (capped for perf)
  const cap = 28;
  const dist = levenshtein(nt.slice(0, cap), nq.slice(0, cap));
  const maxLen = Math.max(Math.min(nt.length, cap), Math.min(nq.length, cap), 1);
  const sim = 1 - dist / maxLen;
  if (sim >= 0.72) return 30 + sim * 18;

  return 0;
}

// Maps Portuguese terms to English search equivalents for TMDB
const KEYWORD_MAP: [RegExp, string][] = [
  [/terror|medo|assusta/,             "horror"],
  [/super.?her[oó]i?s?/,             "superhero"],
  [/ficç[aã]o\s*cient[ií]fica|sci.?fi|espaço|nave\s+espacial/, "science fiction"],
  [/anim[eê]s?|manga/,               "anime"],
  [/anim[aã]ç[aã]o|infantil|pixar/,  "animation"],
  [/document[aá]rio|documentais/,     "documentary"],
  [/com[eé]dia|engraçad|rir\b/,      "comedy"],
  [/romance|amor|casal/,              "romance"],
  [/suspense|thriller/,               "thriller"],
  [/western|faroeste/,               "western"],
  [/musical|m[uú]sica/,              "music"],
  [/esporte|futebol|basquete/,        "sport"],
  [/guerra|batalha|milit/,            "war"],
  [/hist[oó]rico|[eé]poca|medieval/,  "historical"],
  [/policial|crime|detetive/,         "crime"],
  [/a[çc][aã]o|aventura/,            "action adventure"],
  [/drama|s[eé]rio/,                  "drama"],
];

function expandQuery(q: string): string {
  const nq = normalize(q);
  for (const [pattern, replacement] of KEYWORD_MAP) {
    if (pattern.test(nq)) return replacement;
  }
  return q;
}

// Strip [L], [D], (2026) etc. for fuzzy title comparison
const cleanT = (s: string) =>
  s.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").replace(/[:\-–]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

type Flix2RawItem = { title: string; _type: string; thumbnail?: string | null; tmdb_id?: number; category_name?: string };

async function flix2Search(q: string): Promise<{ titles: Set<string>; raw: Flix2RawItem[] }> {
  try {
    const base = r2Base();
    const url = base
      ? `${base}/flix2/search?q=${encodeURIComponent(q)}&type=all&limit=40&maxPages=20`
      : `/api/r2/flix2/search?q=${encodeURIComponent(q)}&type=all&limit=40&maxPages=20`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return { titles: new Set(), raw: [] };
    const data = await res.json();
    const titles = new Set<string>();
    const raw: Flix2RawItem[] = [];
    for (const item of (data.results ?? [])) {
      if (item.title) {
        titles.add(item.title.toLowerCase().trim());
        raw.push({ title: item.title, _type: item._type ?? "movie", thumbnail: item.poster ?? item.thumbnail ?? null, tmdb_id: item.tmdb_id ?? 0, category_name: item.category_name ?? "" });
      }
    }
    return { titles, raw };
  } catch {
    return { titles: new Set(), raw: [] };
  }
}

async function searchFromCache(q: string): Promise<{ titles: Set<string>; raw: Flix2RawItem[] }> {
  const nq = normalize(q);
  const [movies, series, animes] = await Promise.all([
    getCached("movies"),
    getCached("series"),
    getCached("animes"),
  ]);
  const scored: Array<{ score: number; item: Flix2RawItem }> = [];
  const seen = new Set<string>();

  const pushItems = (items: any[] | null, type: string) => {
    if (!items) return;
    for (const item of items) {
      if (!item.title) continue;
      const score = fuzzyScore(item.title, q);
      if (score < 30) continue;
      const key = normalize(item.title);
      if (seen.has(key)) continue;
      seen.add(key);
      scored.push({
        score,
        item: { title: item.title, _type: type, thumbnail: item.poster ?? item.thumbnail ?? null, tmdb_id: item.tmdb_id ?? 0, category_name: item.category_name ?? "" },
      });
    }
  };

  pushItems(movies, "movie");
  pushItems(series, "series");
  pushItems(animes, "anime");
  scored.sort((a, b) => b.score - a.score);

  const titles = new Set<string>();
  const raw = scored.slice(0, 60).map(({ item }) => {
    titles.add(item.title.toLowerCase().trim());
    return item;
  });
  return { titles, raw };
}

const { width: W } = Dimensions.get("window");
const RED   = "#e50914";
const GREEN = "#22c55e";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY  = "8f0beb08cf016ec8de49e454e09879ec";
const IMG_W500  = "https://image.tmdb.org/t/p/w500";
const IMG_W780  = "https://image.tmdb.org/t/p/w780";

async function tfetch(path: string, params: Record<string, string> = {}): Promise<any> {
  try {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("language", "pt-BR");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) return { results: [] };
    return r.json();
  } catch { return { results: [] }; }
}

function toItem(raw: any, forcedType?: "movie" | "tv"): ContentItem {
  const isMovie = forcedType
    ? forcedType === "movie"
    : (raw.media_type === "movie" || !!(raw.title && !raw.name));
  const year = parseInt(((raw.release_date ?? raw.first_air_date) || "2024").slice(0, 4));
  return {
    id: String(raw.id),
    tmdbId: raw.id,
    title: raw.title ?? raw.name ?? "",
    year,
    rating: raw.vote_average ?? 0,
    posterPath: raw.poster_path ? `${IMG_W500}${raw.poster_path}` : "",
    backdropPath: raw.backdrop_path ? `${IMG_W780}${raw.backdrop_path}` : "",
    description: raw.overview ?? "",
    genres: raw.genre_ids ?? [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
}

// Maps TMDB genre ids → pt-BR labels, used to group search results into
// Netflix-style horizontal category rows.
const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 53: "Suspense",
  10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
  10765: "Sci-Fi & Fantasia", 10766: "Novela", 10767: "Talk Show",
  10768: "Guerra & Política", 10762: "Infantil", 10763: "Notícias",
  10764: "Reality",
};

// ─── Quick suggestion chips shown when idle ────────────────────────────────────
const SUGGESTIONS = [
  { label: "Marvel",     emoji: "⚡", q: "Marvel" },
  { label: "Terror",     emoji: "👻", q: "terror" },
  { label: "Anime",      emoji: "⛩️", q: "anime" },
  { label: "Comédia",    emoji: "😂", q: "comédia" },
  { label: "Sci-Fi",     emoji: "🚀", q: "ficção científica" },
  { label: "Disney",     emoji: "✨", q: "Disney" },
  { label: "Crime",      emoji: "🔍", q: "crime policial" },
  { label: "Drama",      emoji: "🎭", q: "drama" },
];

// ─── Components ───────────────────────────────────────────────────────────────

function PosterCard({ item, onPress, inFlix2 = false, variantLabel }: {
  item: ContentItem;
  onPress: () => void;
  inFlix2?: boolean;
  variantLabel?: string;
}) {
  const variantColor = variantLabel === "LEG" ? "#3b82f6" : variantLabel === "DUB" ? "#f59e0b" : "#6366f1";
  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={s.cardImg}>
        {item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020", "#0e0810"]}
            style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={24} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={StyleSheet.absoluteFill} locations={[0.55, 1]} />

        {/* type badge */}
        <View style={[s.typeBadge, item.mediaType === "movie" && { backgroundColor: "rgba(229,9,20,0.82)" }]}>
          <Text style={s.typeBadgeText}>{item.mediaType === "tv" ? "SÉRIE" : "FILME"}</Text>
        </View>

        {/* rating */}
        {item.rating >= 7 && (
          <View style={s.ratingBadge}>
            <Text style={s.ratingText}>★ {item.rating.toFixed(1)}</Text>
          </View>
        )}

        {/* variant / flix2 badge */}
        {variantLabel ? (
          <View style={[s.variantBadge, { backgroundColor: `${variantColor}dd`, borderColor: `${variantColor}88` }]}>
            <Feather name={variantLabel === "LEG" ? "align-left" : "volume-2"} size={7} color="#fff" />
            <Text style={s.variantBadgeText}>{variantLabel}</Text>
          </View>
        ) : inFlix2 ? (
          <View style={s.flix2Badge}>
            <Feather name="zap" size={8} color="#fff" />
            <Text style={s.flix2BadgeText}>FLIX</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.cardTitle} numberOfLines={2}>
        {variantLabel
          ? item.title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").trim()
          : item.title}
      </Text>
      <Text style={s.cardYear}>{item.year}</Text>
    </Pressable>
  );
}

function Flix2OnlyCard({ item, siblings, onPress }: { item: Flix2RawItem; siblings?: Flix2RawItem[]; onPress?: () => void }) {
  const typeLabel = item._type === "series" ? "SÉRIE" : item._type === "anime" ? "ANIME" : "FILME";
  const typeBg =
    item._type === "series" ? "rgba(8,145,178,0.85)" :
    item._type === "anime"  ? "rgba(234,88,12,0.85)"  : "rgba(229,9,20,0.85)";
  const catName = (item.category_name ?? "").toLowerCase();
  const isLeg = /\[L\]/i.test(item.title) || /legendado/i.test(catName);
  const isDub = /\[D\b|Dub\b/i.test(item.title) || /dublado/i.test(catName);
  // If a sibling with [L] exists and this one has no [L], it's the DUB version
  const hasSiblingLeg = !isLeg && (siblings ?? []).some(s => /\[L\]/i.test(s.title) || /legendado/i.test((s.category_name ?? "").toLowerCase()));
  const variantLabel = isLeg ? "LEG" : isDub || hasSiblingLeg ? "DUB" : null;
  const variantColor = isLeg ? "#3b82f6" : "#f59e0b";
  const cleanTitle = item.title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").trim();

  const inner = (
    <>
      <View style={s.cardImg}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020", "#0e0810"]}
            style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={24} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={StyleSheet.absoluteFill} locations={[0.55, 1]} />
        <View style={[s.typeBadge, { backgroundColor: typeBg }]}>
          <Text style={s.typeBadgeText}>{typeLabel}</Text>
        </View>
        {variantLabel ? (
          <View style={[s.variantBadge, { backgroundColor: `${variantColor}dd`, borderColor: `${variantColor}88` }]}>
            <Feather name={isLeg ? "align-left" : "volume-2"} size={7} color="#fff" />
            <Text style={s.variantBadgeText}>{variantLabel}</Text>
          </View>
        ) : (
          <View style={s.flix2Badge}>
            <Feather name="zap" size={8} color="#fff" />
            <Text style={s.flix2BadgeText}>FLIX</Text>
          </View>
        )}
      </View>
      <Text style={s.cardTitle} numberOfLines={2}>{cleanTitle}</Text>
      <Text style={s.cardYear}>{typeLabel[0] + typeLabel.slice(1).toLowerCase()}</Text>
    </>
  );

  return onPress
    ? <Pressable style={s.card} onPress={onPress}>{inner}</Pressable>
    : <View style={[s.card, { opacity: 0.9 }]}>{inner}</View>;
}

// Netflix-style horizontal landscape card (used for "Principais sugestões"
// and genre rows in search results, plus Flix2/Drive rows).
function LandscapeCard({ item, onPress, variantLabel, inFlix2 }: {
  item: ContentItem;
  onPress: () => void;
  variantLabel?: string;
  inFlix2?: boolean;
}) {
  const variantColor = variantLabel === "LEG" ? "#3b82f6" : variantLabel === "DUB" ? "#f59e0b" : "#6366f1";
  const img = item.backdropPath || item.posterPath;
  return (
    <Pressable style={s.landCard} onPress={onPress}>
      <View style={s.landImg}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020", "#0e0810"]}
            style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={22} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFill} locations={[0.5, 1]} />
        <View style={[s.typeBadge, item.mediaType === "movie" && { backgroundColor: "rgba(229,9,20,0.82)" }]}>
          <Text style={s.typeBadgeText}>{item.mediaType === "tv" ? "SÉRIE" : "FILME"}</Text>
        </View>
        {item.rating >= 7 && (
          <View style={s.ratingBadge}>
            <Text style={s.ratingText}>★ {item.rating.toFixed(1)}</Text>
          </View>
        )}
        {variantLabel ? (
          <View style={[s.variantBadge, { backgroundColor: `${variantColor}dd`, borderColor: `${variantColor}88` }]}>
            <Feather name={variantLabel === "LEG" ? "align-left" : "volume-2"} size={7} color="#fff" />
            <Text style={s.variantBadgeText}>{variantLabel}</Text>
          </View>
        ) : inFlix2 ? (
          <View style={s.flix2Badge}>
            <Feather name="zap" size={8} color="#fff" />
            <Text style={s.flix2BadgeText}>FLIX</Text>
          </View>
        ) : null}
        <View style={s.landPlayBtn}>
          <Feather name="play" size={13} color="#fff" />
        </View>
      </View>
      <Text style={s.landTitle} numberOfLines={1}>
        {variantLabel
          ? item.title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").trim()
          : item.title}
      </Text>
    </Pressable>
  );
}

function Flix2LandscapeCard({ item, siblings, onPress }: { item: Flix2RawItem; siblings?: Flix2RawItem[]; onPress?: () => void }) {
  const typeLabel = item._type === "series" ? "SÉRIE" : item._type === "anime" ? "ANIME" : "FILME";
  const typeBg =
    item._type === "series" ? "rgba(8,145,178,0.85)" :
    item._type === "anime"  ? "rgba(234,88,12,0.85)"  : "rgba(229,9,20,0.85)";
  const catName = (item.category_name ?? "").toLowerCase();
  const isLeg = /\[L\]/i.test(item.title) || /legendado/i.test(catName);
  const isDub = /\[D\b|Dub\b/i.test(item.title) || /dublado/i.test(catName);
  const hasSiblingLeg = !isLeg && (siblings ?? []).some(s => /\[L\]/i.test(s.title) || /legendado/i.test((s.category_name ?? "").toLowerCase()));
  const variantLabel = isLeg ? "LEG" : isDub || hasSiblingLeg ? "DUB" : null;
  const variantColor = isLeg ? "#3b82f6" : "#f59e0b";
  const cleanTitle = item.title.replace(/\s*\[[^\]]*\]/g, "").replace(/\s*\(\d{4}\)/g, "").trim();

  return (
    <Pressable style={s.landCard} onPress={onPress}>
      <View style={s.landImg}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020", "#0e0810"]}
            style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={22} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={StyleSheet.absoluteFill} locations={[0.5, 1]} />
        <View style={[s.typeBadge, { backgroundColor: typeBg }]}>
          <Text style={s.typeBadgeText}>{typeLabel}</Text>
        </View>
        {variantLabel ? (
          <View style={[s.variantBadge, { backgroundColor: `${variantColor}dd`, borderColor: `${variantColor}88` }]}>
            <Feather name={isLeg ? "align-left" : "volume-2"} size={7} color="#fff" />
            <Text style={s.variantBadgeText}>{variantLabel}</Text>
          </View>
        ) : (
          <View style={s.flix2Badge}>
            <Feather name="zap" size={8} color="#fff" />
            <Text style={s.flix2BadgeText}>FLIX</Text>
          </View>
        )}
        <View style={s.landPlayBtn}>
          <Feather name="play" size={13} color="#fff" />
        </View>
      </View>
      <Text style={s.landTitle} numberOfLines={1}>{cleanTitle}</Text>
    </Pressable>
  );
}

// Netflix-style vertical row shown on the idle "recomendados" list
function RecommendedRow({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const img = item.backdropPath || item.posterPath;
  return (
    <Pressable style={s.recRow} onPress={onPress}>
      <View style={s.recThumb}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020", "#0e0810"]} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <Text style={s.recTitle} numberOfLines={2}>{item.title}</Text>
      <View style={s.recPlayBtn}>
        <Feather name="play" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BuscarScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const params   = useLocalSearchParams<{ q?: string }>();
  const inputRef = useRef<TextInput>(null);
  const topPad   = insets.top + (Platform.OS === "web" ? 67 : 0);

  const { r2All } = useR2Catalog();

  // Tracks vote_count per TMDB id — used to resolve Flix2 ownership among duplicate titles
  const voteCountRef = useRef<Map<string, number>>(new Map());

  const [query,           setQuery]           = useState(params.q ?? "");
  const [results,         setResults]         = useState<ContentItem[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [flix2Titles,     setFlix2Titles]     = useState<Set<string>>(new Set());
  const [flix2Raw,        setFlix2Raw]        = useState<Flix2RawItem[]>([]);
  const [flix2Loading,    setFlix2Loading]    = useState(false);
  const [searchHistory,   setSearchHistory]   = useState<string[]>([]);
  const [geminiSuggs,     setGeminiSuggs]     = useState<string[]>([]);
  const [geminiCorrection, setGeminiCorrection] = useState<string | null>(null);
  const [geminiEnabled,   setGeminiEnabled]   = useState(false);
  const [recommended,        setRecommended]        = useState<ContentItem[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(true);

  // Animations
  const barFade  = useRef(new Animated.Value(0)).current;
  const resFade  = useRef(new Animated.Value(0)).current;
  const idleFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadHistory().then(setSearchHistory);
    Animated.timing(barFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    setTimeout(() => inputRef.current?.focus(), 350);
    checkGeminiAvailable().then(setGeminiEnabled);
  }, []);

  // Recommended list shown on the idle "Buscar" screen (Netflix-style)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [trend1, trend2] = await Promise.all([
          tfetch("/trending/all/week", { page: "1" }),
          tfetch("/trending/all/week", { page: "2" }),
        ]);
        if (cancelled) return;
        const seen = new Set<string>();
        const items: ContentItem[] = [];
        for (const raw of [...(trend1.results ?? []), ...(trend2.results ?? [])]) {
          if (raw.media_type !== "movie" && raw.media_type !== "tv") continue;
          if (seen.has(String(raw.id))) continue;
          seen.add(String(raw.id));
          items.push(toItem(raw));
        }
        setRecommended(items);
      } finally {
        if (!cancelled) setRecommendedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Search logic ────────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setFlix2Titles(new Set());
      setFlix2Raw([]);
      setGeminiCorrection(null);
      // fade in idle, fade out results
      Animated.parallel([
        Animated.timing(idleFade, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(resFade,  { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
      return;
    }

    // fade out idle
    Animated.timing(idleFade, { toValue: 0, duration: 150, useNativeDriver: true }).start();

    setLoading(true);
    setFlix2Loading(true);
    setGeminiCorrection(null);

    let cancelled = false;
    let cacheHit  = false;

    const cacheSearch = searchFromCache(q).then((cached) => {
      if (cancelled) return;
      cacheHit = cached.raw.length > 0;
      if (cacheHit) {
        setFlix2Titles(cached.titles);
        setFlix2Raw(cached.raw);
        setFlix2Loading(false);
      }
    });

    // Gemini smart search runs in parallel with cache search
    const geminiPromise = geminiEnabled
      ? geminiSmartSearch(q)
      : Promise.resolve(null);

    const localExpandedQ = expandQuery(q);

    const timer = setTimeout(async () => {
      await cacheSearch;
      if (cancelled) return;

      // Use Gemini expansion if available, otherwise fall back to local keyword map
      const geminiResult = await geminiPromise;
      if (cancelled) return;

      let searchQ = localExpandedQ !== q ? localExpandedQ : q;
      let englishQ = q;

      if (geminiResult) {
        englishQ = geminiResult.englishQuery || q;
        if (geminiResult.corrected && geminiResult.expandedQuery !== q) {
          setGeminiCorrection(geminiResult.expandedQuery);
        }
        // Use Gemini suggestions as quick chips
        if (geminiResult.suggestions?.length > 0) {
          setGeminiSuggs(geminiResult.suggestions);
        }
      }

      const queryVariants = new Set([q, searchQ, englishQ].filter(Boolean));

      const tasks: Promise<any>[] = [
        tfetch("/search/multi", { query: englishQ, include_adult: "false", page: "1" }),
        ...(queryVariants.size > 1 && searchQ !== englishQ
          ? [tfetch("/search/multi", { query: searchQ, include_adult: "false", page: "1" })]
          : []),
      ];
      if (!cacheHit) tasks.push(flix2Search(q));

      const settled = await Promise.allSettled(tasks);
      if (cancelled) return;

      // Merge TMDB results from both queries, dedup by id
      const seen = new Set<string>();
      const merged: ContentItem[] = [];
      const newVoteCounts = new Map<string, number>();
      for (const r of settled.slice(0, 2)) {
        if (r.status !== "fulfilled") continue;
        for (const x of (r.value.results ?? [])) {
          if (x.media_type !== "movie" && x.media_type !== "tv") continue;
          if (seen.has(String(x.id))) continue;
          seen.add(String(x.id));
          newVoteCounts.set(String(x.id), x.vote_count ?? 0);
          merged.push(toItem(x));
        }
      }
      voteCountRef.current = newVoteCounts;

      // Re-rank by fuzzy score (keeps TMDB relevance for top results, surfaces fuzzy matches)
      const scoredMerged = merged.map(item => ({ item, score: fuzzyScore(item.title, q) }));
      scoredMerged.sort((a, b) => {
        const diff = b.score - a.score;
        if (Math.abs(diff) < 5) return 0;
        return diff;
      });
      setResults(scoredMerged.map(x => x.item));

      if (merged.length > 0 || cacheHit) {
        setSearchHistory(prev => addToHistory(prev, q));
      }
      setLoading(false);

      if (!cacheHit && settled.length > 2) {
        const flix2R = settled[2];
        if (flix2R.status === "fulfilled") {
          setFlix2Titles(flix2R.value.titles);
          setFlix2Raw(flix2R.value.raw);
          setFlix2Loading(false);
        }
      }

      Animated.timing(resFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, geminiEnabled]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId || 0), title: item.title, poster: item.posterPath ?? "" },
    });
  }, [router]);

  const isSearching = query.trim().length >= 2;

  // ── Build merged result list ────────────────────────────────────────────────
  const { expandedItems, flix2OnlyRaw, driveItems } = (() => {
    const flix2ByClean = new Map<string, Flix2RawItem[]>();
    for (const f of flix2Raw) {
      const k = cleanT(f.title);
      if (!flix2ByClean.has(k)) flix2ByClean.set(k, []);
      flix2ByClean.get(k)!.push(f);
    }

    // Pre-compute which TMDB item "owns" each Flix2 title when multiple results
    // share the same normalized title (e.g. remakes, same name different years).
    // The one with the highest vote_count is the primary claimant — it represents
    // the established/classic film that's actually streamable in the IPTV catalog.
    const primaryFlix2Owner = new Map<string, string>(); // normalizedTitle → item.id
    for (const item of results) {
      const key = cleanT(item.title);
      if (!flix2ByClean.has(key)) continue;
      const existing = primaryFlix2Owner.get(key);
      if (!existing) {
        primaryFlix2Owner.set(key, item.id);
      } else {
        const existingCount = voteCountRef.current.get(existing) ?? 0;
        const thisCount     = voteCountRef.current.get(item.id)  ?? 0;
        if (thisCount > existingCount) primaryFlix2Owner.set(key, item.id);
      }
    }

    type Expanded = { item: ContentItem; variantTitle?: string; variantLabel?: string; r2TmdbId?: number };
    const expandedItems: Expanded[] = [];
    const coveredFlix2 = new Set<string>();

    const getR2TmdbId = (varTitle: string): number | undefined => {
      const vClean = cleanT(varTitle);
      return (r2All.find(r => cleanT(r.title) === vClean) ?? r2All.find(r => cleanT(r.title) === cleanT(varTitle.replace(/\s*\[[^\]]*\]/g, "").trim())))?.tmdbId;
    };

    for (const item of results) {
      const key = cleanT(item.title);
      // Only attach Flix2 content to the primary claimant for this title.
      // Other results with the same title (e.g. a remake) appear without a stream badge.
      const isOwner = primaryFlix2Owner.get(key) === item.id;
      const variants = isOwner ? (flix2ByClean.get(key) ?? []) : [];
      // If any variant has [L] in title or "legendado" in category, the plain-title variant is DUB
      const hasLeg = variants.some(v =>
        /\[L\]/i.test(v.title) || /legendado/i.test(v.category_name ?? "")
      );
      const seenLabels = new Set<string>();
      const uniqueVariants: Array<{ title: string; label: string | undefined }> = [];
      for (const v of variants) {
        const catName = (v.category_name ?? "").toLowerCase();
        const lbl =
          /\[L\]/i.test(v.title) || /legendado/i.test(catName) ? "LEG" :
          /\[D\b|Dub\b/i.test(v.title) || /dublado/i.test(catName) ? "DUB" :
          hasLeg ? "DUB" :  // plain title alongside a [L] version → must be DUB
          "__none__";
        if (!seenLabels.has(lbl)) {
          seenLabels.add(lbl);
          coveredFlix2.add(cleanT(v.title));
          uniqueVariants.push({ title: v.title, label: lbl === "__none__" ? undefined : lbl });
        }
      }
      if (uniqueVariants.length > 1) {
        for (const uv of uniqueVariants) {
          expandedItems.push({ item, variantTitle: uv.title, variantLabel: uv.label, r2TmdbId: getR2TmdbId(uv.title) });
        }
      } else if (uniqueVariants.length === 1) {
        expandedItems.push({ item, variantTitle: uniqueVariants[0].title, variantLabel: uniqueVariants[0].label, r2TmdbId: getR2TmdbId(uniqueVariants[0].title) });
      } else {
        expandedItems.push({ item });
      }
    }

    const flix2OnlyRaw = flix2Raw.filter(r =>
      !coveredFlix2.has(cleanT(r.title)) && !results.some(t => cleanT(t.title) === cleanT(r.title))
    );

    const driveItems = r2All.filter(i =>
      i.title.toLowerCase().includes(query.toLowerCase()) &&
      !results.some(t => cleanT(t.title) === cleanT(i.title))
    );

    return { expandedItems, flix2OnlyRaw, driveItems };
  })();

  const totalCount = expandedItems.length + flix2OnlyRaw.length + driveItems.length;

  // Split results into a "Principais sugestões" row + genre-based rows
  // (Netflix-style search layout).
  type Expanded = { item: ContentItem; variantTitle?: string; variantLabel?: string; r2TmdbId?: number };
  const { topSuggestions, genreGroups } = (() => {
    const TOP_N = 8;
    const top = expandedItems.slice(0, TOP_N);
    const rest = expandedItems.slice(TOP_N);
    const groups = new Map<number, { title: string; entries: Expanded[] }>();
    const leftover: Expanded[] = [];
    for (const e of rest) {
      const gid = (e.item.genres ?? []).find((g: number) => GENRE_NAMES[g]);
      if (gid == null) { leftover.push(e); continue; }
      if (!groups.has(gid)) groups.set(gid, { title: GENRE_NAMES[gid], entries: [] });
      groups.get(gid)!.entries.push(e);
    }
    const finalGroups: { title: string; entries: Expanded[] }[] = [];
    for (const g of groups.values()) {
      if (g.entries.length >= 2) finalGroups.push(g);
      else leftover.push(...g.entries);
    }
    if (leftover.length > 0) finalGroups.push({ title: "Mais resultados", entries: leftover });
    return { topSuggestions: top, genreGroups: finalGroups };
  })();

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <StatusBar style="light" />

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <Animated.View style={[s.header, { opacity: barFade }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.logoAccent} />
          <Text style={[s.headerTitle, { color: RED }]}>BUS</Text>
          <Text style={s.headerTitle}>CAR</Text>
        </View>
        <View style={{ width: 36 }} />
      </Animated.View>

      {/* ── SEARCH BAR ─────────────────────────────────────────────────────── */}
      <Animated.View style={[s.searchWrap, { opacity: barFade }]}>
        <View style={s.searchBar}>
          <View style={s.searchIconBox}>
            {loading
              ? <ActivityIndicator color={RED} size="small" />
              : <Feather name="search" size={16} color={RED} />
            }
          </View>
          <TextInput
            ref={inputRef}
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Filmes, séries, animes, atores, gêneros..."
            placeholderTextColor="rgba(255,255,255,0.28)"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={RED}
            onSubmitEditing={() => {
              if (query.trim().length >= 2) {
                setSearchHistory(prev => addToHistory(prev, query.trim()));
              }
            }}
          />
          {query.length > 0 && (
            <Pressable style={s.clearBtn} hitSlop={12} onPress={() => { setQuery(""); inputRef.current?.focus(); }}>
              <Feather name="x" size={13} color="rgba(255,255,255,0.7)" />
            </Pressable>
          )}
        </View>

        {/* Gemini correction banner */}
        {geminiCorrection && isSearching && (
          <Pressable
            style={s.geminiCorrection}
            onPress={() => { setQuery(geminiCorrection); setGeminiCorrection(null); }}
          >
            <Feather name="zap" size={11} color="#a78bfa" />
            <Text style={s.geminiCorrectionText}>
              Você quis dizer:{" "}
              <Text style={{ color: "#a78bfa", fontWeight: "700" }}>{geminiCorrection}</Text>
              {"  "}→
            </Text>
          </Pressable>
        )}

        {/* Gemini suggestions chips (shown in results) */}
        {isSearching && geminiSuggs.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.geminiSuggsRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
            {geminiSuggs.map((s2) => (
              <Pressable key={s2} style={s.geminiSuggChip} onPress={() => setQuery(s2)}>
                <Feather name="zap" size={9} color="#a78bfa" />
                <Text style={s.geminiSuggChipText}>{s2}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Fuzzy hint */}
        {isSearching && !loading && totalCount === 0 && !flix2Loading && (
          <Text style={s.fuzzyHint}>Busca inteligente — tente palavras-chave ou descrições</Text>
        )}
      </Animated.View>

      {isSearching ? (
        /* ─────────────── RESULTS ─────────────────────────────────────────── */
        <Animated.View style={[{ flex: 1 }, { opacity: resFade }]}>
          {/* count bar */}
          {!loading && (
            <View style={s.countBar}>
              <Text style={s.countText}>
                {totalCount > 0
                  ? `${totalCount} resultado${totalCount !== 1 ? "s" : ""} para `
                  : "Nenhum resultado para "}
                <Text style={[s.countText, { color: "#fff", fontWeight: "700" }]}>
                  "{query.trim()}"
                </Text>
              </Text>
              {driveItems.length > 0 && (
                <View style={[s.flix2Pill, { borderColor: "rgba(34,197,94,0.4)", backgroundColor: "rgba(34,197,94,0.1)" }]}>
                  <Feather name="hard-drive" size={9} color={GREEN} />
                  <Text style={[s.flix2PillText, { color: GREEN }]}>{driveItems.length}</Text>
                </View>
              )}
            </View>
          )}

          {loading && expandedItems.length === 0 ? (
            <View style={s.centered}>
              <NetplayLoaderV29 />
              <Text style={s.loadingText}>Buscando...</Text>
            </View>
          ) : totalCount === 0 && !flix2Loading ? (
            <View style={s.centered}>
              <Feather name="search" size={52} color="rgba(255,255,255,0.06)" />
              <Text style={s.emptyTitle}>Nada encontrado</Text>
              <Text style={s.emptySubtitle}>Tente um sinônimo, gênero ou nome parecido</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.resultsScrollRows}>

              {/* Principais sugestões */}
              {topSuggestions.length > 0 && (
                <View style={s.rowWrap}>
                  <Text style={s.rowTitle}>Principais sugestões</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                    {topSuggestions.map((e, idx) => (
                      <LandscapeCard
                        key={`top-${e.item.id}-${idx}`}
                        item={e.item}
                        variantLabel={e.variantLabel}
                        inFlix2={!!e.variantTitle}
                        onPress={() => router.push({
                          pathname: "/detail",
                          params: {
                            type: e.item.mediaType ?? (e.item.type === "movie" ? "movie" : "tv"),
                            id: String(e.r2TmdbId ?? e.item.tmdbId ?? 0),
                            title: e.variantTitle ?? e.item.title,
                            poster: e.item.posterPath ?? "",
                          },
                        } as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Genre-based rows */}
              {genreGroups.map((g, gi) => (
                <View key={`genre-${gi}`} style={s.rowWrap}>
                  <Text style={s.rowTitle}>{g.title}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                    {g.entries.map((e, idx) => (
                      <LandscapeCard
                        key={`g-${gi}-${e.item.id}-${idx}`}
                        item={e.item}
                        variantLabel={e.variantLabel}
                        inFlix2={!!e.variantTitle}
                        onPress={() => router.push({
                          pathname: "/detail",
                          params: {
                            type: e.item.mediaType ?? (e.item.type === "movie" ? "movie" : "tv"),
                            id: String(e.r2TmdbId ?? e.item.tmdbId ?? 0),
                            title: e.variantTitle ?? e.item.title,
                            poster: e.item.posterPath ?? "",
                          },
                        } as any)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ))}

              {/* Flix2-only section */}
              {flix2OnlyRaw.length > 0 && (
                <View style={s.rowWrap}>
                  <View style={s.sectionHead}>
                    <View style={[s.sectionBar, { backgroundColor: "#a855f7" }]} />
                    <Feather name="zap" size={13} color="#a855f7" />
                    <Text style={[s.sectionTitle, { color: "#a855f7" }]}>Exclusivos Flix 2.0</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                    {flix2OnlyRaw.map((item, i) => {
                      const siblings = flix2OnlyRaw.filter(s => s !== item && cleanT(s.title) === cleanT(item.title));
                      return (
                        <Flix2LandscapeCard
                          key={`flix2-${i}`}
                          item={item}
                          siblings={siblings}
                          onPress={() => router.push({
                            pathname: "/detail",
                            params: { type: item._type === "movie" ? "movie" : "tv", id: String(item.tmdb_id || 0), title: item.title, poster: item.thumbnail ?? "" },
                          } as any)}
                        />
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Drive section */}
              {driveItems.length > 0 && (
                <View style={s.rowWrap}>
                  <View style={s.sectionHead}>
                    <View style={[s.sectionBar, { backgroundColor: GREEN }]} />
                    <Feather name="hard-drive" size={13} color={GREEN} />
                    <Text style={[s.sectionTitle, { color: GREEN }]}>Minha Biblioteca</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                    {driveItems.map(item => (
                      <LandscapeCard key={item.id} item={item} onPress={() => goTo(item)} />
                    ))}
                  </ScrollView>
                </View>
              )}

            </ScrollView>
          )}
        </Animated.View>

      ) : (
        /* ─────────────── IDLE STATE ──────────────────────────────────────── */
        <Animated.ScrollView
          style={{ flex: 1, opacity: idleFade }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 120 }}>

          {/* Search history */}
          {searchHistory.length > 0 && (
            <View style={s.historyWrap}>
              <View style={s.historyHead}>
                <Feather name="clock" size={11} color="rgba(255,255,255,0.3)" />
                <Text style={s.historyLabel}>Buscas recentes</Text>
                <Pressable hitSlop={10} onPress={() => { setSearchHistory([]); saveHistory([]); }}>
                  <Text style={s.historyClear}>Limpar</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.historyRow}>
                {searchHistory.map(term => (
                  <Pressable key={term} style={s.historyChip} onPress={() => setQuery(term)}>
                    <Feather name="search" size={10} color="rgba(255,255,255,0.4)" />
                    <Text style={s.historyChipText} numberOfLines={1}>{term}</Text>
                    <Pressable hitSlop={8} onPress={() => {
                      const next = searchHistory.filter(h => h !== term);
                      setSearchHistory(next);
                      saveHistory(next);
                    }}>
                      <Feather name="x" size={10} color="rgba(255,255,255,0.25)" />
                    </Pressable>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Recommended list (Netflix-style vertical rows) */}
          <View style={s.recWrap}>
            <Text style={s.recSectionTitle}>Séries e filmes recomendados</Text>
            {recommendedLoading ? (
              <View style={{ paddingVertical: 30, alignItems: "center" }}>
                <ActivityIndicator color={RED} />
              </View>
            ) : (
              recommended.map(item => (
                <RecommendedRow key={item.id} item={item} onPress={() => goTo(item)} />
              ))
            )}
          </View>

        </Animated.ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050306" },

  /* header */
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  headerTitle:  { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 1.8 },
  logoAccent:   { width: 4, height: 22, borderRadius: 2, backgroundColor: RED, marginRight: 7 },

  /* search bar */
  searchWrap: { paddingHorizontal: 16, marginBottom: 6 },
  searchBar: {
    flexDirection: "row", alignItems: "center", borderRadius: 16,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12, paddingVertical: 11, gap: 10,
  },
  searchIconBox: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  searchInput:  { flex: 1, fontSize: 15, color: "#fff", fontWeight: "500", padding: 0 },
  clearBtn:     { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
  fuzzyHint:    { color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: "500", paddingHorizontal: 4, marginTop: 6 },
  geminiCorrection: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, paddingHorizontal: 4, paddingVertical: 4 },
  geminiCorrectionText: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "500" },
  geminiSuggsRow: { marginTop: 6, marginHorizontal: 4 },
  geminiSuggChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(167,139,250,0.12)", borderColor: "rgba(167,139,250,0.3)", borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  geminiSuggChipText: { color: "#a78bfa", fontSize: 11, fontWeight: "600" },

  /* count bar */
  countBar: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 8, paddingHorizontal: 16, marginBottom: 10, marginTop: 4,
  },
  countText:    { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "600" },
  flix2Pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: "rgba(168,85,247,0.1)", borderWidth: 1, borderColor: "rgba(168,85,247,0.3)",
  },
  flix2PillText: { color: "#a855f7", fontSize: 10, fontWeight: "700" },

  /* results */
  resultsScroll: { paddingHorizontal: 16, paddingBottom: 120, rowGap: 0 },
  resultsScrollRows: { paddingBottom: 120 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14 },

  /* Netflix-style horizontal rows */
  rowWrap: { marginBottom: 22 },
  rowTitle: { color: "#fff", fontSize: 15, fontWeight: "800", marginBottom: 10, paddingHorizontal: 16, letterSpacing: -0.2 },
  hRow: { paddingHorizontal: 16, gap: 10 },
  landCard: { width: 152 },
  landImg: {
    width: "100%", aspectRatio: 16 / 9, borderRadius: 10,
    overflow: "hidden", backgroundColor: "#1a0a14", marginBottom: 6,
  },
  landPlayBtn: {
    position: "absolute", bottom: 6, right: 6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  landTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },

  /* Netflix-style recommended list (idle state) */
  recWrap: { paddingTop: 6, marginBottom: 20 },
  recSectionTitle: { color: "#fff", fontSize: 16, fontWeight: "800", paddingHorizontal: 16, marginBottom: 14, letterSpacing: -0.2 },
  recRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 16, gap: 12 },
  recThumb: { width: 118, height: 68, borderRadius: 8, overflow: "hidden", backgroundColor: "#1a0a14" },
  recTitle: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700", lineHeight: 19 },
  recPlayBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
  },

  /* section headers */
  sectionHead:  { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12, marginTop: 4 },
  sectionBar:   { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },

  /* poster card */
  card:    { width: (W - 32 - 16) / 3, marginBottom: 4 },
  cardImg: {
    width: "100%", aspectRatio: 2 / 3, borderRadius: 10,
    overflow: "hidden", backgroundColor: "#1a0a14", marginBottom: 5,
  },
  typeBadge:     { position: "absolute", top: 5, left: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(8,145,178,0.85)" },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  ratingBadge:   { position: "absolute", top: 5, right: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)" },
  ratingText:    { color: "#f59e0b", fontSize: 10, fontWeight: "800" },
  variantBadge:  { position: "absolute", bottom: 5, left: 5, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5 },
  variantBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  flix2Badge:    { position: "absolute", bottom: 5, left: 5, flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(168,85,247,0.85)" },
  flix2BadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.3 },
  cardTitle:     { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 15 },
  cardYear:      { color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 1 },

  /* loading / empty */
  centered:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32, paddingTop: 60 },
  loadingText: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 8 },
  emptyTitle:  { color: "rgba(255,255,255,0.5)", fontSize: 17, fontWeight: "700" },
  emptySubtitle: { color: "rgba(255,255,255,0.28)", fontSize: 13, textAlign: "center" },

  /* history */
  historyWrap: { marginTop: 8, marginBottom: 20 },
  historyHead: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, marginBottom: 8 },
  historyLabel: { flex: 1, fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  historyClear: { fontSize: 11, color: "rgba(229,9,20,0.65)", fontWeight: "700" },
  historyRow:   { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  historyChip:  { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", maxWidth: 170 },
  historyChipText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "500" },

  /* suggestions */
  suggestWrap: { paddingHorizontal: 16, marginBottom: 28 },
  suggestHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 14 },
  suggestTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestChip: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  suggestEmoji: { fontSize: 15 },
  suggestLabel: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "700" },

  /* idle empty state */
  emptyIdle:     { alignItems: "center", paddingTop: 40, paddingHorizontal: 36, gap: 14 },
  emptyIdleIcon: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 1.5,
    borderColor: "rgba(229,9,20,0.2)", backgroundColor: "rgba(229,9,20,0.08)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyIdleTitle: { color: "rgba(255,255,255,0.6)", fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  emptyIdleSub:   { color: "rgba(255,255,255,0.25)", fontSize: 12, fontWeight: "500", textAlign: "center", lineHeight: 18 },
});
