import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

const NUM_COLS = 3;
const H_PAD = 12;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - H_PAD * 2) / NUM_COLS) - 4;
const CARD_HEIGHT = Math.floor(CARD_WIDTH * 1.5);

const GridCard = React.memo(function GridCard({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH, marginBottom: 12 }}>
      <View style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
        {!imgError && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={styles.cardPlaceholder}>
              <Feather name="film" size={24} color="#444" />
            </View>
          </LinearGradient>
        )}
        {item.type === "series" && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.75)"]}
          style={styles.cardGrad}
          locations={[0.55, 1]}
        />
        <Text style={styles.cardLabel} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );
});

export default function GenreBrowseScreen() {
  const { genre_id, type, title, lang } = useLocalSearchParams<{
    genre_id: string;
    type: string;
    title: string;
    lang?: string;  // optional language filter (e.g. "pt", "ko", "ja")
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

  const loadingRef = useRef(false);

  // Fetch a single page with the correct API method
  const fetchData = (page: number) => {
    if (resolvedLang) {
      return api.tmdb.discoverByLang(resolvedType, resolvedLang, resolvedGenreId, page);
    }
    return api.tmdb.discover(resolvedType, resolvedGenreId, page);
  };

  // Initial load — runs once on mount + whenever user presses retry
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

  const topPad = isWeb ? 0 : insets.top;
  const renderItem = ({ item }: { item: ContentItem }) => (
    <GridCard item={item} onPress={() => goToDetail(item)} />
  );
  const keyExtractor = (item: ContentItem, idx: number) => `${item.id}-${idx}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {title ?? "Explorar"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

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
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 32 }]}
          columnWrapperStyle={styles.row}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
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
    paddingBottom: 12,
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 13, fontWeight: "500", marginTop: 4 },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(229,9,20,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    marginTop: 8,
    backgroundColor: "#e50914",
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  grid: { paddingHorizontal: H_PAD, paddingTop: 8 },
  row: { justifyContent: "space-between" },
  card: { borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" },
  cardPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "50%" },
  cardLabel: {
    position: "absolute",
    bottom: 5,
    left: 5,
    right: 5,
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 12,
  },
  typeBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    zIndex: 1,
  },
  typeBadgeText: { color: "#fff", fontSize: 8, fontWeight: "700", letterSpacing: 0.4 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  footer: { padding: 24, alignItems: "center" },
});
