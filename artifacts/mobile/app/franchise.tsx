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
import { FRANCHISES, getFranchise } from "@/constants/franchises";
import { api, tmdbItemToContent, TMDB_IMG } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const BACKDROP_H = 320;
const CARD_W = 120;
const CARD_H = 175;

// ─── Poster card for horizontal carousel ───────────────────────
function PosterCard({
  item,
  accentColor,
  onPress,
}: {
  item: ContentItem;
  accentColor: string;
  onPress: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_W, marginRight: 10 }}>
      <View style={styles.posterCard}>
        {!imgErr && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={styles.posterCardImg}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient
            colors={[accentColor + "44", "#111"]}
            style={[styles.posterCardImg, styles.posterPlaceholder]}
          >
            <Feather name="film" size={20} color={accentColor} />
          </LinearGradient>
        )}
        {item.type === "series" && (
          <View style={[styles.mediaTypeBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.mediaTypeBadgeText}>TV</Text>
          </View>
        )}
        {item.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={8} color="#fbbf24" />
            <Text style={styles.ratingBadgeText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.posterCardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.posterCardYear}>{item.year}</Text>
    </Pressable>
  );
}

// ─── Horizontal carousel section ───────────────────────────────
function ContentCarousel({
  title,
  items,
  accentColor,
  onPressItem,
  loading,
}: {
  title: string;
  items: ContentItem[];
  accentColor: string;
  onPressItem: (item: ContentItem) => void;
  loading?: boolean;
}) {
  if (!loading && items.length === 0) return null;
  return (
    <View style={styles.carouselSection}>
      <View style={styles.carouselHeader}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <Text style={styles.carouselTitle}>{title}</Text>
        {!loading && (
          <Text style={[styles.carouselCount, { color: accentColor }]}>
            {items.length} títulos
          </Text>
        )}
      </View>
      {loading ? (
        <View style={styles.carouselLoading}>
          <ActivityIndicator color={accentColor} size="small" />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselScroll}
        >
          {items.map((item) => (
            <PosterCard
              key={item.id}
              item={item}
              accentColor={accentColor}
              onPress={() => onPressItem(item)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Related franchise card with real image ────────────────────
function RelatedCard({ franchiseId, onPress }: { franchiseId: string; onPress: () => void }) {
  const f = getFranchise(franchiseId);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    if (!f) return;
    const load = async () => {
      try {
        let path: string | null = null;
        if (f.fetchType === "collection" && f.tmdbCollectionId) {
          const d = await api.tmdb.collection(f.tmdbCollectionId);
          path = d.backdrop_path;
        } else if (f.tmdbTvId) {
          const d = await api.tmdb.tv(f.tmdbTvId) as any;
          path = d.backdrop_path ?? null;
        } else {
          const q = f.searchQuery ?? f.name;
          const type = f.category === "anime" ? "tv" : "movie";
          const d = await api.tmdb.search(q, type as any);
          path = d.results[0]?.backdrop_path ?? null;
        }
        if (path) setImgUrl(TMDB_IMG(path, "w780") ?? null);
      } catch {}
    };
    load();
  }, [franchiseId]);

  if (!f) return null;

  return (
    <Pressable onPress={onPress} style={styles.relatedCard}>
      {imgUrl && !imgErr ? (
        <Image
          source={{ uri: imgUrl }}
          style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
          resizeMode="cover"
          onError={() => setImgErr(true)}
        />
      ) : (
        <LinearGradient colors={f.bgGradient} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.8)"]}
        locations={[0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.relatedAccent, { backgroundColor: f.color }]} />
      <View style={styles.relatedInfo}>
        <Text style={styles.relatedName}>{f.shortName}</Text>
        <Text style={[styles.relatedCount, { color: f.accentColor }]}>{f.contentCount} títulos</Text>
      </View>
    </Pressable>
  );
}

// ─── Main screen ───────────────────────────────────────────────
export default function FranchiseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const franchise = getFranchise(params.id ?? "");
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [backdropUrl, setBackdropUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [series, setSeries] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [BACKDROP_H - 80, BACKDROP_H],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // ── Fetch backdrop image ──────────────────────────────────────
  useEffect(() => {
    if (!franchise) return;
    const load = async () => {
      try {
        let path: string | null = null;
        if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
          const d = await api.tmdb.collection(franchise.tmdbCollectionId);
          path = d.backdrop_path;
        } else if (franchise.tmdbTvId) {
          const d = await api.tmdb.tv(franchise.tmdbTvId) as any;
          path = d.backdrop_path ?? null;
        } else {
          const q = franchise.searchQuery ?? franchise.name;
          const type = franchise.category === "anime" ? "tv" : "movie";
          const d = await api.tmdb.search(q, type as any);
          path = d.results[0]?.backdrop_path ?? null;
        }
        if (path) setBackdropUrl(TMDB_IMG(path, "w1280") ?? null);
      } catch {}
    };
    load();
  }, [franchise?.id]);

  // ── Fetch content ─────────────────────────────────────────────
  useEffect(() => {
    if (!franchise) return;
    setLoading(true);
    setMovies([]);
    setSeries([]);

    const load = async () => {
      try {
        let allItems: ContentItem[] = [];

        if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
          // Movie sagas — ordered by release date
          const data = await api.tmdb.collection(franchise.tmdbCollectionId);
          allItems = data.parts.map((p) =>
            tmdbItemToContent({ ...p, media_type: "movie" })
          );

        } else if (franchise.fetchType === "keyword" && franchise.tmdbKeywordId) {
          // Keyword-based (Marvel, DC, Star Wars, etc.)
          const [mvData, tvData] = await Promise.all([
            api.tmdb.keywordDiscover(franchise.tmdbKeywordId, "movie", 1),
            api.tmdb.keywordDiscover(franchise.tmdbKeywordId, "tv", 1),
          ]);
          const mvItems = mvData.results.map((m) =>
            tmdbItemToContent({ ...m, media_type: "movie" })
          );
          const tvItems = tvData.results.map((t) =>
            tmdbItemToContent({ ...t, media_type: "tv" })
          );
          allItems = [...mvItems, ...tvItems].sort((a, b) => b.rating - a.rating);

        } else if (franchise.fetchType === "tv" && franchise.tmdbTvId) {
          // TV franchise — main show + defined spinoffs (no random similar)
          const tvIds = [franchise.tmdbTvId, ...(franchise.relatedTvIds ?? [])];
          const tvResults = await Promise.allSettled(
            tvIds.map((id) => api.tmdb.tv(id) as Promise<any>)
          );
          allItems = tvResults
            .filter((r) => r.status === "fulfilled")
            .map((r: any) => tmdbItemToContent({ ...r.value, media_type: "tv" }));

        } else {
          // Search fallback — specific title + type
          const q = franchise.searchQuery ?? franchise.name;
          const type = franchise.searchType ?? (franchise.category === "anime" ? "tv" : "movie");
          const data = await api.tmdb.search(q, type as any);
          allItems = data.results
            .slice(0, 20)
            .map((item) => tmdbItemToContent({ ...item, media_type: type as any }));
          allItems.sort((a, b) => b.rating - a.rating);
        }

        // Deduplicate by tmdbId
        const seen = new Set<number>();
        const unique = allItems.filter((item) => {
          if (!item.tmdbId || seen.has(item.tmdbId)) return false;
          seen.add(item.tmdbId);
          return true;
        });

        setMovies(unique.filter((i) => i.type === "movie"));
        setSeries(unique.filter((i) => i.type === "series"));
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

  if (!franchise) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#666" }}>Franquia não encontrada</Text>
      </View>
    );
  }

  const allItems = [...movies, ...series];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Backdrop header ───────────────────────── */}
        <View style={[styles.backdrop, { height: BACKDROP_H }]}>
          {backdropUrl ? (
            <Image
              source={{ uri: backdropUrl }}
              style={[StyleSheet.absoluteFill, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
          )}

          {/* dark gradient overlay */}
          <LinearGradient
            colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)", "#000"]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* accent bar at top */}
          <View style={[styles.backdropAccent, { backgroundColor: franchise.color }]} />

          {/* info overlay */}
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

        {/* ── Stats ────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { icon: "film" as const, value: String(franchise.contentCount), label: "Títulos" },
            { icon: "clock" as const, value: `${franchise.totalHours}h`, label: "Total" },
            { icon: "calendar" as const, value: franchise.yearRange, label: "Período" },
          ].map((s) => (
            <View key={s.label} style={[styles.statItem, { borderColor: franchise.color + "33" }]}>
              <Feather name={s.icon} size={14} color={franchise.accentColor} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Description ──────────────────────────── */}
        <Text style={styles.description}>{franchise.description}</Text>

        {/* ── Action buttons ───────────────────────── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: franchise.color }]}
            onPress={() => allItems[0] && goToDetail(allItems[0])}
          >
            <Feather name="play" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>Maratonar Tudo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn}>
            <Feather name="heart" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.secondaryBtnText}>Favoritar</Text>
          </TouchableOpacity>
        </View>

        {/* ── Divider ──────────────────────────────── */}
        <View style={[styles.divider, { backgroundColor: franchise.color + "25" }]} />

        {/* ── Movies carousel ──────────────────────── */}
        {(loading || movies.length > 0) && (
          <ContentCarousel
            title="Filmes"
            items={movies}
            accentColor={franchise.accentColor}
            onPressItem={goToDetail}
            loading={loading && movies.length === 0}
          />
        )}

        {/* ── Series carousel ──────────────────────── */}
        {(loading || series.length > 0) && (
          <ContentCarousel
            title="Séries"
            items={series}
            accentColor={franchise.accentColor}
            onPressItem={goToDetail}
            loading={loading && series.length === 0}
          />
        )}

        {/* Loading state when no data yet */}
        {loading && movies.length === 0 && series.length === 0 && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={franchise.accentColor} />
            <Text style={styles.loadingText}>Carregando conteúdo...</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && movies.length === 0 && series.length === 0 && (
          <View style={styles.centered}>
            <Feather name="inbox" size={36} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyText}>Nenhum conteúdo encontrado</Text>
          </View>
        )}

        {/* ── Related franchises ───────────────────── */}
        {franchise.related.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.sectionHeader}>
              <View style={[styles.accentBar, { backgroundColor: franchise.color }]} />
              <Text style={styles.sectionTitle}>Se você gosta de {franchise.shortName}...</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedScroll}
            >
              {franchise.related.map((rid) => (
                <RelatedCard
                  key={rid}
                  franchiseId={rid}
                  onPress={() => router.push({ pathname: "/franchise", params: { id: rid } })}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.ScrollView>

      {/* ── Sticky header ────────────────────────── */}
      <Animated.View
        style={[styles.stickyHeader, { paddingTop: topPad }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: headerOpacity }]}
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
  // ── Backdrop ─────────────────────────────────────────────────
  backdrop: {
    position: "relative",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  backdropAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 2,
  },
  backdropInfo: {
    paddingHorizontal: 20,
    paddingBottom: 22,
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
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    lineHeight: 32,
    marginBottom: 4,
  },
  franchiseTagline: { fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },

  // ── Stats ─────────────────────────────────────────────────────
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 16,
    marginBottom: 16,
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

  // ── Description ───────────────────────────────────────────────
  description: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 18,
  },

  // ── Actions ───────────────────────────────────────────────────
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

  divider: { height: 1, marginHorizontal: 16, marginBottom: 4 },

  // ── Carousel ──────────────────────────────────────────────────
  carouselSection: { marginBottom: 24 },
  carouselHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 14,
  },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  carouselTitle: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },
  carouselCount: { fontSize: 12, fontWeight: "600" },
  carouselLoading: {
    height: CARD_H,
    alignItems: "center",
    justifyContent: "center",
  },
  carouselScroll: { paddingHorizontal: 20, paddingBottom: 4 },

  // ── Poster card ───────────────────────────────────────────────
  posterCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 6,
    position: "relative",
  },
  posterCardImg: { width: "100%", height: "100%" },
  posterPlaceholder: { alignItems: "center", justifyContent: "center" },
  mediaTypeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mediaTypeBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  ratingBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 5,
  },
  ratingBadgeText: { color: "#fbbf24", fontSize: 9, fontWeight: "800" },
  posterCardTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  posterCardYear: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 },

  // ── States ────────────────────────────────────────────────────
  centered: { alignItems: "center", paddingVertical: 50, gap: 10 },
  loadingText: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  emptyText: { color: "rgba(255,255,255,0.3)", fontSize: 14 },

  // ── Related ───────────────────────────────────────────────────
  relatedSection: { marginTop: 4, marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  relatedScroll: { paddingHorizontal: 16, gap: 10 },
  relatedCard: {
    width: 140,
    height: 105,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  relatedAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
  },
  relatedInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    zIndex: 2,
  },
  relatedName: { color: "#fff", fontSize: 13, fontWeight: "800", marginBottom: 2 },
  relatedCount: { fontSize: 10, fontWeight: "600" },

  // ── Sticky header ─────────────────────────────────────────────
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
  stickyTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
});
