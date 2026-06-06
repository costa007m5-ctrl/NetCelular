import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { api, tmdbItemToContent } from "@/lib/api";
import { r2Route } from "@/lib/r2-direct";
import type { ContentItem } from "@/constants/content";

const { width: SW } = Dimensions.get("window");
const H_PAD = 12;

// ── View mode type ─────────────────────────────────────────────────────────
type ViewMode = "grid" | "poster" | "list";

const COLS: Record<ViewMode, number> = { grid: 3, poster: 2, list: 1 };

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

// ── Source badge ─────────────────────────────────────────────────────────────
const SOURCE_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  movies:  "film",
  series:  "tv",
  animes:  "star",
};
const SOURCE_COLOR: Record<string, string> = {
  movies:  "#e50914",
  series:  "#3b82f6",
  animes:  "#8b5cf6",
};

// ── Flix2 item → ContentItem ──────────────────────────────────────────────
const flix2ToContent = (item: any): ContentItem => {
  const isMovie = item.type === "filme" || item.type === "movie";
  return {
    id: String(item.tmdb_id || item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? "",
    year: Number(item.year) || 2024,
    rating: parseFloat(item.rating ?? "0") || 0,
    posterPath: item.poster ?? "",
    backdropPath: item.backdrop ?? item.poster ?? "",
    description: item.synopsis ?? "",
    genres: [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
};

// ── View mode toggle ────────────────────────────────────────────────────────
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

// ── Grid / Poster card ────────────────────────────────────────────────────
const CompactCard = React.memo(function CompactCard({
  item, mode, onPress,
}: {
  item: ContentItem; mode: "grid" | "poster"; onPress: () => void;
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

        {item.type === "series" && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}

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

        <Text
          style={[styles.cardLabel, mode === "poster" && styles.cardLabelPoster]}
          numberOfLines={mode === "poster" ? 2 : 1}
        >
          {item.title}
        </Text>

        {mode === "poster" && item.year ? (
          <Text style={styles.cardYear}>{item.year}</Text>
        ) : null}
      </View>
    </Pressable>
  );
});

// ── List card ────────────────────────────────────────────────────────────
const ListCard = React.memo(function ListCard({
  item, onPress,
}: {
  item: ContentItem; onPress: () => void;
}) {
  const colors = useColors();
  const [imgError, setImgError] = useState(false);
  const thumbUrl = item.backdropPath ?? item.posterPath;
  return (
    <Pressable onPress={onPress} style={[styles.listCard, { backgroundColor: "#111" }]}>
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
        <View style={[styles.listTypePill, item.type === "series"
          ? { backgroundColor: "#1d4ed8" } : { backgroundColor: "#991b1b" }]}>
          <Text style={styles.listTypeText}>
            {item.type === "series" ? "SÉRIE" : "FILME"}
          </Text>
        </View>
      </View>

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

// ── Mode indicator dots ──────────────────────────────────────────────────
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

// ── Main screen ──────────────────────────────────────────────────────────
export default function GenreBrowseScreen() {
  const {
    genre_id,
    type,
    title,
    lang,
    sort_by,
    source,
    flix2_type,
  } = useLocalSearchParams<{
    genre_id: string;
    type: string;
    title: string;
    lang?: string;
    sort_by?: string;
    source?: string;
    flix2_type?: string;
  }>();

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  // Determine if we should fetch from Flix2 or TMDB
  const isFlx2 = source === "flix2" && !!flix2_type;
  const flx2Type = flix2_type ?? "movies"; // movies | series | animes

  const resolvedGenreId = Number(genre_id) > 0 ? Number(genre_id) : 0;
  const resolvedType: "movie" | "tv" = type === "tv" ? "tv" : "movie";
  const resolvedLang = lang && lang.length > 0 ? lang : null;
  const resolvedSortBy = sort_by && sort_by.length > 0 ? sort_by : "popularity.desc";

  const [items, setItems] = useState<ContentItem[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(999);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const loadingRef = useRef(false);

  // ── Filtered items based on search query ─────────────────────────────
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [items, searchQuery]);

  // ── Animate search bar expand/collapse ───────────────────────────────
  const openSearch = useCallback(() => {
    setSearchFocused(true);
    Animated.spring(searchAnim, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
    setTimeout(() => searchInputRef.current?.focus(), 80);
  }, [searchAnim]);

  const closeSearch = useCallback(() => {
    setSearchQuery("");
    setSearchFocused(false);
    searchInputRef.current?.blur();
    Animated.spring(searchAnim, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
  }, [searchAnim]);

  const searchBarWidth = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  // ── Flix2 fetch ──────────────────────────────────────────────────────
  const fetchFlix2Page = async (page: number): Promise<{ items: ContentItem[]; totalCount: number; totalPages: number }> => {
    const res = await r2Route<{ success: boolean; pagination: any; data: any[] }>(
      `/flix2/catalog?type=${flx2Type}&page=${page}`
    );
    if (!res.success) throw new Error("Flix2 error");
    const mapped = (res.data ?? [])
      .filter((i: any) => i.tmdb_id > 0 && i.poster)
      .map(flix2ToContent);
    const total: number = res.pagination?.total_count ?? mapped.length;
    const pages: number = res.pagination?.total_pages ?? 999;
    return { items: mapped, totalCount: total, totalPages: pages };
  };

  // ── TMDB fetch ───────────────────────────────────────────────────────
  const fetchTmdbPage = (page: number) => {
    if (resolvedLang) {
      return api.tmdb.discoverByLang(resolvedType, resolvedLang, resolvedGenreId, page);
    }
    return api.tmdb.discover(resolvedType, resolvedGenreId, page);
  };

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setError(false);
    setInitialLoading(true);
    setItems([]);
    setCurrentPage(0);
    setTotalPages(999);
    loadingRef.current = true;
    setLoading(true);

    if (isFlx2) {
      // Fetch first 2 pages in parallel for a bigger initial set
      Promise.all([fetchFlix2Page(1), fetchFlix2Page(2)])
        .then(([d1, d2]) => {
          if (cancelled) return;
          const combined = [...d1.items, ...d2.items];
          setItems(combined);
          setCurrentPage(2);
          setTotalPages(d1.totalPages);
          setTotalCount(d1.totalCount);
          if (combined.length === 0) setError(true);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("genre-browse flix2 init error:", err);
          setError(true);
        })
        .finally(() => {
          if (!cancelled) {
            loadingRef.current = false;
            setLoading(false);
            setInitialLoading(false);
          }
        });
    } else {
      Promise.all([fetchTmdbPage(1), fetchTmdbPage(2)])
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
          console.error("genre-browse tmdb init error:", err);
          setError(true);
        })
        .finally(() => {
          if (!cancelled) {
            loadingRef.current = false;
            setLoading(false);
            setInitialLoading(false);
          }
        });
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, isFlx2, flx2Type]);

  // ── Infinite scroll ──────────────────────────────────────────────────
  const loadMore = () => {
    if (loading || loadingRef.current || currentPage >= totalPages) return;
    loadingRef.current = true;
    setLoading(true);
    const nextPage = currentPage + 1;

    if (isFlx2) {
      fetchFlix2Page(nextPage)
        .then((data) => {
          if (data.items.length > 0) {
            setItems((prev) => [...prev, ...data.items]);
            setCurrentPage(nextPage);
            setTotalPages(data.totalPages);
          }
        })
        .catch((err) => console.error("genre-browse flix2 page error:", err))
        .finally(() => {
          loadingRef.current = false;
          setLoading(false);
        });
    } else {
      fetchTmdbPage(nextPage)
        .then((data) => {
          const newItems = data.results.map(tmdbItemToContent);
          if (newItems.length > 0) {
            setItems((prev) => [...prev, ...newItems]);
            setCurrentPage(nextPage);
            setTotalPages(data.total_pages ?? totalPages);
          }
        })
        .catch((err) => console.error("genre-browse tmdb page error:", err))
        .finally(() => {
          loadingRef.current = false;
          setLoading(false);
        });
    }
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

  const sourceColor = isFlx2 ? (SOURCE_COLOR[flx2Type] ?? "#e50914") : "#e50914";
  const sourceIcon  = isFlx2 ? (SOURCE_ICON[flx2Type]  ?? "film")    : "film";

  const renderItem = ({ item }: { item: ContentItem }) => {
    if (viewMode === "list") {
      return <ListCard item={item} onPress={() => goToDetail(item)} />;
    }
    return <CompactCard item={item} mode={viewMode} onPress={() => goToDetail(item)} />;
  };

  const keyExtractor = (item: ContentItem, idx: number) => `${item.id}-${idx}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={searchFocused ? closeSearch : () => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>

        {/* Animated search bar */}
        <Animated.View style={[styles.searchBarWrap, { width: searchBarWidth }]}>
          <Feather name="search" size={15} color="#aaa" style={{ marginRight: 6 }} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Pesquisar nesta categoria..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={15} color="#aaa" />
            </TouchableOpacity>
          )}
        </Animated.View>

        {!searchFocused && (
          <View style={styles.headerCenter}>
            {/* Source pill */}
            {isFlx2 && (
              <View style={[styles.sourcePill, { backgroundColor: `${sourceColor}20`, borderColor: `${sourceColor}40` }]}>
                <Feather name={sourceIcon} size={10} color={sourceColor} />
                <Text style={[styles.sourcePillText, { color: sourceColor }]}>
                  {flx2Type === "movies" ? "Filmes" : flx2Type === "series" ? "Séries" : "Animes"}
                  {totalCount > 0 ? ` · ${totalCount.toLocaleString("pt-BR")}` : ""}
                </Text>
              </View>
            )}
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {title ?? "Explorar"}
            </Text>
            <Text style={styles.modeLabel}>{MODE_LABEL[viewMode]}</Text>
          </View>
        )}

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.searchBtn} onPress={searchFocused ? closeSearch : openSearch}>
            <Feather name={searchFocused ? "x" : "search"} size={20} color={colors.foreground} />
          </TouchableOpacity>
          {!searchFocused && <ViewToggle mode={viewMode} onToggle={cycleMode} />}
        </View>
      </View>

      <ModeBar mode={viewMode} />

      {/* ── Search results count ────────────────────────────────── */}
      {searchQuery.trim().length > 0 && !initialLoading && (
        <View style={styles.searchResultsBar}>
          <Feather name="search" size={12} color="#888" />
          <Text style={styles.searchResultsText}>
            {filteredItems.length === 0
              ? "Nenhum resultado para "
              : `${filteredItems.length} resultado${filteredItems.length !== 1 ? "s" : ""} para `}
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>"{searchQuery.trim()}"</Text>
          </Text>
        </View>
      )}

      {/* ── States ─────────────────────────────────────────────── */}
      {initialLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={sourceColor} />
          <Text style={[styles.loadingText, { color: "#888" }]}>
            Carregando conteúdo...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <View style={[styles.errorIcon, { backgroundColor: `${sourceColor}15` }]}>
            <Feather name="wifi-off" size={32} color={sourceColor} />
          </View>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Não foi possível carregar
          </Text>
          <Text style={[styles.errorSub, { color: "#888" }]}>
            Verifique sua conexão e tente novamente
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: sourceColor }]}
            onPress={() => setRetryKey((k) => k + 1)}
            activeOpacity={0.8}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={filteredItems}
          keyExtractor={keyExtractor}
          numColumns={numCols}
          contentContainerStyle={[
            viewMode === "list" ? styles.listContainer : styles.gridContainer,
            { paddingBottom: insets.bottom + 40 },
          ]}
          columnWrapperStyle={numCols > 1 ? styles.row : undefined}
          renderItem={renderItem}
          onEndReached={searchQuery.trim() ? undefined : loadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={viewMode === "list" ? 8 : 12}
          maxToRenderPerBatch={viewMode === "list" ? 5 : 9}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name={searchQuery.trim() ? "search" : "film"} size={36} color="rgba(255,255,255,0.12)" />
              <Text style={[styles.emptyTitle, { color: "#666" }]}>
                {searchQuery.trim()
                  ? `Nenhum resultado para "${searchQuery.trim()}"`
                  : "Nenhum título encontrado"}
              </Text>
              {!searchQuery.trim() && (
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: sourceColor }]}
                  onPress={() => setRetryKey((k) => k + 1)}
                  activeOpacity={0.8}
                >
                  <Feather name="refresh-cw" size={14} color="#fff" />
                  <Text style={styles.retryText}>Recarregar</Text>
                </TouchableOpacity>
              )}
              {searchQuery.trim() && items.length > 0 && currentPage < totalPages && (
                <Text style={[styles.searchHint, { color: "#555" }]}>
                  Role a lista para carregar mais títulos
                </Text>
              )}
            </View>
          }
          ListFooterComponent={
            loading && items.length > 0 && !searchQuery.trim() ? (
              <View style={styles.footer}>
                <ActivityIndicator color={sourceColor} />
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
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 2,
  },
  sourcePillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.2,
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
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 22, marginTop: 8,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  gridContainer: { paddingHorizontal: H_PAD, paddingTop: 4 },
  row: { justifyContent: "space-between", marginBottom: 0 },

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

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  searchBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
    borderRadius: 20,
  },
  searchBarWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 40,
    overflow: "hidden",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: 40,
    paddingVertical: 0,
  },
  searchResultsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 2,
  },
  searchResultsText: {
    color: "#888",
    fontSize: 12,
    fontWeight: "500",
  },
  searchHint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
});
