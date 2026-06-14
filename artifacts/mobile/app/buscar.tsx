import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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

type Flix2RawItem = { title: string; _type: string; thumbnail?: string | null; tmdb_id?: number };

async function fetchFlix2Catalog(type: string): Promise<Flix2RawItem[]> {
  try {
    const base = r2Base();
    const url = base
      ? `${base}/flix2/catalog-full?type=${type}`
      : `/api/r2/flix2/catalog-full?type=${type}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 120_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    const kindMap: Record<string, string> = { movies: "movie", series: "series", animes: "anime" };
    return (data.data ?? []).map((item: any) => ({
      title: item.title ?? item.name ?? "",
      _type: kindMap[type] ?? "movie",
      thumbnail: item.poster ?? item.thumbnail ?? null,
      tmdb_id: item.tmdb_id ?? 0,
    })).filter((i: Flix2RawItem) => i.title);
  } catch {
    return [];
  }
}

type Flix2SearchResult = { titles: Set<string>; raw: Flix2RawItem[] };

async function flix2Search(q: string): Promise<Flix2SearchResult> {
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
        raw.push({ title: item.title, _type: item._type ?? "movie", thumbnail: item.poster ?? item.thumbnail ?? null, tmdb_id: item.tmdb_id ?? 0 });
      }
    }
    return { titles, raw };
  } catch {
    return { titles: new Set(), raw: [] };
  }
}

/** Busca instantânea no cache prefetchado — sem chamada de rede */
async function searchFromCache(q: string): Promise<Flix2SearchResult> {
  const qLow = q.toLowerCase();
  const [movies, series, animes] = await Promise.all([
    getCached("movies"),
    getCached("series"),
    getCached("animes"),
  ]);
  const titles = new Set<string>();
  const raw: Flix2RawItem[] = [];
  const pushItems = (items: any[] | null, type: string) => {
    if (!items) return;
    for (const item of items) {
      if (item.title?.toLowerCase().includes(qLow)) {
        const t = item.title.toLowerCase().trim();
        if (!titles.has(t)) {
          titles.add(t);
          raw.push({ title: item.title, _type: type, thumbnail: item.poster ?? item.thumbnail ?? null, tmdb_id: item.tmdb_id ?? 0 });
        }
      }
    }
  };
  pushItems(movies, "movie");
  pushItems(series, "series");
  pushItems(animes, "anime");
  return { titles, raw: raw.slice(0, 60) };
}

const { width: W } = Dimensions.get("window");
const RED    = "#e50914";
const AMBER  = "#f59e0b";
const TEAL   = "#0891b2";
const PURPLE = "#8b5cf6";
const GREEN  = "#22c55e";
const PINK   = "#ec4899";
const CARD_W_3 = (W - 32 - 16) / 3;
const CARD_W_H = 140;

const TMDB_KEY  = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_W500  = "https://image.tmdb.org/t/p/w500";
const IMG_W185  = "https://image.tmdb.org/t/p/w185";
const IMG_W780  = "https://image.tmdb.org/t/p/w780";

async function tfetch(path: string, params: Record<string, string> = {}): Promise<any> {
  try {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("language", "pt-BR");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url.toString());
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

const CATEGORIES = [
  { id: "trending",  label: "Em Alta",   icon: "trending-up" as const, color: RED,    bg: "rgba(229,9,20,0.18)" },
  { id: "live",      label: "Ao Vivo",   icon: "radio"       as const, color: TEAL,   bg: "rgba(8,145,178,0.18)" },
  { id: "new",       label: "Novidades", icon: "bell"        as const, color: PURPLE, bg: "rgba(139,92,246,0.18)" },
  { id: "ia",        label: "IA Picks",  icon: "cpu"         as const, color: GREEN,  bg: "rgba(34,197,94,0.18)" },
  { id: "cinema",    label: "Cinema",    icon: "film"        as const, color: AMBER,  bg: "rgba(245,158,11,0.18)" },
  { id: "series",    label: "Séries",    icon: "tv"          as const, color: PINK,   bg: "rgba(236,72,153,0.18)" },
];

const GENRES = [
  { id: "28",    label: "Ação",         color: "#ef4444" },
  { id: "35",    label: "Comédia",      color: "#f59e0b" },
  { id: "18",    label: "Drama",        color: "#8b5cf6" },
  { id: "27",    label: "Terror",       color: "#1d4ed8" },
  { id: "878",   label: "Ficção Cient.", color: "#0891b2" },
  { id: "10749", label: "Romance",      color: "#ec4899" },
  { id: "53",    label: "Suspense",     color: "#dc2626" },
  { id: "12",    label: "Aventura",     color: "#16a34a" },
  { id: "16",    label: "Animação",     color: "#ea580c" },
  { id: "99",    label: "Documentário", color: "#0284c7" },
  { id: "10751", label: "Família",      color: "#d97706" },
  { id: "14",    label: "Fantasia",     color: "#7c3aed" },
];

const MOODS = [
  { id: "epico",    label: "Algo épico",        emoji: "⚡", query: "épico aventura ação" },
  { id: "rir",      label: "Quero rir",          emoji: "😂", query: "comédia" },
  { id: "assustar", label: "Quero me assustar",  emoji: "👻", query: "terror" },
  { id: "chorar",   label: "Quero chorar",        emoji: "😢", query: "drama romance" },
  { id: "acao",     label: "Muita ação",          emoji: "💥", query: "ação" },
  { id: "sci",      label: "Ficção Científica",   emoji: "🚀", query: "ficção científica" },
];

const HOT_TAGS = ["#Marvel", "#Netflix", "#Anime", "#KDrama", "#Oscar", "#Pixar", "#DC", "#Disney"];

type SourceFilter = "global" | "tmdb" | "flix2" | "drive";

const SOURCE_FILTERS: {
  id: SourceFilter; label: string; icon: keyof typeof Feather.glyphMap;
  color: string; bg: string;
}[] = [
  { id: "global", label: "Global",    icon: "globe",      color: "#fff",     bg: "rgba(255,255,255,0.12)" },
  { id: "tmdb",   label: "TMDB",      icon: "database",   color: "#01b4e4",  bg: "rgba(1,180,228,0.14)" },
  { id: "flix2",  label: "Flix 2.0",  icon: "zap",        color: "#a855f7",  bg: "rgba(168,85,247,0.14)" },
  { id: "drive",  label: "Drive",     icon: "hard-drive",  color: "#22c55e",  bg: "rgba(34,197,94,0.14)" },
];

function PosterCard({ item, onPress, showRating = true, width, inFlix2 = false }: {
  item: ContentItem;
  onPress: () => void;
  showRating?: boolean;
  width?: number;
  inFlix2?: boolean;
}) {
  const fixedW = width ?? 0;
  const fixedH = fixedW * 1.5;
  const outer = fixedW > 0 ? { width: fixedW, marginBottom: 4 } : { width: "32%" as const, marginBottom: 4 };
  const imgBox = fixedW > 0
    ? { width: fixedW, height: fixedH, borderRadius: 10, overflow: "hidden" as const, backgroundColor: "#1a0a14", marginBottom: 5 }
    : { width: "100%" as const, aspectRatio: 2 / 3, borderRadius: 10, overflow: "hidden" as const, backgroundColor: "#1a0a14", marginBottom: 5 };
  return (
    <Pressable style={outer} onPress={onPress}>
      <View style={imgBox}>
        {item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020","#0e0810"]} style={[StyleSheet.absoluteFill, { alignItems:"center", justifyContent:"center" }]}>
            <Feather name="film" size={24} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={StyleSheet.absoluteFill} locations={[0.6, 1]} />
        <View style={{ position:"absolute", top:5, left:5, right:5, flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start" }}>
          {item.mediaType === "tv" ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>SÉRIE</Text>
            </View>
          ) : (
            <View style={[styles.typeBadge, { backgroundColor: "rgba(229,9,20,0.8)" }]}>
              <Text style={styles.typeBadgeText}>FILME</Text>
            </View>
          )}
          {showRating && item.rating >= 6 && (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>★ {item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {inFlix2 && (
          <View style={styles.flix2Badge}>
            <Feather name="zap" size={8} color="#fff" />
            <Text style={styles.flix2BadgeText}>FLIX 2.0</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardYear}>{item.year} · {item.mediaType === "tv" ? "Série" : "Filme"}</Text>
    </Pressable>
  );
}

function Flix2OnlyCard({ item }: { item: Flix2RawItem }) {
  const typeLabel = item._type === "series" ? "SÉRIE" : item._type === "anime" ? "ANIME" : "FILME";
  const typeBg =
    item._type === "series" ? "rgba(8,145,178,0.85)" :
    item._type === "anime"  ? "rgba(234,88,12,0.85)" : "rgba(229,9,20,0.85)";
  return (
    <View style={{ width: "32%", marginBottom: 4, opacity: 0.9 }}>
      <View style={{ width: "100%", aspectRatio: 2/3, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a0a14", marginBottom: 5 }}>
        {item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020","#0e0810"]} style={[StyleSheet.absoluteFill, { alignItems:"center", justifyContent:"center" }]}>
            <Feather name="film" size={24} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.8)"]} style={StyleSheet.absoluteFill} locations={[0.55, 1]} />
        <View style={{ position:"absolute", top:5, left:5 }}>
          <View style={[styles.typeBadge, { backgroundColor: typeBg }]}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
        </View>
        <View style={styles.flix2Badge}>
          <Feather name="zap" size={8} color="#fff" />
          <Text style={styles.flix2BadgeText}>FLIX 2.0</Text>
        </View>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardYear}>{typeLabel[0] + typeLabel.slice(1).toLowerCase()}</Text>
    </View>
  );
}


function SectionRow({ title, badge, accentColor = RED, onSeeAll, children }: {
  title: string; badge?: string; accentColor?: string; onSeeAll?: () => void; children: React.ReactNode;
}) {
  const anim  = useRef(new Animated.Value(0)).current;
  const words = title.split(" ");
  const first = words[0];
  const rest  = words.slice(1).join(" ");

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 420, delay: 80, useNativeDriver: true,
    }).start();
  }, []);

  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View style={[styles.sectionWrap, { opacity: anim, transform: [{ translateY: ty }] }]}>
      <View style={[styles.sectionHeader, { overflow: "hidden" }]}>
        <LinearGradient
          colors={[`${accentColor}28`, "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
          <View style={{ width:3, height:18, borderRadius:2, backgroundColor: accentColor }} />
          <View style={{ flexDirection:"row", alignItems:"baseline" }}>
            <Text style={[styles.sectionTitle, { color: accentColor }]}>{first}</Text>
            {rest.length > 0 && (
              <Text style={styles.sectionTitle}> {rest}</Text>
            )}
          </View>
          {badge && (
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text style={[styles.seeAll, { color: accentColor }]}>Ver tudo ›</Text>
          </Pressable>
        )}
      </View>
      {children}
    </Animated.View>
  );
}

export default function BuscarScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const params   = useLocalSearchParams<{ q?: string }>();
  const inputRef = useRef<TextInput>(null);
  const topPad   = insets.top + (Platform.OS === "web" ? 67 : 0);

  // ── R2/Drive catalog ─────────────────────────────────────────────────────
  const { r2All } = useR2Catalog();

  const [query,         setQuery]         = useState(params.q ?? "");
  const [results,       setResults]       = useState<ContentItem[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [flix2Titles,      setFlix2Titles]      = useState<Set<string>>(new Set());
  const [flix2RawResults,  setFlix2RawResults]  = useState<Flix2RawItem[]>([]);
  const [flix2Loading,     setFlix2Loading]      = useState(false);
  const [sourceFilter,     setSourceFilter]      = useState<SourceFilter>("global");
  const [r2SearchResults,  setR2SearchResults]   = useState<ContentItem[]>([]);

  // ── Catálogo Flix 2.0 (browse mode) ─────────────────────────────────────
  const [showFlix2Catalog, setShowFlix2Catalog] = useState(false);
  const [flix2CatType,     setFlix2CatType]     = useState<"movies"|"series"|"animes">("movies");
  const [flix2CatItems,    setFlix2CatItems]    = useState<Flix2RawItem[]>([]);
  const [flix2CatLoading,  setFlix2CatLoading]  = useState(false);
  const [activeCategory,setActiveCategory]= useState<string>("trending");
  const [activeGenre,   setActiveGenre]   = useState<string | null>(null);

  const [genreItems,     setGenreItems]     = useState<ContentItem[]>([]);
  const [searchHistory,  setSearchHistory]  = useState<string[]>([]);
  const [micOn,          setMicOn]          = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;

  // Carrega histórico salvo na primeira abertura
  useEffect(() => {
    loadHistory().then(setSearchHistory);
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const loadGenre = useCallback(async (genreId: string) => {
    setActiveGenre(genreId);
    const data = await tfetch("/discover/multi", { with_genres: genreId, sort_by: "popularity.desc" })
      .catch(() => tfetch("/discover/movie", { with_genres: genreId, sort_by: "popularity.desc" }));
    setGenreItems((data.results ?? []).slice(0, 30).map((x: any) => toItem(x)));
  }, []);

  const startVoice = useCallback(() => {
    if (Platform.OS !== "web") return;
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = false;
    rec.onstart = () => {
      setMicOn(true);
      Animated.loop(Animated.sequence([
        Animated.timing(micPulse, { toValue: 0.3, duration: 450, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1,   duration: 450, useNativeDriver: true }),
      ])).start();
    };
    rec.onresult = (e: any) => { setQuery(e.results[0][0].transcript); };
    rec.onend  = () => { setMicOn(false); micPulse.stopAnimation(); micPulse.setValue(1); };
    rec.onerror = () => { setMicOn(false); micPulse.setValue(1); };
    rec.start();
  }, [micPulse]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]); setFlix2Titles(new Set()); setFlix2RawResults([]);
      setR2SearchResults([]);
      return;
    }
    setLoading(true);
    setFlix2Loading(true);

    // R2/Drive: instant in-memory filter
    setR2SearchResults(r2All.filter(i => i.title.toLowerCase().includes(q.toLowerCase())));

    // Flix 2.0: busca instantânea no cache prefetchado (sem rede)
    let cacheHit = false;
    const cacheSearch = searchFromCache(q).then((cached) => {
      cacheHit = cached.raw.length > 0;
      if (cacheHit) {
        setFlix2Titles(cached.titles);
        setFlix2RawResults(cached.raw);
        setFlix2Loading(false);
      }
    });

    // TMDB: debounce 300ms + Flix 2.0 API fallback se cache vazio
    const timer = setTimeout(async () => {
      await cacheSearch; // aguarda cache resolver (< 50ms normalmente)

      const tasks: Promise<any>[] = [
        tfetch("/search/multi", { query: q, include_adult: "false", page: "1" }),
      ];
      if (!cacheHit) tasks.push(flix2Search(q));

      const [tmdbResult, flix2Result] = await Promise.allSettled(tasks);

      if (tmdbResult.status === "fulfilled") {
        const items: ContentItem[] = (tmdbResult.value.results ?? [])
          .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
          .map((x: any) => toItem(x));
        setResults(items);
        // Salva no histórico quando há resultados
        if (items.length > 0 || cacheHit) {
          setSearchHistory((prev) => addToHistory(prev, q));
        }
      }
      setLoading(false);

      if (!cacheHit && flix2Result && flix2Result.status === "fulfilled") {
        setFlix2Titles(flix2Result.value.titles);
        setFlix2RawResults(flix2Result.value.raw);
        setFlix2Loading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, r2All]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId || 0), title: item.title, poster: item.posterPath ?? "" },
    });
  }, [router]);

  // ── Load Flix 2.0 catalog when catalog mode is opened or type changes ───────
  useEffect(() => {
    if (!showFlix2Catalog) return;
    let cancelled = false;
    setFlix2CatLoading(true);
    setFlix2CatItems([]);
    fetchFlix2Catalog(flix2CatType).then((items) => {
      if (!cancelled) { setFlix2CatItems(items); setFlix2CatLoading(false); }
    });
    return () => { cancelled = true; };
  }, [showFlix2Catalog, flix2CatType]);

  const isSearching = query.trim().length >= 2;


  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <StatusBar style="light" />

      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 0 }}>
          <View style={styles.logoAccent} />
          <Text style={[styles.headerTitle, { color: RED }]}>BUS</Text>
          <Text style={styles.headerTitle}>CAR</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── SEARCH BAR ───────────────────────────────────────────────────────── */}
      <View style={styles.searchWrap}>
        <LinearGradient colors={["rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]}
          style={styles.searchBar}>
          <View style={styles.searchIconBox}>
            <Feather name="search" size={15} color={RED} />
          </View>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar filmes, séries, atores, gêneros..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={RED}
          />
          {query.length > 0 ? (
            <Pressable style={styles.clearBtn} hitSlop={10}
              onPress={() => { setQuery(""); inputRef.current?.focus(); }}>
              <Feather name="x" size={12} color="#fff" />
            </Pressable>
          ) : (
            <Pressable style={[styles.micBtn, micOn && styles.micBtnActive]} hitSlop={10} onPress={startVoice}>
              <Animated.View style={micOn ? { opacity: micPulse } : undefined}>
                <Feather name="mic" size={13} color={micOn ? RED : "rgba(255,255,255,0.4)"} />
              </Animated.View>
            </Pressable>
          )}
        </LinearGradient>
      </View>

      {/* ── HISTÓRICO DE BUSCAS ─────────────────────────────────────────────── */}
      {!isSearching && searchHistory.length > 0 && (
        <View style={styles.historyWrap}>
          <View style={styles.historyHeader}>
            <Feather name="clock" size={11} color="rgba(255,255,255,0.35)" />
            <Text style={styles.historyLabel}>Recentes</Text>
            <Pressable hitSlop={10} onPress={() => {
              setSearchHistory([]);
              saveHistory([]);
            }}>
              <Text style={styles.historyClear}>Limpar</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 6 }}>
            {searchHistory.map((term) => (
              <Pressable key={term} style={styles.historyChip}
                onPress={() => setQuery(term)}>
                <Feather name="search" size={10} color="rgba(255,255,255,0.45)" />
                <Text style={styles.historyChipText} numberOfLines={1}>{term}</Text>
                <Pressable hitSlop={8} onPress={() => {
                  const next = searchHistory.filter(h => h !== term);
                  setSearchHistory(next);
                  saveHistory(next);
                }}>
                  <Feather name="x" size={10} color="rgba(255,255,255,0.3)" />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── SOURCE FILTER PILLS (always visible) ────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        nestedScrollEnabled keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10, alignItems: "center" }}>
        {SOURCE_FILTERS.map((sf) => {
          const active = sourceFilter === sf.id;
          return (
            <Pressable
              key={sf.id}
              style={[
                styles.sourcePill,
                active && { backgroundColor: sf.bg, borderColor: sf.color },
              ]}
              onPress={() => {
                setSourceFilter(sf.id);
                if (sf.id === "flix2" && !isSearching) setShowFlix2Catalog(true);
                if (sf.id !== "flix2") setShowFlix2Catalog(false);
              }}>
              <Feather
                name={sf.icon}
                size={12}
                color={active ? sf.color : "rgba(255,255,255,0.4)"}
              />
              <Text style={[styles.sourcePillText, active && { color: sf.color, fontWeight: "800" }]}>
                {sf.label}
              </Text>
              {sf.id === "global" && active && (
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: RED }} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {isSearching ? (
        /* ─────────────────── SEARCH RESULTS ───────────────────────────────── */
        <View style={{ flex: 1 }}>
          {/* ── results bar ─────────────────────────────────────────────────── */}
          <View style={styles.resultsBar}>
            <View style={{ gap: 4, flex: 1 }}>
              {loading ? (
                <ActivityIndicator color={RED} size="small" />
              ) : (
                <Text style={styles.resultsLabel}>
                  {(() => {
                    const sf = SOURCE_FILTERS.find(s => s.id === sourceFilter)!;
                    const cnt = sourceFilter === "drive"
                      ? r2SearchResults.length
                      : sourceFilter === "flix2"
                        ? flix2Titles.size + flix2RawResults.filter(r => !results.some(t => t.title.toLowerCase().trim() === r.title.toLowerCase().trim())).length
                        : results.length;
                    return cnt > 0
                      ? `${cnt} resultado${cnt !== 1 ? "s" : ""} em ${sf.label} · "${query.trim()}"`
                      : `Nenhum resultado em ${sf.label} para "${query.trim()}"`;
                  })()}
                </Text>
              )}
              {sourceFilter !== "drive" && flix2Loading && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <ActivityIndicator color="#a855f7" size="small" />
                  <Text style={[styles.resultsLabel, { fontSize: 11, color: "#a855f7" }]}>Buscando Flix 2.0…</Text>
                </View>
              )}
            </View>
            {/* counts pills */}
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              {r2SearchResults.length > 0 && (
                <View style={{ flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:10, backgroundColor:"rgba(34,197,94,0.14)", borderWidth:1, borderColor:"rgba(34,197,94,0.3)" }}>
                  <Feather name="hard-drive" size={9} color="#22c55e" />
                  <Text style={{ color:"#22c55e", fontSize:10, fontWeight:"800" }}>{r2SearchResults.length}</Text>
                </View>
              )}
              {flix2Titles.size > 0 && (
                <View style={{ flexDirection:"row", alignItems:"center", gap:3, paddingHorizontal:7, paddingVertical:3, borderRadius:10, backgroundColor:"rgba(168,85,247,0.14)", borderWidth:1, borderColor:"rgba(168,85,247,0.3)" }}>
                  <Feather name="zap" size={9} color="#a855f7" />
                  <Text style={{ color:"#a855f7", fontSize:10, fontWeight:"800" }}>{flix2Titles.size}</Text>
                </View>
              )}
            </View>
          </View>

          {(() => {
            // ── compute what to show based on sourceFilter ──────────────────
            const flix2OnlyRaw = flix2RawResults.filter(
              r => !results.some(t => t.title.toLowerCase().trim() === r.title.toLowerCase().trim())
            );

            let tmdbItems: ContentItem[] = [];
            let showFlix2Only = false;
            let driveItems: ContentItem[] = [];

            if (sourceFilter === "global") {
              tmdbItems = results;
              showFlix2Only = flix2OnlyRaw.length > 0;
              driveItems = r2SearchResults.filter(
                r => !results.some(t => t.title.toLowerCase().trim() === r.title.toLowerCase().trim())
              );
            } else if (sourceFilter === "tmdb") {
              tmdbItems = results;
            } else if (sourceFilter === "flix2") {
              tmdbItems = results.filter(r => flix2Titles.has(r.title.toLowerCase().trim()));
              showFlix2Only = flix2OnlyRaw.length > 0;
            } else if (sourceFilter === "drive") {
              driveItems = r2SearchResults;
            }

            const isEmpty = tmdbItems.length === 0 && !showFlix2Only && driveItems.length === 0;

            if (loading && sourceFilter !== "drive") {
              return (
                <View style={styles.centered}>
                  <ActivityIndicator color={RED} size="large" />
                  <Text style={styles.loadingText}>Buscando...</Text>
                </View>
              );
            }
            if (isEmpty) {
              const sf = SOURCE_FILTERS.find(s => s.id === sourceFilter)!;
              return (
                <View style={styles.centered}>
                  <Feather name={sf.icon} size={48} color={`${sf.color}22`} />
                  <Text style={styles.emptyTitle}>Nenhum resultado em {sf.label}</Text>
                  <Text style={styles.emptySubtitle}>
                    {sourceFilter === "drive"
                      ? "Nenhum conteúdo do Drive corresponde à busca"
                      : sourceFilter === "flix2"
                        ? "A busca não retornou resultados no catálogo Flix 2.0"
                        : "Tente outro termo de busca"}
                  </Text>
                </View>
              );
            }
            return (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>

                {/* ── TMDB results ─────────────────────────────────────────── */}
                {tmdbItems.length > 0 && (
                  <>
                    {(showFlix2Only || driveItems.length > 0) && (
                      <View style={[styles.flix2OnlyHeader, { marginBottom: 8 }]}>
                        <View style={[styles.flix2OnlyAccent, { backgroundColor: "#01b4e4" }]} />
                        <Feather name="database" size={13} color="#01b4e4" />
                        <Text style={[styles.flix2OnlyTitle, { color: "#01b4e4" }]}>TMDB</Text>
                        <Text style={styles.flix2OnlySubtitle}>{tmdbItems.length} resultado{tmdbItems.length !== 1 ? "s" : ""}</Text>
                      </View>
                    )}
                    <View style={styles.grid}>
                      {tmdbItems.map((item) => (
                        <PosterCard
                          key={item.id}
                          item={item}
                          onPress={() => goTo(item)}
                          inFlix2={flix2Titles.has(item.title.toLowerCase().trim())}
                        />
                      ))}
                    </View>
                  </>
                )}

                {/* ── Flix 2.0-only items ──────────────────────────────────── */}
                {showFlix2Only && (
                  <View style={{ marginTop: tmdbItems.length > 0 ? 24 : 0 }}>
                    <View style={styles.flix2OnlyHeader}>
                      <View style={styles.flix2OnlyAccent} />
                      <Feather name="zap" size={14} color="#a855f7" />
                      <Text style={styles.flix2OnlyTitle}>Exclusivos Flix 2.0</Text>
                      <Text style={styles.flix2OnlySubtitle}>não encontrados no TMDB</Text>
                    </View>
                    <View style={styles.grid}>
                      {flix2OnlyRaw.map((item, i) => (
                        <Flix2OnlyCard key={`flix2only-${i}`} item={item} />
                      ))}
                    </View>
                  </View>
                )}

                {/* ── Drive/R2 items ───────────────────────────────────────── */}
                {driveItems.length > 0 && (
                  <View style={{ marginTop: (tmdbItems.length > 0 || showFlix2Only) ? 24 : 0 }}>
                    {(tmdbItems.length > 0 || showFlix2Only) && (
                      <View style={styles.flix2OnlyHeader}>
                        <View style={[styles.flix2OnlyAccent, { backgroundColor: "#22c55e" }]} />
                        <Feather name="hard-drive" size={13} color="#22c55e" />
                        <Text style={[styles.flix2OnlyTitle, { color: "#22c55e" }]}>Drive</Text>
                        <Text style={styles.flix2OnlySubtitle}>{driveItems.length} item{driveItems.length !== 1 ? "ns" : ""} no armazenamento</Text>
                      </View>
                    )}
                    <View style={styles.grid}>
                      {driveItems.map((item) => (
                        <PosterCard key={item.id} item={item} onPress={() => goTo(item)} />
                      ))}
                    </View>
                  </View>
                )}

              </ScrollView>
            );
          })()}
        </View>
      ) : showFlix2Catalog ? (
        /* ─────────────────── CATÁLOGO FLIX 2.0 ────────────────────────────── */
        <View style={{ flex: 1 }}>
          {/* header */}
          <View style={styles.catHeader}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setShowFlix2Catalog(false)} hitSlop={12}>
              <Feather name="arrow-left" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Feather name="zap" size={16} color="#a855f7" />
              <Text style={styles.catHeaderTitle}>Catálogo</Text>
              <Text style={[styles.catHeaderTitle, { color: "#a855f7" }]}>Flix 2.0</Text>
            </View>
            {flix2CatLoading && <ActivityIndicator color="#a855f7" size="small" />}
            {!flix2CatLoading && (
              <Text style={styles.catCount}>{flix2CatItems.length} títulos</Text>
            )}
          </View>

          {/* type tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}>
            {([
              { key: "movies",  label: "🎬 Filmes"  },
              { key: "series",  label: "📺 Séries"  },
              { key: "animes",  label: "⛩️ Animes"  },
            ] as { key: "movies"|"series"|"animes"; label: string }[]).map((t) => (
              <Pressable key={t.key}
                style={[styles.catTypeTab, flix2CatType === t.key && styles.catTypeTabActive]}
                onPress={() => setFlix2CatType(t.key)}>
                <Text style={[styles.catTypeTabText, flix2CatType === t.key && { color: "#fff" }]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {flix2CatLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#a855f7" size="large" />
              <Text style={[styles.loadingText, { color: "#a855f7" }]}>Carregando catálogo…</Text>
              <Text style={[styles.loadingText, { fontSize: 11, marginTop: 4 }]}>Pode demorar na primeira vez</Text>
            </View>
          ) : flix2CatItems.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="zap" size={48} color="rgba(168,85,247,0.15)" />
              <Text style={styles.emptyTitle}>Catálogo indisponível</Text>
              <Text style={styles.emptySubtitle}>Tente novamente em instantes</Text>
            </View>
          ) : (
            <FlatList
              data={flix2CatItems}
              keyExtractor={(item, i) => `cat-${i}-${item.title}`}
              numColumns={3}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, rowGap: 12 }}
              columnWrapperStyle={{ justifyContent: "space-between" }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <Flix2OnlyCard item={item} />}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews={true}
              updateCellsBatchingPeriod={50}
            />
          )}
        </View>

      ) : sourceFilter === "drive" && !isSearching ? (
        /* ─────────────────── DRIVE / R2 LIBRARY BROWSE ────────────────────── */
        <View style={{ flex: 1 }}>
          <View style={[styles.catHeader, { paddingVertical: 8 }]}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: GREEN }} />
              <Feather name="hard-drive" size={16} color={GREEN} />
              <Text style={[styles.catHeaderTitle, { color: GREEN }]}>Minha</Text>
              <Text style={styles.catHeaderTitle}> Biblioteca</Text>
              {r2All.length > 0 && (
                <View style={{ backgroundColor: "rgba(34,197,94,0.2)", borderColor: "rgba(34,197,94,0.4)", borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: GREEN, fontSize: 10, fontWeight: "800" }}>{r2All.length} títulos</Text>
                </View>
              )}
            </View>
          </View>
          {r2All.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="hard-drive" size={52} color="rgba(34,197,94,0.1)" />
              <Text style={styles.emptyTitle}>Drive vazio</Text>
              <Text style={styles.emptySubtitle}>Adicione conteúdo via painel Admin → R2</Text>
            </View>
          ) : (
            <FlatList
              data={r2All}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, rowGap: 12 }}
              columnWrapperStyle={{ justifyContent: "space-between" }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <PosterCard item={item} onPress={() => goTo(item)} />
              )}
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={7}
              removeClippedSubviews
              updateCellsBatchingPeriod={50}
            />
          )}
        </View>

      ) : (
        /* ─────────────────── DISCOVERY STATE ──────────────────────────────── */
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled" nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: 120 }}>

          {/* ── CATEGORY PILLS (compact) ───────────────────────────────────── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            nestedScrollEnabled directionalLockEnabled
            contentContainerStyle={styles.pillRow}>
            {CATEGORIES.map((cat) => (
              <Pressable key={cat.id}
                style={[styles.pill, { backgroundColor: cat.bg, borderColor: activeCategory === cat.id ? cat.color : "transparent", borderWidth: 1.5 }]}
                onPress={() => setActiveCategory(cat.id)}>
                <Feather name={cat.icon} size={12} color={cat.color} />
                <Text style={[styles.pillLabel, { color: cat.color }]}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* ── GENRE FILTER ROW ───────────────────────────────────────────── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            nestedScrollEnabled directionalLockEnabled
            contentContainerStyle={styles.genreRow}>
            {GENRES.map((g) => (
              <Pressable key={g.id}
                style={[styles.genrePill, activeGenre === g.id && { backgroundColor: g.color + "30", borderColor: g.color }]}
                onPress={() => activeGenre === g.id ? setActiveGenre(null) : loadGenre(g.id)}>
                <Text style={[styles.genreLabel, activeGenre === g.id && { color: g.color }]}>{g.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* ── GENRE RESULTS (when genre selected) ───────────────────────── */}
          {activeGenre && genreItems.length > 0 && (
            <SectionRow title={GENRES.find(g => g.id === activeGenre)?.label ?? "Gênero"}
              badge="GÊNERO"
              accentColor={GENRES.find(g => g.id === activeGenre)?.color ?? RED}>
              <FlatList
                data={genreItems}
                keyExtractor={(item) => item.id}
                numColumns={3}
                scrollEnabled={false}
                contentContainerStyle={{ paddingHorizontal: 16, rowGap: 12, paddingBottom: 8 }}
                columnWrapperStyle={{ justifyContent: "space-between" }}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={() => goTo(item)} />
                )}
                initialNumToRender={9}
                maxToRenderPerBatch={9}
                windowSize={3}
                removeClippedSubviews={true}
              />
            </SectionRow>
          )}

          {/* ── FLIX 2.0 CATALOG SHORTCUT ─────────────────────────────────── */}
          <Pressable style={styles.flix2ShortcutCard} onPress={() => setShowFlix2Catalog(true)}>
            <LinearGradient
              colors={["rgba(168,85,247,0.18)", "rgba(88,28,135,0.35)"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
              <View style={styles.flix2ShortcutIcon}>
                <Feather name="zap" size={22} color="#a855f7" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Text style={styles.flix2ShortcutTitle}>Catálogo</Text>
                  <Text style={[styles.flix2ShortcutTitle, { color: "#a855f7" }]}>Flix 2.0</Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(168,85,247,0.25)", borderWidth: 1, borderColor: "rgba(168,85,247,0.4)" }}>
                    <Text style={{ color: "#c084fc", fontSize: 9, fontWeight: "800" }}>PREMIUM</Text>
                  </View>
                </View>
                <Text style={styles.flix2ShortcutSub}>
                  Filmes · Séries · Animes — navegue o acervo completo
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color="rgba(168,85,247,0.6)" />
            </View>
          </Pressable>

          {/* ── MOOD CHIPS ─────────────────────────────────────────────────── */}
          <View style={styles.moodSection}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: AMBER }} />
              <Text style={[styles.moodTitle, { color: AMBER }]}>O que</Text>
              <Text style={styles.moodTitle}>quer assistir hoje?</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              nestedScrollEnabled directionalLockEnabled
              contentContainerStyle={{ gap: 8 }}>
              {MOODS.map((m) => (
                <Pressable key={m.id} style={styles.moodChip}
                  onPress={() => setQuery(m.query)}>
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={styles.moodLabel}>{m.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* ── HOT TAGS ───────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: PURPLE }} />
              <Text style={[styles.tagsTitle, { color: PURPLE }]}>#</Text>
              <Text style={styles.tagsTitle}>Tags em Alta</Text>
            </View>
            <View style={styles.tagsWrap}>
              {HOT_TAGS.map((tag) => (
                <Pressable key={tag} style={styles.tagChip}
                  onPress={() => setQuery(tag.replace("#",""))}>
                  <Text style={styles.tagText}>{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: "#050306" },
  centered:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32, paddingVertical: 40 },

  /* header */
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems:"center", justifyContent:"center" },
  headerTitle:  { color: "#fff", fontSize: 19, fontWeight: "900", letterSpacing: 1.5 },
  logoAccent:   { width: 4, height: 20, borderRadius: 2, backgroundColor: RED, marginRight: 6 },

  /* search bar */
  searchWrap:   { paddingHorizontal: 16, marginBottom: 12 },
  searchBar:    { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 10, gap: 9 },
  searchIconBox:{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(229,9,20,0.14)", alignItems:"center", justifyContent:"center" },
  searchInput:  { flex: 1, fontSize: 14, color: "#fff", fontWeight: "500", padding: 0 },
  micBtn:       { width: 30, height: 30, borderRadius: 15, alignItems:"center", justifyContent:"center", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.06)" },
  micBtnActive: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.14)" },
  clearBtn:     { width: 22, height: 22, borderRadius: 11, alignItems:"center", justifyContent:"center", backgroundColor: "rgba(255,255,255,0.2)" },

  /* history */
  historyWrap:     { marginBottom: 6 },
  historyHeader:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, paddingBottom: 6 },
  historyLabel:    { flex: 1, fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: "600", letterSpacing: 0.5 },
  historyClear:    { fontSize: 11, color: "rgba(229,9,20,0.7)", fontWeight: "700" },
  historyChip:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", maxWidth: 160 },
  historyChipText: { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "500" },

  /* category pills (compact) */
  pillRow:   { paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  pill:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  pillLabel: { fontSize: 13, fontWeight: "700" },

  /* genre pills */
  genreRow:   { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  genrePill:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.06)" },
  genreLabel: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "600" },

  /* mood section */
  moodSection: { paddingHorizontal: 16, marginBottom: 16 },
  moodTitle:   { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 10 },
  moodChip:    { flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:13, paddingVertical:8, borderRadius:20, backgroundColor:"rgba(255,255,255,0.07)", borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  moodEmoji:   { fontSize: 14 },
  moodLabel:   { color: "#fff", fontSize: 13, fontWeight: "600" },

  /* hot tags */
  tagsTitle: { color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "700", marginBottom: 8, letterSpacing: 0.3 },
  tagsWrap:  { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  tagText:   { color: RED, fontSize: 12, fontWeight: "700" },

  /* section wrapper */
  sectionWrap:   { marginBottom: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle:  { color: "#fff", fontSize: 15, fontWeight: "700" },
  seeAll:        { fontSize: 13, fontWeight: "700" },
  badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  badgeText:     { color: "#fff", fontSize: 10, fontWeight: "800" },

  /* poster card */
  cardTitle: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 15 },
  cardYear:  { color: "rgba(255,255,255,0.38)", fontSize: 10, marginTop: 1 },
  typeBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(8,145,178,0.8)" },
  typeBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  ratingBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.75)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)" },
  ratingText:  { color: "#f59e0b", fontSize: 10, fontWeight: "800" },

  /* backdrop card */
  backdropCard: { width: 240, borderRadius: 12, overflow: "hidden" },
  backdropImg:  { width: 240, height: CARD_W_H, backgroundColor: "#1a0a14", borderRadius: 12, overflow: "hidden" },
  backdropGrad: { position:"absolute", bottom:0, left:0, right:0, height: CARD_W_H * 0.6 },
  backdropInfo: { position:"absolute", bottom:8, left:8, right:8 },
  backdropTitle:{ color:"#fff", fontSize:12, fontWeight:"700", lineHeight:16 },
  backdropYear: { color:"rgba(255,255,255,0.5)", fontSize:10 },
  backdropDesc: { color:"rgba(255,255,255,0.45)", fontSize:10, marginTop:3, lineHeight:14 },
  backdropRank: { position:"absolute", top:6, left:8, color:"rgba(255,255,255,0.22)", fontSize:36, fontWeight:"900", fontStyle:"italic" },

  /* search results */
  resultsBar:   { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, marginBottom:12, flexWrap:"wrap", gap:8 },
  resultsLabel: { color:"rgba(255,255,255,0.45)", fontSize:13, fontWeight:"600" },
  filterChip:   { paddingHorizontal:10, paddingVertical:4, borderRadius:12, backgroundColor:"rgba(255,255,255,0.09)", borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  filterChipText:{ color:"rgba(255,255,255,0.7)", fontSize:11, fontWeight:"600" },

  loadingText:   { color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:8 },
  emptyTitle:    { color:"rgba(255,255,255,0.5)", fontSize:16, fontWeight:"700" },
  emptySubtitle: { color:"rgba(255,255,255,0.3)", fontSize:13, textAlign:"center" },
  emptyHint:     { color:"rgba(255,255,255,0.2)", fontSize:12, textAlign:"center" },

  /* grid */
  grid: { paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingBottom: 8, rowGap: 12 },

  /* flix2 badge (bottom-left corner of poster) */
  flix2Badge: {
    position: "absolute",
    bottom: 5,
    left: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(168,85,247,0.85)",
  },
  flix2BadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.3 },

  /* flix2 count row in results bar */
  flix2CountRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  flix2CountText: { color: "#a855f7", fontSize: 11, fontWeight: "700" },

  /* flix2 filter chip (toggle button in results bar) */
  flix2FilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#a855f7",
    backgroundColor: "rgba(168,85,247,0.1)",
  },
  flix2FilterChipActive: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  flix2FilterChipText: { color: "#a855f7", fontSize: 12, fontWeight: "800" },

  /* catalog mode */
  catHeader:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  catHeaderTitle: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 1 },
  catCount:       { color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: "600" },
  catTypeTab:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(168,85,247,0.3)", backgroundColor: "rgba(168,85,247,0.08)" },
  catTypeTabActive: { backgroundColor: "#a855f7", borderColor: "#a855f7" },
  catTypeTabText: { color: "rgba(168,85,247,0.9)", fontSize: 13, fontWeight: "700" },

  /* flix2 shortcut card in discovery */
  flix2ShortcutCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.3)",
    overflow: "hidden",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  flix2ShortcutIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "rgba(168,85,247,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.3)",
  },
  flix2ShortcutTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  flix2ShortcutSub:   { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "500" },

  /* source filter pills */
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sourcePillText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  /* flix2 exclusive section header */
  flix2OnlyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  flix2OnlyAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: "#a855f7" },
  flix2OnlyTitle:    { color: "#fff", fontSize: 15, fontWeight: "700" },
  flix2OnlySubtitle: { color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: "500" },
});
