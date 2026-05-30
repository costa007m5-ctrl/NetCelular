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

const MOOD_CARDS = [
  { emoji: "👑", label: "Algo épico",      color: "#f59e0b", dark: "#78350f" },
  { emoji: "😂", label: "Quero rir",       color: "#22c55e", dark: "#14532d" },
  { emoji: "👻", label: "Quero suspense",  color: "#7c3aed", dark: "#3b0764" },
  { emoji: "📻", label: "Ao vivo agora",   color: RED,       dark: "#7f1d1d" },
  { emoji: "🍿", label: "Algo leve",       color: "#f97316", dark: "#7c2d12" },
];

const GENRE_CARDS = [
  { label: "Ação",    color: "#ef4444", emoji: "💥" },
  { label: "Terror",  color: "#7c3aed", emoji: "👻" },
  { label: "Anime",   color: "#f97316", emoji: "🎌" },
  { label: "Futebol", color: "#22c55e", emoji: "⚽" },
  { label: "Drama",   color: "#3b82f6", emoji: "🎭" },
  { label: "Ficção",  color: "#06b6d4", emoji: "🚀" },
];

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
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [popular, setPopular] = useState<TmdbItem[]>([]);
  const [recents, setRecents] = useState<string[]>(RECENT_SEARCHES);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

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
    if (!q.trim()) { setResults([]); return; }
    setSearchLoading(true);
    try {
      const data = await api.tmdb.search(q, "multi");
      const items = data.results
        .filter((r: TmdbItem) => r.media_type === "movie" || r.media_type === "tv")
        .map(tmdbItemToContent);
      setResults(items);
    } catch { setResults([]); }
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

  const avatarLetter = user?.username?.charAt(0)?.toUpperCase() ?? "N";

  const isSearching = query.trim().length > 0;

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
            <Pressable style={s.avatarBtn}>
              <Text style={s.avatarTxt}>{avatarLetter}</Text>
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
          <View style={{ marginTop: 8 }}>
            {searchLoading && results.length === 0 && (
              <View style={s.searchingState}>
                <ActivityIndicator size="large" color={RED} />
                <Text style={s.searchingTxt}>Buscando "{query}"...</Text>
              </View>
            )}
            {!searchLoading && results.length === 0 && (
              <View style={s.searchingState}>
                <Feather name="search" size={36} color="rgba(255,255,255,0.15)" />
                <Text style={s.noResultTxt}>Nenhum resultado para "{query}"</Text>
                <Text style={s.noResultSub}>Tente um outro título ou ator</Text>
              </View>
            )}
            {results.map((item) => (
              <ResultCard key={item.id} item={item} onPress={() => navigate(item)} />
            ))}
          </View>
        ) : (
          <>
            {/* ── QUICK ACCESS CARDS ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickScroll}>
              {QUICK_CARDS.map((q) => (
                <Pressable key={q.label} style={[s.quickCard, { backgroundColor: q.accent, borderColor: `${q.color}30` }]}>
                  <View style={[s.quickIcon, { backgroundColor: `${q.color}22` }]}>
                    <Feather name={q.icon as any} size={18} color={q.color} />
                  </View>
                  <Text style={[s.quickLabel, { color: q.color }]}>{q.label}</Text>
                </Pressable>
              ))}
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
                {GENRE_CARDS.map((g) => (
                  <Pressable key={g.label} style={[s.genreCard, { backgroundColor: `${g.color}18`, borderColor: `${g.color}33` }]}>
                    <Text style={s.genreEmoji}>{g.emoji}</Text>
                    <Text style={[s.genreLabel, { color: g.color }]}>{g.label}</Text>
                  </Pressable>
                ))}
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
                {MOOD_CARDS.map((m) => (
                  <Pressable key={m.label} style={[s.moodCard, { backgroundColor: `${m.color}15`, borderColor: `${m.color}30` }]}>
                    <Text style={s.moodEmoji}>{m.emoji}</Text>
                    <Text style={[s.moodLabel, { color: m.color }]}>{m.label}</Text>
                  </Pressable>
                ))}
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
                {[
                  { label: "Marvel", emoji: "⚡", color: "#e50914" },
                  { label: "DC",     emoji: "🦇", color: "#1a56db" },
                  { label: "Harry\nPotter", emoji: "🪄", color: "#b45309" },
                  { label: "Naruto", emoji: "🎌", color: "#f97316" },
                  { label: "Star\nWars", emoji: "🚀", color: "#22d3ee" },
                  { label: "Disney+", emoji: "✨", color: "#a78bfa" },
                ].map((u) => (
                  <Pressable key={u.label} style={[s.universoCard, { backgroundColor: `${u.color}12`, borderColor: `${u.color}35` }]}>
                    <Text style={s.universoEmoji}>{u.emoji}</Text>
                    <Text style={[s.universoLabel, { color: u.color }]}>{u.label}</Text>
                  </Pressable>
                ))}
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
