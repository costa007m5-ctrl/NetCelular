import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { ContentCardWithLabel } from "@/components/ContentCard";
import { api, tmdbItemToContent } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const NUM_COLS = 3;
const H_PAD = 16;
const GAP = 8;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - H_PAD * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_HEIGHT = Math.floor(CARD_WIDTH * 1.5);

export default function GenreBrowseScreen() {
  const { genre_id, type, title } = useLocalSearchParams<{
    genre_id: string;
    type: string;
    title: string;
  }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  const [items, setItems] = useState<ContentItem[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(999);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(
    async (page: number) => {
      if (loadingRef.current || page > totalPages) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const data = await api.tmdb.discover(
          (type as "movie" | "tv") ?? "movie",
          Number(genre_id),
          page
        );
        const newItems = data.results.map(tmdbItemToContent);
        setItems((prev) => (page === 1 ? newItems : [...prev, ...newItems]));
        setCurrentPage(page);
        setTotalPages(data.total_pages);
      } catch (err) {
        console.error("Error loading genre page:", err);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [type, genre_id, totalPages]
  );

  useEffect(() => {
    const init = async () => {
      setInitialLoading(true);
      loadingRef.current = true;
      setLoading(true);
      try {
        const [d1, d2] = await Promise.all([
          api.tmdb.discover((type as "movie" | "tv") ?? "movie", Number(genre_id), 1),
          api.tmdb.discover((type as "movie" | "tv") ?? "movie", Number(genre_id), 2),
        ]);
        const all = [
          ...d1.results.map(tmdbItemToContent),
          ...d2.results.map(tmdbItemToContent),
        ];
        setItems(all);
        setCurrentPage(2);
        setTotalPages(d1.total_pages);
      } catch (err) {
        console.error("Error initializing genre browse:", err);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setInitialLoading(false);
      }
    };
    init();
  }, []);

  const loadMore = useCallback(() => {
    if (!loading && currentPage < totalPages) {
      fetchPage(currentPage + 1);
    }
  }, [loading, currentPage, totalPages, fetchPage]);

  const topPad = isWeb ? 0 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {title ?? "Explorar"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {initialLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          numColumns={NUM_COLS}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + 32 },
          ]}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <ContentCardWithLabel
              item={item}
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              onPress={() =>
                router.push({
                  pathname: "/detail",
                  params: {
                    type:
                      item.mediaType ??
                      (item.type === "movie" ? "movie" : "tv"),
                    id: String(item.tmdbId ?? item.id),
                    title: item.title,
                  },
                })
              }
            />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.primary} />
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  grid: {
    paddingHorizontal: H_PAD,
    paddingTop: 8,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  footer: { padding: 24, alignItems: "center" },
});
