import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { api, tmdbItemToContent } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: SW } = Dimensions.get("window");
const RED = "#ff1a1a";
const RED_DIM = "rgba(255,26,26,0.13)";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_BORDER = "rgba(255,255,255,0.09)";
const BG = "#050505";

const TMDB_IMG = (path: string | null, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const itemTitle = (item: TmdbItem) => item.title ?? item.name ?? "Sem título";
const itemYear  = (item: TmdbItem) => (item.release_date ?? item.first_air_date ?? "2024").slice(0, 4);
const isMovie   = (item: TmdbItem) => item.media_type === "movie" || (!!item.title && !item.name);

const RECENT_SEARCHES = ["The Boys", "UFC", "Naruto", "ESPN", "Harry Potter"];

const QUICK_CARDS = [
  { label: "Em Alta",          icon: "trending-up", color: RED,       accent: "rgba(255,26,26,0.18)" },
  { label: "Ao Vivo",          icon: "radio",       color: "#22d3ee", accent: "rgba(34,211,238,0.15)" },
  { label: "Novidades",        icon: "calendar",    color: "#a78bfa", accent: "rgba(167,139,250,0.15)" },
  { label: "Recomendados IA",  icon: "cpu",         color: "#34d399", accent: "rgba(52,211,153,0.15)" },
  { label: "Continue",         icon: "play-circle", color: "#fbbf24", accent: "rgba(251,191,36,0.15)" },
];

const FRANCHISE_DATA = [
  { label: "Marvel",        color: "#e50914", tmdbType: "collection" as const, tmdbId: 131292, routeType: "collection" as const },
  { label: "DC",            color: "#1a56db", tmdbType: "collection" as const, tmdbId: 263,    routeType: "collection" as const },
  { label: "Harry\nPotter", color: "#b45309", tmdbType: "collection" as const, tmdbId: 1241,   routeType: "collection" as const },
  { label: "Naruto",        color: "#f97316", tmdbType: "tv" as const,         tmdbId: 46260,  routeType: "tv" as const },
  { label: "Star\nWars",    color: "#22d3ee", tmdbType: "collection" as const, tmdbId: 10,     routeType: "collection" as const },
  { label: "Disney+",       color: "#a78bfa", tmdbType: null,                  tmdbId: null,   routeType: "streaming" as const },
];

const GENRE_DATA = [
  { label: "Ação",    color: "#ef4444", genreId: "28",  tmdbType: "movie" as const, tmdbId: 299534, routeType: "movie" },
  { label: "Terror",  color: "#7c3aed", genreId: "27",  tmdbType: "movie" as const, tmdbId: 539,    routeType: "movie" },
  { label: "Anime",   color: "#f97316", genreId: "16",  tmdbType: "movie" as const, tmdbId: 129,    routeType: "movie" },
  { label: "Futebol", color: "#22c55e", genreId: null,  tmdbType: null,             tmdbId: null,   routeType: "live"  },
  { label: "Drama",   color: "#3b82f6", genreId: "18",  tmdbType: "tv" as const,    tmdbId: 1396,   routeType: "tv"    },
  { label: "Ficção",  color: "#06b6d4", genreId: "878", tmdbType: "movie" as const, tmdbId: 324857, routeType: "movie" },
];

const MOOD_DATA = [
  { label: "Algo épico",     color: "#f59e0b", tmdbType: "movie" as const, tmdbId: 299536, genreId: "12",    routeType: "movie" },
  { label: "Quero rir",      color: "#22c55e", tmdbType: "movie" as const, tmdbId: 616037, genreId: "35",    routeType: "movie" },
  { label: "Quero suspense", color: "#7c3aed", tmdbType: "movie" as const, tmdbId: 539,    genreId: "53",    routeType: "movie" },
  { label: "Ao vivo agora",  color: RED,       tmdbType: null,             tmdbId: null,   genreId: null,    routeType: "live"  },
  { label: "Algo leve",      color: "#f97316", tmdbType: "movie" as const, tmdbId: 10193,  genreId: "10751", routeType: "movie" },
];

const SEARCH_CHANNELS = [
  { id: "espn",      name: "ESPN",         description: "Esportes ao vivo",           color: "#ef4444" },
  { id: "disney",    name: "Disney+",      description: "Filmes e séries da Disney",  color: "#a78bfa" },
  { id: "amazon",    name: "Prime Video",  description: "Amazon Prime Video",         color: "#22d3ee" },
  { id: "max",       name: "Max",          description: "HBO e Max originais",        color: "#1a56db" },
  { id: "globo",     name: "Globoplay",    description: "Conteúdo Globo",             color: "#f97316" },
  { id: "telecine",  name: "Telecine",     description: "Filmes em HD",              color: "#fbbf24" },
  { id: "paramount", name: "Paramount+",   description: "Filmes e séries",           color: "#3b82f6" },
  { id: "apple",     name: "Apple TV+",    description: "Originais Apple",           color: "#22c55e" },
];

const TMDB_API_KEY = "8f0beb08cf016ec8de49e454e09879ec";

function TmdbCard({
  tmdbType, tmdbId, label, color, cardStyle, onPress,
}: {
  tmdbType: "movie" | "tv" | "collection" | null;
  tmdbId: number | null;
  label: string;
  color: string;
  cardStyle?: any;
  onPress?: () => void;
}) {
  const [imgPath, setImgPath] = useState<string | null>(null);
  useEffect(() => {
    if (!tmdbId || !tmdbType) return;
    const url = tmdbType === "collection"
      ? `https://api.themoviedb.org/3/collection/${tmdbId}?api_key=${TMDB_API_KEY}`
      : `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    fetch(url).then(r => r.json()).then(d => setImgPath(d.backdrop_path || d.poster_path)).catch(() => {});
  }, [tmdbId, tmdbType]);
  const imgUrl = imgPath ? `https://image.tmdb.org/t/p/w500${imgPath}` : null;
  return (
    <Pressable onPress={onPress} style={[{ overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: `${color}35` }, cardStyle]}>
      {imgUrl
        ? <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: `${color}18` }]} />
      }
      <LinearGradient colors={["transparent", `${color}99`, `${color}ee`]} locations={[0.1, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", bottom: 8, left: 6, right: 6, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11, textAlign: "center", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/* ── Rank Badge Card (Em Alta Top 10) ── */
function RankCard({ item, rank, onPress }: { item: TmdbItem; rank: number; onPress: () => void }) {
  const img = TMDB_IMG(item.poster_path);
  const rating = item.vote_average?.toFixed(1) ?? "–";
  return (
    <Pressable onPress={onPress} style={rc.wrap}>
      <Text style={rc.rank}>{rank}</Text>
      <View style={rc.card}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        <LinearGradient colors={["transparent", "rgba(5,5,5,0.95)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
        <View style={rc.info}>
          <Text style={rc.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <View style={rc.meta}>
            <Text style={rc.type}>{isMovie(item) ? "Filme" : "Série"}</Text>
            <Text style={rc.dot}>·</Text>
            <Text style={rc.year}>{itemYear(item)}</Text>
          </View>
          <View style={rc.ratingRow}>
            <Text style={rc.star}>⭐</Text>
            <Text style={rc.ratingTxt}>{rating}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
const rc = StyleSheet.create({
  wrap: { marginRight: 10, alignItems: "flex-end" },
  rank: {
    fontSize: 64, fontWeight: "900", color: "rgba(255,255,255,0.12)",
    lineHeight: 56, marginRight: 8, alignSelf: "flex-start",
    position: "absolute", bottom: 0, left: -8, zIndex: 0,
  },
  card: {
    width: 130, height: 186, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "#111",
    zIndex: 1, justifyContent: "flex-end",
  },
  info: { padding: 8, gap: 2 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  meta: { flexDirection: "row", alignItems: "center", gap: 3 },
  type: { fontSize: 9, color: "rgba(255,255,255,0.45)" },
  dot: { fontSize: 9, color: "rgba(255,255,255,0.25)" },
  year: { fontSize: 9, color: "rgba(255,255,255,0.45)" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  star: { fontSize: 9 },
  ratingTxt: { fontSize: 10, color: "#fbbf24", fontWeight: "700" },
});

/* ── Trend Card (big card for Tendências) ── */
function TrendCard({
  item, badge, onPress,
}: { item: TmdbItem; badge?: string; badgeColor?: string; onPress: () => void }) {
  const img = TMDB_IMG(item.backdrop_path, "w780") ?? TMDB_IMG(item.poster_path);
  const rating = item.vote_average?.toFixed(1) ?? "–";
  return (
    <Pressable onPress={onPress} style={trnd.card}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,5,0.98)"]} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
      {badge && (
        <View style={[trnd.badge, badge === "NOVO EPISÓDIO" && trnd.badgeNew, badge === "AO VIVO" && trnd.badgeLive]}>
          {badge === "AO VIVO" && <View style={trnd.liveDot} />}
          <Text style={trnd.badgeTxt}>{badge}</Text>
        </View>
      )}
      <View style={trnd.info}>
        <Text style={trnd.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <View style={trnd.meta}>
          <Text style={trnd.sub}>{isMovie(item) ? "Filme" : "Série"}</Text>
          <Text style={trnd.sub}> · </Text>
          <Text style={trnd.sub}>{itemYear(item)}</Text>
          <Text style={trnd.sub}> · </Text>
          <Text style={trnd.ratingStar}>⭐</Text>
          <Text style={trnd.ratingVal}>{rating}</Text>
        </View>
        <Pressable onPress={onPress} style={trnd.playBtn}>
          <Feather name="play" size={11} color="#fff" />
        </Pressable>
      </View>
    </Pressable>
  );
}
const trnd = StyleSheet.create({
  card: {
    width: 160, height: 220, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 10,
    backgroundColor: "#111", justifyContent: "flex-end",
  },
  badge: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: RED, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  badgeNew: { backgroundColor: "#7c3aed" },
  badgeLive: { backgroundColor: "rgba(34,197,94,0.9)" },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },
  info: { padding: 10, gap: 3 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  meta: { flexDirection: "row", alignItems: "center" },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  ratingStar: { fontSize: 10 },
  ratingVal: { fontSize: 10, color: "#fbbf24", fontWeight: "600" },
  playBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
    marginTop: 4, alignSelf: "flex-start",
    shadowColor: RED, shadowRadius: 8, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 },
  },
});

/* ── Live Result Row (search results) ── */
function ResultCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const img = item.backdropPath || item.posterPath;
  const rating = item.rating?.toFixed(1) ?? "–";
  return (
    <Pressable onPress={onPress} style={rs.wrap}>
      <View style={rs.poster}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        <LinearGradient colors={["transparent", "rgba(5,5,5,0.7)"]} style={StyleSheet.absoluteFill} />
        <View style={rs.playIcon}>
          <Feather name="play" size={14} color="#fff" />
        </View>
      </View>
      <View style={rs.info}>
        <Text style={rs.title} numberOfLines={2}>{item.title}</Text>
        <View style={rs.metaRow}>
          <View style={rs.typeBadge}>
            <Text style={rs.typeTxt}>{item.type === "movie" ? "Filme" : "Série"}</Text>
          </View>
          <Text style={rs.year}>{item.year}</Text>
          {item.genres?.[0] && (
            <Text style={rs.genre} numberOfLines={1}>{item.genres[0]}</Text>
          )}
        </View>
        <View style={rs.ratingRow}>
          <Text style={rs.ratingStar}>⭐</Text>
          <Text style={rs.ratingTxt}>{rating}</Text>
          <Text style={rs.ratingLabel}> · TMDB</Text>
        </View>
        {item.description ? (
          <Text style={rs.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
      <Pressable onPress={onPress} style={rs.watchBtn}>
        <Text style={rs.watchTxt}>Assistir</Text>
      </Pressable>
    </Pressable>
  );
}
const rs = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, marginBottom: 12,
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: GLASS_BORDER,
    padding: 10, gap: 12,
  },
  poster: {
    width: 72, height: 106, borderRadius: 10, overflow: "hidden",
    backgroundColor: "#111", flexShrink: 0,
  },
  playIcon: {
    position: "absolute", bottom: 6, right: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  info: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: "700", color: "#fff", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  typeBadge: {
    backgroundColor: RED_DIM, borderWidth: 1, borderColor: "rgba(255,26,26,0.3)",
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  typeTxt: { fontSize: 9, fontWeight: "700", color: RED },
  year: { fontSize: 11, color: "rgba(255,255,255,0.4)" },
  genre: { fontSize: 11, color: "rgba(255,255,255,0.35)", flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center" },
  ratingStar: { fontSize: 11 },
  ratingTxt: { fontSize: 12, color: "#fbbf24", fontWeight: "700" },
  ratingLabel: { fontSize: 10, color: "rgba(255,255,255,0.3)" },
  desc: { fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 16 },
  watchBtn: {
    backgroundColor: RED, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: RED, shadowRadius: 6, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 0 },
  },
  watchTxt: { fontSize: 11, fontWeight: "700", color: "#fff" },
});

/* ═══════════════════════════════════════════
   MAIN SCREEN
═══════════════════════════════════════════ */
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 64 : insets.top;

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<ContentItem[]>([]);
  const [collectionResults, setCollectionResults] = useState<any[]>([]);
  const [searchTab, setSearchTab] = useState<"media" | "collections" | "channels">("media");
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [popular, setPopular] = useState<TmdbItem[]>([]);
  const [recents, setRecents] = useState<string[]>(RECENT_SEARCHES);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem("netplay_active_profile_v2")
      .then(raw => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
  }, [user?.id]);

  const load = useCallback(async () => {
    try {
      const [t, pm, ptv] = await Promise.all([
        api.tmdb.trending(),
        api.tmdb.popularMovies(),
        api.tmdb.popularTv(),
      ]);
      setTrending(t.all.slice(0, 16));
      setPopular([...pm.slice(0, 8), ...ptv.slice(0, 8)].sort(() => Math.random() - 0.5));
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchTmdb = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setCollectionResults([]); setSearchTab("media"); return; }
    setSearchLoading(true);
    try {
      const data = await api.tmdb.search(q, "multi");
      const items = data.results
        .filter((r: TmdbItem) => r.media_type === "movie" || r.media_type === "tv")
        .map(tmdbItemToContent);
      const cols = data.results.filter((r: any) => r.media_type === "collection");
      setResults(items);
      setCollectionResults(cols);
    } catch { setResults([]); setCollectionResults([]); }
    finally { setSearchLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTmdb(query), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchTmdb]);

  const onFocus = () => {
    setFocused(true);
    Animated.timing(glowAnim, { toValue: 1, duration: 280, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    if (!query) {
      setFocused(false);
      Animated.timing(glowAnim, { toValue: 0, duration: 280, useNativeDriver: false }).start();
    }
  };

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const glowSize   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });

  const navigate = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.type === "movie" ? "movie" : "tv", id: String((item as any).tmdbId ?? item.id), title: item.title },
    });
  };

  const navigateTmdb = (item: TmdbItem) => {
    router.push({
      pathname: "/detail",
      params: { type: isMovie(item) ? "movie" : "tv", id: String(item.id), title: itemTitle(item) },
    });
  };

  const top10 = trending.slice(0, 10);
  const tendencias = popular.slice(0, 8);
  const badges = ["🔥 HOT", "NOVO EPISÓDIO", "AO VIVO", "🔥 HOT", "NOVO EPISÓDIO", "🔥 HOT", "AO VIVO", "NOVO EPISÓDIO"];
  const badgeLabels = ["HOT", "NOVO EPISÓDIO", "AO VIVO", "HOT", "NOVO EPISÓDIO", "HOT", "AO VIVO", "NOVO EPISÓDIO"];

  const isSearching = query.trim().length > 0;
  const channelResults = SEARCH_CHANNELS.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HEADER ── */}
        <View style={[s.header, { paddingTop: topPad + 10 }]}>
          <Text style={s.logo}><Text style={s.logoRed}>NET</Text>PLAY</Text>
          <View style={s.headerRight}>
            <Pressable style={s.iconBtn}>
              <Feather name="bell" size={19} color="rgba(255,255,255,0.8)" />
              <View style={s.notifDot} />
            </Pressable>
            <Pressable
              style={[s.avatarBtn, { overflow: "hidden" }]}
              onPress={() => router.push("/(tabs)/profile")}
            >
              {activeProfile?.avatarUrl ? (
                <Image source={{ uri: activeProfile.avatarUrl }} style={{ width: 36, height: 36 }} contentFit="cover" />
              ) : (
                <Text style={s.avatarTxt}>
                  {(activeProfile?.name ?? user?.username ?? "N")[0]?.toUpperCase()}
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── SEARCH BAR ── */}
        <View style={s.searchWrap}>
          <Animated.View style={[s.searchGlow, { opacity: glowOpacity, shadowRadius: glowSize }]} />
          <View style={[s.searchBar, focused && s.searchBarFocused]}>
            <Feather name="search" size={18} color={focused ? RED : "rgba(255,255,255,0.35)"} />
            <TextInput
              ref={inputRef}
              style={s.searchInput}
              placeholder="Buscar filmes, séries, canais, atores..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={query}
              onChangeText={setQuery}
              onFocus={onFocus}
              onBlur={onBlur}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchLoading ? (
              <ActivityIndicator size="small" color={RED} />
            ) : query.length > 0 ? (
              <Pressable onPress={() => { setQuery(""); setResults([]); }}>
                <Feather name="x-circle" size={17} color="rgba(255,255,255,0.4)" />
              </Pressable>
            ) : null}
            <Pressable style={s.micBtn}>
              <Feather name="mic" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* ── SEARCH RESULTS (when typing) ── */}
        {isSearching ? (
          <View style={{ marginTop: 4 }}>
            {/* Filter tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 14 }}>
              {(["media", "collections", "channels"] as const).map((tab) => {
                const labels = { media: "Filmes & Séries", collections: "Coleções", channels: "Canais" };
                const counts = { media: results.length, collections: collectionResults.length, channels: channelResults.length };
                const active = searchTab === tab;
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setSearchTab(tab)}
                    style={[
                      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
                      active ? { backgroundColor: RED, borderColor: RED } : { backgroundColor: GLASS, borderColor: GLASS_BORDER },
                    ]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                      {labels[tab]}{counts[tab] > 0 ? ` (${counts[tab]})` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {searchLoading && results.length === 0 && searchTab === "media" && (
              <View style={s.searchingState}>
                <ActivityIndicator size="large" color={RED} />
                <Text style={s.searchingTxt}>Buscando "{query}"...</Text>
              </View>
            )}

            {/* Media: Filmes & Séries */}
            {searchTab === "media" && !searchLoading && results.length === 0 && (
              <View style={s.searchingState}>
                <Feather name="search" size={36} color="rgba(255,255,255,0.15)" />
                <Text style={s.noResultTxt}>Nenhum resultado para "{query}"</Text>
                <Text style={s.noResultSub}>Tente um outro título ou ator</Text>
              </View>
            )}
            {searchTab === "media" && results.map((item) => (
              <ResultCard key={item.id} item={item} onPress={() => navigate(item)} />
            ))}

            {/* Collections */}
            {searchTab === "collections" && !searchLoading && collectionResults.length === 0 && (
              <View style={s.searchingState}>
                <Feather name="box" size={36} color="rgba(255,255,255,0.15)" />
                <Text style={s.noResultTxt}>Nenhuma coleção para "{query}"</Text>
              </View>
            )}
            {searchTab === "collections" && collectionResults.map((col) => (
              <Pressable
                key={col.id}
                style={rs.wrap}
                onPress={() => router.push({ pathname: "/collection", params: { id: col.id, title: col.name } })}
              >
                <View style={rs.poster}>
                  {col.backdrop_path || col.poster_path ? (
                    <Image source={{ uri: TMDB_IMG(col.backdrop_path ?? col.poster_path)! }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="box" size={20} color="#444" />
                    </View>
                  )}
                </View>
                <View style={rs.info}>
                  <Text style={rs.title} numberOfLines={2}>{col.name}</Text>
                  <View style={rs.metaRow}>
                    <View style={[rs.typeBadge, { backgroundColor: "rgba(26,86,219,0.15)", borderColor: "rgba(26,86,219,0.3)" }]}>
                      <Text style={[rs.typeTxt, { color: "#1a56db" }]}>Coleção</Text>
                    </View>
                    {col.parts && <Text style={rs.year}>{col.parts.length} títulos</Text>}
                  </View>
                </View>
                <View style={[rs.watchBtn, { backgroundColor: "#1a56db" }]}>
                  <Text style={rs.watchTxt}>Ver</Text>
                </View>
              </Pressable>
            ))}

            {/* Channels */}
            {searchTab === "channels" && channelResults.length === 0 && (
              <View style={s.searchingState}>
                <Feather name="tv" size={36} color="rgba(255,255,255,0.15)" />
                <Text style={s.noResultTxt}>Nenhum canal para "{query}"</Text>
              </View>
            )}
            {searchTab === "channels" && channelResults.map((ch) => (
              <Pressable key={ch.id} style={rs.wrap} onPress={() => router.push("/(tabs)/channels")}>
                <View style={[rs.poster, { backgroundColor: `${ch.color}22`, alignItems: "center", justifyContent: "center" }]}>
                  <Feather name="tv" size={26} color={ch.color} />
                </View>
                <View style={rs.info}>
                  <Text style={rs.title}>{ch.name}</Text>
                  <Text style={rs.desc}>{ch.description}</Text>
                </View>
                <View style={[rs.watchBtn, { backgroundColor: ch.color }]}>
                  <Text style={rs.watchTxt}>Abrir</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            {/* ── QUICK ACCESS CARDS ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickScroll}>
              {QUICK_CARDS.map((q) => {
                const handleQuick = () => {
                  if (q.label === "Ao Vivo") router.push("/(tabs)/channels");
                  else if (q.label === "Novidades") router.push("/(tabs)/novidades");
                  else if (q.label === "Continue") router.push("/(tabs)/list");
                  else if (q.label === "Recomendados IA") { inputRef.current?.focus(); }
                  else router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: q.label } });
                };
                return (
                  <Pressable key={q.label} onPress={handleQuick} style={[s.quickCard, { backgroundColor: q.accent, borderColor: `${q.color}30` }]}>
                    <View style={[s.quickIcon, { backgroundColor: `${q.color}22` }]}>
                      <Feather name={q.icon as any} size={18} color={q.color} />
                    </View>
                    <Text style={[s.quickLabel, { color: q.color }]}>{q.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── RECENT SEARCHES ── */}
            {recents.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionRow}>
                  <View style={s.sectionLeft}>
                    <Feather name="clock" size={13} color="rgba(255,255,255,0.35)" />
                    <Text style={s.sectionTitle}>Pesquisas recentes</Text>
                  </View>
                  <Pressable onPress={() => setRecents([])}>
                    <Text style={s.clearAll}>Limpar tudo</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentsWrap}>
                  {recents.map((r) => (
                    <Pressable
                      key={r}
                      style={s.recentPill}
                      onPress={() => { setQuery(r); inputRef.current?.focus(); }}
                    >
                      <Text style={s.recentTxt}>{r}</Text>
                      <Pressable
                        onPress={() => setRecents((p) => p.filter((x) => x !== r))}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Feather name="x" size={11} color="rgba(255,255,255,0.4)" />
                      </Pressable>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── EM ALTA AGORA TOP 10 ── */}
            {top10.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionRow}>
                  <View style={s.sectionLeft}>
                    <View style={[s.sectionIcon, { backgroundColor: "rgba(255,26,26,0.15)" }]}>
                      <Feather name="trending-up" size={12} color={RED} />
                    </View>
                    <Text style={s.sectionTitle}>Em alta agora</Text>
                  </View>
                  <Text style={s.seeAll}>Ver todos  ›</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {top10.map((item, i) => (
                    <RankCard key={item.id} item={item} rank={i + 1} onPress={() => navigateTmdb(item)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── EXPLORAR POR GÊNERO ── */}
            <View style={s.section}>
              <View style={s.sectionRow}>
                <View style={s.sectionLeft}>
                  <View style={[s.sectionIcon, { backgroundColor: "rgba(167,139,250,0.15)" }]}>
                    <Feather name="grid" size={12} color="#a78bfa" />
                  </View>
                  <Text style={s.sectionTitle}>Explorar por gênero</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {GENRE_DATA.map((g) => {
                  const handleGenre = () => {
                    if (g.routeType === "live") router.push("/(tabs)/channels");
                    else if (g.genreId) router.push({ pathname: "/genre-browse", params: { genre_id: g.genreId, type: g.routeType, title: g.label } });
                  };
                  return (
                    <TmdbCard
                      key={g.label}
                      tmdbType={g.tmdbType}
                      tmdbId={g.tmdbId}
                      label={g.label}
                      color={g.color}
                      cardStyle={s.genreCard}
                      onPress={handleGenre}
                    />
                  );
                })}
              </ScrollView>
            </View>

            {/* ── O QUE VOCÊ QUER ASSISTIR HOJE? ── */}
            <View style={s.section}>
              <View style={s.sectionRow}>
                <View style={s.sectionLeft}>
                  <View style={[s.sectionIcon, { backgroundColor: "rgba(34,211,238,0.15)" }]}>
                    <Feather name="zap" size={12} color="#22d3ee" />
                  </View>
                  <Text style={s.sectionTitle}>O que quer assistir hoje?</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {MOOD_DATA.map((m) => {
                  const handleMood = () => {
                    if (m.routeType === "live") router.push("/(tabs)/channels");
                    else if (m.genreId) router.push({ pathname: "/genre-browse", params: { genre_id: m.genreId, type: m.routeType, title: m.label } });
                  };
                  return (
                    <TmdbCard
                      key={m.label}
                      tmdbType={m.tmdbType}
                      tmdbId={m.tmdbId}
                      label={m.label}
                      color={m.color}
                      cardStyle={s.moodCard}
                      onPress={handleMood}
                    />
                  );
                })}
              </ScrollView>
            </View>

            {/* ── TENDÊNCIAS ── */}
            {tendencias.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionRow}>
                  <View style={s.sectionLeft}>
                    <View style={[s.sectionIcon, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
                      <Feather name="award" size={12} color="#fbbf24" />
                    </View>
                    <Text style={s.sectionTitle}>Tendências</Text>
                  </View>
                  <Text style={s.seeAll}>Ver todos  ›</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {tendencias.map((item, i) => (
                    <TrendCard
                      key={item.id}
                      item={item}
                      badge={badgeLabels[i % badgeLabels.length]}
                      onPress={() => navigateTmdb(item)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── UNIVERSOS / FRANQUIAS ── */}
            <View style={s.section}>
              <View style={s.sectionRow}>
                <View style={s.sectionLeft}>
                  <View style={[s.sectionIcon, { backgroundColor: "rgba(34,211,238,0.15)" }]}>
                    <Feather name="globe" size={12} color="#22d3ee" />
                  </View>
                  <Text style={s.sectionTitle}>Universos & Franquias</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {FRANCHISE_DATA.map((u) => {
                  const handleFranchise = () => {
                    if (u.routeType === "collection") {
                      router.push({ pathname: "/collection", params: { id: u.tmdbId!, title: u.label.replace("\n", " ") } });
                    } else if (u.routeType === "tv") {
                      router.push({ pathname: "/detail", params: { type: "tv", id: u.tmdbId!, title: u.label } });
                    } else if (u.routeType === "streaming") {
                      router.push({ pathname: "/streaming", params: { id: 337 } });
                    }
                  };
                  return (
                    <TmdbCard
                      key={u.label}
                      tmdbType={u.tmdbType}
                      tmdbId={u.tmdbId}
                      label={u.label}
                      color={u.color}
                      cardStyle={s.universoCard}
                      onPress={handleFranchise}
                    />
                  );
                })}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  /* header */
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14,
  },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  logoRed: { color: RED },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
    alignItems: "center", justifyContent: "center",
  },
  notifDot: {
    position: "absolute", top: 7, right: 7,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: RED, borderWidth: 1.5, borderColor: BG,
  },
  avatarBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: RED,
    alignItems: "center", justifyContent: "center",
    shadowColor: RED, shadowRadius: 8, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 },
  },
  avatarTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },

  /* search */
  searchWrap: { paddingHorizontal: 20, marginBottom: 20 },
  searchGlow: {
    position: "absolute", left: 20, right: 20, top: 0, bottom: 0,
    borderRadius: 16, shadowColor: RED, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 },
  },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.5, borderColor: GLASS_BORDER,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13,
  },
  searchBarFocused: { borderColor: RED, backgroundColor: "rgba(255,26,26,0.06)" },
  searchInput: { flex: 1, fontSize: 14, color: "#fff", fontWeight: "500" },
  micBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
    shadowColor: RED, shadowRadius: 6, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 },
  },

  /* quick cards */
  quickScroll: { paddingHorizontal: 20, gap: 10, paddingBottom: 4 },
  quickCard: {
    alignItems: "center", gap: 8, padding: 14,
    borderRadius: 14, borderWidth: 1, minWidth: 80,
  },
  quickIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 10, fontWeight: "700", textAlign: "center" },

  /* sections */
  section: { marginBottom: 28 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14 },
  sectionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  seeAll: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  clearAll: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  hScroll: { paddingHorizontal: 20, paddingBottom: 4, gap: 0 },

  /* recent searches */
  recentsWrap: { paddingHorizontal: 20, gap: 8, alignItems: "center" },
  recentPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
    borderRadius: 50, paddingHorizontal: 12, paddingVertical: 7,
  },
  recentTxt: { fontSize: 12, color: "#fff", fontWeight: "600" },

  /* genre cards */
  genreCard: {
    width: 100, height: 90, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    marginRight: 10, gap: 6,
  },
  genreEmoji: { fontSize: 26 },
  genreLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },

  /* mood cards */
  moodCard: {
    width: 100, height: 90, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    marginRight: 10, gap: 6,
  },
  moodEmoji: { fontSize: 26 },
  moodLabel: { fontSize: 10, fontWeight: "700", textAlign: "center", letterSpacing: 0.3 },

  /* universo cards */
  universoCard: {
    width: 90, height: 90, borderRadius: 14, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
    marginRight: 10, gap: 6,
  },
  universoEmoji: { fontSize: 24 },
  universoLabel: { fontSize: 10, fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },

  /* search results state */
  searchingState: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 60, gap: 12,
  },
  searchingTxt: { fontSize: 14, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  noResultTxt: { fontSize: 16, color: "#fff", fontWeight: "700" },
  noResultSub: { fontSize: 13, color: "rgba(255,255,255,0.35)" },
});
