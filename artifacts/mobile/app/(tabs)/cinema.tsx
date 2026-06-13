import React, {
  useCallback,
  useEffect,
  useMemo,
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
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";
import { r2Route } from "@/lib/r2-direct";

const { width: W, height: H } = Dimensions.get("window");
const GOLD   = "#c9a227";
const RED    = "#e50914";
const AMBER  = "#f59e0b";
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const PURPLE = "#8b5cf6";
const TEAL   = "#0891b2";
const ORANGE = "#f97316";

const IMG_W500 = "https://image.tmdb.org/t/p/w342";
const IMG_ORIG = "https://image.tmdb.org/t/p/w780";

function flix2ToContent(item: any): ContentItem {
  return {
    id: String(item.tmdb_id || item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? item.name ?? "",
    year: parseInt(((item.release_date ?? item.first_air_date) || "0").slice(0, 4)) || 0,
    rating: item.vote_average ?? item.rating ?? 0,
    posterPath:   item.poster   ? (item.poster.startsWith("http") ? item.poster : `${IMG_W500}${item.poster}`)   : "",
    backdropPath: item.backdrop ? (item.backdrop.startsWith("http") ? item.backdrop : `${IMG_ORIG}${item.backdrop}`) : "",
    description: item.overview ?? item.description ?? "",
    genres: item.genre_ids ?? [],
    type: "movie",
    mediaType: "movie",
  };
}

async function fetchCinema2026(): Promise<ContentItem[]> {
  try {
    const res = await r2Route<{ success: boolean; data: any[] }>(
      "/flix2/catalog-full?type=movies"
    );
    if (!res.success) return [];

    const currentYear = new Date().getFullYear();
    const items = (res.data ?? [])
      .filter((i: any) => i.title && (i.poster || i.backdrop))
      .map(flix2ToContent);

    // First try: current year
    const current = items.filter((i) => i.year === currentYear);
    if (current.length >= 20) return current;

    // Fallback: current year + previous year
    const recent = items.filter((i) => i.year >= currentYear - 1 && i.year > 0);
    if (recent.length >= 20) return recent;

    // Last fallback: top of catalog (most recently added, regardless of year)
    return items.slice(0, 300);
  } catch {
    return [];
  }
}

// ─── Genre filter config ──────────────────────────────────────────────────────
const GENRE_FILTERS = [
  { id: null,   label: "Todos",    color: GOLD,   icon: "film" as const },
  { id: 28,     label: "Ação",     color: RED,    icon: "zap" as const },
  { id: 18,     label: "Drama",    color: BLUE,   icon: "heart" as const },
  { id: 35,     label: "Comédia",  color: ORANGE, icon: "smile" as const },
  { id: 27,     label: "Terror",   color: PURPLE, icon: "eye" as const },
  { id: 878,    label: "Sci-Fi",   color: TEAL,   icon: "cpu" as const },
  { id: 53,     label: "Suspense", color: "#dc2626", icon: "alert-circle" as const },
  { id: 12,     label: "Aventura", color: GREEN,  icon: "compass" as const },
  { id: 10749,  label: "Romance",  color: "#ec4899", icon: "sun" as const },
  { id: 16,     label: "Animação", color: AMBER,  icon: "star" as const },
  { id: 80,     label: "Crime",    color: "#6366f1", icon: "shield" as const },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonGrid({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.04)", "rgba(255,255,255,0.10)"],
  });
  const CARD_W = (W - 48) / 2;
  const CARD_H = CARD_W * 1.5;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 12, marginTop: 8 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Animated.View key={i} style={{
          width: CARD_W, height: CARD_H, borderRadius: 14,
          backgroundColor: bg as any,
        }} />
      ))}
    </View>
  );
}

// ─── HeroCard ─────────────────────────────────────────────────────────────────
function HeroCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const imgUri = item.backdropPath || item.posterPath;
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={sty.heroPad}>
      <Animated.View style={[sty.heroCard, { transform: [{ scale }] }]}>
        {!err && imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={300}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1208", "#0a0804"]} style={StyleSheet.absoluteFill} />
        )}
        {/* Letterbox bars */}
        <View style={sty.heroBarTop} />
        <View style={sty.heroBarBot} />
        <LinearGradient
          colors={["transparent", `${GOLD}18`, "rgba(0,0,0,0.96)"]}
          locations={[0.2, 0.6, 1]} style={StyleSheet.absoluteFill} />
        {/* Gold top stripe */}
        <View style={sty.heroGoldStripe} />
        <View style={sty.heroContent}>
          <View style={sty.heroBadgeRow}>
            <View style={sty.heroBadge}>
              <Feather name="film" size={9} color={GOLD} />
              <Text style={sty.heroBadgeText}>DESTAQUE 2026</Text>
            </View>
            {item.rating > 0 && (
              <View style={sty.heroRating}>
                <Feather name="star" size={9} color={AMBER} />
                <Text style={sty.heroRatingText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <Text style={sty.heroTitle} numberOfLines={2}>{item.title}</Text>
          {item.description ? (
            <Text style={sty.heroDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={sty.heroActions}>
            <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={sty.heroPlayBtn}>
              <Feather name="play" size={14} color="#000" />
              <Text style={sty.heroPlayText}>Assistir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={sty.heroInfoBtn}>
              <Feather name="info" size={14} color="#fff" />
              <Text style={sty.heroInfoText}>Detalhes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── GridCard ─────────────────────────────────────────────────────────────────
function GridCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const CARD_W = (W - 48) / 2;
  const CARD_H = CARD_W * 1.5;
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ flex: 1 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={[sty.gridCard, { width: CARD_W, height: CARD_H }]}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a1208", "#0a0804"]} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="film" size={28} color="rgba(201,162,39,0.15)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]}
            locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
          {item.year > 0 && (
            <View style={sty.gridYear}>
              <Text style={sty.gridYearText}>{item.year}</Text>
            </View>
          )}
          {item.rating > 0 && (
            <View style={sty.gridRating}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={sty.gridRatingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <View style={sty.gridInfo}>
            <Text style={sty.gridTitle} numberOfLines={2}>{item.title}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CinemaScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 0 : insets.top;

  const shimmer = useRef(new Animated.Value(0)).current;
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems]           = useState<ContentItem[]>([]);
  const [genreFilter, setGenreFilter] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data = await fetchCinema2026();
    setItems(data);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    if (Platform.OS === "web") loop.start();
    load().then(() => {
      loop.stop();
      setLoading(false);
    });
    return () => loop.stop();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().then(() => setRefreshing(false));
  }, [load]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: "movie",
        id: String(item.tmdbId),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  }, [router]);

  const filtered = useMemo(() => {
    if (genreFilter === null) return items;
    return items.filter((i) => (i.genres ?? []).includes(genreFilter));
  }, [items, genreFilter]);

  const hero    = filtered[0] ?? null;
  const gridItems = filtered.slice(1);

  // Stats
  const currentYear = new Date().getFullYear();
  const year2026 = items.filter((i) => i.year === currentYear).length;
  const year2025 = items.filter((i) => i.year === currentYear - 1).length;

  const CARD_W = (W - 48) / 2;

  return (
    <View style={[sty.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <View style={[sty.header, { paddingTop: topPad + 8 }]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.97)", "rgba(0,0,0,0.65)", "transparent"]}
          style={StyleSheet.absoluteFill} />
        <View style={sty.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={sty.headerIconWrap}>
              <Feather name="film" size={16} color={GOLD} />
            </View>
            <Text style={sty.logoGold}>CINEMA</Text>
            <View style={sty.yearBadge}>
              <Text style={sty.yearBadgeText}>{currentYear}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity style={sty.iconBtn}
              onPress={() => router.push("/(tabs)/list")} activeOpacity={0.75}>
              <Feather name="bookmark" size={20} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ═══ CONTENT ══════════════════════════════════════════════════════════ */}
      <FlatList
        data={gridItems}
        keyExtractor={(item, idx) => `${item.id}_${idx}`}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16, marginBottom: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={GOLD} colors={[GOLD]} progressViewOffset={topPad + 50} />
        }
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        renderItem={({ item }) => (
          <GridCard item={item} onPress={() => goTo(item)} />
        )}
        ListHeaderComponent={
          <View>
            {/* Spacer for header */}
            <View style={{ height: topPad + 58 }} />

            {/* ── GENRE PILLS ──────────────────────────────────────────── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}
              style={{ flexGrow: 0, marginBottom: 14 }}>
              {GENRE_FILTERS.map((g) => {
                const active = genreFilter === g.id;
                return (
                  <TouchableOpacity key={String(g.id)} onPress={() => setGenreFilter(g.id)}
                    activeOpacity={0.8}
                    style={[sty.pill, active && { backgroundColor: g.color, borderColor: g.color }]}>
                    <Feather name={g.icon} size={11} color={active ? "#fff" : "rgba(255,255,255,0.5)"} />
                    <Text style={[sty.pillText, active && { color: "#fff" }]}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── STATS ────────────────────────────────────────────────── */}
            {!loading && items.length > 0 && (
              <View style={sty.statsRow}>
                {year2026 > 0 && (
                  <View style={sty.statChip}>
                    <LinearGradient colors={[`${GOLD}25`, `${GOLD}08`]} style={StyleSheet.absoluteFill} />
                    <Feather name="film" size={11} color={GOLD} />
                    <Text style={sty.statChipText}>
                      <Text style={{ color: GOLD, fontWeight: "800" }}>{year2026}</Text> filmes de {currentYear}
                    </Text>
                  </View>
                )}
                {year2025 > 0 && (
                  <View style={[sty.statChip, { borderColor: `${BLUE}30` }]}>
                    <LinearGradient colors={[`${BLUE}20`, `${BLUE}06`]} style={StyleSheet.absoluteFill} />
                    <Feather name="clock" size={11} color={BLUE} />
                    <Text style={sty.statChipText}>
                      <Text style={{ color: BLUE, fontWeight: "800" }}>{year2025}</Text> filmes de {currentYear - 1}
                    </Text>
                  </View>
                )}
                <View style={[sty.statChip, { borderColor: `${GREEN}30` }]}>
                  <LinearGradient colors={[`${GREEN}20`, `${GREEN}06`]} style={StyleSheet.absoluteFill} />
                  <Feather name="layers" size={11} color={GREEN} />
                  <Text style={sty.statChipText}>
                    <Text style={{ color: GREEN, fontWeight: "800" }}>{filtered.length}</Text> total
                  </Text>
                </View>
              </View>
            )}

            {loading ? (
              <SkeletonGrid shimmer={shimmer} />
            ) : (
              <>
                {/* ── HERO ───────────────────────────────────────────────── */}
                {hero && (
                  <View style={{ marginBottom: 16 }}>
                    <HeroCard item={hero} onPress={() => goTo(hero)} />
                  </View>
                )}

                {/* ── GRID HEADER ────────────────────────────────────────── */}
                {gridItems.length > 0 && (
                  <View style={sty.gridHeaderRow}>
                    <View style={[sty.accentBar, { backgroundColor: GOLD }]} />
                    <Text style={[sty.gridHeaderText, { color: GOLD }]}>CATÁLOGO</Text>
                    <Text style={sty.gridHeaderSub}> COMPLETO</Text>
                    <View style={[sty.badge, { backgroundColor: `${GOLD}20`, borderColor: `${GOLD}40`, marginLeft: 8 }]}>
                      <Text style={[sty.badgeText, { color: GOLD }]}>{filtered.length}</Text>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={sty.emptyState}>
              <Feather name="film" size={48} color={`${GOLD}20`} />
              <Text style={sty.emptyTitle}>Nenhum filme encontrado</Text>
              <Text style={sty.emptySub}>
                {genreFilter !== null ? "Tente outro gênero" : "Puxe para baixo para atualizar"}
              </Text>
              {genreFilter !== null && (
                <TouchableOpacity onPress={() => setGenreFilter(null)} style={sty.resetBtn} activeOpacity={0.8}>
                  <Text style={sty.resetBtnText}>Ver todos os filmes</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          !loading && filtered.length > 0 ? (
            <View style={sty.footer}>
              <View style={sty.footerLine} />
              <Text style={sty.footerText}>{filtered.length} filmes · fim do catálogo</Text>
              <View style={sty.footerLine} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 140 }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
    paddingBottom: 12,
  },
  headerInner: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 16,
  },
  headerIconWrap: {
    width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center",
    backgroundColor: `${GOLD}20`, borderWidth: 1, borderColor: `${GOLD}40`,
  },
  logoGold: { color: GOLD, fontSize: 22, fontWeight: "900", letterSpacing: 2.5 },
  yearBadge: {
    backgroundColor: GOLD, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  yearBadgeText: { color: "#000", fontSize: 12, fontWeight: "900" },
  iconBtn: { padding: 6 },

  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  pillText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },

  statsRow: {
    flexDirection: "row", flexWrap: "wrap",
    gap: 8, paddingHorizontal: 16, marginBottom: 16,
  },
  statChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    overflow: "hidden", borderWidth: 1, borderColor: `${GOLD}30`,
  },
  statChipText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  heroPad: { paddingHorizontal: 16, marginBottom: 8 },
  heroCard: {
    height: 220, borderRadius: 20, overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1, borderColor: `${GOLD}25`,
  },
  heroBarTop: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: 18, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1,
  },
  heroBarBot: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 18, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1,
  },
  heroGoldStripe: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: 2, backgroundColor: GOLD, zIndex: 2,
  },
  heroContent: {
    position: "absolute", bottom: 18, left: 0, right: 0,
    padding: 18, zIndex: 3,
  },
  heroBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  heroBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: `${GOLD}22`, borderWidth: 1, borderColor: `${GOLD}55`,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  heroBadgeText: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  heroRating: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  heroRatingText: { color: AMBER, fontSize: 10, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "900", marginBottom: 5, lineHeight: 26 },
  heroDesc:  { color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  heroActions: { flexDirection: "row", gap: 10 },
  heroPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: GOLD, borderRadius: 22,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  heroPlayText: { color: "#000", fontSize: 13, fontWeight: "900" },
  heroInfoBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  heroInfoText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  gridHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, marginBottom: 12,
  },
  accentBar: { width: 3, height: 18, borderRadius: 2 },
  gridHeaderText: { fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  gridHeaderSub:  { fontSize: 15, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  badge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "800" },

  gridCard: {
    borderRadius: 14, overflow: "hidden", backgroundColor: "#111",
  },
  gridYear: {
    position: "absolute", top: 8, left: 8,
    backgroundColor: `${GOLD}22`, borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: `${GOLD}40`,
  },
  gridYearText: { color: GOLD, fontSize: 9, fontWeight: "800" },
  gridRating: {
    position: "absolute", top: 8, right: 8,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 5,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  gridRatingText: { color: AMBER, fontSize: 8, fontWeight: "700" },
  gridInfo: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 10,
  },
  gridTitle: { color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 16 },

  emptyState: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 80, gap: 12,
  },
  emptyTitle: { color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: "700" },
  emptySub:   { color: "rgba(255,255,255,0.18)", fontSize: 13 },
  resetBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: `${GOLD}20`, borderRadius: 22,
    borderWidth: 1, borderColor: `${GOLD}40`,
  },
  resetBtnText: { color: GOLD, fontSize: 13, fontWeight: "700" },

  footer: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 20, gap: 12,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: "rgba(201,162,39,0.15)" },
  footerText: { color: "rgba(201,162,39,0.35)", fontSize: 11, fontWeight: "600" },
});
