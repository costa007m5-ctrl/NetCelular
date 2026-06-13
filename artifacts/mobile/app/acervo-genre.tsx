import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { getCachedItemsByGenre, type CatalogItem } from "@/lib/drive-catalog";

const RED = "#e50914";
const PAGE_SIZE = 10;
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLS = 3;
const CARD_GAP = 8;
const HORIZONTAL_PAD = 16;
const CARD_WIDTH =
  (SCREEN_WIDTH - HORIZONTAL_PAD * 2 - CARD_GAP * (NUM_COLS - 1)) / NUM_COLS;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

function PosterCard({
  item,
  onPress,
}: {
  item: CatalogItem;
  onPress: () => void;
}) {
  const colors = useColors();
  const [imgError, setImgError] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: CARD_WIDTH, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <View
        style={[
          styles.posterWrap,
          { width: CARD_WIDTH, height: CARD_HEIGHT, backgroundColor: colors.card },
        ]}
      >
        {item.posterPath && !imgError ? (
          <Image
            source={{ uri: item.posterPath }}
            style={styles.poster}
            onError={() => setImgError(true)}
          />
        ) : (
          <View style={styles.noImage}>
            <Feather name="film" size={24} color={colors.mutedForeground} />
          </View>
        )}
        {/* Year badge */}
        {item.year > 0 && (
          <View style={styles.yearBadge}>
            <Text style={styles.yearText}>{item.year}</Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.cardTitle, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      {item.rating > 0 && (
        <View style={styles.ratingRow}>
          <Feather name="star" size={10} color="#f59e0b" />
          <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function AcervoGenreScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { genre } = useLocalSearchParams<{ genre: string }>();

  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const allItems = useMemo(
    () => getCachedItemsByGenre(genre ?? ""),
    [genre]
  );

  const displayedItems = useMemo(
    () => allItems.slice(0, page * PAGE_SIZE),
    [allItems, page]
  );

  const hasMore = displayedItems.length < allItems.length;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    // Small delay for visual feedback
    setTimeout(() => {
      setPage((p) => p + 1);
      setLoadingMore(false);
    }, 200);
  }, [hasMore, loadingMore]);

  const handleItemPress = (item: CatalogItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.type,
        id: String(item.tmdbId || item.id),
        title: item.title,
      },
    });
  };

  // Pad to fill last row
  const paddedItems = useMemo(() => {
    const rem = displayedItems.length % NUM_COLS;
    if (rem === 0) return displayedItems as (CatalogItem | null)[];
    const pads = NUM_COLS - rem;
    return [
      ...(displayedItems as (CatalogItem | null)[]),
      ...Array(pads).fill(null),
    ];
  }, [displayedItems]);

  const renderItem = ({ item }: { item: CatalogItem | null }) => {
    if (!item) {
      return <View style={{ width: CARD_WIDTH }} />;
    }
    return (
      <PosterCard item={item} onPress={() => handleItemPress(item)} />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {genre}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {allItems.length} {allItems.length === 1 ? "título" : "títulos"}
          </Text>
        </View>
        <View style={[styles.genreTag, { backgroundColor: RED + "22", borderColor: RED + "55" }]}>
          <Text style={[styles.genreTagText, { color: RED }]}>{genre}</Text>
        </View>
      </View>

      {allItems.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={44} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Nenhum título encontrado
          </Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Volte à tela Acervo e aguarde o carregamento completo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={paddedItems}
          keyExtractor={(item, index) =>
            item ? item.id : `pad-${index}`
          }
          numColumns={NUM_COLS}
          contentContainerStyle={{
            paddingHorizontal: HORIZONTAL_PAD,
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
          }}
          columnWrapperStyle={{ gap: CARD_GAP, marginBottom: CARD_GAP + 4 }}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator color={RED} size="small" />
                <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                  Carregando mais…
                </Text>
              </View>
            ) : hasMore ? (
              <TouchableOpacity
                onPress={loadMore}
                style={[styles.loadMoreBtn, { borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.loadMoreText, { color: colors.foreground }]}>
                  Carregar mais ({allItems.length - displayedItems.length} restantes)
                </Text>
                <Feather name="chevron-down" size={15} color={colors.foreground} />
              </TouchableOpacity>
            ) : (
              <View style={styles.footer}>
                <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                  {allItems.length} {allItems.length === 1 ? "título" : "títulos"} no total
                </Text>
              </View>
            )
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
    paddingBottom: 14,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 12, marginTop: 1 },
  genreTag: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  genreTagText: { fontSize: 12, fontWeight: "700" },
  card: { alignItems: "flex-start" },
  posterWrap: {
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  poster: { width: "100%", height: "100%", resizeMode: "cover" },
  noImage: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  yearBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  yearText: { color: "#fff", fontSize: 9, fontWeight: "600" },
  cardTitle: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 5,
    lineHeight: 15,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  ratingText: { color: "#f59e0b", fontSize: 10, fontWeight: "600" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 40,
  },
  emptyText: { fontSize: 16, fontWeight: "600" },
  emptyHint: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  footerText: { fontSize: 13 },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 40,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  loadMoreText: { fontSize: 14, fontWeight: "500" },
});
