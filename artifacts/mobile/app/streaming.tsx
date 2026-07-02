import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  RefreshControl,
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
import { getPlatform } from "@/constants/streamings";
import { getLocalLogo } from "@/constants/streaming-logos";
import { api, tmdbItemToContent } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { HeroBanner } from "@/components/HeroBanner";
import { ContentRow } from "@/components/ContentRow";
import { TopTenCard } from "@/components/TopTenCard";
import { StreamingGenreRow } from "@/components/StreamingGenreRow";
import { SkeletonRow } from "@/components/SkeletonLoader";

const TAB_BAR_CLEARANCE = 40;

const PLATFORM_GENRES: Record<string, { id: number; type: "movie" | "tv"; label: string }[]> = {
  netflix: [
    { id: 28,   type: "movie", label: "Ação" },
    { id: 18,   type: "tv",    label: "Drama" },
    { id: 35,   type: "movie", label: "Comédia" },
    { id: 27,   type: "movie", label: "Terror" },
    { id: 878,  type: "movie", label: "Ficção Científica" },
    { id: 80,   type: "tv",    label: "Crime" },
    { id: 99,   type: "movie", label: "Documentários" },
  ],
  prime: [
    { id: 28,   type: "movie", label: "Ação" },
    { id: 12,   type: "movie", label: "Aventura" },
    { id: 35,   type: "tv",    label: "Comédia" },
    { id: 878,  type: "movie", label: "Ficção Científica" },
    { id: 80,   type: "tv",    label: "Crime" },
    { id: 10759,type: "tv",    label: "Ação & Aventura" },
  ],
  disney: [
    { id: 16,   type: "movie", label: "Animação" },
    { id: 28,   type: "movie", label: "Ação" },
    { id: 12,   type: "movie", label: "Aventura" },
    { id: 10751,type: "movie", label: "Família" },
    { id: 14,   type: "movie", label: "Fantasia" },
    { id: 878,  type: "movie", label: "Ficção Científica" },
  ],
  max: [
    { id: 18,   type: "tv",    label: "Drama" },
    { id: 80,   type: "tv",    label: "Crime" },
    { id: 28,   type: "movie", label: "Ação" },
    { id: 35,   type: "movie", label: "Comédia" },
    { id: 878,  type: "movie", label: "Ficção Científica" },
    { id: 27,   type: "movie", label: "Terror" },
  ],
  apple: [
    { id: 18,   type: "tv",    label: "Drama" },
    { id: 878,  type: "tv",    label: "Ficção Científica" },
    { id: 35,   type: "tv",    label: "Comédia" },
    { id: 80,   type: "tv",    label: "Crime" },
    { id: 99,   type: "tv",    label: "Documentários" },
  ],
  globoplay: [
    { id: 10766,type: "tv",    label: "Novelas" },
    { id: 18,   type: "tv",    label: "Drama" },
    { id: 35,   type: "tv",    label: "Comédia" },
    { id: 80,   type: "tv",    label: "Crime" },
    { id: 99,   type: "movie", label: "Documentários" },
  ],
  paramount: [
    { id: 28,   type: "movie", label: "Ação" },
    { id: 18,   type: "tv",    label: "Drama" },
    { id: 27,   type: "movie", label: "Terror" },
    { id: 80,   type: "tv",    label: "Crime" },
    { id: 878,  type: "movie", label: "Ficção Científica" },
  ],
  crunchyroll: [
    { id: 16,   type: "tv",    label: "Anime" },
    { id: 28,   type: "tv",    label: "Ação" },
    { id: 12,   type: "tv",    label: "Aventura" },
    { id: 10765,type: "tv",    label: "Sci-Fi & Fantasy" },
    { id: 35,   type: "tv",    label: "Comédia" },
  ],
};

function PlatformLogo({ platform }: { platform: NonNullable<ReturnType<typeof getPlatform>> }) {
  const [logoError, setLogoError] = useState(false);
  const localLogo = getLocalLogo(platform.id);
  const logoUrl = platform.logoUrl
    ? platform.logoUrl
    : platform.logoPath
    ? `https://image.tmdb.org/t/p/w300${platform.logoPath}`
    : null;

  if (localLogo) {
    return (
      <Image
        source={localLogo}
        style={styles.platformLogo}
        resizeMode="contain"
      />
    );
  }

  if (logoUrl && !logoError) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={styles.platformLogo}
        resizeMode="contain"
        onError={() => setLogoError(true)}
      />
    );
  }

  const parts = platform.name.split(" ");
  return (
    <View style={styles.textLogo}>
      <Text style={[styles.textLogoMain, { color: platform.brandColor }]}>
        {parts[0].toUpperCase()}
      </Text>
      {parts.length > 1 && (
        <Text style={[styles.textLogoSub, { color: platform.accentColor }]}>
          {parts.slice(1).join(" ").toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export default function StreamingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const platform = getPlatform(params.id ?? "");
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [heroItems, setHeroItems] = useState<ContentItem[]>([]);
  const [trendingItems, setTrendingItems] = useState<ContentItem[]>([]);
  const [top10Items, setTop10Items] = useState<ContentItem[]>([]);
  const [continueItems, setContinueItems] = useState<ContentItem[]>([]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const accent = platform?.accentColor ?? "#E50914";
  const bgColor = platform?.bgColor ?? "#141414";
  const gradient = platform?.bgGradient ?? ["#141414", "#0a0a0a", "#000000"];
  const genres = PLATFORM_GENRES[platform?.id ?? ""] ?? PLATFORM_GENRES["netflix"];

  const userId = user?.id ?? "";
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

  const loadData = useCallback(async () => {
    if (!platform?.tmdbId) {
      setLoading(false);
      return;
    }
    try {
      const [movieData, tvData] = await Promise.all([
        api.tmdb.streaming(platform.tmdbId, "movie", 1),
        api.tmdb.streaming(platform.tmdbId, "tv", 1),
      ]);

      const movies = movieData.results.map(tmdbItemToContent);
      const tv = tvData.results.map(tmdbItemToContent);
      const all = [...movies.slice(0, 10), ...tv.slice(0, 10)];

      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }

      setHeroItems(all.slice(0, 3));
      setTrendingItems(all.slice(0, 10));

      const top10 = [
        ...movies.slice(0, 5),
        ...tv.slice(0, 5),
      ].slice(0, 10);
      setTop10Items(top10);
    } catch (e) {
      console.warn("Streaming load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [platform?.tmdbId, platform?.id]);

  useEffect(() => {
    setLoading(true);
    setHeroItems([]);
    setTrendingItems([]);
    setTop10Items([]);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const goToDetail = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  };

  if (!platform) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Text style={{ color: "#666" }}>Plataforma não encontrada</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar style="light" />

      <LinearGradient
        colors={gradient as any}
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
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + (isWeb ? 0 : insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
      >
        {/* Hero Banner */}
        {heroItems.length > 0 ? (
          <HeroBanner items={heroItems} onItemPress={goToDetail} />
        ) : loading ? (
          <View style={styles.heroPlaceholder}>
            <LinearGradient
              colors={[gradient[0], gradient[1]] as [string, string]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}

        <View style={{ paddingTop: 16 }}>
          {/* Em Alta section */}
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : (
            <>
              {trendingItems.length > 0 && (
                <ContentRow
                  title="Em Alta"
                  icon="fire"
                  items={trendingItems}
                  cardWidth={150}
                  cardHeight={210}
                  seeAllLabel="Ver mais"
                  onSeeAll={() => {}}
                  onItemPress={goToDetail}
                />
              )}

              {top10Items.length > 0 && (
                <View style={styles.topTenSection}>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.accentBar, { backgroundColor: accent }]} />
                    <Text style={styles.sectionTitle}>Top 10</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.topTenScroll}
                  >
                    {top10Items.map((item, i) => (
                      <TopTenCard
                        key={item.id}
                        item={item}
                        rank={i + 1}
                        onPress={() => goToDetail(item)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}

              {continueItems.length > 0 && (
                <ContentRow
                  title="Continue Assistindo"
                  icon="play"
                  items={continueItems}
                  cardWidth={170}
                  cardHeight={100}
                  showProgress
                  onSeeAll={() => {}}
                  onItemPress={goToDetail}
                />
              )}

              {platform.tmdbId &&
                genres.map((genre) => (
                  <StreamingGenreRow
                    key={`${genre.type}-${genre.id}`}
                    providerId={platform.tmdbId!}
                    genreId={genre.id}
                    type={genre.type}
                    title={genre.label}
                    accentColor={accent}
                  />
                ))}
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Sticky header */}
      <Animated.View
        style={[styles.header, { paddingTop: topPad, top: 0 }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: bgColor, opacity: headerOpacity },
          ]}
        />
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circleBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <PlatformLogo platform={platform} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  heroPlaceholder: {
    height: 480,
    backgroundColor: "#111",
  },
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
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  platformLogo: {
    width: 140,
    height: 44,
    flexShrink: 0,
  },
  textLogo: {
    alignItems: "center",
  },
  textLogoMain: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 26,
  },
  textLogoSub: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  topTenSection: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    letterSpacing: -0.3,
  },
  topTenScroll: { paddingHorizontal: 20, gap: 4 },
});
