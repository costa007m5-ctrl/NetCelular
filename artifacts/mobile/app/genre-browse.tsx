import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { api, tmdbItemToContent } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: SW } = Dimensions.get("window");
const H_PAD = 12;

// ── View mode type ─────────────────────────────────────────────────────────
type ViewMode = "grid" | "poster" | "list";

// Column counts per mode
const COLS: Record<ViewMode, number> = { grid: 3, poster: 2, list: 1 };

// Card dimensions per mode
const CARD_W: Record<ViewMode, number> = {
  grid:   Math.floor((SW - H_PAD * 2) / 3) - 4,
  poster: Math.floor((SW - H_PAD * 2) / 2) - 6,
  list:   SW - H_PAD * 2,
};
const CARD_H: Record<ViewMode, number> = {
  grid:   Math.floor(CARD_W.grid * 1.5),
  poster: Math.floor(CARD_W.poster * 1.5),
  list:   100,
};

// ── View mode toggle button ─────────────────────────────────────────────────
const MODE_CYCLE: ViewMode[] = ["grid", "poster", "list"];
const MODE_ICON: Record<ViewMode, keyof typeof Feather.glyphMap> = {
  grid:   "grid",
  poster: "image",
  list:   "list",
};
const MODE_LABEL: Record<ViewMode, string> = {
  grid:   "Grade",
  poster: "Pôsteres",
  list:   "Lista",
};

function ViewToggle({ mode, onToggle }: { mode: ViewMode; onToggle: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scale,  { toValue: 1,    useNativeDriver: true, speed: 28 }),
    ]).start();
    onToggle();
  };
  return (
    <Pressable onPress={press}>
      <Animated.View style={[styles.viewToggle, { transform: [{ scale }] }]}>
        <Feather name={MODE_ICON[mode]} size={17} color="#fff" />
      </Animated.View>
    </Pressable>
  );
}

// ── Grid / Poster card (compact, used in 2–3 column layout) ───────────────
const CompactCard = React.memo(function CompactCard({
  item,
  mode,
  onPress,
}: {
  item: ContentItem;
  mode: "grid" | "poster";
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const w = CARD_W[mode];
  const h = CARD_H[mode];
  return (
    <Pressable onPress={onPress} style={{ width: w, marginBottom: mode === "grid" ? 10 : 12 }}>
      <View style={[styles.compactCard, { width: w, height: h }]}>
        {!imgError && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={styles.cardPlaceholder}>
              <Feather name="film" size={mode === "poster" ? 28 : 22} color="#444" />
            </View>
          </LinearGradient>
        )}

        {/* Series badge */}
        {item.type === "series" && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}

        {/* Rating badge (poster mode only) */}
        {mode === "poster" && item.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={9} color="#f59e0b" />
            <Text style={styles.ratingBadgeText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={styles.cardGrad}
          locations={[0.55, 1]}
        />

        {/* Title */}
        <Text
          style={[styles.cardLabel, mode === "poster" && styles.cardLabelPoster]}
          numberOfLines={mode === "poster" ? 2 : 1}
        >
          {item.title}
        </Text>

        {/* Year (poster mode only) */}
        {mode === "poster" && item.year ? (
          <Text style={styles.cardYear}>{item.year}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

// ── List card (1 column, backdrop + info) ─────────────────────────────────
const ListCard = React.memo(function ListCard({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: () => void;
}) {
  const colors = useColors();
  const [imgError, setImgError] = useState(false);
  const thumbUrl = item.backdropPath ?? item.posterPath;
  return (
    <Pressable onPress={onPress} style={[styles.listCard, { backgroundColor: "#111" }]}>
      {/* Thumbnail */}
      <View style={styles.listThumb}>
        {!imgError && thumbUrl ? (
          <Image source={{ uri: thumbUrl }} style={StyleSheet.absoluteFill}
            resizeMode="cover" onError={() => setImgError(true)} />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="film" size={18} color="#444" />
            </View>
          </LinearGradient>
        )}
        {/* Type pill */}
        <View style={[styles.listTypePill, item.type === "series"
          ? { backgroundColor: "#1d4ed8" } : { backgroundColor: "#991b1b" }]}>
          <Text style={styles.listTypeText}>
            {item.type === "series" ? "SÉRIE" : "FILME"}
          </Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.listInfo}>
        <Text style={[styles.listTitle, { color: colors.foreground }]} numberOfLines={2}>
          {item.title}
        </Text>

        <View style={styles.listMeta}>
          {item.rating > 0 && (
            <View style={styles.listRating}>
              <Feather name="star" size={10} color="#f59e0b" />
              <Text style={styles.listRatingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          {item.year ? (
            <Text style={styles.listYear}>{item.year}</Text>
          ) : null}
        </View>

        {item.description ? (
          <Text style={styles.listSynopsis} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}

        {/* Play hint */}
        <TouchableOpacity style={styles.listPlayRow} onPress={onPress}>
          <View style={styles.listPlayBtn}>
            <Feather name="play" size={9} color="#fff" />
          </View>
          <Text style={styles.listPlayText}>Ver detalhes</Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );
});

// ── Mode toggle indicator bar ───────────────────────────────────────────────
function ModeBar({ mode }: { mode: ViewMode }) {
  return (
    <View style={styles.modeBar}>
      {MODE_CYCLE.map((m) => (
        <View key={m} style={[
          styles.modeDot,
          m === mode && { backgroundColor: "#e50914", width: 16 },
        ]} />
      ))}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function GenreBrowseScreen() {
  const { genre_id, type, title, lang } = useLocalSearchParams<{
    genre_id: string;
    type: string;
    title: string;
    lang?: string;
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  const resolvedGenreId = Number(genre_id) > 0 ? Number(genre_id) : 0;
  const resolvedType: "movie" | "tv" = type === "tv" ? "tv" : "movie";
  const resolvedLang = lang && lang.length > 0 ? lang : null;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(999);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const loadingRef = useRef(false);

  const fetchData = (page: number) => {
    if (resolvedLang) {
      return api.tmdb.discoverByLang(resolvedType, resolvedLang, resolvedGenreId, page);
    }
    return api.tmdb.discover(resolvedType, resolvedGenreId, page);
  };

  useEffect(() => {
    let cancelled = false;
    setError(false);
    setInitialLoading(true);
    setItems([]);
    setCurrentPage(0);
    setTotalPages(999);
    loadingRef.current = true;
    setLoading(true);

    Promise.all([fetchData(1), fetchData(2)])
      .then(([d1, d2]) => {
        if (cancelled) return;
        const combined = [
          ...d1.results.map(tmdbItemToContent),
          ...d2.results.map(tmdbItemToContent),
        ];
        setItems(combined);
        setCurrentPage(2);
        setTotalPages(d1.total_pages ?? 999);
        if (combined.length === 0) setError(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("genre-browse init error:", err);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) {
          loadingRef.current = false;
          setLoading(false);
          setInitialLoading(false);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  const loadMore = () => {
    if (loading || loadingRef.current || currentPage >= totalPages) return;
    loadingRef.current = true;
    setLoading(true);
    fetchData(currentPage + 1)
      .then((data) => {
        const newItems = data.results.map(tmdbItemToContent);
        if (newItems.length > 0) {
          setItems((prev) => [...prev, ...newItems]);
          setCurrentPage((p) => p + 1);
          setTotalPages(data.total_pages ?? totalPages);
        }
      })
      .catch((err) => console.error("genre-browse page error:", err))
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  };

  const goToDetail = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  };

  const cycleMode = () => {
    setViewMode((m) => {
      const idx = MODE_CYCLE.indexOf(m);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  };

  const topPad = isWeb ? 0 : insets.top;
  const numCols = COLS[viewMode];

  const renderItem = ({ item }: { item: ContentItem }) => {
    if (viewMode === "list") {
      return <ListCard item={item} onPress={() => goToDetail(item)} />;
    }
    return (
      <CompactCard item={item} mode={viewMode} onPress={() => goToDetail(item)} />
    );
  };

  const keyExtractor = (item: ContentItem, idx: number) => `${item.id}-${idx}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {title ?? "Explorar"}
          </Text>
          {/* Mode label */}
          <Text style={styles.modeLabel}>{MODE_LABEL[viewMode]}</Text>
        </View>

        {/* View toggle button */}
        <ViewToggle mode={viewMode} onToggle={cycleMode} />
      </View>

      {/* Mode indicator dots */}
      <ModeBar mode={viewMode} />

      {/* ── States ─────────────────────────────────────────────── */}
      {initialLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={[styles.loadingText, { color: "#888" }]}>
            Carregando conteúdo...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={styles.errorIcon}>
            <Feather name="wifi-off" size={32} color="#e50914" />
          </View>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Não foi possível carregar
          </Text>
          <Text style={[styles.errorSub, { color: "#888" }]}>
            Verifique sua conexão e tente novamente
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => setRetryKey((k) => k + 1)}
            activeOpacity={0.8}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── FlatList — key forces re-mount when numColumns changes ── */
        <FlatList
          key={viewMode}
          data={items}
          keyExtractor={keyExtractor}
          numColumns={numCols}
          contentContainerStyle={[
            viewMode === "list" ? styles.listContainer : styles.gridContainer,
            { paddingBottom: insets.bottom + 40 },
          ]}
          columnWrapperStyle={numCols > 1 ? styles.row : undefined}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={viewMode === "list" ? 8 : 12}
          maxToRenderPerBatch={viewMode === "list" ? 5 : 9}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="film" size={36} color="rgba(255,255,255,0.12)" />
              <Text style={[styles.emptyTitle, { color: "#666" }]}>
                Nenhum título encontrado
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setRetryKey((k) => k + 1)}
                activeOpacity={0.8}
              >
                <Feather name="refresh-cw" size={14} color="#fff" />
                <Text style={styles.retryText}>Recarregar</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={
            loading && items.length > 0 ? (
              <View style={styles.footer}>
                <ActivityIndicator color="#e50914" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center", borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  modeLabel: {
    color: "#555",
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  viewToggle: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  modeBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginBottom: 10,
  },
  modeDot: {
    height: 3,
    width: 6,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  centered: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 12, paddingHorizontal: 32,
  },
  loadingText: { fontSize: 13, fontWeight: "500", marginTop: 4 },
  errorIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(229,9,20,0.1)",
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 22, marginTop: 8, backgroundColor: "#e50914",
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Grid / Poster layout
  gridContainer: { paddingHorizontal: H_PAD, paddingTop: 4 },
  row: { justifyContent: "space-between", marginBottom: 0 },

  // Compact card (grid + poster)
  compactCard: { borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" },
  cardPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  typeBadge: {
    position: "absolute", top: 5, left: 5,
    backgroundColor: "rgba(0,0,0,0.78)",
    paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, zIndex: 1,
  },
  typeBadgeText: { color: "#fff", fontSize: 7, fontWeight: "800", letterSpacing: 0.4 },
  ratingBadge: {
    position: "absolute", top: 5, right: 5,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.78)",
    paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5, zIndex: 1,
  },
  ratingBadgeText: { color: "#f59e0b", fontSize: 10, fontWeight: "700" },
  cardGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "45%" },
  cardLabel: {
    position: "absolute", bottom: 20, left: 6, right: 6,
    color: "#fff", fontSize: 9, fontWeight: "600", lineHeight: 12,
  },
  cardLabelPoster: {
    bottom: 22, fontSize: 11, fontWeight: "700", lineHeight: 14,
  },
  cardYear: {
    position: "absolute", bottom: 6, left: 6,
    color: "#aaa", fontSize: 9,
  },

  // List layout
  listContainer: {
    paddingHorizontal: H_PAD,
    paddingTop: 4,
    gap: 10,
  },
  listCard: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    height: CARD_H.list,
  },
  listThumb: {
    width: 150,
    height: CARD_H.list,
    position: "relative",
  },
  listTypePill: {
    position: "absolute", bottom: 6, left: 6,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  listTypeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  listInfo: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  listTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  listMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  listRating: { flexDirection: "row", alignItems: "center", gap: 3 },
  listRatingText: { color: "#f59e0b", fontSize: 11, fontWeight: "700" },
  listYear: { color: "#666", fontSize: 11 },
  listSynopsis: {
    color: "#888",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    flex: 1,
  },
  listPlayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  listPlayBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#e50914",
    alignItems: "center", justifyContent: "center",
  },
  listPlayText: { color: "#e50914", fontSize: 11, fontWeight: "700" },

  emptyState: {
    alignItems: "center", justifyContent: "center",
    gap: 12, paddingTop: 80, paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  footer: { padding: 24, alignItems: "center" },
});
