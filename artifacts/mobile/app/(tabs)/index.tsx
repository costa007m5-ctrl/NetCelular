import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { NotificationBell } from "@/components/NotificationBell";
import { PromoBanner, MiniStatBanner } from "@/components/PromoBanner";
import { r2Route } from "@/lib/r2-direct";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { HERO_ITEMS, TOP_10_SERIES } from "@/constants/content";
import { MAIN_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";

const TAB_BAR_CLEARANCE = 110;

function getTimeGreeting(): { greeting: string; icon: keyof typeof Feather.glyphMap } {
  const h = new Date().getHours();
  if (h < 5)  return { greeting: "Boa madrugada", icon: "moon" };
  if (h < 12) return { greeting: "Bom dia", icon: "sun" };
  if (h < 18) return { greeting: "Boa tarde", icon: "cloud" };
  return { greeting: "Boa noite", icon: "moon" };
}

const flix2ToContent = (item: any): ContentItem => ({
  id: String(item.tmdb_id || item.id),
  tmdbId: Number(item.tmdb_id) || 0,
  title: item.title ?? "",
  year: Number(item.year) || 2024,
  rating: 0,
  posterPath: item.poster ?? "",
  backdropPath: item.poster ?? "",
  description: item.synopsis ?? "",
  genres: [],
  type: item.type === "movie" ? "movie" : "series",
  mediaType: item.type === "movie" ? "movie" : "tv",
});

const HOME_STREAMING = MAIN_PLATFORMS.slice(0, 7);

const CATEGORY_FILTERS = [
  { id: "all",   label: "Tudo",   icon: "grid" as const },
  { id: "movie", label: "Filmes", icon: "film" as const },
  { id: "tv",    label: "Séries", icon: "tv" as const },
  { id: "anime", label: "Anime",  icon: "star" as const },
  { id: "docs",  label: "Docs",   icon: "eye" as const },
];


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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(2);
  const [showSync, setShowSync] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [heroItems, setHeroItems] = useState<ContentItem[]>(HERO_ITEMS);
  const [flix2Movies, setFlix2Movies] = useState<ContentItem[]>([]);
  const [flix2Series, setFlix2Series] = useState<ContentItem[]>([]);
  const [flix2Animes, setFlix2Animes] = useState<ContentItem[]>([]);
  const [top10, setTop10] = useState<ContentItem[]>(TOP_10_SERIES);
  const [flix2Totals, setFlix2Totals] = useState({ movies: 0, series: 0, animes: 0 });

  const userId = user?.id ?? "";
  const [continueItems, setContinueItems] = useState<ContentItem[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);


  useEffect(() => {
    AsyncStorage.getItem("netplay_active_profile_v2")
      .then((raw) => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
  }, [userId]);


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

  const loadFlix2Data = useCallback(async () => {
    try {
      const [moviesRes, seriesRes, animesRes] = await Promise.allSettled([
        r2Route<{ success: boolean; pagination: any; data: any[] }>("/flix2/catalog?type=movies&page=1"),
        r2Route<{ success: boolean; pagination: any; data: any[] }>("/flix2/catalog?type=series&page=1"),
        r2Route<{ success: boolean; pagination: any; data: any[] }>("/flix2/catalog?type=animes&page=1"),
      ]);

      if (moviesRes.status === "fulfilled" && moviesRes.value.success) {
        const movies = moviesRes.value.data
          .filter((i: any) => i.tmdb_id > 0 && i.poster)
          .map(flix2ToContent);
        setFlix2Movies(movies);
        const heroPool = movies.filter((m: ContentItem) => m.posterPath);
        if (heroPool.length >= 2) setHeroItems(heroPool.slice(0, 6));
        setTop10(movies.slice(0, 10));
        setFlix2Totals((t) => ({ ...t, movies: moviesRes.value.pagination?.total_items ?? movies.length }));
      }
      if (seriesRes.status === "fulfilled" && seriesRes.value.success) {
        const series = seriesRes.value.data
          .filter((i: any) => i.tmdb_id > 0)
          .map(flix2ToContent);
        setFlix2Series(series);
        setFlix2Totals((t) => ({ ...t, series: seriesRes.value.pagination?.total_items ?? series.length }));
      }
      if (animesRes.status === "fulfilled" && animesRes.value.success) {
        const animes = animesRes.value.data
          .filter((i: any) => i.tmdb_id > 0)
          .map(flix2ToContent);
        setFlix2Animes(animes);
        setFlix2Totals((t) => ({ ...t, animes: animesRes.value.pagination?.total_items ?? animes.length }));
      }
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadFlix2Data(); }, [loadFlix2Data]);

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
    loadFlix2Data();
  }, [loadFlix2Data]);

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

  const spotlightItem = useMemo(() => flix2Movies[0] ?? null, [flix2Movies]);

  const miniStats = useMemo(() => [
    { label: "Filmes",  value: flix2Totals.movies > 0 ? flix2Totals.movies.toLocaleString("pt-BR") : "–", icon: "film" as const,         color: "#e50914" },
    { label: "Séries",  value: flix2Totals.series > 0 ? flix2Totals.series.toLocaleString("pt-BR") : "–", icon: "tv" as const,           color: "#3b82f6" },
    { label: "Animes",  value: flix2Totals.animes > 0 ? flix2Totals.animes.toLocaleString("pt-BR") : "–", icon: "star" as const,         color: "#8b5cf6" },
  ], [flix2Totals]);

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

              {/* ── FILMES ──────────────────────────────── */}
              {flix2Movies.length > 0 && (
                <ContentRow
                  title="Filmes"
                  subtitle="Catálogo Flix 2.0"
                  icon="film"
                  items={flix2Movies}
                  cardWidth={148}
                  cardHeight={215}
                  seeAllLabel="Ver mais"
                  maxItems={10}
                  onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "Filmes" } })}
                  onItemPress={goToPlayer}
                />
              )}

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

              {/* ── DESTAQUE ────────────────────────────── */}
              {spotlightItem && (
                <SpotlightBanner item={spotlightItem} onPress={() => goToPlayer(spotlightItem)} />
              )}

              {/* ── SÉRIES ──────────────────────────────── */}
              {flix2Series.length > 0 && (
                <>
                  <SectionDivider label="SÉRIES" />
                  <ContentRow
                    title="Séries"
                    subtitle="Catálogo Flix 2.0"
                    icon="tv"
                    items={flix2Series}
                    cardWidth={148}
                    cardHeight={215}
                    seeAllLabel="Ver mais"
                    maxItems={10}
                    onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "tv", title: "Séries" } })}
                    onItemPress={goToPlayer}
                    accentColor="#8b5cf6"
                  />
                </>
              )}

              {/* ── ANIMES ──────────────────────────────── */}
              {flix2Animes.length > 0 && (
                <>
                  <SectionDivider label="ANIMES" />
                  <ContentRow
                    title="Animes"
                    subtitle="Catálogo Flix 2.0"
                    icon="star"
                    items={flix2Animes}
                    cardWidth={148}
                    cardHeight={215}
                    seeAllLabel="Ver mais"
                    maxItems={10}
                    onSeeAll={() => router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "tv", title: "Animes" } })}
                    onItemPress={goToPlayer}
                    accentColor="#f59e0b"
                  />
                </>
              )}

              <PromoBanner
                icon="bookmark"
                title="Sua Lista Pessoal"
                subtitle="Salve filmes e séries para assistir depois"
                actionLabel="Ver lista"
                onPress={() => router.push("/(tabs)/list")}
                gradient={["#0891b2", "#0e7490"]}
              />
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
