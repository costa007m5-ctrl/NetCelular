import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { r2Route } from "@/lib/r2-direct";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");
const RED = "#e50914";
const CARD_W = (W - 48) / 3;
const CARD_H = CARD_W * 1.5;
const TAB_CLEARANCE = 120;

type Source = "flix2" | "r2";
const SOURCES: { id: Source; label: string; color: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "flix2", label: "Flix 2.0", color: "#e50914", icon: "play-circle" },
  { id: "r2",    label: "Acervo R2", color: "#f59e0b", icon: "database" },
];

interface Flix2Item {
  id: string | number;
  tmdb_id: number;
  title: string;
  poster?: string;
  year?: number;
  type?: string;
  stream_url?: string;
}

interface R2Entry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  tmdb: { id: number; title: string; poster_path: string | null; backdrop_path: string | null; overview: string; vote_average: number; release_date?: string; media_type: "movie" | "tv" } | null;
}

function MovieCard({ title, poster, tmdbId, mediaType, onPress }: {
  title: string; poster: string | null; tmdbId: number; mediaType: "movie" | "tv"; onPress: () => void;
}) {
  const [err, setErr] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const uri = !err && poster ? poster : null;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
      style={styles.cardWrap}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14", "#0a0812"]} style={StyleSheet.absoluteFill}>
            <View style={styles.cardPlaceholder}>
              <Feather name="film" size={20} color="rgba(255,255,255,0.15)" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function SourceBadge({ active, source, onPress }: { active: boolean; source: typeof SOURCES[0]; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
    >
      <Animated.View style={[styles.sourceBadge, active && { backgroundColor: `${source.color}22`, borderColor: source.color }, { transform: [{ scale }] }]}>
        <Feather name={source.icon} size={12} color={active ? source.color : "rgba(255,255,255,0.35)"} />
        <Text style={[styles.sourceBadgeText, { color: active ? source.color : "rgba(255,255,255,0.35)" }]}>{source.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function FilmesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [activeSource, setActiveSource] = useState<Source>("flix2");
  const [flix2Movies, setFlix2Movies] = useState<Flix2Item[]>([]);
  const [r2Movies, setR2Movies] = useState<R2Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFlix2 = useCallback(async (p = 1, append = false) => {
    try {
      const res = await r2Route<{ success: boolean; pagination: { total_pages: number; total_items: number }; data: Flix2Item[] }>(
        `/flix2/catalog?type=movies&page=${p}`
      );
      if (res.success) {
        const movies = res.data.filter((i) => i.tmdb_id > 0 && i.poster);
        setFlix2Movies((prev) => append ? [...prev, ...movies] : movies);
        setTotalPages(res.pagination?.total_pages ?? 1);
        setPage(p);
      }
    } catch {}
  }, []);

  const loadR2Catalog = useCallback(async () => {
    try {
      const res = await r2Route<{ catalog: R2Entry[] }>("/catalog");
      const movies = (res.catalog ?? []).filter((e) => e.type === "movie" && e.tmdb);
      setR2Movies(movies);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([loadFlix2(1, false), loadR2Catalog()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadFlix2, loadR2Catalog]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    loadAll();
  }, [loadAll]);

  const loadMore = useCallback(async () => {
    if (activeSource !== "flix2" || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await loadFlix2(page + 1, true);
    setLoadingMore(false);
  }, [activeSource, loadingMore, page, totalPages, loadFlix2]);

  const goToDetail = useCallback((tmdbId: number, type: "movie" | "tv", title: string) => {
    router.push({ pathname: "/detail", params: { type, id: String(tmdbId), title } });
  }, [router]);

  const displayItems = activeSource === "flix2"
    ? flix2Movies.map((i) => ({
        key: String(i.id),
        title: i.title,
        poster: i.poster ?? null,
        tmdbId: i.tmdb_id,
        mediaType: "movie" as const,
      }))
    : r2Movies.map((e) => ({
        key: e.key,
        title: e.tmdb?.title ?? e.name,
        poster: e.tmdb?.poster_path ? `https://image.tmdb.org/t/p/w500${e.tmdb.poster_path}` : null,
        tmdbId: e.tmdb?.id ?? 0,
        mediaType: (e.tmdb?.media_type ?? "movie") as "movie" | "tv",
      }));

  const activeSourceInfo = SOURCES.find((s) => s.id === activeSource)!;
  const itemCount = activeSource === "flix2" ? flix2Movies.length : r2Movies.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14 }]}>
        <View>
          <Text style={styles.headerTitle}>Filmes</Text>
          <Text style={styles.headerSub}>
            {loading ? "Carregando..." : `${itemCount.toLocaleString("pt-BR")} filmes`}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(tabs)/channels")}
          style={styles.searchBtn}
        >
          <Feather name="search" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      {/* Source selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sourceScroll}
        style={styles.sourceRow}
      >
        {SOURCES.map((s) => (
          <SourceBadge key={s.id} active={activeSource === s.id} source={s} onPress={() => setActiveSource(s.id)} />
        ))}
      </ScrollView>

      {/* Active source bar */}
      <View style={[styles.activeBar, { borderLeftColor: activeSourceInfo.color }]}>
        <Feather name={activeSourceInfo.icon} size={12} color={activeSourceInfo.color} />
        <Text style={[styles.activeBarText, { color: activeSourceInfo.color }]}>{activeSourceInfo.label}</Text>
        {activeSource === "flix2" && totalPages > 1 && (
          <Text style={styles.activeBarPage}>· Pág. {page}/{totalPages}</Text>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={styles.loadingText}>Carregando filmes...</Text>
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={(i) => i.key}
          numColumns={3}
          contentContainerStyle={[styles.grid, { paddingBottom: TAB_CLEARANCE }]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RED} colors={[RED]} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="film" size={48} color="rgba(255,255,255,0.08)" />
              <Text style={styles.emptyText}>Nenhum filme encontrado</Text>
              <Text style={styles.emptyHint}>Verifique a conexão com o servidor</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreWrap}>
                <ActivityIndicator color={RED} size="small" />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <MovieCard
              title={item.title}
              poster={item.poster}
              tmdbId={item.tmdbId}
              mediaType={item.mediaType}
              onPress={() => goToDetail(item.tmdbId, item.mediaType, item.title)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, fontWeight: "500" },
  searchBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  sourceRow: { maxHeight: 52 },
  sourceScroll: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, flexDirection: "row" },
  sourceBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  sourceBadgeText: { fontSize: 12, fontWeight: "700" },
  activeBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginBottom: 8, paddingLeft: 10,
    borderLeftWidth: 2,
  },
  activeBarText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  activeBarPage: { fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: "500" },
  grid: { paddingHorizontal: 12, paddingTop: 4 },
  row: { gap: 8, marginBottom: 8 },
  cardWrap: { width: CARD_W },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden",
    backgroundColor: "#111",
  },
  cardPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardInfo: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 8,
  },
  cardTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: "rgba(255,255,255,0.3)", fontWeight: "700" },
  emptyHint: { fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: "500" },
  loadMoreWrap: { paddingVertical: 20, alignItems: "center" },
});
