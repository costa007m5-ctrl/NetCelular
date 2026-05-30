import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, TMDB_IMG, tmdbItemToContent, type TmdbItem } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const CARD_W = (W - 48) / 3;
const CARD_H = CARD_W * 1.5;
const BACKDROP_H = 260;
const ACCENT = "#E8C97E";

function MovieCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardInner}>
        {!err && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1a1a", "#0a0a0a"]} style={StyleSheet.absoluteFill}>
            <Feather name="film" size={22} color="#444" style={{ margin: "auto" }} />
          </LinearGradient>
        )}
        {item.rating > 0 && (
          <View style={styles.rating}>
            <Feather name="star" size={8} color="#fbbf24" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardYear}>{item.year}</Text>
    </Pressable>
  );
}

export default function CollectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const collectionId = Number(params.id);

  const [collectionName, setCollectionName] = useState(params.name ?? "");
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange: [BACKDROP_H - 80, BACKDROP_H], outputRange: [0, 1], extrapolate: "clamp" });

  useEffect(() => {
    if (!collectionId) return;
    const load = async () => {
      try {
        const [data, logoData] = await Promise.all([
          api.tmdb.collection(collectionId),
          api.tmdb.franchiseLogo("collection", collectionId),
        ]);
        if (data.name) setCollectionName(data.name);
        if (data.backdrop_path) setBackdrop(TMDB_IMG(data.backdrop_path, "w1280"));
        if (logoData.logo_path) setLogo(TMDB_IMG(logoData.logo_path, "w500"));
        const items = data.parts
          .sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""))
          .map((p) => tmdbItemToContent({ ...p, media_type: "movie" }));
        setMovies(items);
      } catch (e) {
        console.warn("Collection load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [collectionId]);

  const goToDetail = (item: ContentItem) => {
    router.push({ pathname: "/detail", params: { type: "movie", id: String(item.tmdbId), title: item.title } });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <Animated.FlatList
        data={movies}
        keyExtractor={(item) => String(item.tmdbId)}
        numColumns={3}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View>
            {/* Backdrop */}
            <View style={[styles.backdrop, { height: BACKDROP_H }]}>
              {backdrop ? (
                <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <LinearGradient colors={["#0a0a0a", "#111", "#0a0a0a"]} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.55)", "#000"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
              <View style={[styles.backdropContent, { paddingTop: insets.top + 48 }]}>
                {logo ? (
                  <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
                ) : (
                  <Text style={styles.title}>{collectionName}</Text>
                )}
                <Text style={[styles.subtitle, { color: ACCENT }]}>{movies.length} filmes na coleção</Text>
              </View>
            </View>

            {/* Count header */}
            {!loading && movies.length > 0 && (
              <View style={styles.sectionHeader}>
                <View style={[styles.accentBar, { backgroundColor: ACCENT }]} />
                <Text style={styles.sectionTitle}>Filmes</Text>
                <Text style={[styles.sectionCount, { color: ACCENT }]}>{movies.length} títulos</Text>
              </View>
            )}

            {loading && (
              <View style={styles.centered}>
                <ActivityIndicator color={ACCENT} size="large" />
              </View>
            )}
          </View>
        }
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => <MovieCard item={item} onPress={() => goToDetail(item)} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>Nenhum filme encontrado</Text>
          </View>
        ) : null}
      />

      {/* Sticky top bar */}
      <Animated.View style={[styles.topBar, { paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: headerOpacity }]} />
        <View style={styles.topBarContent}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </Pressable>
          <Animated.Text style={[styles.topBarTitle, { opacity: headerOpacity }]} numberOfLines={1}>
            {collectionName}
          </Animated.Text>
          <View style={{ width: 36 }} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  backdrop: { position: "relative", overflow: "hidden" },
  backdropContent: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 24, paddingHorizontal: 24 },
  logo: { width: W * 0.6, height: 90, marginBottom: 8 },
  title: { color: "#fff", fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 13, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, gap: 8 },
  accentBar: { width: 3, height: 18, borderRadius: 2 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },
  sectionCount: { fontSize: 12, fontWeight: "600" },
  row: { paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  card: { width: CARD_W },
  cardInner: { width: CARD_W, height: CARD_H, borderRadius: 8, overflow: "hidden", backgroundColor: "#111", marginBottom: 4 },
  rating: { position: "absolute", bottom: 4, right: 4, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, gap: 2 },
  ratingText: { color: "#fbbf24", fontSize: 9, fontWeight: "700" },
  cardTitle: { color: "#ddd", fontSize: 10, fontWeight: "600", lineHeight: 13 },
  cardYear: { color: "#666", fontSize: 9 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  topBarContent: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)" },
  topBarTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  emptyText: { color: "#555", fontSize: 14 },
});
