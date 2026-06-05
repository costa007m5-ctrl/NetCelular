import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCatalog } from "@/lib/catalog-context";
import { api } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";
import { apiGetRegistry } from "@/lib/r2-direct";

const { width: SW } = Dimensions.get("window");
const NUM_COLS = 3;
const H_PAD = 12;
const GAP = 6;
const CARD_W = Math.floor((SW - H_PAD * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.floor(CARD_W * 1.5);
const PAGE_SIZE = 18;
const RED = "#e50914";

type CatalogType = "movie" | "tv" | "anime" | "dorama";

function itemTitle(it: TmdbItem) { return it.title ?? it.name ?? "Sem título"; }
function itemYear(it: TmdbItem) { return (it.release_date ?? it.first_air_date ?? "").slice(0, 4); }
function tmdbImg(path: string | null | undefined, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function PosterCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const img = tmdbImg(item.poster_path);
  const isMovie = !!(item.title && !item.name) || item.media_type === "movie";
  return (
    <Pressable style={s.card} onPress={onPress}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
          <Feather name="film" size={22} color="rgba(255,255,255,0.15)" />
        </View>
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.88)"]}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.cardInfo}>
        <Text style={s.cardTitle} numberOfLines={2}>{itemTitle(item)}</Text>
        <Text style={s.cardYear}>{itemYear(item)}</Text>
      </View>
    </Pressable>
  );
}

const TYPE_LABELS: Record<string, string> = {
  movie: "Filmes",
  tv: "Séries",
  anime: "Animes",
  dorama: "Doramas",
};

export default function CatalogListScreen() {
  const { catalog_type, title: titleParam } = useLocalSearchParams<{
    catalog_type: string;
    title: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const { byType } = useCatalog();
  const catalogType = (catalog_type as CatalogType) ?? "movie";
  const catalogIds = byType[catalogType] ?? [];

  const [r2ExtraIds, setR2ExtraIds] = useState<number[]>([]);

  useEffect(() => {
    const loadR2 = async () => {
      try {
        const reg = await apiGetRegistry();
        const registryItems: any[] = reg.items ?? [];
        const targetType = (catalogType === "movie") ? "movie" : "tv";
        const uniqueIds = [...new Set(
          registryItems
            .filter((i: any) => i.tmdbType === targetType)
            .map((i: any) => i.tmdbId)
            .filter(Boolean)
        )] as number[];
        setR2ExtraIds(uniqueIds);
      } catch {}
    };
    loadR2();
  }, [catalogType]);

  const allIds = (() => {
    const catalogSet = new Set(catalogIds);
    const extra = r2ExtraIds.filter((id) => !catalogSet.has(id));
    return [...extra, ...catalogIds];
  })();

  const [items, setItems] = useState<TmdbItem[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const loadingRef = useRef(false);

  const isTV = catalogType === "tv" || catalogType === "anime" || catalogType === "dorama";

  const loadPage = useCallback(async (pageIndex: number) => {
    if (loadingRef.current) return;
    const start = pageIndex * PAGE_SIZE;
    if (start >= allIds.length) return;

    loadingRef.current = true;
    setLoading(true);
    try {
      const slice = allIds.slice(start, start + PAGE_SIZE);
      const results = await Promise.all(
        slice.map((id) =>
          isTV
            ? api.tmdb.tv(id).catch(() => api.tmdb.movie(id).catch(() => null))
            : api.tmdb.movie(id).catch(() => api.tmdb.tv(id).catch(() => null))
        )
      );
      const valid = results.filter(Boolean) as TmdbItem[];
      setItems((prev) => (pageIndex === 0 ? valid : [...prev, ...valid]));
      setPage(pageIndex);
    } catch {
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setInitialLoading(false);
    }
  }, [allIds, isTV]);

  useEffect(() => {
    if (allIds.length > 0) {
      setItems([]);
      setPage(0);
      setInitialLoading(true);
      loadPage(0);
    }
  }, [allIds.length, catalogType]);

  const loadMore = useCallback(() => {
    const nextStart = (page + 1) * PAGE_SIZE;
    if (!loading && nextStart < allIds.length) {
      loadPage(page + 1);
    }
  }, [loading, page, allIds.length, loadPage]);

  const goToDetail = (item: TmdbItem) => {
    const isMovieItem = !!(item.title && !item.name) || item.media_type === "movie";
    router.push({
      pathname: "/detail",
      params: { type: isMovieItem ? "movie" : "tv", id: String(item.id), title: itemTitle(item) },
    });
  };

  const screenTitle = titleParam || TYPE_LABELS[catalogType] || "Catálogo";

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{screenTitle}</Text>
        <View style={s.headerRight}>
          <Text style={s.headerCount}>{allIds.length.toLocaleString("pt-BR")} títulos</Text>
        </View>
      </View>

      {initialLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={s.loadTxt}>Carregando catálogo...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it, i) => `${it.id}-${i}`}
          numColumns={NUM_COLS}
          contentContainerStyle={[s.grid, { paddingBottom: insets.bottom + 100 }]}
          columnWrapperStyle={s.row}
          renderItem={({ item }) => (
            <PosterCard item={item} onPress={() => goToDetail(item)} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loading && items.length > 0 ? (
              <View style={s.footer}>
                <ActivityIndicator color={RED} size="small" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.centered}>
              <Feather name="inbox" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={s.emptyTxt}>Nenhum conteúdo encontrado</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: "#000",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: "#fff", marginHorizontal: 8 },
  headerRight: { alignItems: "flex-end" },
  headerCount: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  grid: { paddingHorizontal: H_PAD, paddingTop: 12 },
  row: { gap: GAP, marginBottom: GAP },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden",
    backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 7, gap: 2 },
  cardTitle: { fontSize: 10, fontWeight: "700", color: "#fff", lineHeight: 13 },
  cardYear: { fontSize: 9, color: "rgba(255,255,255,0.4)" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  loadTxt: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  emptyTxt: { fontSize: 14, color: "rgba(255,255,255,0.3)", marginTop: 8 },
  footer: { paddingVertical: 20, alignItems: "center" },
});
