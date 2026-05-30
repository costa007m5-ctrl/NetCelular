import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getFranchise } from "@/constants/franchises";
import { api, tmdbItemToContent, TMDB_IMG } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const BACKDROP_H = 340;
type FilterType = "all" | "movie" | "tv";

function ContentListItem({
  item,
  rank,
  accentColor,
  onPress,
}: {
  item: ContentItem;
  rank: number;
  accentColor: string;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <Pressable onPress={onPress} style={styles.listItem}>
      <Text style={[styles.listRank, { color: accentColor + "80" }]}>
        {String(rank).padStart(2, "0")}
      </Text>
      <View style={styles.listPoster}>
        {!imgError && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={styles.posterImg}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient
            colors={[accentColor + "33", "#1a1a1a"]}
            style={[styles.posterImg, styles.posterPlaceholder]}
          >
            <Feather name="film" size={18} color={accentColor} />
          </LinearGradient>
        )}
        {item.type === "series" && (
          <View style={[styles.typeBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}
      </View>
      <View style={styles.listInfo}>
        <Text style={styles.listTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.listMeta}>
          <Text style={styles.listYear}>{item.year}</Text>
          {item.rating > 0 && (
            <View style={styles.ratingRow}>
              <Feather name="star" size={10} color="#fbbf24" />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.listDesc} numberOfLines={2}>{item.description}</Text>
      </View>
    </Pressable>
  );
}

export default function FranchiseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const franchise = getFranchise(params.id ?? "");
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [BACKDROP_H - 80, BACKDROP_H],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  useEffect(() => {
    if (!franchise) return;
    setLoading(true);
    setItems([]);

    const load = async () => {
      try {
        let allItems: ContentItem[] = [];

        if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
          const data = await api.tmdb.collection(franchise.tmdbCollectionId);
          allItems = data.parts.map((p) =>
            tmdbItemToContent({ ...p, media_type: "movie" })
          );
        } else if (franchise.fetchType === "tv" && franchise.tmdbTvId) {
          const tv = await api.tmdb.tv(franchise.tmdbTvId);
          allItems = [tmdbItemToContent({ ...tv, media_type: "tv" })];
          const similar = await api.tmdb.tvSimilar(franchise.tmdbTvId);
          allItems = [...allItems, ...similar.slice(0, 6).map((s) =>
            tmdbItemToContent({ ...s, media_type: "tv" })
          )];
        } else {
          const q = franchise.searchQuery ?? franchise.name;
          const [movieData, tvData] = await Promise.all([
            api.tmdb.search(q, "movie"),
            api.tmdb.search(q, "tv"),
          ]);
          const movies = movieData.results.map((m) =>
            tmdbItemToContent({ ...m, media_type: "movie" })
          );
          const tvs = tvData.results.map((t) =>
            tmdbItemToContent({ ...t, media_type: "tv" })
          );
          allItems = [...movies, ...tvs];
          allItems.sort((a, b) => b.rating - a.rating);
        }

        setItems(allItems);
      } catch (e) {
        console.warn("Franchise fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [franchise?.id]);

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

  const relatedFranchises = franchise?.related
    .map((rid) => {
      const f = require("@/constants/franchises").getFranchise(rid);
      return f;
    })
    .filter(Boolean) ?? [];

  const filteredItems = items.filter((item) => {
    if (filter === "movie") return item.type === "movie";
    if (filter === "tv") return item.type === "series";
    return true;
  });

  if (!franchise) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#666" }}>Franquia não encontrada</Text>
      </View>
    );
  }

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: "all", label: "Tudo" },
    { id: "movie", label: "Filmes" },
    { id: "tv", label: "Séries" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: franchise.bgGradient[2] }]}>
      <StatusBar style="light" />

      <LinearGradient
        colors={franchise.bgGradient}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Backdrop Header ─────────────────────────────── */}
        <View style={[styles.backdrop, { height: BACKDROP_H }]}>
          <LinearGradient
            colors={[franchise.bgGradient[0], franchise.bgGradient[1]]}
            style={StyleSheet.absoluteFill}
          />

          {/* Animated glow */}
          <View style={[styles.backdropGlow, { backgroundColor: franchise.color }]} />

          {/* Emoji large */}
          <Text style={styles.backdropEmoji}>{franchise.emoji}</Text>

          {/* Gradient overlay to body */}
          <LinearGradient
            colors={["transparent", franchise.bgGradient[2]]}
            style={styles.backdropFade}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          {/* Franchise info */}
          <View style={styles.backdropInfo}>
            <View style={[styles.categoryBadge, { borderColor: franchise.color + "80" }]}>
              <Text style={[styles.categoryBadgeText, { color: franchise.accentColor }]}>
                {franchise.category.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.franchiseName}>{franchise.name.toUpperCase()}</Text>
            <Text style={[styles.franchiseTagline, { color: franchise.accentColor }]}>
              {franchise.tagline}
            </Text>
          </View>
        </View>

        {/* ── Stats ───────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { icon: "film" as const, value: String(franchise.contentCount), label: "Conteúdos" },
            { icon: "clock" as const, value: `${franchise.totalHours}h`, label: "Total" },
            { icon: "calendar" as const, value: franchise.yearRange, label: "Período" },
          ].map((stat) => (
            <View key={stat.label} style={[styles.statItem, { borderColor: franchise.color + "33" }]}>
              <Feather name={stat.icon} size={14} color={franchise.accentColor} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Description ─────────────────────────────────── */}
        <Text style={styles.description}>{franchise.description}</Text>

        {/* ── Action Buttons ───────────────────────────────── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: franchise.color }]}
            onPress={() => filteredItems[0] && goToDetail(filteredItems[0])}
          >
            <Feather name="play" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>Maratonar Tudo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn}>
            <Feather name="heart" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.secondaryBtnText}>Favoritar</Text>
          </TouchableOpacity>
        </View>

        {/* ── Filter Tabs ─────────────────────────────────── */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.filterTab,
                filter === f.id
                  ? { backgroundColor: franchise.color, borderColor: franchise.color }
                  : { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)" },
              ]}
            >
              <Text
                style={[
                  styles.filterTabText,
                  { color: filter === f.id ? "#fff" : "rgba(255,255,255,0.55)" },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Divider ─────────────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: franchise.color + "30" }]} />

        {/* ── Content List ────────────────────────────────── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={franchise.accentColor} />
            <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 13 }}>
              Carregando conteúdo...
            </Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.centered}>
            <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
              Nenhum conteúdo encontrado
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredItems.map((item, i) => (
              <ContentListItem
                key={item.id}
                item={item}
                rank={i + 1}
                accentColor={franchise.accentColor}
                onPress={() => goToDetail(item)}
              />
            ))}
          </View>
        )}

        {/* ── Related Franchises ───────────────────────────── */}
        {relatedFranchises.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.sectionHeader}>
              <View style={[styles.accentBar, { backgroundColor: franchise.color }]} />
              <Text style={styles.sectionTitle}>Se você gosta de {franchise.shortName}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedScroll}
            >
              {relatedFranchises.map((rel: any) => (
                <Pressable
                  key={rel.id}
                  onPress={() => router.push({ pathname: "/franchise", params: { id: rel.id } })}
                  style={styles.relatedCard}
                >
                  <LinearGradient
                    colors={rel.bgGradient as [string, string, string]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={[styles.relatedAccent, { backgroundColor: rel.color }]} />
                  <Text style={styles.relatedEmoji}>{rel.emoji}</Text>
                  <Text style={styles.relatedName}>{rel.shortName}</Text>
                  <Text style={[styles.relatedCount, { color: rel.accentColor }]}>
                    {rel.contentCount} conteúdos
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.ScrollView>

      {/* ── Sticky Header ───────────────────────────────── */}
      <Animated.View
        style={[styles.stickyHeader, { paddingTop: topPad }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: franchise.bgGradient[2], opacity: headerOpacity }]}
        />
        <View style={styles.stickyHeaderContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circleBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Animated.Text style={[styles.stickyTitle, { opacity: headerOpacity }]}>
            {franchise.shortName.toUpperCase()}
          </Animated.Text>
          <View style={{ width: 40 }} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },

  // Backdrop
  backdrop: {
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  backdropGlow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -80,
    right: -60,
    opacity: 0.25,
  },
  backdropEmoji: {
    position: "absolute",
    fontSize: 120,
    top: 40,
    opacity: 0.15,
  },
  backdropFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  backdropInfo: {
    width: "100%",
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 2,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  categoryBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  franchiseName: {
    fontSize: 30,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    lineHeight: 34,
    marginBottom: 4,
  },
  franchiseTagline: { fontSize: 14, fontWeight: "600", letterSpacing: 0.3 },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
    marginTop: 8,
  },
  statItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  statValue: { color: "#fff", fontSize: 13, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "500" },

  // Description
  description: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 18,
  },

  // Actions
  actionsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    flex: 1,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },

  // Filter
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTabText: { fontSize: 13, fontWeight: "700" },
  divider: { height: 1, marginHorizontal: 16, marginBottom: 16 },

  // List
  list: { paddingHorizontal: 16 },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  listRank: {
    fontSize: 22,
    fontWeight: "900",
    width: 32,
    textAlign: "right",
    lineHeight: 28,
    letterSpacing: -1,
  },
  listPoster: { position: "relative" },
  posterImg: { width: 70, height: 105, borderRadius: 8 },
  posterPlaceholder: { alignItems: "center", justifyContent: "center" },
  typeBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  typeBadgeText: { color: "#fff", fontSize: 7, fontWeight: "800", letterSpacing: 0.4 },
  listInfo: { flex: 1, paddingTop: 2 },
  listTitle: { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 4, lineHeight: 19 },
  listMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  listYear: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "500" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  listDesc: { color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 16 },

  // Related
  relatedSection: { marginTop: 16, marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 14,
  },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  relatedScroll: { paddingHorizontal: 16, gap: 10 },
  relatedCard: {
    width: 130,
    height: 110,
    borderRadius: 14,
    overflow: "hidden",
    padding: 12,
    position: "relative",
  },
  relatedAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  relatedEmoji: { fontSize: 22, marginBottom: 4 },
  relatedName: { color: "#fff", fontSize: 12, fontWeight: "800", marginBottom: 3 },
  relatedCount: { fontSize: 10, fontWeight: "600" },

  // Sticky header
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  stickyHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  stickyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
