import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMergedPreferences } from "@/lib/smart-preferences";
import {
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { HERO_ITEMS, TOP_10_SERIES, TRENDING } from "@/constants/content";
import { MAIN_PLATFORMS, STREAMING_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";

const TAB_BAR_CLEARANCE = 110;

const TMDB_KEY_HOME = "8f0beb08cf016ec8de49e454e09879ec";

function decadeToYearRange(decades: string[]): { gte: string; lte: string } | null {
  if (!decades?.length) return null;
  const MAP: Record<string, [number, number]> = {
    "Anos 80": [1980, 1989],
    "Anos 90": [1990, 1999],
    "Anos 2000": [2000, 2009],
    "Anos 2010": [2010, 2019],
    "Anos 2020": [2020, 2024],
    "2025": [2025, 2025],
    "2026": [2026, 2026],
  };
  let minYear = Infinity, maxYear = -Infinity;
  for (const d of decades) {
    const r = MAP[d];
    if (r) { if (r[0] < minYear) minYear = r[0]; if (r[1] > maxYear) maxYear = r[1]; }
  }
  if (minYear === Infinity) return null;
  return { gte: `${minYear}-01-01`, lte: `${maxYear}-12-31` };
}

async function discoverPersonalized(
  type: "movie" | "tv",
  genres: number[],
  yearRange: { gte: string; lte: string } | null
): Promise<any[]> {
  try {
    const path = type === "movie" ? "/discover/movie" : "/discover/tv";
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set("api_key", TMDB_KEY_HOME);
    url.searchParams.set("language", "pt-BR");
    if (genres.length) url.searchParams.set("with_genres", genres.slice(0, 3).join(","));
    url.searchParams.set("sort_by", "popularity.desc");
    url.searchParams.set("include_adult", "false");
    if (yearRange) {
      if (type === "movie") {
        url.searchParams.set("primary_release_date.gte", yearRange.gte);
        url.searchParams.set("primary_release_date.lte", yearRange.lte);
      } else {
        url.searchParams.set("first_air_date.gte", yearRange.gte);
        url.searchParams.set("first_air_date.lte", yearRange.lte);
      }
    }
    const res = await fetch(url.toString());
    const data = await res.json();
    return (data.results ?? []) as any[];
  } catch {
    return [];
  }
}

// Streaming chips shown in the home row (first 6 main + "Ver todos")
const HOME_STREAMING = MAIN_PLATFORMS.slice(0, 6);

function StreamingChip({
  platform,
  onPress,
}: {
  platform: StreamingPlatform;
  onPress: () => void;
}) {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = platform.logoPath
    ? `https://image.tmdb.org/t/p/w185${platform.logoPath}`
    : null;

  return (
    <Pressable onPress={onPress} style={styles.streamingChip}>
      <LinearGradient
        colors={[platform.bgGradient[0], platform.bgGradient[1]] as [string, string]}
        style={styles.streamingChipGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={[styles.streamingChipAccent, { backgroundColor: platform.brandColor }]} />
        {logoUrl && !logoError ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.streamingChipLogo}
            contentFit="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Text style={[styles.streamingChipText, { color: platform.brandColor }]} numberOfLines={1}>
            {platform.name.split(" ")[0]}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const DEFAULT_GENRE_SECTIONS = [
  { id: 28,  type: "movie" as const, label: "Filmes de Ação" },
  { id: 18,  type: "tv"    as const, label: "Séries Drama" },
  { id: 16,  type: "movie" as const, label: "Animação" },
  { id: 35,  type: "movie" as const, label: "Comédia" },
  { id: 27,  type: "movie" as const, label: "Terror" },
];

const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 10770: "TV Movie",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
};

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

  const [heroItems, setHeroItems] = useState<ContentItem[]>(HERO_ITEMS);
  const [trendingItems, setTrendingItems] = useState<ContentItem[]>(TRENDING);
  const [top10, setTop10] = useState<ContentItem[]>(TOP_10_SERIES);

  const userId = user?.id ?? "";
  const [continueItems, setContinueItems] = useState<ContentItem[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [preferences, setPreferences] = useState<{
    genres?: number[];
    contentTypes?: string[];
    decades?: string[];
    movies?: number[];
    series?: number[];
  } | null>(null);
  const [personalizedItems, setPersonalizedItems] = useState<ContentItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem("netplay_active_profile_v2")
      .then((raw) => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    getMergedPreferences()
      .then((merged) => { if (merged) setPreferences(merged); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!preferences?.genres?.length) return;

    const genres = preferences.genres;
    const yearRange = decadeToYearRange(preferences.decades ?? []);
    const wantsMovies = !preferences.contentTypes?.length || preferences.contentTypes.includes("Filmes");
    const wantsSeries = !preferences.contentTypes?.length || preferences.contentTypes.includes("Séries");
    const primaryType: "movie" | "tv" = wantsSeries && !wantsMovies ? "tv" : "movie";
    const secondaryType: "movie" | "tv" = primaryType === "movie" ? "tv" : "movie";

    Promise.all([
      discoverPersonalized(primaryType, genres, yearRange),
      discoverPersonalized(secondaryType, genres.slice(0, 2), yearRange),
      discoverPersonalized("movie", genres, yearRange),
      discoverPersonalized("tv", genres, yearRange),
    ]).then(([primaryResults, secondaryResults, movieResults, tvResults]) => {
      const toContent = (item: any, type: "movie" | "tv"): ContentItem => ({
        id: String(item.id),
        tmdbId: item.id,
        title: item.title ?? item.name ?? "",
        year: parseInt((item.release_date ?? item.first_air_date ?? "2024").slice(0, 4)) || 2024,
        rating: item.vote_average ?? 0,
        posterPath: item.poster_path ?? "",
        backdropPath: item.backdrop_path ?? "",
        description: item.overview ?? "",
        genres: item.genre_ids ?? [],
        type: type === "movie" ? "movie" : "series",
        mediaType: type,
      });

      const heroPool = [
        ...primaryResults.filter((i: any) => i.backdrop_path).slice(0, 4),
        ...secondaryResults.filter((i: any) => i.backdrop_path).slice(0, 2),
      ];
      if (heroPool.length >= 2) {
        setHeroItems(heroPool.slice(0, 3).map((i: any) =>
          toContent(i, primaryType === "movie" && i.title ? "movie" : "tv")
        ));
      }

      const trendingPool = [
        ...primaryResults.slice(0, 5).map((i: any) => toContent(i, primaryType)),
        ...secondaryResults.slice(0, 3).map((i: any) => toContent(i, secondaryType)),
      ];
      if (trendingPool.length >= 4) setTrendingItems(trendingPool.slice(0, 8));

      const top10Pool = [
        ...movieResults.slice(0, 5).map((i: any) => toContent(i, "movie")),
        ...tvResults.slice(0, 5).map((i: any) => toContent(i, "tv")),
      ];
      if (top10Pool.length >= 3) setTop10(top10Pool.slice(0, 8));

      const paraVoce = primaryResults.slice(0, 10).map((i: any) => toContent(i, primaryType));
      if (paraVoce.length) setPersonalizedItems(paraVoce);
    }).catch(() => {});
  }, [preferences]);

  const genreSections = useMemo(() => {
    if (!preferences?.genres?.length) return DEFAULT_GENRE_SECTIONS;
    return preferences.genres.slice(0, 8).map((genreId, i) => ({
      id: genreId,
      type: (i % 2 === 0 ? "movie" : "tv") as "movie" | "tv",
      label: `${GENRE_NAMES[genreId] ?? "Para Você"}`,
    }));
  }, [preferences]);

  const displayTrending = trendingItems;
  const displayHero = heroItems;

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
          <HeroBanner items={displayHero.length > 0 ? displayHero : heroItems} onItemPress={goToPlayer} />
        </View>

        {/* ── SEARCH BAR ─────────────────────────────────── */}
        <Pressable
          onPress={() => router.push("/(tabs)/search")}
          style={({ pressed }) => [styles.searchBar, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.searchBarInner, { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.12)" }]}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.45)" />
            <Text style={[styles.searchBarPlaceholder, { color: "rgba(255,255,255,0.35)" }]}>
              Buscar filmes, séries, atores...
            </Text>
            <View style={styles.searchBarMic}>
              <Feather name="mic" size={14} color="rgba(255,255,255,0.3)" />
            </View>
          </View>
        </Pressable>

        <View style={{ paddingTop: 0, marginTop: 0 }}>
          {/* Streaming platforms row */}
          <View style={styles.streamingRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.streamingScroll}
            >
              {HOME_STREAMING.map((p) => (
                <StreamingChip
                  key={p.id}
                  platform={p}
                  onPress={() => router.push({ pathname: "/streaming", params: { id: p.id } })}
                />
              ))}
              {/* "Ver todos" chip */}
              <Pressable
                onPress={() => router.push("/streamings-all")}
                style={[styles.seeAllChip, { borderColor: colors.border }]}
              >
                <Feather name="grid" size={14} color={colors.mutedForeground} />
                <Text style={[styles.seeAllChipText, { color: colors.mutedForeground }]}>
                  Ver todos
                </Text>
              </Pressable>
            </ScrollView>
          </View>

          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : (
            <>
              {personalizedItems.length > 0 && (
                <ContentRow
                  title="Para Você"
                  icon="star"
                  items={personalizedItems}
                  cardWidth={150}
                  cardHeight={210}
                  seeAllLabel="Ver mais"
                  onSeeAll={() =>
                    router.push({
                      pathname: "/genre-browse",
                      params: {
                        genre_id: String(preferences?.genres?.[0] ?? 0),
                        type: "movie",
                        title: "Para Você",
                      },
                    })
                  }
                  onItemPress={goToPlayer}
                />
              )}

              <ContentRow
                title={preferences?.genres?.length ? "Em Alta" : "Em Alta"}
                icon="fire"
                items={displayTrending.length > 0 ? displayTrending : trendingItems}
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
                  <TouchableOpacity style={styles.seeAllBtn} onPress={() => router.push({ pathname: "/genre-browse", params: { genre_id: "18", type: "tv", title: "Top 10 Séries" } })}>
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
                  onSeeAll={() => router.push("/(tabs)/list")}
                  onItemPress={goToPlayer}
                />
              )}

              {genreSections.map((genre) => (
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
              {activeProfile?.avatarUrl ? (
                <Image
                  source={{ uri: activeProfile.avatarUrl }}
                  style={{ width: 28, height: 28, borderRadius: 14 }}
                  contentFit="cover"
                />
              ) : (
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: "#e50914",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>
                    {(activeProfile?.name ?? user?.name ?? "N")[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
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
  streamingRow: { marginTop: 12, marginBottom: 20 },
  streamingScroll: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  streamingChip: {
    borderRadius: 12,
    overflow: "hidden",
    width: 100,
    height: 56,
  },
  streamingChipGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  streamingChipAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  streamingChipLogo: { width: 84, height: 34 },
  streamingChipText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  seeAllChip: {
    borderRadius: 12,
    borderWidth: 1,
    width: 90,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  seeAllChipText: { fontSize: 11, fontWeight: "600" },
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
  searchBar: { paddingHorizontal: 16, marginBottom: 16, marginTop: -4 },
  searchBarInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  searchBarPlaceholder: { flex: 1, fontSize: 14 },
  searchBarMic: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
