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

function PosterCard({ item, onPress, showRating = true, width = CARD_W_3 }: {
  item: ContentItem;
  onPress: () => void;
  showRating?: boolean;
  width?: number;
}) {
  const h = width * 1.5;
  return (
    <Pressable style={{ width, marginBottom: 4 }} onPress={onPress}>
      <View style={{ width, height: h, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a0a14", marginBottom: 5 }}>
        {item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020","#0e0810"]} style={[StyleSheet.absoluteFill, { alignItems:"center", justifyContent:"center" }]}>
            <Feather name="film" size={24} color="rgba(255,255,255,0.1)" />
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.8)"]} style={{ position:"absolute", bottom:0, left:0, right:0, height: h * 0.4 }} />
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
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardYear}>{item.year} · {item.mediaType === "tv" ? "Série" : "Filme"}</Text>
    </Pressable>
  );
}

function BackdropCard({ item, onPress, rank }: { item: ContentItem; onPress: () => void; rank?: number }) {
  return (
    <Pressable style={styles.backdropCard} onPress={onPress}>
      <View style={styles.backdropImg}>
        {item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={["#2a1020","#0e0810"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={styles.backdropGrad} />
        {rank !== undefined && (
          <Text style={styles.backdropRank}>#{rank + 1}</Text>
        )}
        <View style={styles.backdropInfo}>
          <Text style={styles.backdropTitle} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection:"row", alignItems:"center", gap:8, marginTop:3 }}>
            <Text style={styles.backdropYear}>{item.year}</Text>
            {item.rating >= 6 && (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingText}>★ {item.rating.toFixed(1)}</Text>
              </View>
            )}
            <View style={[styles.typeBadge, item.mediaType === "tv" ? {} : { backgroundColor:"rgba(229,9,20,0.8)" }]}>
              <Text style={styles.typeBadgeText}>{item.mediaType === "tv" ? "SÉRIE" : "FILME"}</Text>
            </View>
          </View>
          {item.description ? (
            <Text style={styles.backdropDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function SectionRow({ title, badge, accentColor = RED, onSeeAll, children }: {
  title: string; badge?: string; accentColor?: string; onSeeAll?: () => void; children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionWrap}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
          <View style={{ width:3, height:18, borderRadius:2, backgroundColor: accentColor }} />
          <Text style={styles.sectionTitle}>{title}</Text>
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
    </View>
  );
}

export default function BuscarScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const params   = useLocalSearchParams<{ q?: string }>();
  const inputRef = useRef<TextInput>(null);
  const topPad   = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [query,         setQuery]         = useState(params.q ?? "");
  const [results,       setResults]       = useState<ContentItem[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [activeCategory,setActiveCategory]= useState<string>("trending");
  const [activeGenre,   setActiveGenre]   = useState<string | null>(null);

  // ── Content rows ────────────────────────────────────────────────────────────
  const [trending,   setTrending]   = useState<ContentItem[]>([]);
  const [topMovies,  setTopMovies]  = useState<ContentItem[]>([]);
  const [topSeries,  setTopSeries]  = useState<ContentItem[]>([]);
  const [newContent, setNewContent] = useState<ContentItem[]>([]);
  const [popular,    setPopular]    = useState<ContentItem[]>([]);
  const [acclaimed,  setAcclaimed]  = useState<ContentItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<ContentItem[]>([]);
  const [onAir,      setOnAir]      = useState<ContentItem[]>([]);
  const [action,     setAction]     = useState<ContentItem[]>([]);
  const [horror,     setHorror]     = useState<ContentItem[]>([]);
  const [anime,      setAnime]      = useState<ContentItem[]>([]);
  const [kdrama,     setKdrama]     = useState<ContentItem[]>([]);
  const [genreItems, setGenreItems] = useState<ContentItem[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [micOn,      setMicOn]      = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
    loadAllContent();
  }, []);

  const loadAllContent = useCallback(async () => {
    try {
      const [
        r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11
      ] = await Promise.all([
        tfetch("/trending/all/week"),
        tfetch("/movie/top_rated"),
        tfetch("/tv/top_rated"),
        tfetch("/movie/upcoming"),
        tfetch("/movie/popular"),
        tfetch("/movie/top_rated", { page: "2" }),
        tfetch("/movie/now_playing"),
        tfetch("/tv/on_the_air"),
        tfetch("/discover/movie", { with_genres: "28,12", sort_by: "popularity.desc" }),
        tfetch("/discover/movie", { with_genres: "27", sort_by: "popularity.desc" }),
        tfetch("/discover/tv",    { with_genres: "16", with_origin_country: "JP" }),
        tfetch("/discover/tv",    { with_origin_country: "KR", sort_by: "popularity.desc" }),
      ]);
      setTrending(  (r0.results ?? []).slice(0,20).map((x: any) => toItem(x)));
      setTopMovies( (r1.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setTopSeries( (r2.results ?? []).slice(0,20).map((x: any) => toItem(x, "tv")));
      setNewContent((r3.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setPopular(   (r4.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setAcclaimed( (r5.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setNowPlaying((r6.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setOnAir(     (r7.results ?? []).slice(0,20).map((x: any) => toItem(x, "tv")));
      setAction(    (r8.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setHorror(    (r9.results ?? []).slice(0,20).map((x: any) => toItem(x, "movie")));
      setAnime(     (r10.results ?? []).slice(0,20).map((x: any) => toItem(x, "tv")));
      setKdrama(    (r11.results ?? []).slice(0,20).map((x: any) => toItem(x, "tv")));
      setDataLoaded(true);
    } catch {}
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
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await tfetch("/search/multi", { query: q, include_adult: "false", page: "1" });
        const items: ContentItem[] = (data.results ?? [])
          .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
          .map((x: any) => toItem(x));
        setResults(items);
      } catch {}
      setLoading(false);
    }, 380);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  const isSearching = query.trim().length >= 2;

  // ── Helper: horizontal scroll of poster cards ─────────────────────────────
  const HRow = ({ items, accentColor = RED }: { items: ContentItem[]; accentColor?: string }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      directionalLockEnabled
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {items.map((item) => (
        <PosterCard key={item.id} item={item} onPress={() => goTo(item)} width={100} />
      ))}
    </ScrollView>
  );

  // ── Helper: backdrop cards row ─────────────────────────────────────────────
  const BRow = ({ items, ranked }: { items: ContentItem[]; ranked?: boolean }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      directionalLockEnabled
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
      {items.slice(0, 10).map((item, i) => (
        <BackdropCard key={item.id} item={item} onPress={() => goTo(item)} rank={ranked ? i : undefined} />
      ))}
    </ScrollView>
  );

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

      {isSearching ? (
        /* ─────────────────── SEARCH RESULTS ───────────────────────────────── */
        <View style={{ flex: 1 }}>
          <View style={styles.resultsBar}>
            {loading ? (
              <ActivityIndicator color={RED} size="small" />
            ) : (
              <Text style={styles.resultsLabel}>
                {results.length > 0
                  ? `${results.length} resultado${results.length !== 1 ? "s" : ""} · "${query.trim()}"`
                  : `Nenhum resultado para "${query.trim()}"`}
              </Text>
            )}
            <View style={{ flexDirection:"row", gap:8 }}>
              {["Todos","Filmes","Séries"].map((f) => (
                <View key={f} style={styles.filterChip}>
                  <Text style={styles.filterChipText}>{f}</Text>
                </View>
              ))}
            </View>
          </View>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={RED} size="large" />
              <Text style={styles.loadingText}>Buscando...</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="search" size={56} color="rgba(255,255,255,0.06)" />
              <Text style={styles.emptyTitle}>Nenhum resultado</Text>
              <Text style={styles.emptySubtitle}>Tente outro termo de busca</Text>
              <Text style={styles.emptyHint}>Sugestões: {HOT_TAGS.slice(0,4).join(", ")}</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              numColumns={3}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <PosterCard item={item} onPress={() => goTo(item)} />
              )}
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
                contentContainerStyle={styles.grid}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={() => goTo(item)} />
                )}
              />
            </SectionRow>
          )}

          {/* ── MOOD CHIPS ─────────────────────────────────────────────────── */}
          <View style={styles.moodSection}>
            <Text style={styles.moodTitle}>⚡ O que quer assistir hoje?</Text>
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
            <Text style={styles.tagsTitle}># Tags em Alta</Text>
            <View style={styles.tagsWrap}>
              {HOT_TAGS.map((tag) => (
                <Pressable key={tag} style={styles.tagChip}
                  onPress={() => setQuery(tag.replace("#",""))}>
                  <Text style={styles.tagText}>{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {!dataLoaded ? (
            <View style={styles.centered}>
              <ActivityIndicator color={RED} />
              <Text style={styles.loadingText}>Carregando conteúdo...</Text>
            </View>
          ) : (
            <>
              {/* ── 1. EM ALTA AGORA (backdrop cards, ranked) ─────────────── */}
              <SectionRow title="Em Alta Agora" badge="TOP 10" accentColor={RED}
                onSeeAll={() => {}}>
                <BRow items={trending} ranked />
              </SectionRow>

              {/* ── 2. TOP FILMES (poster row) ─────────────────────────────── */}
              <SectionRow title="Top Filmes" badge="AVALIADOS" accentColor={AMBER}
                onSeeAll={() => setQuery("filmes mais bem avaliados")}>
                <HRow items={topMovies} accentColor={AMBER} />
              </SectionRow>

              {/* ── 3. EM CARTAZ AGORA ────────────────────────────────────── */}
              <SectionRow title="Em Cartaz Agora" accentColor={GREEN}
                onSeeAll={() => setQuery("filmes em cartaz")}>
                <BRow items={nowPlaying} />
              </SectionRow>

              {/* ── 4. TOP SÉRIES ─────────────────────────────────────────── */}
              <SectionRow title="Séries Mais Bem Avaliadas" badge="TOP" accentColor={PURPLE}
                onSeeAll={() => setQuery("melhores séries")}>
                <HRow items={topSeries} accentColor={PURPLE} />
              </SectionRow>

              {/* ── 5. LANÇAMENTOS ────────────────────────────────────────── */}
              <SectionRow title="Lançamentos em Breve" accentColor={TEAL}
                onSeeAll={() => setQuery("lançamentos")}>
                <BRow items={newContent} />
              </SectionRow>

              {/* ── 6. SÉRIES NO AR AGORA ─────────────────────────────────── */}
              <SectionRow title="Séries no Ar Agora" badge="AO VIVO" accentColor={PINK}
                onSeeAll={() => setQuery("séries em andamento")}>
                <HRow items={onAir} accentColor={PINK} />
              </SectionRow>

              {/* ── 7. FILMES POPULARES ────────────────────────────────────── */}
              <SectionRow title="Filmes Populares" accentColor={AMBER}
                onSeeAll={() => setQuery("filmes populares")}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled directionalLockEnabled
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                  {popular.slice(0,10).map((item) => (
                    <BackdropCard key={item.id} item={item} onPress={() => goTo(item)} />
                  ))}
                </ScrollView>
              </SectionRow>

              {/* ── 8. AÇÃO & AVENTURA ────────────────────────────────────── */}
              <SectionRow title="Ação & Aventura" accentColor="#ef4444"
                onSeeAll={() => setQuery("ação aventura")}>
                <HRow items={action} accentColor="#ef4444" />
              </SectionRow>

              {/* ── 9. TERROR & SUSPENSE ──────────────────────────────────── */}
              <SectionRow title="Terror & Suspense" accentColor="#1d4ed8"
                onSeeAll={() => setQuery("terror suspense")}>
                <BRow items={horror} />
              </SectionRow>

              {/* ── 10. ANIME ────────────────────────────────────────────── */}
              <SectionRow title="Anime" badge="JAPÃO" accentColor="#ea580c"
                onSeeAll={() => setQuery("anime")}>
                <HRow items={anime} accentColor="#ea580c" />
              </SectionRow>

              {/* ── 11. K-DRAMA ──────────────────────────────────────────── */}
              <SectionRow title="K-Drama" badge="CORÉIA" accentColor="#7c3aed"
                onSeeAll={() => setQuery("k-drama coreia")}>
                <BRow items={kdrama} />
              </SectionRow>

              {/* ── 12. CLÁSSICOS ACLAMADOS ──────────────────────────────── */}
              <SectionRow title="Clássicos Aclamados" accentColor={AMBER}
                onSeeAll={() => setQuery("clássicos cinema")}>
                <HRow items={acclaimed} accentColor={AMBER} />
              </SectionRow>

            </>
          )}
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
  grid: { paddingHorizontal: 16, gap: 8 },
});
