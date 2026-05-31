import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, TMDB_IMG } from "@/lib/api";

const { width: W } = Dimensions.get("window");
const COLS = 2;
const CARD_W = (W - 48) / COLS;
const CARD_H = CARD_W * 1.5;

interface CollectionEntry {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview?: string;
}

function CollectionCard({
  item,
  onPress,
}: {
  item: CollectionEntry;
  onPress: () => void;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const imgUrl = TMDB_IMG(item.poster_path, "w500");

  useEffect(() => {
    api.tmdb.franchiseLogo("collection", item.id).then((d) => {
      if (d.logo_path) setLogoUrl(TMDB_IMG(d.logo_path, "w500"));
    });
  }, [item.id]);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardImg}>
        {!imgErr && imgUrl ? (
          <Image
            source={{ uri: imgUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#0a0a18"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.82)"]}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardBottom}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.cardLogo}
              resizeMode="contain"
            />
          ) : (
            <Text style={styles.cardName} numberOfLines={2}>
              {item.name}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function CollectionsBrowserScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; title?: string }>();

  const initialQ = params.q ?? "";
  const screenTitle = params.title ?? "Coletâneas TMDB";

  const [collections, setCollections] = useState<CollectionEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(999);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState(initialQ);
  const [searchActive, setSearchActive] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPage = useCallback(
    async (pageNum: number, query: string, replace = false) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const data = query.trim()
          ? await api.tmdb.searchCollections(query, pageNum)
          : await api.tmdb.popularCollections(pageNum);
        setTotalPages(data.total_pages ?? 1);
        setCollections((prev) =>
          replace ? data.results : [...prev, ...data.results]
        );
        setPage(pageNum);
      } catch (e) {
        console.warn("Collections load error:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPage(1, initialQ, true);
  }, []);

  useEffect(() => {
    if (!searchActive) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadPage(1, search, true);
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const loadMore = () => {
    if (loadingMore || loading || page >= totalPages) return;
    loadPage(page + 1, search, false);
  };

  const openCollection = (item: CollectionEntry) => {
    router.push({ pathname: "/collection", params: { id: String(item.id), name: item.name } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{screenTitle}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Feather name="search" size={15} color="#888" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar coletânea..."
            placeholderTextColor="#555"
            value={search}
            onChangeText={(t) => { setSearch(t); setSearchActive(true); }}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => { setSearch(""); setSearchActive(false); loadPage(1, "", true); }}>
              <Feather name="x" size={15} color="#888" />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#E8C97E" size="large" />
          <Text style={styles.loadingText}>Carregando coletâneas...</Text>
        </View>
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => String(item.id)}
          numColumns={COLS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 60 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <CollectionCard item={item} onPress={() => openCollection(item)} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color="#E8C97E" size="small" />
                <Text style={styles.footerText}>Carregando mais...</Text>
              </View>
            ) : page < totalPages ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                <Text style={styles.loadMoreText}>Ver mais</Text>
                <Feather name="chevron-down" size={16} color="#E8C97E" />
              </TouchableOpacity>
            ) : (
              <Text style={styles.endText}>Fim das coletâneas</Text>
            )
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather name="inbox" size={40} color="#333" />
              <Text style={styles.emptyText}>Nenhuma coletânea encontrada</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: { backgroundColor: "#000", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#111" },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#1a1a1a" },
  headerTitle: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "800", textAlign: "center", letterSpacing: 0.5 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#111", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "#222" },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, padding: 0 },
  row: { gap: 12, marginBottom: 12 },
  card: { width: CARD_W },
  cardImg: { width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" },
  cardBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, alignItems: "center", justifyContent: "center" },
  cardLogo: { width: CARD_W - 20, height: 48, marginBottom: 4 },
  cardName: { color: "#fff", fontSize: 12, fontWeight: "700", textAlign: "center", lineHeight: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  loadingText: { color: "#666", marginTop: 12, fontSize: 13 },
  footerLoader: { alignItems: "center", paddingVertical: 20, gap: 8 },
  footerText: { color: "#666", fontSize: 12 },
  loadMoreBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16, marginHorizontal: 40, borderRadius: 24, borderWidth: 1, borderColor: "#333", marginBottom: 8 },
  loadMoreText: { color: "#E8C97E", fontSize: 14, fontWeight: "700" },
  endText: { textAlign: "center", color: "#333", fontSize: 12, paddingVertical: 20 },
  emptyText: { color: "#555", fontSize: 14, marginTop: 12 },
});
