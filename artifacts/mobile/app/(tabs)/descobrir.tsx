import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
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
const PURPLE = "#8b5cf6";
const CARD_W = (W - 48) / 3;
const CARD_H = CARD_W * 1.5;
const TAB_CLEARANCE = 120;

type ContentType = "series" | "animes";

const TYPES: { id: ContentType; label: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { id: "series",  label: "Séries",  icon: "tv",   color: RED },
  { id: "animes",  label: "Animes",  icon: "star", color: PURPLE },
];

interface Flix2Item {
  id: string | number;
  tmdb_id: number;
  title: string;
  poster?: string;
  year?: number;
}

interface R2Entry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  tmdb: {
    id: number; title: string; poster_path: string | null;
    backdrop_path: string | null; overview: string; vote_average: number;
    media_type: "movie" | "tv";
  } | null;
}

function ContentCard({ title, poster, onPress }: {
  title: string; poster: string | null; onPress: () => void;
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
          <LinearGradient colors={["#0d0a1a", "#060408"]} style={StyleSheet.absoluteFill}>
            <View style={styles.placeholder}>
              <Feather name="tv" size={18} color="rgba(255,255,255,0.12)" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function TypeTab({ active, item, onPress }: { active: boolean; item: typeof TYPES[0]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.typeTab, active && { borderBottomColor: item.color, borderBottomWidth: 2 }]}>
      <Feather name={item.icon} size={14} color={active ? item.color : "rgba(255,255,255,0.3)"} />
      <Text style={[styles.typeTabText, { color: active ? item.color : "rgba(255,255,255,0.3)" }]}>{item.label}</Text>
    </Pressable>
  );
}

export default function SeriesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [activeType, setActiveType] = useState<ContentType>("series");
  const [flix2Series, setFlix2Series] = useState<Flix2Item[]>([]);
  const [flix2Animes, setFlix2Animes] = useState<Flix2Item[]>([]);
  const [r2Series, setR2Series] = useState<R2Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pages, setPages] = useState<Record<ContentType, number>>({ series: 1, animes: 1 });
  const [totalPages, setTotalPages] = useState<Record<ContentType, number>>({ series: 1, animes: 1 });
  const [loadingMore, setLoadingMore] = useState(false);

  const loadFlix2 = useCallback(async (type: ContentType, p = 1, append = false) => {
    try {
      const res = await r2Route<{
        success: boolean;
        pagination: { total_pages: number };
        data: Flix2Item[];
      }>(`/flix2/catalog?type=${type}&page=${p}`);
      if (res.success) {
        const items = res.data.filter((i) => i.tmdb_id > 0 && i.poster);
        if (type === "series") {
          setFlix2Series((prev) => append ? [...prev, ...items] : items);
        } else {
          setFlix2Animes((prev) => append ? [...prev, ...items] : items);
        }
        setTotalPages((prev) => ({ ...prev, [type]: res.pagination?.total_pages ?? 1 }));
        setPages((prev) => ({ ...prev, [type]: p }));
      }
    } catch {}
  }, []);

  const loadR2Series = useCallback(async () => {
    try {
      const res = await r2Route<{ catalog: R2Entry[] }>("/catalog");
      const series = (res.catalog ?? []).filter((e) => e.type === "tv" && e.tmdb);
      setR2Series(series);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([
      loadFlix2("series", 1, false),
      loadFlix2("animes", 1, false),
      loadR2Series(),
    ]);
    setLoading(false);
    setRefreshing(false);
  }, [loadFlix2, loadR2Series]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPages({ series: 1, animes: 1 });
    loadAll();
  }, [loadAll]);

  const loadMore = useCallback(async () => {
    const p = pages[activeType];
    const tp = totalPages[activeType];
    if (loadingMore || p >= tp) return;
    setLoadingMore(true);
    await loadFlix2(activeType, p + 1, true);
    setLoadingMore(false);
  }, [activeType, loadingMore, pages, totalPages, loadFlix2]);

  const goToDetail = useCallback((tmdbId: number, title: string) => {
    if (!tmdbId) return;
    router.push({ pathname: "/detail", params: { type: "tv", id: String(tmdbId), title } });
  }, [router]);

  const flix2Items = activeType === "series" ? flix2Series : flix2Animes;
  const currentPage = pages[activeType];
  const currentTotalPages = totalPages[activeType];
  const activeInfo = TYPES.find((t) => t.id === activeType)!;

  const displayItems = [
    ...flix2Items.map((i) => ({
      key: `flix2-${i.id}`,
      title: i.title,
      poster: i.poster ?? null,
      tmdbId: i.tmdb_id,
    })),
    ...(activeType === "series" ? r2Series : []).map((e) => ({
      key: `r2-${e.key}`,
      title: e.tmdb?.title ?? e.name,
      poster: e.tmdb?.poster_path ? `https://image.tmdb.org/t/p/w500${e.tmdb.poster_path}` : null,
      tmdbId: e.tmdb?.id ?? 0,
    })),
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: topPad + 14 }]}>
        <View>
          <Text style={styles.headerTitle}>Séries & Animes</Text>
          <Text style={styles.headerSub}>
            {loading
              ? "Carregando..."
              : `${displayItems.length.toLocaleString("pt-BR")} títulos · Pág. ${currentPage}/${currentTotalPages}`}
          </Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        {TYPES.map((t) => (
          <TypeTab key={t.id} item={t} active={activeType === t.id} onPress={() => setActiveType(t.id)} />
        ))}
        <View style={{ flex: 1 }} />
        <View style={styles.srcIndicator}>
          <View style={[styles.srcDot, { backgroundColor: RED }]} />
          <Text style={styles.srcLabel}>Flix 2.0</Text>
          <View style={[styles.srcDot, { backgroundColor: "#f59e0b", marginLeft: 6 }]} />
          <Text style={styles.srcLabel}>R2</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={activeInfo.color} size="large" />
          <Text style={[styles.loadingText, { color: activeInfo.color }]}>
            Carregando {activeInfo.label.toLowerCase()}...
          </Text>
        </View>
      ) : (
        <FlatList
          key={activeType}
          data={displayItems}
          keyExtractor={(i) => i.key}
          numColumns={3}
          contentContainerStyle={[styles.grid, { paddingBottom: TAB_CLEARANCE }]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={activeInfo.color} colors={[activeInfo.color]} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name={activeInfo.icon} size={48} color="rgba(255,255,255,0.07)" />
              <Text style={styles.emptyText}>Nenhum título encontrado</Text>
              <Text style={styles.emptyHint}>Verifique a conexão com o servidor</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreWrap}>
                <ActivityIndicator color={activeInfo.color} size="small" />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ContentCard
              title={item.title}
              poster={item.poster}
              onPress={() => goToDetail(item.tmdbId, item.title)}
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
    paddingHorizontal: 20, paddingBottom: 10,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
  },
  headerTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, fontWeight: "500" },
  tabRow: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
    marginHorizontal: 16, marginBottom: 8,
  },
  typeTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 11, marginRight: 4,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  typeTabText: { fontSize: 13, fontWeight: "700" },
  srcIndicator: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 8 },
  srcDot: { width: 6, height: 6, borderRadius: 3 },
  srcLabel: { fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  grid: { paddingHorizontal: 12, paddingTop: 4 },
  row: { gap: 8, marginBottom: 8 },
  cardWrap: { width: CARD_W },
  card: { width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#0d0a1a" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  cardTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13, fontWeight: "600" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: "rgba(255,255,255,0.3)", fontWeight: "700" },
  emptyHint: { fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: "500" },
  loadMoreWrap: { paddingVertical: 20, alignItems: "center" },
});
