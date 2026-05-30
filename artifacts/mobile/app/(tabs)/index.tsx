import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { TopTenCard } from "@/components/TopTenCard";
import { SyncBar } from "@/components/SyncBar";
import { SkeletonRow } from "@/components/SkeletonLoader";
import { GenreRow } from "@/components/GenreRow";
import { api, tmdbItemToContent } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { CATEGORIES, HERO_ITEMS, TOP_10_SERIES, TRENDING } from "@/constants/content";

const TAB_BAR_CLEARANCE = 110;

const GENRE_SECTIONS = [
  { id: 28,    type: "movie" as const, label: "Filmes de Ação" },
  { id: 18,    type: "tv"    as const, label: "Séries Drama" },
  { id: 16,    type: "movie" as const, label: "Animação" },
  { id: 35,    type: "movie" as const, label: "Comédia" },
  { id: 27,    type: "movie" as const, label: "Terror" },
  { id: 878,   type: "movie" as const, label: "Ficção Científica" },
  { id: 10766, type: "tv"    as const, label: "Novelas" },
  { id: 80,    type: "movie" as const, label: "Crime" },
  { id: 10749, type: "movie" as const, label: "Romance" },
  { id: 99,    type: "movie" as const, label: "Documentários" },
  { id: 12,    type: "movie" as const, label: "Aventura" },
  { id: 14,    type: "movie" as const, label: "Fantasia" },
  { id: 9648,  type: "tv"    as const, label: "Séries Mistério" },
  { id: 10751, type: "movie" as const, label: "Família" },
  { id: 36,    type: "movie" as const, label: "História" },
  { id: 10759, type: "tv"    as const, label: "Ação & Aventura (Séries)" },
  { id: 10764, type: "tv"    as const, label: "Reality Shows" },
  { id: 10752, type: "movie" as const, label: "Guerra" },
  { id: 37,    type: "movie" as const, label: "Faroeste" },
  { id: 10402, type: "movie" as const, label: "Musical" },
];

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(2);
  const [showSync, setShowSync] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");

  const [heroItems, setHeroItems] = useState<ContentItem[]>(HERO_ITEMS);
  const [trendingItems, setTrendingItems] = useState<ContentItem[]>(TRENDING);
  const [top10, setTop10] = useState<ContentItem[]>(TOP_10_SERIES);

  const userId = user?.id ?? "";
  const [continueItems, setContinueItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;
    db.progress.getAll(userId).then((items) =>
      setContinueItems(items.map((p) => ({
        id: String(p.tmdb_id),
        tmdbId: p.tmdb_id,
        title: p.title ?? "Sem título",
        year: 2024,
        rating: 0,
        posterPath: p.poster_path ?? "",
        backdropPath: p.backdrop_path ?? "",
        description: "",
        genres: [],
        type: p.type === "movie" ? ("movie" as const) : ("series" as const),
        mediaType: p.type,
        progress: p.progress ?? 0,
      })))
    );
  }, [userId]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const loadData = useCallback(async () => {
    try {
      const data = await api.tmdb.trending();
      const all = data.all.map(tmdbItemToContent);
      const movies = data.movies.map(tmdbItemToContent);
      const tv = data.tv.map(tmdbItemToContent);

      setHeroItems(all.slice(0, 3));
      setTrendingItems(all.slice(0, 8));
      setTop10([...movies.slice(0, 3), ...tv.slice(0, 2)]);
    } catch (err) {
      console.log("Using mock data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!showSync) return;
    const interval = setInterval(() => {
      setSyncProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => setShowSync(false), 800);
          return 100;
        }
        return Math.min(p + Math.floor(Math.random() * 8) + 3, 100);
      });
    }, 160);
    return () => clearInterval(interval);
  }, [showSync]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const goToPlayer = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View>
          <HeroBanner items={heroItems} onItemPress={goToPlayer} />
        </View>

        <View style={{ paddingTop: 0, marginTop: 0 }}>
          <View style={styles.categoriesRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setActiveCategory(cat.id)}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor:
                        activeCategory === cat.id ? colors.primary : colors.card,
                      borderColor:
                        activeCategory === cat.id ? colors.primary : colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      {
                        color:
                          activeCategory === cat.id ? "#fff" : colors.mutedForeground,
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : (
            <>
              <ContentRow
                title="Em Alta"
                icon="fire"
                items={trendingItems}
                cardWidth={150}
                cardHeight={210}
                seeAllLabel="Ver mais"
                onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Em Alta" } })}
                onItemPress={goToPlayer}
              />

              <View style={styles.topTenSection}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.redBar, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    Top 10 Séries
                  </Text>
                  <TouchableOpacity style={styles.seeAllBtn}>
                    <Text style={[styles.seeAllText, { color: colors.mutedForeground }]}>
                      Ver mais
                    </Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.topTenScroll}
                >
                  {top10.map((item, i) => (
                    <TopTenCard
                      key={item.id}
                      item={item}
                      rank={i + 1}
                      onPress={() => goToPlayer(item)}
                    />
                  ))}
                </ScrollView>
              </View>

              {continueItems.length > 0 && (
                <ContentRow
                  title="Continue Assistindo"
                  icon="play"
                  items={continueItems}
                  cardWidth={170}
                  cardHeight={100}
                  showProgress
                  onSeeAll={() => {}}
                  onItemPress={goToPlayer}
                />
              )}

              {GENRE_SECTIONS.map((genre) => (
                <GenreRow
                  key={`${genre.type}-${genre.id}`}
                  genreId={genre.id}
                  type={genre.type}
                  title={genre.label}
                />
              ))}
            </>
          )}
        </View>
      </Animated.ScrollView>

      <Animated.View
        style={[styles.header, { paddingTop: topPad, top: 0 }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.background, opacity: headerOpacity },
          ]}
        />
        <View style={styles.headerContent}>
          <Text style={[styles.logo, { color: colors.primary }]}>NETPLAY</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/search")}
            >
              <Feather name="search" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/profile")}
            >
              <Feather name="user" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {showSync && (
        <View style={[styles.syncWrapper, { top: topPad + 52 }]}>
          <SyncBar progress={Math.min(syncProgress, 100)} visible={showSync} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  logo: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  categoriesRow: { marginTop: 12, marginBottom: 20 },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontWeight: "600" },
  topTenSection: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  redBar: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: "700", flex: 1, letterSpacing: -0.3 },
  seeAllBtn: {},
  seeAllText: { fontSize: 12, fontWeight: "500" },
  topTenScroll: { paddingHorizontal: 20, gap: 4 },
  syncWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
});
