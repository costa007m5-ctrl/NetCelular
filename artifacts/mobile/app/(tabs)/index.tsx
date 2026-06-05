import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { NotificationBell } from "@/components/NotificationBell";
import { PromoBanner, MiniStatBanner } from "@/components/PromoBanner";
import { api, tmdbItemToContent } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCatalog } from "@/lib/catalog-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { HERO_ITEMS, TOP_10_SERIES, TRENDING } from "@/constants/content";
import { MAIN_PLATFORMS, STREAMING_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";

const TAB_BAR_CLEARANCE = 110;
const TMDB_KEY_HOME = "8f0beb08cf016ec8de49e454e09879ec";

function getTimeGreeting(): { greeting: string; icon: keyof typeof Feather.glyphMap } {
  const h = new Date().getHours();
  if (h < 5)  return { greeting: "Boa madrugada", icon: "moon" };
  if (h < 12) return { greeting: "Bom dia", icon: "sun" };
  if (h < 18) return { greeting: "Boa tarde", icon: "cloud" };
  return { greeting: "Boa noite", icon: "moon" };
}

function decadeToYearRange(decades: string[]): { gte: string; lte: string } | null {
  if (!decades?.length) return null;
  const MAP: Record<string, [number, number]> = {
    "Anos 80": [1980, 1989], "Anos 90": [1990, 1999],
    "Anos 2000": [2000, 2009], "Anos 2010": [2010, 2019],
    "Anos 2020": [2020, 2024], "2025": [2025, 2025], "2026": [2026, 2026],
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
  } catch { return []; }
}

async function fetchNowPlaying(): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY_HOME}&language=pt-BR&page=1`
    );
    const data = await res.json();
    return data.results ?? [];
  } catch { return []; }
}

async function fetchUpcoming(): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_KEY_HOME}&language=pt-BR&page=1`
    );
    const data = await res.json();
    return data.results ?? [];
  } catch { return []; }
}

async function fetchTopRated(type: "movie" | "tv"): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${type}/top_rated?api_key=${TMDB_KEY_HOME}&language=pt-BR&page=1`
    );
    const data = await res.json();
    return data.results ?? [];
  } catch { return []; }
}

const toContent = (item: any, type: "movie" | "tv"): ContentItem => ({
  id: String(item.id),
  tmdbId: item.id,
  title: item.title ?? item.name ?? "",
  year: parseInt((item.release_date ?? item.first_air_date ?? "2024").slice(0, 4)) || 2024,
  rating: item.vote_average ?? 0,
  posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
  backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : "",
  description: item.overview ?? "",
  genres: item.genre_ids ?? [],
  type: type === "movie" ? "movie" : "series",
  mediaType: type,
});

const HOME_STREAMING = MAIN_PLATFORMS.slice(0, 7);

const CATEGORY_FILTERS = [
  { id: "all",   label: "Tudo",   icon: "grid" as const },
  { id: "movie", label: "Filmes", icon: "film" as const },
  { id: "tv",    label: "Séries", icon: "tv" as const },
  { id: "anime", label: "Anime",  icon: "star" as const },
  { id: "docs",  label: "Docs",   icon: "eye" as const },
];

const DEFAULT_GENRE_SECTIONS = [
  { id: 28,    type: "movie" as const, label: "Filmes de Ação" },
  { id: 18,    type: "tv"    as const, label: "Séries Drama" },
  { id: 16,    type: "movie" as const, label: "Animação" },
  { id: 35,    type: "movie" as const, label: "Comédia" },
  { id: 27,    type: "movie" as const, label: "Terror" },
  { id: 878,   type: "movie" as const, label: "Ficção Científica" },
  { id: 10749, type: "movie" as const, label: "Romance" },
];

const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 53: "Suspense",
  10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
};

function StreamingChip({ platform, onPress }: { platform: StreamingPlatform; onPress: () => void }) {
  const [logoError, setLogoError] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const logoUrl = platform.logoPath ? `https://image.tmdb.org/t/p/w185${platform.logoPath}` : null;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.91, useNativeDriver: true, speed: 28, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 5 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.streamingChip, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={platform.bgGradient}
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
              cachePolicy="memory-disk"
            />
          ) : (
            <Text style={[styles.streamingChipText, { color: platform.brandColor }]} numberOfLines={1}>
              {platform.name.split(" ")[0]}
            </Text>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function CategoryPill({ label, icon, active, onPress }: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View
        style={[
          styles.categoryPill,
          active
            ? { backgroundColor: colors.primary, borderColor: colors.primary }
            : { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)" },
          { transform: [{ scale }] },
        ]}
      >
        <Feather name={icon} size={12} color={active ? "#fff" : colors.mutedForeground} />
        <Text style={[styles.categoryPillText, { color: active ? "#fff" : colors.mutedForeground }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <View style={styles.sectionDivider}>
      <LinearGradient
        colors={["transparent", "rgba(229,9,20,0.3)", "transparent"]}
        style={styles.sectionDividerLine}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      <View style={styles.sectionDividerLabel}>
        <Text style={styles.sectionDividerText}>{label}</Text>
      </View>
      <LinearGradient
        colors={["transparent", "rgba(229,9,20,0.3)", "transparent"]}
        style={styles.sectionDividerLine}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
    </View>
  );
}

function SectionHeader({
  title,
  icon,
  onSeeAll,
  badge,
  accentColor,
}: {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  onSeeAll?: () => void;
  badge?: string;
  accentColor?: string;
}) {
  const colors = useColors();
  const accent = accentColor ?? colors.primary;

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionAccentBar, { backgroundColor: accent }]} />
        {icon && (
          <View style={[styles.sectionIconWrap, { backgroundColor: `${accent}18` }]}>
            <Feather name={icon} size={13} color={accent} />
          </View>
        )}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        {badge && (
          <View style={[styles.sectionBadge, { backgroundColor: `${accent}22`, borderColor: `${accent}40` }]}>
            <Text style={[styles.sectionBadgeText, { color: accent }]}>{badge}</Text>
          </View>
        )}
      </View>
      {onSeeAll && (
        <TouchableOpacity
          onPress={onSeeAll}
          activeOpacity={0.7}
          style={[styles.seeAllBtn, { borderColor: colors.border }]}
        >
          <Text style={[styles.seeAllText, { color: colors.mutedForeground }]}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function SpotlightBanner({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const colors = useColors();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
      style={styles.spotlightWrap}
    >
      <Animated.View style={[styles.spotlightCard, { transform: [{ scale }] }]}>
        {!imgErr && item.backdropPath ? (
          <Image
            source={{ uri: item.backdropPath }}
            style={styles.spotlightImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1a0a14", "#08060e"]} style={styles.spotlightImage} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.88)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.spotlightContent}>
          <View style={styles.spotlightBadge}>
            <Feather name="trending-up" size={10} color="#f59e0b" />
            <Text style={styles.spotlightBadgeText}>DESTAQUE DO DIA</Text>
          </View>
          <Text style={styles.spotlightTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.spotlightMeta}>
            {item.rating > 0 && (
              <View style={styles.spotlightRating}>
                <Feather name="star" size={10} color="#f59e0b" />
                <Text style={styles.spotlightRatingText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={styles.spotlightYear}>{item.year}</Text>
            <Text style={styles.spotlightType}>{item.type === "movie" ? "Filme" : "Série"}</Text>
          </View>
          <View style={styles.spotlightPlayBtn}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={styles.spotlightPlayText}>Assistir agora</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function ScrollToTopButton({ scrollRef, visible }: { scrollRef: any; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <Animated.View style={[styles.scrollTopBtn, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      >
        <LinearGradient
          colors={["#e50914", "#b5060f"]}
          style={styles.scrollTopGradient}
        >
          <Feather name="chevron-up" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isAvailable, byType } = useCatalog();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(2);
  const [showSync, setShowSync] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [heroItems, setHeroItems] = useState<ContentItem[]>(HERO_ITEMS);
  const [trendingItems, setTrendingItems] = useState<ContentItem[]>(TRENDING);
  const [top10, setTop10] = useState<ContentItem[]>(TOP_10_SERIES);
  const [nowPlayingItems, setNowPlayingItems] = useState<ContentItem[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<ContentItem[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<ContentItem[]>([]);
  const [topRatedSeries, setTopRatedSeries] = useState<ContentItem[]>([]);

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

  const { greeting, icon: greetIcon } = useMemo(() => getTimeGreeting(), []);
  const firstName = useMemo(() => {
    const name = activeProfile?.name ?? user?.name ?? "";
    return name.split(" ")[0] ?? "";
  }, [activeProfile, user]);

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
      const heroPool = [
        ...primaryResults.filter((i: any) => i.backdrop_path).slice(0, 4),
        ...secondaryResults.filter((i: any) => i.backdrop_path).slice(0, 2),
      ];
      if (heroPool.length >= 2) {
        setHeroItems(heroPool.slice(0, 5).map((i: any) =>
          toContent(i, primaryType === "movie" && i.title ? "movie" : "tv")
        ));
      }
      const trendingPool = [
        ...primaryResults.slice(0, 5).map((i: any) => toContent(i, primaryType)),
        ...secondaryResults.slice(0, 3).map((i: any) => toContent(i, secondaryType)),
      ];
      if (trendingPool.length >= 4) setTrendingItems(trendingPool.slice(0, 10));

      const top10Pool = [
        ...movieResults.slice(0, 5).map((i: any) => toContent(i, "movie")),
        ...tvResults.slice(0, 5).map((i: any) => toContent(i, "tv")),
      ];
      if (top10Pool.length >= 3) setTop10(top10Pool.slice(0, 10));

      const paraVoce = primaryResults.slice(0, 12).map((i: any) => toContent(i, primaryType));
      if (paraVoce.length) setPersonalizedItems(paraVoce);
    }).catch(() => {});
  }, [preferences]);

  const genreSections = useMemo(() => {
    if (!preferences?.genres?.length) return DEFAULT_GENRE_SECTIONS;
    return preferences.genres.slice(0, 8).map((genreId, i) => ({
      id: genreId,
      type: (i % 2 === 0 ? "movie" : "tv") as "movie" | "tv",
      label: GENRE_NAMES[genreId] ?? "Para Você",
    }));
  }, [preferences]);

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
  const scrollRef = useRef<any>(null);

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const heroParallax = scrollY.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: [150, 0, -80],
    extrapolate: "clamp",
  });

  const loadData = useCallback(async () => {
    try {
      try {
        const data = await api.tmdb.trending();
        const all    = data.all.map(tmdbItemToContent).filter((c) => isAvailable(c.tmdbId));
        const movies = data.movies.map(tmdbItemToContent).filter((c) => isAvailable(c.tmdbId));
        const tv     = data.tv.map(tmdbItemToContent).filter((c) => isAvailable(c.tmdbId));

        if (all.length >= 4) {
          setHeroItems(all.slice(0, 5));
          setTrendingItems(all.slice(0, 10));
          if (movies.length > 0 || tv.length > 0)
            setTop10([...movies.slice(0, 5), ...tv.slice(0, 5)].slice(0, 10));
        }
      } catch {}

      const [nowPlaying, upcoming, topMovies, topSeries] = await Promise.all([
        fetchNowPlaying(),
        fetchUpcoming(),
        fetchTopRated("movie"),
        fetchTopRated("tv"),
      ]);

      setNowPlayingItems(nowPlaying.slice(0, 10).map((i: any) => toContent(i, "movie")));
      setUpcomingItems(upcoming.slice(0, 8).map((i: any) => toContent(i, "movie")));
      setTopRatedMovies(topMovies.slice(0, 10).map((i: any) => toContent(i, "movie")));
      setTopRatedSeries(topSeries.slice(0, 10).map((i: any) => toContent(i, "tv")));

      const movieIds = (byType.movie ?? []).slice(0, 20);
      const tvIds    = (byType.tv    ?? []).slice(0, 20);

      if ((movieIds.length > 0 || tvIds.length > 0) && trendingItems.length < 4) {
        const [movieResults, tvResults] = await Promise.all([
          Promise.all(movieIds.slice(0, 10).map((id) => api.tmdb.movie(id).catch(() => null))),
          Promise.all(tvIds.slice(0, 10).map((id) => api.tmdb.tv(id).catch(() => null))),
        ]);
        const validMovies = movieResults.filter(Boolean).map((i) => toContent(i, "movie"));
        const validTv     = tvResults.filter(Boolean).map((i) => toContent(i, "tv"));
        const combined    = [...validMovies.slice(0, 5), ...validTv.slice(0, 5)];
        if (combined.length > 0) {
          const heroPool = combined.filter((c) => c.backdropPath);
          setHeroItems(heroPool.length > 0 ? heroPool.slice(0, 5) : combined.slice(0, 5));
          setTrendingItems(combined.slice(0, 10));
          setTop10([...validMovies.slice(0, 5), ...validTv.slice(0, 5)].slice(0, 10));
        }
      }
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAvailable, byType]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const goToPlayer = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  }, [router]);

  const spotlightItem = useMemo(() => nowPlayingItems[0] ?? trendingItems[0] ?? null, [nowPlayingItems, trendingItems]);

  const miniStats = useMemo(() => [
    { label: "Em Alta",   value: String(trendingItems.length),   icon: "trending-up" as const, color: "#e50914" },
    { label: "Filmes",    value: String((byType.movie ?? []).length), icon: "film" as const,    color: "#3b82f6" },
    { label: "Séries",    value: String((byType.tv ?? []).length),    icon: "tv" as const,      color: "#8b5cf6" },
  ], [trendingItems, byType]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              setShowScrollTop(e.nativeEvent.contentOffset.y > 600);
            },
          }
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
        <Animated.View style={{ transform: [{ translateY: heroParallax }] }}>
          <HeroBanner
            items={heroItems.length > 0 ? heroItems : HERO_ITEMS}
            onItemPress={goToPlayer}
          />
        </Animated.View>

        <View style={styles.body}>
          {/* ── SEARCH BAR ──────────────────────────── */}
          <Pressable
            onPress={() => router.push("/(tabs)/search")}
            style={({ pressed }) => [styles.searchBar, { opacity: pressed ? 0.85 : 1 }]}
          >
            <LinearGradient
              colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.03)"]}
              style={[styles.searchBarInner, { borderColor: "rgba(255,255,255,0.1)" }]}
            >
              <View style={styles.searchIconWrap}>
                <Feather name="search" size={15} color={colors.primary} />
              </View>
              <Text style={[styles.searchBarPlaceholder, { color: "rgba(255,255,255,0.32)" }]}>
                Buscar filmes, séries, atores...
              </Text>
              <View style={[styles.searchBarMic, { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.1)" }]}>
                <Feather name="mic" size={13} color={colors.mutedForeground} />
              </View>
            </LinearGradient>
          </Pressable>

          {/* ── CATEGORY FILTER PILLS ────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
            style={styles.categoryRow}
          >
            {CATEGORY_FILTERS.map((cat) => (
              <CategoryPill
                key={cat.id}
                label={cat.label}
                icon={cat.icon}
                active={activeCategory === cat.id}
                onPress={() => setActiveCategory(cat.id)}
              />
            ))}
          </ScrollView>

          {/* ── STREAMING PLATFORMS ──────────────────── */}
          <View style={styles.streamingRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.streamingScroll}
              decelerationRate="fast"
            >
              {HOME_STREAMING.map((p) => (
                <StreamingChip
                  key={p.id}
                  platform={p}
                  onPress={() => router.push({ pathname: "/streaming", params: { id: p.id } })}
                />
              ))}
              <Pressable
                onPress={() => router.push("/streamings-all")}
                style={[styles.seeAllChip, { borderColor: colors.border }]}
              >
                <LinearGradient
                  colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0.02)"]}
                  style={styles.seeAllChipInner}
                >
                  <Feather name="grid" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.seeAllChipText, { color: colors.mutedForeground }]}>
                    Ver todos
                  </Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>

          {loading ? (
            <View style={{ marginTop: 8 }}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <>
              {/* ── MINI STATS ───────────────────────────── */}
              <MiniStatBanner stats={miniStats} />

              {/* ── PARA VOCÊ ───────────────────────────── */}
              {personalizedItems.length > 0 && (
                <ContentRow
                  title="Para Você"
                  subtitle="Baseado nas suas preferências"
                  icon="star"
                  items={personalizedItems}
                  cardWidth={148}
                  cardHeight={215}
                  showRating
                  seeAllLabel="Ver mais"
                  maxItems={8}
                  onSeeAll={() =>
                    router.push({
                      pathname: "/genre-browse",
                      params: { genre_id: String(preferences?.genres?.[0] ?? 0), type: "movie", title: "Para Você" },
                    })
                  }
                  onItemPress={goToPlayer}
                />
              )}

              {/* ── CONTINUE ASSISTINDO ─────────────────── */}
              {continueItems.length > 0 && (
                <ContentRow
                  title="Continue Assistindo"
                  subtitle="Retome de onde parou"
                  icon="play"
                  items={continueItems}
                  cardWidth={165}
                  cardHeight={96}
                  showProgress
                  seeAllLabel="Ver lista"
                  maxItems={6}
                  onSeeAll={() => router.push("/(tabs)/list")}
                  onItemPress={goToPlayer}
                  accentColor="#22c55e"
                />
              )}

              {/* ── EM ALTA ─────────────────────────────── */}
              <ContentRow
                title="Em Alta Agora"
                subtitle="Os mais assistidos da semana"
                icon="fire"
                items={trendingItems}
                cardWidth={148}
                cardHeight={215}
                showRating
                seeAllLabel="Ver mais"
                maxItems={8}
                onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Em Alta" } })}
                onItemPress={goToPlayer}
              />

              {/* ── PROMO NOVIDADES ────────────────────── */}
              <PromoBanner
                icon="zap"
                title="Novidades desta semana"
                subtitle="Novos títulos adicionados ao catálogo"
                actionLabel="Ver tudo"
                onPress={() => router.push("/(tabs)/novidades")}
                gradient={[colors.primary, colors.primaryDim]}
              />

              {/* ── TOP 10 ──────────────────────────────── */}
              <View style={styles.topTenSection}>
                <SectionHeader
                  title="Top 10"
                  icon="award"
                  badge="SEMANAL"
                  onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Top 10" } })}
                  accentColor="#f59e0b"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.topTenScroll}
                  decelerationRate="fast"
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

              {/* ── DIVIDER ─────────────────────────────── */}
              <SectionDivider label="EM CARTAZ" />

              {/* ── SPOTLIGHT BANNER ────────────────────── */}
              {spotlightItem && (
                <SpotlightBanner item={spotlightItem} onPress={() => goToPlayer(spotlightItem)} />
              )}

              {/* ── AGORA NOS CINEMAS ───────────────────── */}
              {nowPlayingItems.length > 0 && (
                <ContentRow
                  title="Agora nos Cinemas"
                  subtitle="Filmes em exibição"
                  icon="film"
                  items={nowPlayingItems}
                  cardWidth={148}
                  cardHeight={215}
                  showRating
                  seeAllLabel="Ver mais"
                  maxItems={8}
                  onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Em Cartaz" } })}
                  onItemPress={goToPlayer}
                  accentColor="#3b82f6"
                />
              )}

              {/* ── MELHOR AVALIADOS FILMES ─────────────── */}
              {topRatedMovies.length > 0 && (
                <ContentRow
                  title="Melhores Avaliados"
                  subtitle="Filmes com maior nota"
                  icon="award"
                  items={topRatedMovies}
                  cardWidth={148}
                  cardHeight={215}
                  showRating
                  seeAllLabel="Ver mais"
                  maxItems={8}
                  onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Melhores Avaliados" } })}
                  onItemPress={goToPlayer}
                  accentColor="#f59e0b"
                />
              )}

              {/* ── DIVIDER ─────────────────────────────── */}
              <SectionDivider label="SÉRIES" />

              {/* ── MELHORES SÉRIES ─────────────────────── */}
              {topRatedSeries.length > 0 && (
                <ContentRow
                  title="Séries Imperdíveis"
                  subtitle="As séries mais bem avaliadas"
                  icon="tv"
                  items={topRatedSeries}
                  cardWidth={148}
                  cardHeight={215}
                  showRating
                  seeAllLabel="Ver mais"
                  maxItems={8}
                  onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "tv", title: "Séries Imperdíveis" } })}
                  onItemPress={goToPlayer}
                  accentColor="#8b5cf6"
                />
              )}

              {/* ── PROMO EM BREVE ──────────────────────── */}
              {upcomingItems.length > 0 && (
                <PromoBanner
                  icon="clock"
                  title="Em Breve no Catálogo"
                  subtitle={`${upcomingItems.length} novos títulos chegando em breve`}
                  actionLabel="Ver prévia"
                  onPress={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Em Breve" } })}
                  gradient={["#7c3aed", "#4c1d95"]}
                  count={upcomingItems.length}
                />
              )}

              {/* ── POR GÊNERO ──────────────────────────── */}
              <SectionDivider label="POR GÊNERO" />

              {genreSections.map((genre, idx) => (
                <React.Fragment key={`${genre.type}-${genre.id}`}>
                  <GenreRow
                    genreId={genre.id}
                    type={genre.type}
                    title={genre.label}
                  />
                  {idx === 2 && (
                    <PromoBanner
                      icon="bookmark"
                      title="Sua Lista Pessoal"
                      subtitle="Salve filmes e séries para assistir depois"
                      actionLabel="Ver lista"
                      onPress={() => router.push("/(tabs)/list")}
                      gradient={["#0891b2", "#0e7490"]}
                    />
                  )}
                </React.Fragment>
              ))}
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── ANIMATED HEADER ─────────────────────────── */}
      <Animated.View
        style={[styles.header, { paddingTop: topPad, top: 0 }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.background,
              opacity: headerOpacity,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.04)",
            },
          ]}
        />
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Text style={[styles.logo, { color: colors.primary }]}>NET</Text>
            <Text style={[styles.logoWhite, { color: "#fff" }]}>PLAY</Text>
          </View>

          <View style={styles.headerActions}>
            <NotificationBell onPress={() => router.push("/(tabs)/profile")} />
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/search")}
              activeOpacity={0.75}
            >
              <Feather name="search" size={21} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/profile")}
              activeOpacity={0.75}
            >
              {activeProfile?.avatarUrl ? (
                <Image
                  source={{ uri: activeProfile.avatarUrl }}
                  style={{ width: 30, height: 30, borderRadius: 15 }}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={["#e50914", "#b5060f"]}
                  style={styles.avatarCircle}
                >
                  <Text style={styles.avatarLetter}>
                    {(activeProfile?.name ?? user?.name ?? "N")[0]?.toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ── SYNC BAR ────────────────────────────────── */}
      {showSync && (
        <View style={[styles.syncWrapper, { top: topPad + 50 }]}>
          <SyncBar progress={Math.min(syncProgress, 100)} visible={showSync} />
        </View>
      )}

      {/* ── SCROLL TO TOP ───────────────────────────── */}
      <ScrollToTopButton scrollRef={scrollRef} visible={showScrollTop} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { marginTop: -12 },

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
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  logoWhite: {
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  headerActions: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  searchBar: {
    paddingHorizontal: 16,
    marginBottom: 14,
    marginTop: 6,
  },
  searchBarInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  searchIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontWeight: "400",
  },
  searchBarMic: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  categoryRow: { marginBottom: 16 },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },

  streamingRow: { marginBottom: 22 },
  streamingScroll: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  streamingChip: {
    borderRadius: 12,
    overflow: "hidden",
    width: 104,
    height: 58,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 5 },
    }),
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
    height: 2.5,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  streamingChipLogo: { width: 88, height: 36 },
  streamingChipText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  seeAllChip: {
    borderRadius: 12,
    borderWidth: 1,
    width: 96,
    height: 58,
    overflow: "hidden",
  },
  seeAllChipInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  seeAllChipText: { fontSize: 11, fontWeight: "600" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  sectionAccentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  sectionBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  seeAllText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
  },

  topTenSection: { marginBottom: 32 },
  topTenScroll: { paddingHorizontal: 20, gap: 4 },

  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginVertical: 22,
    gap: 12,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
  },
  sectionDividerLabel: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.12)",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.25)",
  },
  sectionDividerText: {
    color: "#e50914",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },

  spotlightWrap: {
    paddingHorizontal: 20,
    marginBottom: 26,
  },
  spotlightCard: {
    height: 175,
    borderRadius: 18,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18 },
      android: { elevation: 12 },
    }),
  },
  spotlightImage: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightContent: {
    position: "absolute",
    bottom: 16,
    left: 18,
    right: 18,
    gap: 6,
  },
  spotlightBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(245,158,11,0.2)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.45)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  spotlightBadgeText: {
    color: "#f59e0b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  spotlightTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  spotlightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  spotlightRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  spotlightRatingText: {
    color: "#f59e0b",
    fontSize: 12,
    fontWeight: "700",
  },
  spotlightYear: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "500",
  },
  spotlightType: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "400",
  },
  spotlightPlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: "#e50914",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
  spotlightPlayText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  syncWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },

  scrollTopBtn: {
    position: "absolute",
    bottom: TAB_BAR_CLEARANCE + 16,
    right: 20,
    zIndex: 50,
  },
  scrollTopGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#e50914", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
});
