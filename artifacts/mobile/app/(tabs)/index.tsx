import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFollowedActors } from "@/hooks/useFollowedActors";
import { useColors } from "@/hooks/useColors";
import { getAllLocalProgress, clearLocalProgress } from "@/hooks/useWatchProgress";
import type { WatchEntry } from "@/hooks/useWatchProgress";
import { HeroBanner } from "@/components/HeroBanner";
import { TopTenCard } from "@/components/TopTenCard";
import { NotificationBell } from "@/components/NotificationBell";
import NetplayLogo from "@/components/NetplayLogo";
import { r2Route } from "@/lib/r2-direct";
import { useR2Catalog } from "@/lib/r2-catalog-hook";
import { getCached, setCached, getCacheTimestamp } from "@/lib/catalog-cache";
import { getModalHistory, addToModalHistory, clearModalHistory, removeFromModalHistory } from "@/lib/modal-search-history";
import { checkCatalogWatchAndNotify } from "@/lib/catalog-watch";
import { useAuth } from "@/lib/auth-context";
import { AdminEditOverlay } from "@/components/AdminEditOverlay";
import { useAppliedContentItem } from "@/lib/content-edits";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { MAIN_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";
import { getLocalLogo } from "@/constants/streaming-logos";
import { subscribePrefetch, forceRefreshCatalog, type PrefetchPhase } from "@/lib/flix2-prefetch";
import { getCacheItemCount } from "@/lib/catalog-cache";
import { preloadImages, clearPreloadQueue } from "@/lib/image-preloader";
import { computeRecommendations } from "@/lib/recommendations";
import { bulkGetStarRatings, setStarRating } from "@/lib/star-ratings";
import { trackOpen, trackTab, getBehaviorProfile } from "@/lib/ai-behavior-tracker";
import { geminiPersonalizeHome } from "@/lib/gemini-client";
import { api, tmdbItemToContent } from "@/lib/api";
import { getFranchise, type Franchise } from "@/constants/franchises";
import {
  CinematicBanner,
  DailyPickBanner,
  DoubleFeatureBanner,
  GlassStatsRow,
  GlassFeaturedCard,
  EditorPickBanner,
  NewEpisodeBanner,
  WeekendPickBanner,
  BingeWorthyRow,
  PremiumContinueCard,
  PanoramicRow,
  AwardWinnersRow,
  LeavingSoonRow,
  QuickPlayRow,
  TrendingHashtagRow,
  CompactRankedList,
  CountryFlagRow,
  GradientSectionHeader,
  GenreMatrixRow,
  OriginalsBanner,
  PremiumDivider,
  PremiumSkeleton,
  SkeletonHeaderLine,
  FadeInSection,
  ActorSpotlightRow,
  UpcomingRow,
  PlatformShowcaseRow,
  ScrollProgressBar,
  // ── Novos componentes premium ──────────────────────────────────────────────
  MasonryRow,
  ImmersiveHeroCard,
  MiniBannerTriple,
  CategoryShowcaseCard,
  NewThisWeekRow,
  NetplayExclusiveRow,
  DuoFeatureBanner,
  PremiumLargePosterRow,
} from "@/components/HomePremiumSections";

const TAB_BAR_CLEARANCE = 120;
const { width: W, height: H } = Dimensions.get("window");
const RED = "#e50914";
const PURPLE = "#8b5cf6";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";
const TEAL = "#0891b2";
const PINK = "#ec4899";
const ORANGE = "#f97316";
const INDIGO = "#6366f1";

// ── helpers ────────────────────────────────────────────────────────────────────
const toHttps = (url: string): string =>
  url ? url.replace(/^http:\/\//i, "https://") : url;

const flix2ToContent = (item: any): ContentItem => {
  const isMovie = item.type === "filme" || item.type === "movie";
  return {
    id: String(item.tmdb_id || item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? "",
    year: Number(item.year) || 2024,
    rating: parseFloat(item.rating ?? "0") || 0,
    posterPath: toHttps(item.poster ?? ""),
    backdropPath: toHttps(item.backdrop ?? item.poster ?? ""),
    description: item.synopsis ?? "",
    genres: [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
    exclusive: item.exclusive ?? false,
  };
};

// ── MINI COMPONENTS ────────────────────────────────────────────────────────────

// Standard poster card
function PosterCard({ item: rawItem, onPress, width = 118, height = 172, showTitle = false }: {
  item: ContentItem; onPress: () => void;
  width?: number; height?: number; showTitle?: boolean;
}) {
  const item = useAppliedContentItem(rawItem);
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pressIn  = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[{ width, marginRight: 10 }, { transform: [{ scale }] }]}>
        <View style={[styles.posterCard, { width, height }]}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill}>
              <View style={styles.posterFallback}>
                <Feather name="film" size={24} color="rgba(255,255,255,0.1)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent","rgba(0,0,0,0.8)"]} locations={[0.6,1]}
            style={StyleSheet.absoluteFill} />
          <AdminEditOverlay itemKey={item.id} title={item.title} type={item.type} />
        </View>
        {showTitle && (
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Wide landscape card
function WideCard({ item: rawItem, onPress, badge }: {
  item: ContentItem; onPress: () => void; badge?: string;
}) {
  const item = useAppliedContentItem(rawItem);
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pressIn  = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 28 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.wideCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#0d0a1a","#060408"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.9)"]} locations={[0.3,1]}
          style={StyleSheet.absoluteFill} />
        {badge && (
          <View style={styles.wideBadge}>
            <Text style={styles.wideBadgeText}>{badge}</Text>
          </View>
        )}
        <View style={styles.wideInfo}>
          <Text style={styles.wideTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.wideMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        <AdminEditOverlay itemKey={item.id} title={item.title} type={item.type} />
      </Animated.View>
    </Pressable>
  );
}

// Large featured card with gradient and rating
function FeaturedCard({ item: rawItem, onPress, accentColor = RED }: {
  item: ContentItem; onPress: () => void; accentColor?: string;
}) {
  const item = useAppliedContentItem(rawItem);
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pressIn  = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.featuredCard, { transform: [{ scale }] }]}>
        {!err && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["transparent", `${accentColor}22`, "rgba(0,0,0,0.95)"]}
          locations={[0.4, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.featuredInfo}>
          {item.rating > 0 && (
            <View style={[styles.featuredRatingBadge, { backgroundColor: `${AMBER}22`, borderColor: `${AMBER}55` }]}>
              <Feather name="star" size={9} color={AMBER} />
              <Text style={[styles.featuredRatingText, { color: AMBER }]}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <Text style={styles.featuredTitle} numberOfLines={2}>{item.title}</Text>
          <View style={[styles.featuredPlay, { backgroundColor: accentColor }]}>
            <Feather name="play" size={11} color="#fff" />
          </View>
        </View>
        <AdminEditOverlay itemKey={item.id} title={item.title} type={item.type} />
      </Animated.View>
    </Pressable>
  );
}

// Compact horizontal list item
function CompactItem({ item, rank, onPress }: {
  item: ContentItem; rank: number; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.compactItem, { transform: [{ scale }] }]}>
        <Text style={styles.compactRank}>{String(rank).padStart(2, "0")}</Text>
        <View style={styles.compactThumb}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={styles.compactInfo}>
          <Text style={styles.compactTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.compactMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
      </Animated.View>
    </Pressable>
  );
}

// Progress/continue watching card
type ContinueItem = ContentItem & {
  contentId?: string;
  positionMs?: number;
  durationMs?: number;
  episodeSeason?: number;
  episodeNum?: number;
};

function fmtRemaining(positionMs: number, durationMs: number): string {
  if (!durationMs || durationMs < 1000) return "";
  const remSec = Math.max(0, (durationMs - positionMs) / 1000);
  const remMin = Math.round(remSec / 60);
  if (remMin < 1) return "< 1 min restante";
  return `${remMin} min restante${remMin !== 1 ? "s" : ""}`;
}

function ContinueCard({
  item, onPress, onRemove,
}: {
  item: ContinueItem;
  onPress: () => void;
  onRemove?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const progress   = item.progress ?? 0;
  const remaining  = fmtRemaining(item.positionMs ?? 0, item.durationMs ?? 0);
  const isSeries   = item.type === "series" || item.mediaType === "tv";
  const epLabel    = isSeries && item.episodeSeason
    ? `T${item.episodeSeason} · E${item.episodeNum ?? 1}`
    : null;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 28 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.continueCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.85)"]} locations={[0.4,1]}
          style={StyleSheet.absoluteFill} />

        {/* remove button */}
        {onRemove && (
          <Pressable onPress={(e) => { e.stopPropagation(); onRemove(); }}
            style={styles.continueRemoveBtn} hitSlop={8}>
            <Feather name="x" size={11} color="#fff" />
          </Pressable>
        )}

        {/* episode badge */}
        {epLabel && (
          <View style={styles.continueEpBadge}>
            <Text style={styles.continueEpText}>{epLabel}</Text>
          </View>
        )}

        <View style={styles.continuePlayOverlay}>
          <View style={styles.continuePlayBtn}>
            <Feather name="play" size={18} color="#fff" />
          </View>
        </View>
        <View style={styles.continueBottom}>
          <Text style={styles.continueTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` as any, backgroundColor: RED }]} />
          </View>
          {remaining ? (
            <Text style={styles.continueRemaining}>{remaining}</Text>
          ) : (
            <Text style={styles.continueRemaining}>{Math.round(progress * 100)}% assistido</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

// Streaming platform chip
function StreamingChip({ platform, onPress }: { platform: StreamingPlatform; onPress: () => void }) {
  const [err, setErr] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  const localLogo = getLocalLogo(platform.id);
  const logoSrc = platform.logoUrl
    ? platform.logoUrl
    : platform.logoPath
    ? `https://image.tmdb.org/t/p/w185${platform.logoPath}`
    : null;

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.streamingChip, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[platform.bgGradient[0], platform.bgGradient[1]] as [string, string]}
          style={styles.streamingChipGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* subtle glow from brand color */}
          <View style={[styles.streamingGlow, { backgroundColor: platform.brandColor + "30" }]} />

          {/* logo area — takes most of the card */}
          <View style={styles.streamingLogoArea}>
            {localLogo ? (
              <Image source={localLogo} style={styles.streamingLogo} contentFit="contain" />
            ) : logoSrc && !err ? (
              <Image source={{ uri: logoSrc }} style={styles.streamingLogo} contentFit="contain"
                onError={() => setErr(true)} cachePolicy="memory-disk" />
            ) : (
              <Text style={[styles.streamingName, { color: platform.brandColor }]} numberOfLines={1} adjustsFontSizeToFit>
                {platform.name}
              </Text>
            )}
          </View>

          {/* tagline */}
          <Text style={[styles.streamingTagline, { color: platform.brandColor + "cc" }]} numberOfLines={1}>
            {platform.tagline ?? "PREMIUM"}
          </Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// Category filter pill
function CategoryPill({ label, active, onPress, color = RED }: {
  label: string; active: boolean; onPress: () => void; color?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[
        styles.categoryPill,
        active
          ? { backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.85)", borderWidth: 1.5 }
          : { backgroundColor: "transparent", borderColor: "transparent", borderWidth: 1.5 },
        { transform: [{ scale }] },
      ]}>
        <Text style={[styles.categoryPillText, { color: active ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: active ? "800" : "500" }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// Section header with accent bar, icon, badge, and "Ver mais"
function SectionHeader({ title, icon, onSeeAll, badge, accentColor = RED, subtitle }: {
  title: string; icon?: keyof typeof Feather.glyphMap; onSeeAll?: () => void;
  badge?: string; accentColor?: string; subtitle?: string;
}) {
  return (
    <View style={[styles.sectionHeader, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[`${accentColor}28`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={styles.sectionLeft}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <View>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            {(() => {
              const words = title.split(" ");
              const first = words[0];
              const rest  = words.slice(1).join(" ");
              return (
                <>
                  <Text style={[styles.sectionTitle, { color: accentColor }]}>{first}</Text>
                  {rest.length > 0 && <Text style={styles.sectionTitle}> {rest}</Text>}
                </>
              );
            })()}
          </View>
          {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
        </View>
        {badge && (
          <View style={[styles.badge, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}44` }]}>
            <Text style={[styles.badgeText, { color: accentColor }]}>{badge}</Text>
          </View>
        )}
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={styles.seeAllBtn}>
          <Text style={styles.seeAllText}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.4)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Shared scroll-position tracker updated by HomeScreen's onScroll.
// A plain object ref (not Animated.Value) so LazySection can read it without re-renders.
const _homeScrollY = { current: 0 };

// LazySection — renders children only when the user has scrolled past `threshold` pixels.
// Shows a blank placeholder until revealed. Once revealed it never unmounts (mount-once pattern).
function LazySection({
  children,
  threshold,
  minHeight = 220,
}: {
  children: React.ReactNode;
  threshold: number;
  minHeight?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (revealed) return;
    // Immediate check in case user loaded deep via back-nav
    if (_homeScrollY.current >= threshold) { setRevealed(true); return; }
    const id = setInterval(() => {
      if (_homeScrollY.current >= threshold) setRevealed(true);
    }, 150);
    return () => clearInterval(id);
  }, [revealed, threshold]);
  if (!revealed) return <View style={{ minHeight }} />;
  return <>{children}</>;
}

// Animated section wrapper — fades + slides up on mount
function AnimatedSection({ anim, children }: { anim: Animated.Value; children: React.ReactNode }) {
  // On native skip Animated.View entirely — avoids creating 100+ animated wrappers on Android
  if (Platform.OS !== "web") return <>{children}</>;
  const opacity    = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// Promo action banner
const PromoBanner = React.memo(function PromoBanner({ title, subtitle, actionLabel, onPress, gradient, icon }: {
  title: string; subtitle: string; actionLabel: string;
  onPress: () => void; gradient: string[]; icon: keyof typeof Feather.glyphMap;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={styles.promoPad}>
      <Animated.View style={[styles.promoCard, { transform: [{ scale }] }]}>
        <LinearGradient colors={gradient as any} style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={styles.promoContent}>
          <View style={styles.promoIconWrap}>
            <Feather name={icon} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.promoTitle}>{title}</Text>
            <Text style={styles.promoSub}>{subtitle}</Text>
          </View>
          <View style={styles.promoAction}>
            <Text style={styles.promoActionText}>{actionLabel}</Text>
            <Feather name="arrow-right" size={14} color="#fff" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

// Wide spotlight banner (single featured item)
function SpotlightBanner({ item, label, onPress, accentColor = RED }: {
  item: ContentItem; label: string; onPress: () => void; accentColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;
  const [err, setErr] = useState(false);
  const pressIn  = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  useEffect(() => {
    if (Platform.OS !== "web") return; // skip loop on Hermes
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={styles.spotPad}>
      <Animated.View style={[styles.spotCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.93)"]} locations={[0.3,1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.spotContent}>
          <Animated.View style={[styles.spotLabel, { backgroundColor: `${accentColor}22`,
            borderColor: `${accentColor}55`, opacity: glowOpacity }]}>
            <Text style={[styles.spotLabelText, { color: accentColor }]}>{label}</Text>
          </Animated.View>
          <Text style={styles.spotTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.spotMeta}>
            {item.rating > 0 && (
              <View style={styles.spotRating}>
                <Feather name="star" size={10} color={AMBER} />
                <Text style={styles.spotRatingText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={styles.spotYear}>{item.year}</Text>
            <Text style={styles.spotType}>{item.type === "movie" ? "Filme" : "Série"}</Text>
          </View>
          <View style={[styles.spotPlayBtn, { backgroundColor: accentColor }]}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={styles.spotPlayText}>Assistir</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// Horizontal section divider with label
function SectionDivider({ label, accentColor = RED }: { label: string; accentColor?: string }) {
  return (
    <View style={styles.divider}>
      <LinearGradient colors={["transparent", `${accentColor}44`, "transparent"]}
        style={styles.dividerLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={[styles.dividerLabel, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30` }]}>
        <Text style={[styles.dividerText, { color: accentColor }]}>{label}</Text>
      </View>
      <LinearGradient colors={["transparent", `${accentColor}44`, "transparent"]}
        style={styles.dividerLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
    </View>
  );
}

// Mini stats pill row
function StatsBanner({ stats }: { stats: { label: string; value: string; color: string; icon: keyof typeof Feather.glyphMap }[] }) {
  return (
    <View style={styles.statsBanner}>
      {stats.map((s, i) => (
        <View key={i} style={[styles.statPill, { borderColor: `${s.color}30` }]}>
          <LinearGradient colors={[`${s.color}18`, `${s.color}08`]} style={StyleSheet.absoluteFill} />
          <Feather name={s.icon} size={13} color={s.color} />
          <View>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// Generic horizontal poster row
function PosterRow({ items, onPress, cardWidth = 118, cardHeight = 172, showTitle = false }: {
  items: ContentItem[]; onPress: (item: ContentItem) => void;
  cardWidth?: number; cardHeight?: number; showTitle?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }} decelerationRate="fast">
      {items.slice(0, 4).map((item) => (
        <PosterCard key={item.id} item={item} onPress={() => onPress(item)}
          width={cardWidth} height={cardHeight} showTitle={showTitle} />
      ))}
    </ScrollView>
  );
}

// Wide landscape row
function WideRow({ items, onPress, badgeFn }: {
  items: ContentItem[]; onPress: (item: ContentItem) => void; badgeFn?: (item: ContentItem) => string | undefined;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 4).map((item) => (
        <WideCard key={item.id} item={item} onPress={() => onPress(item)}
          badge={badgeFn ? badgeFn(item) : undefined} />
      ))}
    </ScrollView>
  );
}

// Featured large cards row
function FeaturedRow({ items, onPress, accentColor = RED }: {
  items: ContentItem[]; onPress: (item: ContentItem) => void; accentColor?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 6).map((item) => (
        <FeaturedCard key={item.id} item={item} onPress={() => onPress(item)} accentColor={accentColor} />
      ))}
    </ScrollView>
  );
}

// Compact vertical list (3 items visible)
function CompactRow({ items, onPress }: { items: ContentItem[]; onPress: (item: ContentItem) => void }) {
  return (
    <View style={styles.compactList}>
      {items.slice(0, 6).map((item, i) => (
        <CompactItem key={item.id} item={item} rank={i + 1} onPress={() => onPress(item)} />
      ))}
    </View>
  );
}

// Scroll to top FAB
function ScrollTopBtn({ scrollRef, visible }: { scrollRef: any; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible]);
  return (
    <Animated.View style={[styles.scrollTopBtn, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      <TouchableOpacity activeOpacity={0.8}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
        <LinearGradient colors={[RED, "#b5060f"]} style={styles.scrollTopGrad}>
          <Feather name="chevron-up" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STATIC DATA CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const MOODS = [
  { id: "terror",   label: "Terror",     icon: "alert-triangle" as const, color: "#dc2626", genreId: 27    },
  { id: "romance",  label: "Romance",    icon: "heart"          as const, color: "#ec4899", genreId: 10749 },
  { id: "acao",     label: "Adrenalina", icon: "zap"            as const, color: "#f97316", genreId: 28    },
  { id: "comedia",  label: "Comédia",    icon: "smile"          as const, color: "#22c55e", genreId: 35    },
  { id: "drama",    label: "Drama",      icon: "film"           as const, color: "#8b5cf6", genreId: 18    },
  { id: "ficcao",   label: "Ficção",     icon: "cpu"            as const, color: "#3b82f6", genreId: 878   },
  { id: "misterio", label: "Mistério",   icon: "search"         as const, color: "#6366f1", genreId: 9648  },
  { id: "aventura", label: "Aventura",   icon: "compass"        as const, color: "#f59e0b", genreId: 12    },
];

const GENRE_CIRCLES = [
  { id: 28,    label: "Ação",      icon: "zap"       as const, color: "#f97316" },
  { id: 12,    label: "Aventura",  icon: "compass"   as const, color: "#f59e0b" },
  { id: 35,    label: "Comédia",   icon: "smile"     as const, color: "#22c55e" },
  { id: 18,    label: "Drama",     icon: "heart"     as const, color: "#ec4899" },
  { id: 27,    label: "Terror",    icon: "eye"       as const, color: "#dc2626" },
  { id: 878,   label: "Ficção",    icon: "cpu"       as const, color: "#3b82f6" },
  { id: 16,    label: "Animação",  icon: "film"      as const, color: "#f97316" },
  { id: 10749, label: "Romance",   icon: "heart"     as const, color: "#ec4899" },
  { id: 80,    label: "Crime",     icon: "shield"    as const, color: "#6366f1" },
  { id: 99,    label: "Docs",      icon: "camera"    as const, color: "#0891b2" },
];

const STUDIOS = [
  { id: "marvel", label: "Marvel",  color: "#e50914", icon: "shield"    as const },
  { id: "dc",     label: "DC Films",color: "#0078f0", icon: "zap"       as const },
  { id: "pixar",  label: "Pixar",   color: "#3b82f6", icon: "film"      as const },
  { id: "disney", label: "Disney",  color: "#4a7fc1", icon: "star"      as const },
  { id: "ghibli", label: "Ghibli",  color: "#22c55e", icon: "wind"      as const },
  { id: "a24",    label: "A24",     color: "#e2e8f0", icon: "award"     as const },
  { id: "wb",     label: "Warner",  color: "#f59e0b", icon: "tv"        as const },
  { id: "sony",   label: "Sony",    color: "#0ea5e9", icon: "camera"    as const },
];

const DECADES = [
  { id: "80s",   label: "Anos 80",   icon: "tv"         as const, color: "#f97316", year: "1980" },
  { id: "90s",   label: "Anos 90",   icon: "video"      as const, color: "#22c55e", year: "1990" },
  { id: "2000s", label: "Anos 2000", icon: "disc"       as const, color: "#3b82f6", year: "2000" },
  { id: "2010s", label: "Anos 2010", icon: "smartphone" as const, color: "#8b5cf6", year: "2010" },
  { id: "2020s", label: "Anos 2020", icon: "film"       as const, color: "#e50914", year: "2020" },
];

const HOT_TAGS = [
  "#Marvel","#Anime","#HBO","#Oscar","#Suspense","#KDrama",
  "#Ghibli","#Clássico","#Blockbuster","#Netflix","#Shounen","#Brasil",
];

// ── Dados para novos componentes premium ───────────────────────────────────────
const NEON_GENRES = [
  { id: 28,    label: "Ação",         icon: "zap"        as const, color: "#f97316" },
  { id: 27,    label: "Terror",       icon: "eye"        as const, color: "#dc2626" },
  { id: 35,    label: "Comédia",      icon: "smile"      as const, color: "#22c55e" },
  { id: 18,    label: "Drama",        icon: "heart"      as const, color: "#ec4899" },
  { id: 878,   label: "Ficção Cient.",icon: "cpu"        as const, color: "#3b82f6" },
  { id: 9648,  label: "Mistério",     icon: "search"     as const, color: "#6366f1" },
  { id: 80,    label: "Crime",        icon: "shield"     as const, color: "#a855f7" },
  { id: 12,    label: "Aventura",     icon: "compass"    as const, color: "#f59e0b" },
  { id: 10749, label: "Romance",      icon: "star"       as const, color: "#fb7185" },
  { id: 99,    label: "Documentário", icon: "camera"     as const, color: "#0891b2" },
];

const MINI_BANNERS = [
  { label: "4K Ultra HD",   sub: "Qualidade máxima",  icon: "monitor"    as const, color: "#3b82f6" },
  { label: "Série Maratona",sub: "Veja tudo hoje",    icon: "play-circle"as const, color: "#e50914" },
  { label: "Próxima Estreia",sub: "Não perca",         icon: "calendar"   as const, color: "#f97316" },
];

const PREMIUM_STATS = [
  { label: "Títulos", value: "50K+",  color: "#e50914", icon: "film"      as const },
  { label: "Países",  value: "195",   color: "#3b82f6", icon: "globe"     as const },
  { label: "4K",      value: "12K",   color: "#f59e0b", icon: "monitor"   as const },
  { label: "Séries",  value: "18K+",  color: "#22c55e", icon: "tv"        as const },
  { label: "Animes",  value: "8K+",   color: "#8b5cf6", icon: "zap"       as const },
];

const GENRE_SHOWCASE = [
  { id: 28,    label: "Ação",         color: "#f97316" },
  { id: 27,    label: "Terror",       color: "#dc2626" },
  { id: 35,    label: "Comédia",      color: "#22c55e" },
  { id: 878,   label: "Ficção",       color: "#3b82f6" },
  { id: 10751, label: "Família",      color: "#f59e0b" },
  { id: 80,    label: "Crime",        color: "#8b5cf6" },
  { id: 14,    label: "Fantasia",     color: "#6366f1" },
  { id: 10752, label: "Guerra",       color: "#64748b" },
];

const ACTOR_CATEGORIES = [
  {
    id: "hollywood",
    label: "Hollywood",
    flagCode: null as string | null,
    color: "#e50914",
    actors: [
      { name: "Tom Cruise",         initial: "TC", color: "#e50914" },
      { name: "L. DiCaprio",        initial: "LD", color: "#3b82f6" },
      { name: "Margot Robbie",      initial: "MR", color: "#ec4899" },
      { name: "T. Chalamet",        initial: "TC", color: "#8b5cf6" },
      { name: "Zendaya",            initial: "ZE", color: "#f59e0b" },
      { name: "Ryan Gosling",       initial: "RG", color: "#f97316" },
      { name: "Ana de Armas",       initial: "AA", color: "#22c55e" },
      { name: "Florence Pugh",      initial: "FP", color: "#fb923c" },
      { name: "C. Blanchett",       initial: "CB", color: "#0891b2" },
      { name: "R. Downey Jr.",      initial: "RD", color: "#e50914" },
      { name: "Scarlett Johansson", initial: "SJ", color: "#a855f7" },
      { name: "Chris Evans",        initial: "CE", color: "#3b82f6" },
    ],
  },
  {
    id: "kdrama",
    label: "K-Drama",
    flagCode: "kr" as string | null,
    color: "#ec4899",
    actors: [
      { name: "Song Joong-ki",   initial: "SJ", color: "#ec4899" },
      { name: "Park Seo-jun",    initial: "PS", color: "#8b5cf6" },
      { name: "Hyun Bin",        initial: "HB", color: "#3b82f6" },
      { name: "Lee Jong-suk",    initial: "LJ", color: "#22c55e" },
      { name: "IU",              initial: "IU", color: "#f59e0b" },
      { name: "Park Min-young",  initial: "PM", color: "#f97316" },
      { name: "Son Ye-jin",      initial: "SY", color: "#ec4899" },
      { name: "Lee Min-ho",      initial: "LM", color: "#0891b2" },
    ],
  },
  {
    id: "brasileiros",
    label: "Brasileiros",
    flagCode: "br" as string | null,
    color: "#22c55e",
    actors: [
      { name: "Wagner Moura",       initial: "WM", color: "#22c55e" },
      { name: "Alice Braga",        initial: "AB", color: "#f59e0b" },
      { name: "Rodrigo Santoro",    initial: "RS", color: "#3b82f6" },
      { name: "F. Montenegro",      initial: "FM", color: "#ec4899" },
      { name: "Lázaro Ramos",       initial: "LR", color: "#f97316" },
      { name: "Taís Araújo",        initial: "TA", color: "#8b5cf6" },
      { name: "Pedro Pascal",       initial: "PP", color: "#0891b2" },
      { name: "Seu Jorge",          initial: "SJ", color: "#22c55e" },
    ],
  },
  {
    id: "japoneses",
    label: "Japoneses",
    flagCode: "jp" as string | null,
    color: "#e50914",
    actors: [
      { name: "Ken Watanabe",    initial: "KW", color: "#e50914" },
      { name: "Hiroyuki Sanada", initial: "HS", color: "#f59e0b" },
      { name: "Rinko Kikuchi",   initial: "RK", color: "#ec4899" },
      { name: "Masaki Suda",     initial: "MS", color: "#8b5cf6" },
      { name: "Takuya Kimura",   initial: "TK", color: "#3b82f6" },
      { name: "Yū Aoi",          initial: "YA", color: "#22c55e" },
    ],
  },
  {
    id: "europeus",
    label: "Europeus",
    flagCode: null as string | null,
    color: "#8b5cf6",
    actors: [
      { name: "Timothée Chalamet", initial: "TC", color: "#8b5cf6" },
      { name: "Marion Cotillard",  initial: "MC", color: "#ec4899" },
      { name: "Javier Bardem",     initial: "JB", color: "#f97316" },
      { name: "Penélope Cruz",     initial: "PC", color: "#e50914" },
      { name: "Idris Elba",        initial: "IE", color: "#3b82f6" },
      { name: "Sophie Turner",     initial: "ST", color: "#f59e0b" },
    ],
  },
];
// Flat list kept for backward compat with any remaining references
const ACTORS = ACTOR_CATEGORIES[0].actors;

// ── Genre image cache (lazy-loaded TMDB poster/backdrop per genre) ────────────
const _genreImageCache: Record<number, { poster: string | null; backdrop: string | null }> = {};
let _genreFetchActive = 0;
const _genreFetchQueue: Array<() => void> = [];
function _drainGenreQueue() {
  while (_genreFetchActive < 3 && _genreFetchQueue.length > 0) {
    const next = _genreFetchQueue.shift()!;
    _genreFetchActive++;
    next();
  }
}
const _TMDB_GENRE_KEY = "8f0beb08cf016ec8de49e454e09879ec";

function fetchGenreImage(
  genreId: number,
  cb: (poster: string | null, backdrop: string | null) => void
) {
  const cached = _genreImageCache[genreId];
  if (cached !== undefined) { cb(cached.poster, cached.backdrop); return; }
  const doFetch = () => {
    fetch(
      `https://api.themoviedb.org/3/discover/movie?api_key=${_TMDB_GENRE_KEY}&with_genres=${genreId}&sort_by=popularity.desc&language=pt-BR&page=1`
    )
      .then((r) => r.json())
      .then((data) => {
        const item = data.results?.[0];
        const poster = item?.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null;
        const backdrop = item?.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null;
        _genreImageCache[genreId] = { poster, backdrop };
        cb(poster, backdrop);
      })
      .catch(() => { _genreImageCache[genreId] = { poster: null, backdrop: null }; cb(null, null); })
      .finally(() => { _genreFetchActive = Math.max(0, _genreFetchActive - 1); _drainGenreQueue(); });
  };
  if (_genreFetchActive < 3) { _genreFetchActive++; doFetch(); }
  else { _genreFetchQueue.push(doFetch); }
}

const COUNTRIES = [
  { id: "BR", label: "Brasil",      flagCode: "br", flag: "🇧🇷", color: "#22c55e" },
  { id: "US", label: "EUA",         flagCode: "us", flag: "🇺🇸", color: "#3b82f6" },
  { id: "KR", label: "Coreia",      flagCode: "kr", flag: "🇰🇷", color: "#ec4899" },
  { id: "JP", label: "Japão",       flagCode: "jp", flag: "🇯🇵", color: "#e50914" },
  { id: "GB", label: "Reino Unido", flagCode: "gb", flag: "🇬🇧", color: "#8b5cf6" },
  { id: "FR", label: "França",      flagCode: "fr", flag: "🇫🇷", color: "#f59e0b" },
  { id: "IT", label: "Itália",      flagCode: "it", flag: "🇮🇹", color: "#f97316" },
  { id: "ES", label: "Espanha",     flagCode: "es", flag: "🇪🇸", color: "#dc2626" },
];

const UPCOMING_MOVIES = [
  { title: "Missão Impossível 8", daysLeft: 12, accentColor: "#f97316" },
  { title: "Deadpool & Wolverine 2", daysLeft: 34, accentColor: "#e50914" },
  { title: "Avatar 3", daysLeft: 78, accentColor: "#0891b2" },
];

// ══════════════════════════════════════════════════════════════════════════════
// NEW COMPONENT TYPES
// ══════════════════════════════════════════════════════════════════════════════

// ── Mood card (atmospheric vibe card) ─────────────────────────────────────────
function MoodCard({ mood, onPress }: {
  mood: typeof MOODS[0]; onPress: () => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [backdropUrl, setBackdropUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    fetchGenreImage(mood.genreId, (_, backdrop) => {
      if (backdrop) setBackdropUrl(backdrop);
    });
  }, [mood.genreId]);

  const pi = () => Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.moodCard, { borderColor: `${mood.color}50`, transform: [{ scale: sc }] }]}>
        {!imgErr && backdropUrl ? (
          <Image source={{ uri: backdropUrl }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={[`${mood.color}40`, `${mood.color}15`, "transparent"]}
            style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.10)", "rgba(0,0,0,0.72)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        />
        <LinearGradient
          colors={[`${mood.color}55`, "transparent"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <View style={[styles.moodIconWrap, { backgroundColor: `${mood.color}35` }]}>
          <Feather name={mood.icon} size={22} color="#fff" />
        </View>
        <Text style={[styles.moodLabel, { color: "#fff", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }]}>{mood.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
function MoodRowComp({ moods, onPress }: { moods: typeof MOODS; onPress: (m: typeof MOODS[0]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {moods.map((m) => <MoodCard key={m.id} mood={m} onPress={() => onPress(m)} />)}
    </ScrollView>
  );
}

// ── Circle genre card ─────────────────────────────────────────────────────────
function CircleGenreCard({ genre, onPress }: { genre: typeof GENRE_CIRCLES[0]; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    fetchGenreImage(genre.id, (poster) => {
      if (poster) setPosterUrl(poster);
    });
  }, [genre.id]);

  const pi = () => Animated.spring(sc, { toValue: 0.87, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[{ alignItems: "center", gap: 6, transform: [{ scale: sc }] }]}>
        <View style={[styles.circleGenre, { borderColor: `${genre.color}70`, borderWidth: 2 }]}>
          {!imgErr && posterUrl ? (
            <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
          ) : (
            <LinearGradient colors={[`${genre.color}45`, `${genre.color}15`]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={["transparent", `${genre.color}cc`]}
            style={StyleSheet.absoluteFill}
            locations={[0.3, 1]}
          />
        </View>
        <Text style={[styles.circleLabel, { color: genre.color }]}>{genre.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
function CircleGenreRow({ genres, onPress }: { genres: typeof GENRE_CIRCLES; onPress: (g: typeof GENRE_CIRCLES[0]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }} decelerationRate="fast">
      {genres.map((g) => <CircleGenreCard key={g.id} genre={g} onPress={() => onPress(g)} />)}
    </ScrollView>
  );
}


// PanoramicCard and PanoramicRow are imported from HomePremiumSections

// ── Studio card ───────────────────────────────────────────────────────────────
function StudioCard({ studio, onPress }: { studio: typeof STUDIOS[0]; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.9, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,   useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.studioCard, { borderColor: `${studio.color}35`, transform: [{ scale: sc }] }]}>
        <LinearGradient colors={[`${studio.color}18`,"transparent"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.studioIconWrap, { backgroundColor: `${studio.color}20` }]}>
          <Feather name={studio.icon} size={18} color={studio.color} />
        </View>
        <Text style={[styles.studioLabel, { color: studio.color }]}>{studio.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
function StudioRowComp({ studios, onPress }: { studios: typeof STUDIOS; onPress: (s: typeof STUDIOS[0]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {studios.map((s) => <StudioCard key={s.id} studio={s} onPress={() => onPress(s)} />)}
    </ScrollView>
  );
}

// ── Decade browse card ────────────────────────────────────────────────────────
function DecadeCard({ decade, onPress }: { decade: typeof DECADES[0]; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.9, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,   useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.decadeCard, { borderColor: `${decade.color}40`, transform: [{ scale: sc }] }]}>
        <LinearGradient colors={[`${decade.color}25`,`${decade.color}08`]} style={StyleSheet.absoluteFill} />
        <View style={[styles.decadeIconWrap, { backgroundColor: `${decade.color}20` }]}>
          <Feather name={decade.icon} size={20} color={decade.color} />
        </View>
        <Text style={[styles.decadeLabel, { color: decade.color }]}>{decade.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
function DecadeRowComp({ decades, onPress }: { decades: typeof DECADES; onPress: (d: typeof DECADES[0]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {decades.map((d) => <DecadeCard key={d.id} decade={d} onPress={() => onPress(d)} />)}
    </ScrollView>
  );
}

// ── Film nation card ──────────────────────────────────────────────────────────
function FilmNationCard({ country, onPress }: { country: typeof COUNTRIES[0]; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.9, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,   useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.nationCard, { borderColor: `${country.color}40`, transform: [{ scale: sc }] }]}>
        <LinearGradient colors={[`${country.color}20`,`${country.color}08`]} style={StyleSheet.absoluteFill} />
        <Image
          source={{ uri: `https://flagcdn.com/w80/${country.flagCode}.png` }}
          style={styles.nationFlagImg}
          contentFit="cover"
        />
        <Text style={[styles.nationLabel, { color: country.color }]}>{country.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
function FilmNationRow({ countries, onPress }: { countries: typeof COUNTRIES; onPress: (c: typeof COUNTRIES[0]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {countries.map((c) => <FilmNationCard key={c.id} country={c} onPress={() => onPress(c)} />)}
    </ScrollView>
  );
}

// ── Cinematic banner (tall 270px with full backdrop) ──────────────────────────
function CinematicBannerComp({ item, onPress, label = "CINEMA" }: {
  item: ContentItem; onPress: () => void; label?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ paddingHorizontal: 16, marginBottom: 28 }}>
      <Animated.View style={[styles.cinematicCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a0010","#08060e"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.25)","rgba(0,0,0,0.97)"]}
          locations={[0.25,0.6,1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cinematicContent}>
          <View style={[styles.cinematicBadge, { backgroundColor: `${RED}22`, borderColor: `${RED}55` }]}>
            <Feather name="film" size={10} color={RED} />
            <Text style={[styles.cinematicBadgeText, { color: RED }]}>{label}</Text>
          </View>
          <Text style={styles.cinematicTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.cinematicMeta}>
            {item.rating > 0 && (
              <View style={styles.cinematicRating}>
                <Feather name="star" size={10} color={AMBER} />
                <Text style={styles.cinematicRatingText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={styles.cinematicYear}>{item.year}</Text>
          </View>
          <View style={styles.cinematicActions}>
            <View style={[styles.cinematicPlayBtn, { backgroundColor: RED }]}>
              <Feather name="play" size={13} color="#fff" />
              <Text style={styles.cinematicPlayText}>Assistir</Text>
            </View>
            <View style={styles.cinematicMoreBtn}>
              <Feather name="plus" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.cinematicMoreText}>Minha Lista</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Originals banner (NETPLAY branding) ───────────────────────────────────────
function OriginalsBannerComp({ onPress }: { onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  useEffect(() => {
    if (Platform.OS !== "web") return; // skip loop on Hermes
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const glowOp = pulse.interpolate({ inputRange: [0,1], outputRange: [0.5,1] });
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ paddingHorizontal: 16, marginBottom: 28 }}>
      <Animated.View style={[styles.originalsCard, { transform: [{ scale: sc }] }]}>
        <LinearGradient colors={["#1a0008","#8b0000",RED]}
          start={{ x:0, y:0 }} end={{ x:1, y:1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.originalsContent}>
          <Animated.View style={[styles.originalsBadge, { opacity: glowOp }]}>
            <Text style={styles.originalsBadgeText}>N</Text>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.originalsTitle}>NETPLAY Originais</Text>
            <Text style={styles.originalsSub}>Conteúdo exclusivo produzido para você</Text>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Surprise banner (random pick) ─────────────────────────────────────────────
function SurpriseBannerComp({
  item, onPick, onPlay,
}: {
  item: ContentItem | null;
  onPick: () => void;
  onPlay: () => void;
}) {
  const TMDB_IMG = "https://image.tmdb.org/t/p";
  const [spinning, setSpinning] = useState(false);
  const spin   = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(item ? 1 : 0)).current;

  // keep reveal synced when item first arrives
  useEffect(() => {
    if (item) Animated.spring(reveal, { toValue: 1, useNativeDriver: true, speed: 18 }).start();
  }, [!!item]);

  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "720deg"] });
  const revealScale = reveal.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });

  const handlePick = () => {
    if (spinning) return;
    setSpinning(true);
    reveal.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 580, useNativeDriver: true }).start(() => {
      spin.setValue(0);
      onPick();
      setSpinning(false);
      Animated.spring(reveal, { toValue: 1, useNativeDriver: true, speed: 14 }).start();
    });
  };

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 28 }}>
      <View style={styles.surpriseCard}>
        <LinearGradient
          colors={["#1a0a14", PURPLE, "#2e1065"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* ── top row ─────────────────────────────────────── */}
        <View style={styles.surpriseContent}>
          <Animated.View style={[styles.surpriseIconWrap, { transform: [{ rotate: spinDeg }] }]}>
            <Feather name="shuffle" size={26} color="#c084fc" />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.surpriseTitle}>Surpreenda-me!</Text>
            <Text style={styles.surpriseSub}>Deixa a sorte decidir o que assistir</Text>
          </View>
          <Pressable
            onPress={handlePick}
            style={[styles.surpriseBtn, { backgroundColor: spinning ? "#553d7a" : PURPLE, opacity: spinning ? 0.7 : 1 }]}
          >
            <Feather name="shuffle" size={13} color="#fff" />
            <Text style={styles.surpriseBtnText}>{spinning ? "..." : "Sortear"}</Text>
          </Pressable>
        </View>

        {/* ── revealed item ───────────────────────────────── */}
        <Animated.View style={{ opacity: reveal, transform: [{ scale: revealScale }] }}>
          {item && (
            <Pressable onPress={onPlay} style={styles.surpriseReveal}>
              {/* poster */}
              <View style={styles.surprisePosterWrap}>
                {item.posterPath ? (
                  <Image
                    source={{ uri: `${TMDB_IMG}/w92${item.posterPath}` }}
                    style={styles.surprisePoster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.surprisePoster, { backgroundColor: "#2a1030", alignItems: "center", justifyContent: "center" }]}>
                    <Feather name="film" size={26} color="#c084fc" />
                  </View>
                )}
              </View>

              {/* info */}
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={styles.surpriseRevealTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.surpriseRevealMeta}>
                  {(item.mediaType === "movie" || item.type === "movie") ? "Filme" : "Série"}
                  {item.year ? ` · ${item.year}` : ""}
                  {item.rating ? ` · ${item.rating.toFixed(1)} ★` : ""}
                </Text>
                {item.description ? (
                  <Text style={styles.surpriseRevealDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <View style={styles.surprisePlayBtn}>
                  <Feather name="play" size={11} color="#fff" />
                  <Text style={styles.surprisePlayText}>Assistir agora</Text>
                </View>
              </View>

              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" style={{ alignSelf: "center" }} />
            </Pressable>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// ── Countdown banner (upcoming release) ───────────────────────────────────────
function CountdownBannerComp({ title, daysLeft, accentColor = AMBER, onPress }: {
  title: string; daysLeft: number; accentColor?: string; onPress: () => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.countdownCard, { borderColor: `${accentColor}40`, transform: [{ scale: sc }] }]}>
        <LinearGradient colors={[`${accentColor}15`,`${accentColor}05`,"transparent"]} style={StyleSheet.absoluteFill} />
        <View style={styles.countdownContent}>
          <View style={[styles.countdownBadge, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
            <Feather name="clock" size={10} color={accentColor} />
            <Text style={[styles.countdownBadgeText, { color: accentColor }]}>EM BREVE</Text>
          </View>
          <Text style={styles.countdownTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.countdownTimer}>
            {[{v:Math.max(0,daysLeft),l:"dias"},{v:23,l:"hrs"},{v:59,l:"min"}].map(({v,l},i) => (
              <React.Fragment key={l}>
                {i > 0 && <Text style={[styles.countdownSep,{color:accentColor}]}>:</Text>}
                <View style={[styles.countdownUnit,{backgroundColor:`${accentColor}18`}]}>
                  <Text style={[styles.countdownNum,{color:accentColor}]}>{String(v).padStart(2,"0")}</Text>
                  <Text style={styles.countdownUnitLabel}>{l}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </View>
        <View style={[styles.countdownNotifyBtn,{borderColor:`${accentColor}40`}]}>
          <Feather name="bell" size={12} color={accentColor} />
          <Text style={[styles.countdownNotifyText,{color:accentColor}]}>Notificar</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Genre matrix item (needs own component to avoid hooks in map) ──────────────
function GenreMatrixItem({ genre, onPress }: { genre: typeof GENRE_CIRCLES[0]; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable style={{ flex:1 }} onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.genreMatrixItem, { borderColor:`${genre.color}35`, transform:[{scale:sc}] }]}>
        <LinearGradient colors={[`${genre.color}18`,"transparent"]} style={StyleSheet.absoluteFill} />
        <Feather name={genre.icon} size={14} color={genre.color} />
        <Text style={[styles.genreMatrixLabel,{color:"#fff"}]}>{genre.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
function GenreMatrixComp({ genres, onPress }: { genres: typeof GENRE_CIRCLES; onPress: (g: typeof GENRE_CIRCLES[0]) => void }) {
  const rows: (typeof GENRE_CIRCLES)[] = [];
  for (let i = 0; i < genres.length; i += 2) rows.push(genres.slice(i, i+2));
  return (
    <View style={{ paddingHorizontal:16, marginBottom:8, gap:8 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection:"row", gap:8 }}>
          {row.map((g) => <GenreMatrixItem key={g.id} genre={g} onPress={() => onPress(g)} />)}
        </View>
      ))}
    </View>
  );
}

// ── Hot tags row ──────────────────────────────────────────────────────────────
function HotTagsComp({ tags, onPress }: { tags: string[]; onPress: (tag: string) => void }) {
  return (
    <View style={{ paddingHorizontal:16, marginBottom:8 }}>
      <View style={styles.hotTagsWrap}>
        {tags.map((tag) => (
          <Pressable key={tag} onPress={() => onPress(tag)} style={styles.hotTag}>
            <LinearGradient colors={["rgba(229,9,20,0.12)","rgba(229,9,20,0.04)"]}
              style={StyleSheet.absoluteFill} />
            <Text style={styles.hotTagText}>{tag}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Actor circle (needs own component to avoid hooks in map) ──────────────────
const _actorPhotoCache: Record<string, string | null> = {};
const _TMDB_ACTOR_KEY = "8f0beb08cf016ec8de49e454e09879ec";
// Semaphore: max 3 concurrent actor photo fetches to avoid hammering network on mount
let _actorFetchActive = 0;
const _actorFetchQueue: Array<() => void> = [];
function _drainActorQueue() {
  while (_actorFetchActive < 3 && _actorFetchQueue.length > 0) {
    const next = _actorFetchQueue.shift()!;
    _actorFetchActive++;
    next();
  }
}

const ActorCircleItem = React.memo(function ActorCircleItem({ actor, onPress }: { actor: typeof ACTORS[0]; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState(false);

  useEffect(() => {
    const name = actor.name;
    if (_actorPhotoCache[name] !== undefined) {
      setPhotoUrl(_actorPhotoCache[name]);
      return;
    }
    let cancelled = false;
    const doFetch = () => {
      fetch(
        `https://api.themoviedb.org/3/search/person?api_key=${_TMDB_ACTOR_KEY}&query=${encodeURIComponent(name)}&language=pt-BR`
      )
        .then((r) => r.json())
        .then((data) => {
          const path: string | null = data.results?.[0]?.profile_path ?? null;
          const photo = path ? `https://image.tmdb.org/t/p/w185${path}` : null;
          _actorPhotoCache[name] = photo;
          if (!cancelled) setPhotoUrl(photo);
        })
        .catch(() => { _actorPhotoCache[name] = null; })
        .finally(() => { _actorFetchActive = Math.max(0, _actorFetchActive - 1); _drainActorQueue(); });
    };
    if (_actorFetchActive < 3) {
      _actorFetchActive++;
      doFetch();
    } else {
      _actorFetchQueue.push(doFetch);
    }
    return () => { cancelled = true; };
  }, [actor.name]);

  const pi = () => Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ alignItems:"center", gap:6, width:72, transform:[{scale:sc}] }}>
        <View style={[styles.actorCircle,{borderColor:`${actor.color}50`}]}>
          {!photoErr && photoUrl ? (
            <Image
              source={{ uri: photoUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              onError={() => setPhotoErr(true)}
            />
          ) : (
            <>
              <LinearGradient colors={[`${actor.color}40`,`${actor.color}15`]} style={StyleSheet.absoluteFill} />
              <Text style={[styles.actorInitial,{color:actor.color}]}>{actor.initial}</Text>
            </>
          )}
        </View>
        <Text style={styles.actorName} numberOfLines={2}>{actor.name}</Text>
      </Animated.View>
    </Pressable>
  );
});
function ActorCirclesRow({ actors, onPress }: { actors: typeof ACTORS; onPress: (a: typeof ACTORS[0]) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:12 }} decelerationRate="fast">
      {actors.map((a) => <ActorCircleItem key={a.name} actor={a} onPress={() => onPress(a)} />)}
    </ScrollView>
  );
}

// ── Actor category section (label + row) ──────────────────────────────────
const ACTORS_INITIAL = 8;

function ActorCategorySection({
  category,
  onActorPress,
}: {
  category: typeof ACTOR_CATEGORIES[0];
  onActorPress: (a: typeof ACTOR_CATEGORIES[0]["actors"][0]) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(ACTORS_INITIAL);
  const hasMore = category.actors.length > visibleCount;
  const visibleActors = category.actors.slice(0, visibleCount);

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Category label pill */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10, gap: 8 }}>
        <View style={{ width: 3, height: 15, borderRadius: 2, backgroundColor: category.color }} />
        {category.flagCode ? (
          <Image
            source={{ uri: `https://flagcdn.com/w80/${category.flagCode}.png` }}
            style={{ width: 22, height: 16, borderRadius: 2 }}
            contentFit="cover"
          />
        ) : (
          <Feather name="film" size={13} color={category.color} />
        )}
        <Text style={{ color: category.color, fontSize: 13, fontWeight: "700", letterSpacing: 0.2 }}>
          {category.label}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12, alignItems: "center" }} decelerationRate="fast">
        {visibleActors.map((a) => (
          <ActorCircleItem key={`${category.id}-${a.name}`} actor={a} onPress={() => onActorPress(a)} />
        ))}
        {hasMore && (
          <TouchableOpacity
            onPress={() => setVisibleCount((c) => c + ACTORS_INITIAL)}
            style={{
              width: 64, height: 64, borderRadius: 32,
              backgroundColor: "rgba(255,255,255,0.07)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
              alignItems: "center", justifyContent: "center", gap: 2,
            }}
            activeOpacity={0.75}
          >
            <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 8, fontWeight: "700" }}>
              VER MAIS
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

// ── Double feature (side by side two posters) ─────────────────────────────────
function DoubleFeatureComp({ left, right, onPressLeft, onPressRight, tagLeft = "FILME", tagRight = "SÉRIE" }: {
  left: ContentItem | null; right: ContentItem | null;
  onPressLeft: () => void; onPressRight: () => void;
  tagLeft?: string; tagRight?: string;
}) {
  const [errL, setErrL] = useState(false);
  const [errR, setErrR] = useState(false);
  if (!left || !right) return null;
  const items = [
    { item: left,  err: errL, setErr: setErrL, onPress: onPressLeft,  tag: tagLeft  },
    { item: right, err: errR, setErr: setErrR, onPress: onPressRight, tag: tagRight },
  ];
  return (
    <View style={{ paddingHorizontal:16, marginBottom:28, flexDirection:"row", gap:8 }}>
      {items.map(({ item, err, setErr, onPress, tag }, i) => (
        <Pressable key={i} style={{ flex:1 }} onPress={onPress}>
          <View style={styles.doubleItem}>
            {!err && item.posterPath
              ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
                  contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
              : <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />}
            <LinearGradient colors={["transparent","rgba(0,0,0,0.9)"]} locations={[0.55,1]}
              style={StyleSheet.absoluteFill} />
            <View style={[styles.doubleTag,{backgroundColor:`${RED}22`,borderColor:`${RED}55`}]}>
              <Text style={[styles.doubleTagText,{color:RED}]}>{tag}</Text>
            </View>
            <View style={styles.doubleInfo}>
              <Text style={styles.doubleTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.doubleMeta}>{item.year}</Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ── Award banner ──────────────────────────────────────────────────────────────
function AwardBannerComp({ item, onPress }: { item: ContentItem | null; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  if (!item) return null;
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ paddingHorizontal:16, marginBottom:28 }}>
      <Animated.View style={[styles.awardCard, { transform:[{scale:sc}] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a1200","#0a0800"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={[`${AMBER}35`,"rgba(0,0,0,0.94)"]} locations={[0,1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.awardContent}>
          <View style={styles.awardTrophies}>
            <Feather name="award" size={18} color={AMBER} />
            <View style={{ width: 6 }} />
            <Feather name="star" size={16} color={AMBER} />
          </View>
          <Text style={styles.awardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.awardSub}>Aclamado pela crítica · {item.rating.toFixed(1)} ★</Text>
          <View style={[styles.awardPlayBtn, { backgroundColor:AMBER }]}>
            <Feather name="play" size={12} color="#000" />
            <Text style={[styles.awardPlayText,{color:"#000"}]}>Assistir Premiado</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Episode preview card ───────────────────────────────────────────────────────
function EpisodePreviewCard({ item, epNum = 1, onPress }: { item: ContentItem; epNum?: number; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.episodeCard, { transform:[{scale:sc}] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#0d0a1a","#060408"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.9)"]} locations={[0.3,1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.epBadge}>
          <Text style={styles.epBadgeText}>EP {epNum}</Text>
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.episodeMeta}>T1 · Ep. {epNum}</Text>
        </View>
        <View style={styles.episodePlayBtn}>
          <Feather name="play" size={15} color="#fff" />
        </View>
      </Animated.View>
    </Pressable>
  );
}
function EpisodeRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {items.slice(0,6).map((item, i) => (
        <EpisodePreviewCard key={item.id} item={item} epNum={i+1} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

// ── Family banner ─────────────────────────────────────────────────────────────
function FamilyBannerComp({ items, onPress, onItem }: {
  items: ContentItem[]; onPress: () => void; onItem: (i: ContentItem) => void;
}) {
  return (
    <View style={{ marginBottom:28 }}>
      <Pressable onPress={onPress} style={{ paddingHorizontal:16, marginBottom:12 }}>
        <View style={[styles.familyHeader, { overflow:"hidden" }]}>
          <LinearGradient colors={["#022c22","#064e3b"]} style={StyleSheet.absoluteFill} />
          <View style={styles.familyEmoji}>
            <Feather name="users" size={26} color="#34d399" />
          </View>
          <View style={{ flex:1 }}>
            <Text style={styles.familyTitle}>Modo Família</Text>
            <Text style={styles.familySub}>Conteúdo para toda a família</Text>
          </View>
          <View style={[styles.familyBtn,{backgroundColor:GREEN}]}>
            <Text style={styles.familyBtnText}>Ver tudo</Text>
          </View>
        </View>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
        {items.slice(0,6).map((item) => (
          <PosterCard key={item.id} item={item} onPress={() => onItem(item)} width={100} height={148} />
        ))}
      </ScrollView>
    </View>
  );
}

// ── MAIN SCREEN ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all",       label: "Tudo" },
  { id: "movie",     label: "Filmes" },
  { id: "tv",        label: "Séries" },
  { id: "anime",     label: "Animes" },
  { id: "animation", label: "Animação" },
  { id: "new",       label: "Novidades" },
  { id: "top",       label: "Top 10" },
];

// ── Genre config por categoria ────────────────────────────────────────────────
type GenreConfig = { genreId: number; genreIds?: string; label: string; color: string; type: "movie" | "tv"; lang?: string };
const CATEGORY_GENRE_CONFIG: Record<string, GenreConfig[]> = {
  movie: [
    { genreId: 28,    label: "Ação",              color: "#ef4444", type: "movie" },
    { genreId: 12,    label: "Aventura",          color: "#f97316", type: "movie" },
    { genreId: 35,    label: "Comédia",           color: "#eab308", type: "movie" },
    { genreId: 18,    label: "Drama",             color: "#8b5cf6", type: "movie" },
    { genreId: 27,    label: "Terror",            color: "#7c3aed", type: "movie" },
    { genreId: 878,   label: "Ficção Científica", color: "#06b6d4", type: "movie" },
    { genreId: 10749, label: "Romance",           color: "#ec4899", type: "movie" },
    { genreId: 53,    label: "Thriller",          color: "#64748b", type: "movie" },
    { genreId: 80,    label: "Crime",             color: "#9ca3af", type: "movie" },
    { genreId: 99,    label: "Documentário",      color: "#84cc16", type: "movie" },
    { genreId: 37,    label: "Faroeste",          color: "#d97706", type: "movie" },
    { genreId: 10751, label: "Família",           color: "#22c55e", type: "movie" },
  ],
  tv: [
    { genreId: 18,    label: "Drama",             color: "#8b5cf6", type: "tv" },
    { genreId: 35,    label: "Comédia",           color: "#eab308", type: "tv" },
    { genreId: 80,    label: "Crime",             color: "#9ca3af", type: "tv" },
    { genreId: 878,   label: "Ficção Científica", color: "#06b6d4", type: "tv" },
    { genreId: 27,    label: "Terror",            color: "#7c3aed", type: "tv" },
    { genreId: 10759, label: "Ação & Aventura",   color: "#ef4444", type: "tv" },
    { genreId: 10751, label: "Família",           color: "#22c55e", type: "tv" },
    { genreId: 99,    label: "Documentário",      color: "#84cc16", type: "tv" },
    { genreId: 10764, label: "Reality",           color: "#f97316", type: "tv" },
    { genreId: 10766, label: "Novelas",           color: "#ec4899", type: "tv" },
    { genreId: 9648,  label: "Mistério",          color: "#6366f1", type: "tv" },
    { genreId: 10765, label: "Sci-Fi & Fantasy",  color: "#3b82f6", type: "tv" },
  ],
  anime: [
    { genreId: 28,    label: "Ação",              color: "#ef4444", type: "tv", lang: "ja" },
    { genreId: 12,    label: "Aventura",          color: "#f97316", type: "tv", lang: "ja" },
    { genreId: 35,    label: "Comédia",           color: "#eab308", type: "tv", lang: "ja" },
    { genreId: 18,    label: "Drama",             color: "#8b5cf6", type: "tv", lang: "ja" },
    { genreId: 10749, label: "Romance",           color: "#ec4899", type: "tv", lang: "ja" },
    { genreId: 27,    label: "Terror",            color: "#7c3aed", type: "tv", lang: "ja" },
    { genreId: 10765, label: "Fantasia",          color: "#06b6d4", type: "tv", lang: "ja" },
    { genreId: 878,   label: "Sci-Fi",            color: "#3b82f6", type: "tv", lang: "ja" },
    { genreId: 10759, label: "Ação & Aventura",   color: "#f97316", type: "tv", lang: "ja" },
    { genreId: 9648,  label: "Mistério",          color: "#6366f1", type: "tv", lang: "ja" },
    { genreId: 16,    label: "Animação",          color: "#84cc16", type: "tv", lang: "ja" },
    { genreId: 10762, label: "Kids",              color: "#22c55e", type: "tv", lang: "ja" },
  ],
  animation: [
    { genreId: 16, genreIds: "16,28",    label: "Aventuras de Ação",     color: "#ef4444", type: "movie" },
    { genreId: 16, genreIds: "16,12",    label: "Grandes Aventuras",      color: "#f97316", type: "movie" },
    { genreId: 16, genreIds: "16,35",    label: "Comédias Animadas",      color: "#eab308", type: "movie" },
    { genreId: 16, genreIds: "16,10751", label: "Para a Família",         color: "#22c55e", type: "movie" },
    { genreId: 16, genreIds: "16,14",    label: "Fantasia & Magia",       color: "#8b5cf6", type: "movie" },
    { genreId: 16, genreIds: "16,878",   label: "Sci-Fi Animado",         color: "#06b6d4", type: "movie" },
    { genreId: 16, genreIds: "16,18",    label: "Animação Dramática",     color: "#7c3aed", type: "movie" },
    { genreId: 16,                       label: "Mais Populares",         color: "#f97316", type: "movie" },
    { genreId: 16, genreIds: "16,10749", label: "Histórias de Amor",      color: "#ec4899", type: "movie" },
    { genreId: 16,                        label: "Séries Animadas",        color: "#34d399", type: "tv" as const },
  ],
  top: [],
};

const CATEGORY_ACCENT: Record<string, string> = {
  movie: RED, tv: BLUE, anime: AMBER, animation: "#f97316", top: AMBER,
};

// ── VerMaisModal ──────────────────────────────────────────────────────────────
function VerMaisModal({
  visible, title, items, accentColor = PURPLE, userId = "", onClose, onItemPress,
}: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; userId?: string;
  onClose: () => void; onItemPress: (item: ContentItem) => void;
}) {
  const slideY   = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [page,          setPage]          = useState(1);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [starRatings,   setStarRatings]   = useState<Map<string, number>>(new Map());
  const [pickerFor,     setPickerFor]     = useState<string | null>(null);
  const PAGE = 20;

  const ratingKey = (item: ContentItem) =>
    `${item.type}:${item.tmdbId ?? item.id}`;

  const q            = searchQuery.trim().toLowerCase();
  const shown        = useMemo(() => items.slice(0, page * PAGE), [items, page]);
  const filteredItems = useMemo(() =>
    q ? items.filter((i) => i.title.toLowerCase().includes(q)) : shown,
    [q, items, shown]
  );

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lq = searchQuery.trim().toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(lq)).slice(0, 6);
  }, [searchQuery, items]);

  useEffect(() => {
    if (visible) {
      setPage(1); setSearchQuery(""); setSearchFocused(false); setPickerFor(null);
      getModalHistory(title).then(setSearchHistory).catch(() => {});
      Animated.parallel([
        Animated.timing(slideY,   { toValue: 0, duration: 340, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
      if (userId && items.length > 0) {
        bulkGetStarRatings(userId, items).then(setStarRatings).catch(() => {});
      }
    } else {
      setPickerFor(null);
      Animated.parallel([
        Animated.timing(slideY,   { toValue: H, duration: 300, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleRate = useCallback((item: ContentItem, stars: number) => {
    const k = ratingKey(item);
    setStarRatings((prev) => {
      const next = new Map(prev);
      if (stars === 0) next.delete(k); else next.set(k, stars);
      return next;
    });
    setPickerFor(null);
    if (userId && item.tmdbId) {
      setStarRating(userId, item.tmdbId, item.type, stars).catch(() => {});
    }
  }, [userId]);

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  const renderItem = useCallback(({ item }: { item: ContentItem }) => {
    const k         = ratingKey(item);
    const myStars   = starRatings.get(k) ?? 0;
    const isPickerOpen = pickerFor === k;

    const starColor = (n: number) => n <= myStars
      ? (myStars >= 4 ? "#f59e0b" : myStars >= 3 ? "#a3e635" : "#f87171")
      : "rgba(255,255,255,0.25)";

    return (
      <Pressable
        onPress={() => {
          if (isPickerOpen) { setPickerFor(null); return; }
          onItemPress(item); onClose();
        }}
        style={{ width: CARD_W, marginBottom: 8 }}>
        <View style={{ width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" }}>
          {item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent","rgba(0,0,0,0.88)"]} locations={[0.5,1]}
            style={StyleSheet.absoluteFill} />

          {/* ── star badge (top-right) ── */}
          <TouchableOpacity
            onPress={() => setPickerFor(isPickerOpen ? null : k)}
            activeOpacity={0.8}
            style={{
              position:"absolute", top:6, right:6,
              flexDirection:"row", alignItems:"center", gap:2,
              paddingHorizontal: myStars > 0 ? 6 : 5,
              paddingVertical: myStars > 0 ? 3 : 5,
              borderRadius:20,
              backgroundColor: myStars > 0 ? `${starColor(myStars)}22` : "rgba(0,0,0,0.45)",
              borderWidth:1,
              borderColor: myStars > 0 ? `${starColor(myStars)}80` : "rgba(255,255,255,0.18)",
            }}>
            <Feather name="star" size={9}
              color={myStars > 0 ? starColor(myStars) : "rgba(255,255,255,0.55)"} />
            {myStars > 0 && (
              <Text style={{ color: starColor(myStars), fontSize: 9, fontWeight: "800", lineHeight:12 }}>
                {myStars}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── star picker overlay ── */}
          {isPickerOpen && (
            <View style={{
              position:"absolute", bottom:0, left:0, right:0,
              backgroundColor:"rgba(0,0,0,0.88)",
              paddingVertical:10, paddingHorizontal:4,
              alignItems:"center", gap:6,
            }}>
              <Text style={{ color:"rgba(255,255,255,0.5)", fontSize:8, fontWeight:"600",
                letterSpacing:0.5, textTransform:"uppercase" }}>Sua nota</Text>
              <View style={{ flexDirection:"row", gap:4 }}>
                {[1,2,3,4,5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => handleRate(item, n === myStars ? 0 : n)}
                    activeOpacity={0.7} style={{ padding:3 }}>
                    <Feather name={n <= myStars ? "star" : "star"} size={18}
                      color={n <= myStars ? starColor(n) : "rgba(255,255,255,0.25)"} />
                  </TouchableOpacity>
                ))}
              </View>
              {myStars > 0 && (
                <TouchableOpacity onPress={() => handleRate(item, 0)} activeOpacity={0.7}>
                  <Text style={{ color:"rgba(255,255,255,0.35)", fontSize:8 }}>remover nota</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── title + TMDB rating ── */}
          {!isPickerOpen && (
            <View style={{ position:"absolute", bottom:0, left:0, right:0, padding:7 }}>
              <Text style={{ color:"#fff", fontSize:10, fontWeight:"700", lineHeight:14 }}
                numberOfLines={2}>{item.title}</Text>
              {item.rating > 0 && (
                <View style={{ flexDirection:"row", alignItems:"center", gap:3, marginTop:2 }}>
                  <Feather name="star" size={7} color={AMBER} />
                  <Text style={{ color:AMBER, fontSize:8, fontWeight:"700" }}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  }, [onItemPress, onClose, CARD_W, CARD_H, starRatings, pickerFor, handleRate]);

  const handleEndReached = useCallback(() => {
    if (q) return;
    if (shown.length < items.length) setPage((p) => p + 1);
  }, [q, shown.length, items.length]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor:"rgba(0,0,0,0.7)", opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={{
        position:"absolute", bottom:0, left:0, right:0, height: H * 0.88,
        backgroundColor:"#0a0810", borderTopLeftRadius:18, borderTopRightRadius:18,
        overflow:"hidden", transform:[{ translateY: slideY }],
      }}>
        <LinearGradient colors={["#0a0810","#060408"]} style={StyleSheet.absoluteFill} />
        <View style={{ width:40, height:4, borderRadius:2,
          backgroundColor:`${accentColor}60`, alignSelf:"center", marginTop:10 }} />
        <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
          paddingHorizontal:18, paddingVertical:14 }}>
          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
            <View style={{ width:3, height:18, borderRadius:2, backgroundColor:accentColor }} />
            <Text style={{ color:"#fff", fontSize:17, fontWeight:"800" }}>{title}</Text>
            {q ? (
              <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:20,
                backgroundColor:`${accentColor}20`, borderWidth:1, borderColor:`${accentColor}40` }}>
                <Text style={{ color:accentColor, fontSize:11, fontWeight:"700" }}>
                  {filteredItems.length} resultado{filteredItems.length !== 1 ? "s" : ""}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}
            style={{ width:34, height:34, borderRadius:17,
              backgroundColor:"rgba(255,255,255,0.08)", alignItems:"center", justifyContent:"center" }}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection:"row", alignItems:"center", gap:8,
          marginHorizontal:16, marginBottom:10, paddingHorizontal:14, paddingVertical:10,
          borderRadius:10, backgroundColor:"rgba(255,255,255,0.07)",
          borderWidth:1, borderColor:"rgba(255,255,255,0.1)" }}>
          <Feather name="search" size={14} color={q ? accentColor : "rgba(255,255,255,0.35)"} />
          <TextInput
            value={searchQuery} onChangeText={setSearchQuery}
            placeholder="Buscar nesta lista..."
            placeholderTextColor="rgba(255,255,255,0.28)"
            style={{ flex:1, color:"#fff", fontSize:14 }}
            returnKeyType="search" autoCorrect={false}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onSubmitEditing={() => {
              const t = searchQuery.trim();
              if (t) addToModalHistory(title, t)
                .then(() => getModalHistory(title))
                .then(setSearchHistory)
                .catch(() => {});
            }}
          />
          {q ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Feather name="x-circle" size={14} color={accentColor} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Search history ─────────────────────────────────────────── */}
        {searchFocused && !q && searchHistory.length > 0 && (
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection:"row", alignItems:"center",
              justifyContent:"space-between", paddingHorizontal:16, marginBottom:6 }}>
              <Text style={{ color:"rgba(255,255,255,0.38)", fontSize:11,
                fontWeight:"700", letterSpacing:0.5, textTransform:"uppercase" }}>
                Buscas recentes
              </Text>
              <TouchableOpacity onPress={() => {
                clearModalHistory(title).then(() => setSearchHistory([])).catch(() => {});
              }} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                <Text style={{ color:`${accentColor}99`, fontSize:11, fontWeight:"600" }}>Limpar</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ paddingHorizontal:16, gap:8 }}
              style={{ flexGrow:0 }}>
              {searchHistory.map((h, i) => (
                <View key={i} style={{ flexDirection:"row", alignItems:"center",
                  borderRadius:20, overflow:"hidden",
                  backgroundColor:`${accentColor}15`,
                  borderWidth:1, borderColor:`${accentColor}35` }}>
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery(h);
                      setSearchFocused(false);
                      addToModalHistory(title, h).then(() => getModalHistory(title))
                        .then(setSearchHistory).catch(() => {});
                    }}
                    activeOpacity={0.75}
                    style={{ flexDirection:"row", alignItems:"center", gap:6,
                      paddingLeft:12, paddingRight:6, paddingVertical:7 }}>
                    <Feather name="clock" size={10} color={`${accentColor}cc`} />
                    <Text style={{ color:"rgba(255,255,255,0.82)", fontSize:12,
                      fontWeight:"600", maxWidth:140 }} numberOfLines={1}>{h}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      removeFromModalHistory(title, h).then(setSearchHistory).catch(() => {});
                    }}
                    hitSlop={{ top:8, bottom:8, left:4, right:10 }}
                    activeOpacity={0.7}
                    style={{ paddingRight:10, paddingLeft:2, paddingVertical:7 }}>
                    <Feather name="x" size={10} color={`${accentColor}99`} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Autocomplete suggestions ──────────────────────────────────── */}
        {searchFocused && searchQuery.trim().length >= 1 && suggestions.length > 0 && (
          <View style={{ marginHorizontal:16, marginBottom:8, borderRadius:12,
            backgroundColor:"rgba(255,255,255,0.06)",
            borderWidth:1, borderColor:"rgba(255,255,255,0.09)", overflow:"hidden" }}>
            {suggestions.map((s, i) => (
              <TouchableOpacity key={`sug_${s.id}_${i}`}
                onPress={() => {
                  setSearchQuery(s.title);
                  setSearchFocused(false);
                  addToModalHistory(title, s.title)
                    .then(() => getModalHistory(title))
                    .then(setSearchHistory)
                    .catch(() => {});
                }}
                activeOpacity={0.75}
                style={[{ flexDirection:"row", alignItems:"center",
                  paddingHorizontal:14, paddingVertical:11, gap:10 },
                  i > 0 && { borderTopWidth:1, borderTopColor:"rgba(255,255,255,0.06)" }]}>
                <Feather name="search" size={12} color={`${accentColor}99`} />
                <Text style={{ flex:1, color:"#fff", fontSize:13, fontWeight:"600" }}
                  numberOfLines={1}>{s.title}</Text>
                <Feather name="corner-down-left" size={11} color="rgba(255,255,255,0.25)" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {q && filteredItems.length === 0 ? (
          <View style={{ flex:1, alignItems:"center", justifyContent:"center", gap:10, paddingBottom:80 }}>
            <Feather name="search" size={32} color="rgba(255,255,255,0.12)" />
            <Text style={{ color:"rgba(255,255,255,0.28)", fontSize:14 }}>
              Nenhum resultado para "{searchQuery}"
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(i, idx) => `${i.id}_${idx}`}
            numColumns={3}
            style={{ flex: 1 }}
            columnWrapperStyle={{ gap:8, paddingHorizontal:16 }}
            contentContainerStyle={{ paddingBottom:120, paddingTop:4 }}
            showsVerticalScrollIndicator={false}
            renderItem={renderItem}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            initialNumToRender={12}
            maxToRenderPerBatch={9}
            windowSize={5}
            removeClippedSubviews={Platform.OS !== "web"}
            ListFooterComponent={
              !q && shown.length < items.length ? (
                <TouchableOpacity onPress={() => setPage((p) => p + 1)}
                  style={{ flexDirection:"row", alignItems:"center", justifyContent:"center",
                    gap:8, paddingVertical:14, marginHorizontal:16, marginTop:8, borderRadius:12,
                    backgroundColor:`${accentColor}12`, borderWidth:1, borderColor:`${accentColor}25` }}
                  activeOpacity={0.8}>
                  <Feather name="chevrons-down" size={14} color={accentColor} />
                  <Text style={{ color:accentColor, fontSize:13, fontWeight:"600" }}>
                    Carregar mais ({items.length - shown.length} restantes)
                  </Text>
                </TouchableOpacity>
              ) : null
            }
          />
        )}
      </Animated.View>
    </Modal>
  );
}

// ── Curated list of well-known franchises shown in home circles ───────────────
const KNOWN_FRANCHISE_IDS = [
  "marvel", "dc", "starwars", "harrypotter", "lotr", "batman", "spiderman",
  "xmen", "transformers", "jurassic", "matrix", "fastandfurious",
  "missionimpossible", "johnwick", "jamesbond", "indianajones",
  "gameofthrones", "strangerthings", "deadpool", "hobbit",
];
const CURATED_FRANCHISES: Franchise[] = KNOWN_FRANCHISE_IDS
  .map(id => getFranchise(id))
  .filter((f): f is Franchise => !!f);

// ── Known Franchise Banner ────────────────────────────────────────────────────
const _knownLogoCache: Record<string, string | null> = {};

const FranchiseKnownCircleItem = React.memo(function FranchiseKnownCircleItem({
  franchise, onPress,
}: { franchise: Franchise; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const cached = _knownLogoCache[franchise.id];
  const [logoUrl, setLogoUrl] = useState<string | null>(cached !== undefined ? cached : null);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    const fid = franchise.id;
    if (_knownLogoCache[fid] !== undefined) { setLogoUrl(_knownLogoCache[fid]); return; }
    let cancelled = false;
    const type: "collection" | "tv" | "movie" | null =
      (franchise as any).tmdbLogoType && (franchise as any).tmdbLogoId ? (franchise as any).tmdbLogoType
      : franchise.fetchType === "collection" && franchise.tmdbCollectionId ? "collection"
      : franchise.tmdbTvId ? "tv"
      : null;
    const tmdbId = (franchise as any).tmdbLogoId ?? franchise.tmdbCollectionId ?? franchise.tmdbTvId ?? 0;
    if (!type || !tmdbId) { _knownLogoCache[fid] = null; return; }
    api.tmdb.franchiseLogo(type as any, tmdbId)
      .then((data: any) => {
        const path = data?.logo_path ?? null;
        const url = path ? `https://image.tmdb.org/t/p/w300${path}` : null;
        _knownLogoCache[fid] = url;
        if (!cancelled) setLogoUrl(url);
      })
      .catch(() => { _knownLogoCache[fid] = null; });
    return () => { cancelled = true; };
  }, [franchise.id]);

  const pi = () => Animated.spring(sc, { toValue: 0.94, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ transform: [{ scale: sc }] }}>
        <View style={styles.franchiseBanner}>
          <LinearGradient colors={franchise.bgGradient as [string, string, string]}
            style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.7)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.franchiseBannerAccent, { backgroundColor: franchise.color }]} />
          <View style={styles.franchiseBannerLogoArea}>
            {logoUrl && !imgErr ? (
              <Image source={{ uri: logoUrl }} style={styles.franchiseBannerLogo}
                contentFit="contain" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
            ) : (
              <Text style={[styles.franchiseBannerText, { color: franchise.accentColor }]} numberOfLines={2}>
                {franchise.shortName.toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.franchiseBannerBottom}>
            <View style={[styles.franchiseBannerBadge, {
              backgroundColor: franchise.color + "40",
              borderColor: franchise.color + "70",
            }]}>
              <Text style={[styles.franchiseBannerBadgeText, { color: franchise.accentColor }]}>
                {franchise.contentCount}+ títulos
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.franchiseCircleLabel} numberOfLines={1}>
          {franchise.shortName}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

// ── Franchise circle item ─────────────────────────────────────────────────────
const _franchiseLogoCache: Record<number, string | null> = {};
let _franchiseFetchActive = 0;

const FranchiseCircleItem = React.memo(function FranchiseCircleItem({
  collection, onPress,
}: {
  collection: { id: number; name: string; poster_path: string | null; backdrop_path: string | null };
  onPress: () => void;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);

  const bgUrl = collection.backdrop_path
    ? `https://image.tmdb.org/t/p/w300${collection.backdrop_path}`
    : collection.poster_path
    ? `https://image.tmdb.org/t/p/w185${collection.poster_path}`
    : null;

  useEffect(() => {
    const id = collection.id;
    if (_franchiseLogoCache[id] !== undefined) {
      setLogoUrl(_franchiseLogoCache[id]);
      return;
    }
    let cancelled = false;
    _franchiseFetchActive++;
    api.tmdb.franchiseLogo("collection", id)
      .then((data: any) => {
        const path = data?.logo_path ?? null;
        const url = path ? `https://image.tmdb.org/t/p/w185${path}` : null;
        _franchiseLogoCache[id] = url;
        if (!cancelled) setLogoUrl(url);
      })
      .catch(() => { _franchiseLogoCache[id] = null; })
      .finally(() => { _franchiseFetchActive = Math.max(0, _franchiseFetchActive - 1); });
    return () => { cancelled = true; };
  }, [collection.id]);

  const pi = () => Animated.spring(sc, { toValue: 0.87, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  const shortName = (collection.name ?? "")
    .replace(/\s*(Collection|Coleção|Saga|Universe|Franchise)\s*/gi, "").trim();

  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ alignItems: "center", gap: 7, width: 90, transform: [{ scale: sc }] }}>
        <View style={styles.franchiseCircle}>
          {bgUrl && !imgErr ? (
            <Image source={{ uri: bgUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setImgErr(true)} />
          ) : (
            <LinearGradient colors={["#2a0a1a", "#0a060e"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.65)"]} style={StyleSheet.absoluteFill} />
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.franchiseLogoImg}
              contentFit="contain" cachePolicy="memory-disk" />
          ) : (
            <Feather name="film" size={22} color="rgba(255,255,255,0.5)" />
          )}
          <View style={styles.franchiseCircleRing} />
        </View>
        <Text style={styles.franchiseCircleLabel} numberOfLines={2}>{shortName}</Text>
      </Animated.View>
    </Pressable>
  );
});

// ── Square card (1:1 ratio) ───────────────────────────────────────────────────
function SquareCard({ item: rawItem, onPress, accentColor = RED }: {
  item: ContentItem; onPress: () => void; accentColor?: string;
}) {
  const item = useAppliedContentItem(rawItem);
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  const imgKey = useRef(`${item.backdropPath}|${item.posterPath}`);
  useEffect(() => {
    const next = `${item.backdropPath}|${item.posterPath}`;
    if (imgKey.current !== next) { imgKey.current = next; setErr(false); }
  }, [item.backdropPath, item.posterPath]);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.squareCard, { transform: [{ scale: sc }] }]}>
        {!err && (item.backdropPath || item.posterPath) ? (
          <Image source={{ uri: item.backdropPath || item.posterPath }}
            style={StyleSheet.absoluteFill} contentFit="cover"
            cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.92)"]} locations={[0.3, 1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.squareInfo}>
          {item.rating > 0 && (
            <View style={[styles.squareRating, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55` }]}>
              <Feather name="star" size={8} color={accentColor} />
              <Text style={[styles.squareRatingText, { color: accentColor }]}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <Text style={styles.squareTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.squareMeta}>{item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        <AdminEditOverlay itemKey={item.id} title={item.title} type={item.type} />
      </Animated.View>
    </Pressable>
  );
}

// ── Tall poster card (portrait 2:3.5) ────────────────────────────────────────
function TallCard({ item: rawItem, onPress }: { item: ContentItem; onPress: () => void }) {
  const item = useAppliedContentItem(rawItem);
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  const posterRef = useRef(item.posterPath);
  useEffect(() => {
    if (posterRef.current !== item.posterPath) { posterRef.current = item.posterPath; setErr(false); }
  }, [item.posterPath]);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.tallCard, { transform: [{ scale: sc }] }]}>
        {!err && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.tallInfo}>
          {item.rating > 0 && (
            <View style={styles.tallRating}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={styles.tallRatingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <Text style={styles.tallTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        <AdminEditOverlay itemKey={item.id} title={item.title} type={item.type} />
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  // ── state ──────────────────────────────────────────────────────────────────
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [heroItems, setHeroItems]         = useState<ContentItem[]>([]);
  const [movies, setMovies]               = useState<ContentItem[]>([]);
  const [series, setSeries]               = useState<ContentItem[]>([]);
  const [animes, setAnimes]               = useState<ContentItem[]>([]);
  const [top10Movies, setTop10Movies]     = useState<ContentItem[]>([]);
  const [top10Series, setTop10Series]     = useState<ContentItem[]>([]);
  const [totals, setTotals]               = useState({ movies: 0, series: 0, animes: 0 });
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);
  const [cacheTs, setCacheTs]             = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<ContentItem[]>([]);
  const [aiRowItems, setAiRowItems]           = useState<ContentItem[]>([]);
  const [aiRowLabel, setAiRowLabel]           = useState("Para Você");
  const [aiRowSubtitle, setAiRowSubtitle]     = useState("Escolhido pela IA");

  // ── below-fold extra data ──────────────────────────────────────────────────
  const [nowPlayingItems, setNowPlayingItems] = useState<ContentItem[]>([]);
  const [onTheAirItems, setOnTheAirItems] = useState<ContentItem[]>([]);
  const [animations, setAnimations] = useState<ContentItem[]>([]);
  // ── Shorts para você — personalized picks from Shorts feed ────────────────
  const [shortsForYou, setShortsForYou] = useState<ContentItem[]>([]);
  const [shortsGenreLabel, setShortsGenreLabel] = useState("Baseado no seu gosto nos Shorts");
  // ── Continuar Shorts — itens assistidos recentemente nos Shorts ──────────
  const [continueShorts, setContinueShorts] = useState<{ id: string; tmdbId: number; type: "movie" | "tv"; title: string; poster: string | null; progress: number }[]>([]);
  // ── Shorts curtidos — itens curtidos pelo usuário nos Shorts ─────────────
  const [shortsLikes, setShortsLikes] = useState<{ id: string; tmdbId: number; type: "movie" | "tv"; title: string; poster: string | null; likedAt: number }[]>([]);
  // ── Shorts de amigos — recebidos via "Shorts para Amigos" ────────────────
  const [fromFriendsShorts, setFromFriendsShorts] = useState<import("@/lib/shorts-received").ReceivedShort[]>([]);
  // ── Top Shorts da Semana — TMDB trending, cached per ISO week ────────────
  const [topShortsWeek, setTopShortsWeek] = useState<ContentItem[]>([]);
  // ── Dos seus atores — content from followed actors ─────────────────────
  const [actorCarouselItems, setActorCarouselItems] = useState<ContentItem[]>([]);
  const [actorCarouselLabel, setActorCarouselLabel] = useState("Dos seus atores");

  // ── genre carousels per category ──────────────────────────────────────────
  const [genreRows, setGenreRows] = useState<Record<string, ContentItem[]>>({});
  const genreRowsLoadedRef = useRef<Set<string>>(new Set());

  // ── modal "ver mais" ───────────────────────────────────────────────────────
  const [verMaisModal, setVerMaisModal] = useState<{
    visible: boolean; title: string; items: ContentItem[]; accentColor: string;
  }>({ visible: false, title: "", items: [], accentColor: PURPLE });
  const openModal = useCallback((title: string, items: ContentItem[], accentColor = PURPLE) => {
    setVerMaisModal({ visible: true, title, items, accentColor });
  }, []);
  const closeModal = useCallback(() => {
    setVerMaisModal((p) => ({ ...p, visible: false }));
  }, []);
  const [timeAgoStr, setTimeAgoStr]       = useState<string | null>(null);
  const [prefetchPhase, setPrefetchPhase] = useState<PrefetchPhase>("idle");
  // Below-fold sections render after interactions complete (avoids mounting all 56 sections at once on Android)
  const [belowFoldReady, setBelowFoldReady] = useState(Platform.OS === "web");

  // ── watchList — derived from continueItems for progress stats ────────────
  const watchList = continueItems;

  // ── followed actors ───────────────────────────────────────────────────────
  const { followedActors } = useFollowedActors();

  // ── R2 / Drive catalog ────────────────────────────────────────────────────
  const { r2Movies, r2Series, r2All } = useR2Catalog();

  // Mix R2 items into hero banner (max 2 slots at front)
  const mergedHeroItems = useMemo(() => {
    if (!r2All.length) return heroItems;
    const r2WithMedia = r2All.filter((i) => i.backdropPath || i.posterPath).slice(0, 2);
    const combined = [...r2WithMedia, ...heroItems];
    const seen = new Set<string>();
    return combined.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 8);
  }, [heroItems, r2All]);

  // ── Banner items per active category ──────────────────────────────────────
  const activeBannerItems = useMemo(() => {
    const withMedia = (arr: ContentItem[]) =>
      arr.filter((i) => i.backdropPath || i.posterPath);
    const dedupe = (arr: ContentItem[]) => {
      const seen = new Set<string>();
      return arr.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
    };
    switch (activeCategory) {
      case "movie": {
        const r2 = r2Movies.filter((i) => i.backdropPath || i.posterPath).slice(0, 2);
        return dedupe([...r2, ...withMedia(movies)]).slice(0, 8);
      }
      case "tv": {
        const r2 = r2Series.filter((i) => i.backdropPath || i.posterPath).slice(0, 2);
        return dedupe([...r2, ...withMedia(series)]).slice(0, 8);
      }
      case "anime":
        return dedupe(withMedia(animes)).slice(0, 8);
      case "animation":
        return dedupe(withMedia(animations.length >= 4 ? animations : withMedia(movies).slice(0, 8))).slice(0, 8);
      case "top": {
        const mixed: ContentItem[] = [];
        const tm = [...top10Movies];
        const ts = [...top10Series];
        while (mixed.length < 8 && (tm.length || ts.length)) {
          if (tm.length) mixed.push(tm.shift()!);
          if (ts.length) mixed.push(ts.shift()!);
        }
        return dedupe(mixed).slice(0, 8);
      }
      case "new":
        return dedupe([...withMedia(nowPlayingItems), ...withMedia(onTheAirItems)]).slice(0, 8);
      default:
        return mergedHeroItems;
    }
  }, [activeCategory, mergedHeroItems, movies, series, animes, animations, top10Movies, top10Series,
      nowPlayingItems, onTheAirItems, r2Movies, r2Series]);

  // ── section entrance animations ────────────────────────────────────────────
  const SECTION_COUNT = 12;
  // On native, skip entrance animations entirely — set all to 1 immediately.
  // Stagger of 49 animations at 90ms each takes 4.4s and causes jank on mobile.
  const sectionAnims = useRef(
    Array.from({ length: SECTION_COUNT }, () => new Animated.Value(Platform.OS === "web" ? 0 : 1))
  ).current;

  // pulse anim for "NOVO" badges
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── refs ──────────────────────────────────────────────────────────────────
  const scrollY   = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  // ── derived scroll animations ─────────────────────────────────────────────
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100], outputRange: [0, 1], extrapolate: "clamp",
  });
  const heroParallax = scrollY.interpolate({
    inputRange: [-300, 0, 300], outputRange: [150, 0, -80], extrapolate: "clamp",
  });

  // ── cache timestamp helper ────────────────────────────────────────────────
  const buildTimeAgo = useCallback((ts: number): string => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60)   return "Atualizado agora";
    if (diff < 3600) return `Atualizado há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Atualizado há ${Math.floor(diff / 3600)} h`;
    return `Atualizado há ${Math.floor(diff / 86400)} d`;
  }, []);

  // refresh display string every 60s
  useEffect(() => {
    if (!cacheTs) return;
    setTimeAgoStr(buildTimeAgo(cacheTs));
    const id = setInterval(() => setTimeAgoStr(buildTimeAgo(cacheTs)), 60_000);
    return () => clearInterval(id);
  }, [cacheTs, buildTimeAgo]);

  // ── pulse animation (web only — loop animations cause Hermes jank) ──────────
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900,  useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900,  useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── stagger entrance animations after load ────────────────────────────────
  const startEntranceAnims = useCallback(() => {
    // Skip stagger on native — values are pre-set to 1, no animation needed.
    if (Platform.OS !== "web") return;
    Animated.stagger(
      60,
      sectionAnims.map((anim) =>
        Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true })
      )
    ).start();
  }, []);

  // ── profile ───────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("netplay_active_profile_v2")
      .then((raw) => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
  }, [user?.id]);

  // ── below-fold extra data (fetched lazily after below-fold mounts) ─────────
  useEffect(() => {
    if (!belowFoldReady) return;
    api.tmdb.nowPlaying()
      .then((items: any[]) => { setNowPlayingItems((items ?? []).slice(0, 10).map(tmdbItemToContent)); })
      .catch(() => {});
    api.tmdb.onTheAir()
      .then((items: any[]) => { setOnTheAirItems((items ?? []).slice(0, 10).map(tmdbItemToContent)); })
      .catch(() => {});
    api.tmdb.discover("movie", 16)
      .then((r: any) => { setAnimations(((r.results ?? []) as any[]).slice(0, 20).map(tmdbItemToContent)); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [belowFoldReady]);

  // ── Shorts para você — load personalized picks when screen gains focus ──────
  // Re-runs every time the user comes back from the Shorts tab (preferences may
  // have been updated). Only shows if the user has built a genre history.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const load = async () => {
        try {
          // Load "Continuar Shorts" watch history (runs independently of genre prefs)
          const { loadShortsHistory } = await import("@/lib/shorts-history");
          const history = await loadShortsHistory();
          if (!cancelled && history.length > 0) {
            setContinueShorts(history.slice(0, 10));
          }
        } catch {}

        try {
          // Load liked Shorts for "Curtidos por Você" ranking
          const { loadShortsLikes } = await import("@/lib/shorts-likes");
          const likes = await loadShortsLikes();
          if (!cancelled && likes.length > 0) {
            setShortsLikes(likes.slice(0, 10));
          }
        } catch {}

        try {
          // Load received Shorts from friends for "De Amigos" section
          const { getAllReceivedShorts } = await import("@/lib/shorts-received");
          const received = await getAllReceivedShorts();
          if (!cancelled && received.length > 0) {
            setFromFriendsShorts(received.slice(0, 10));
          }
        } catch {}

        try {
          // Load Top Shorts da Semana — TMDB trending, week-cached
          const { fetchTopShortsWeek } = await import("@/lib/shorts-top-week");
          const top = await fetchTopShortsWeek();
          if (!cancelled && top.length > 0) setTopShortsWeek(top);
        } catch {}

        try {
          const raw = await AsyncStorage.getItem("netplay_shorts_genre_prefs_v1");
          const prefs: Record<number, number> = raw ? JSON.parse(raw) : {};
          const sorted = Object.entries(prefs).sort(([, a], [, b]) => b - a);
          const topGenres = sorted.slice(0, 5).map(([id]) => Number(id));
          if (!topGenres.length) return; // no prefs yet — hide section

          // Build the subtitle using PT-BR genre names from smart-preferences
          const { GENRE_NAMES } = await import("@/lib/smart-preferences");
          const GENRE_SHORT_INLINE: Record<number, string> = {
            878: "Sci-Fi", 10749: "Romance", 10751: "Família",
            10752: "Guerra", 10759: "Ação/Av.", 10765: "Sci-Fi/Fan.", 10768: "Guerra/Pol.",
          };
          const topNames = sorted.slice(0, 2).map(([id]) => {
            const n = Number(id);
            return GENRE_SHORT_INLINE[n] ?? GENRE_NAMES[n] ?? String(n);
          });
          if (!cancelled) {
            setShortsGenreLabel(
              topNames.length > 0
                ? `Baseado em ${topNames.join(", ")}`
                : "Baseado no seu gosto nos Shorts"
            );
          }

          const { getApiBase } = await import("@/lib/api");
          const base = getApiBase();
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(
            `${base}/shorts/feed?limit=8&preferGenres=${topGenres.join(",")}`,
            { signal: ctrl.signal }
          );
          clearTimeout(t);
          if (!res.ok || cancelled) return;
          const data = await res.json() as any;
          const items: ContentItem[] = (data.items ?? []).slice(0, 8).map((it: any) => ({
            id: it.id ?? String(it.tmdbId),
            tmdbId: Number(it.tmdbId) || 0,
            title: it.title ?? "",
            year: it.year ?? 2024,
            rating: it.rating ?? 0,
            posterPath: it.poster ?? "",
            backdropPath: it.backdrop ?? it.poster ?? "",
            description: it.overview ?? "",
            genres: [],
            type: it.type === "movie" ? ("movie" as const) : ("series" as const),
            mediaType: it.type === "movie" ? "movie" : "tv",
            exclusive: false,
          }));
          if (!cancelled) setShortsForYou(items);
        } catch { /* silent — section simply stays hidden */ }
      };
      load();
      return () => { cancelled = true; };
    }, [])
  );

  // ── fetch TMDB filmography for followed actors → actor carousel ──────────
  useEffect(() => {
    if (!followedActors.length) { setActorCarouselItems([]); return; }
    let cancelled = false;
    const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
    (async () => {
      try {
        const allItems: ContentItem[] = [];
        for (const actor of followedActors.slice(0, 4)) {
          const r = await fetch(
            `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(actor.name)}&language=pt-BR`
          );
          if (!r.ok || cancelled) continue;
          const d = await r.json() as any;
          const personId: number | undefined = d.results?.[0]?.id;
          if (!personId) continue;
          const cr = await fetch(
            `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${TMDB_KEY}&language=pt-BR`
          );
          if (!cr.ok || cancelled) continue;
          const cd = await cr.json() as any;
          const credits: any[] = [...(cd.cast ?? [])];
          const top = credits
            .filter((c: any) => c.poster_path && (c.vote_average ?? 0) >= 6 && (c.vote_count ?? 0) > 100)
            .sort((a: any, b: any) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
            .slice(0, 4);
          for (const c of top) {
            const isMovie = c.media_type === "movie";
            allItems.push({
              id: `actor-${personId}-${c.id}`,
              tmdbId: c.id,
              title: c.title ?? c.name ?? "",
              year: parseInt((isMovie ? c.release_date : c.first_air_date)?.split("-")[0] ?? "2024"),
              rating: c.vote_average ?? 0,
              posterPath: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : "",
              backdropPath: c.backdrop_path ? `https://image.tmdb.org/t/p/w780${c.backdrop_path}` : "",
              description: c.overview ?? "",
              genres: [],
              type: isMovie ? "movie" : "series",
              mediaType: isMovie ? "movie" : "tv",
              exclusive: false,
            });
          }
        }
        if (!cancelled && allItems.length > 0) {
          const seen = new Set<number>();
          const deduped = allItems.filter((i) => {
            if (seen.has(i.tmdbId)) return false;
            seen.add(i.tmdbId);
            return true;
          });
          setActorCarouselItems(deduped.slice(0, 12));
          if (followedActors.length === 1) {
            setActorCarouselLabel(`De ${followedActors[0].name}`);
          } else {
            setActorCarouselLabel("Dos seus atores");
          }
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [followedActors]);

  // ── fetch genre rows when category changes ────────────────────────────────
  useEffect(() => {
    const cat = activeCategory;
    if (cat === "all" || cat === "new" || cat === "top") return;
    const genres = CATEGORY_GENRE_CONFIG[cat] ?? [];
    genres.forEach(async (g) => {
      const key = `${cat}_${g.genreId}_${g.genreIds ?? ""}`;
      if (genreRowsLoadedRef.current.has(key)) return;
      genreRowsLoadedRef.current.add(key);
      try {
        const result: any = g.lang
          ? await api.tmdb.discoverByLang(g.type, g.lang, g.genreId)
          : await api.tmdb.discover(g.type, g.genreId, 1, "popularity.desc", g.genreIds);
        const items = ((result.results ?? []) as any[]).slice(0, 20).map(tmdbItemToContent);
        setGenreRows((prev) => ({ ...prev, [key]: items }));
      } catch { /* silent */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  // ── continue watching — merge local AsyncStorage + Supabase cloud ─────────
  const loadContinueItems = useCallback(async () => {
    // Always load local immediately (fast, no auth needed)
    const localEntries = await getAllLocalProgress();

    // Build a map keyed by contentId for dedup/merge
    const map = new Map<string, ContinueItem>();

    for (const e of localEntries) {
      map.set(e.contentId, {
        id: e.contentId,
        contentId: e.contentId,
        tmdbId: Number(e.tmdbId),
        title: e.title,
        year: 2024, rating: 0,
        posterPath: e.posterPath,
        backdropPath: e.backdropPath,
        description: "", genres: [],
        type: e.type === "tv" ? ("series" as const) : ("movie" as const),
        mediaType: e.type,
        progress: e.progress,
        positionMs: e.positionMs,
        durationMs: e.durationMs,
        episodeSeason: e.season,
        episodeNum: e.episode,
      });
    }

    // Render local immediately so the row appears without waiting for Supabase
    if (map.size > 0) setContinueItems(Array.from(map.values()));

    // Merge Supabase data if logged in (may have entries from other devices)
    if (user?.id && isSupabaseConfigured) {
      try {
        const cloudItems = await db.progress.getAll(user.id);
        for (const p of cloudItems) {
          const cid = `${p.type}_${p.tmdb_id}`;
          const existing = map.get(cid);
          const cloudUpdated = p.updated_at ? new Date(p.updated_at).getTime() : 0;
          const localUpdated = existing?.positionMs ? (existing as any)._updatedAt ?? 0 : 0;
          // Prefer the entry with the more recent timestamp
          if (!existing || cloudUpdated > localUpdated) {
            map.set(cid, {
              id: cid,
              contentId: cid,
              tmdbId: p.tmdb_id,
              title: p.title ?? "Sem título",
              year: 2024, rating: 0,
              posterPath: p.poster_path ?? "",
              backdropPath: p.backdrop_path ?? "",
              description: "", genres: [],
              type: p.type === "movie" ? ("movie" as const) : ("series" as const),
              mediaType: p.type,
              progress: p.progress ?? 0,
              positionMs: (p as any).position_ms ?? 0,
              durationMs: (p as any).duration_ms ?? 0,
              episodeSeason: p.season,
              episodeNum: p.episode,
            });
          }
        }
        // Sort merged results by updatedAt descending
        const merged = Array.from(map.values())
          .filter((i) => (i.progress ?? 0) > 0.02 && (i.progress ?? 1) < 0.95);
        setContinueItems(merged);
      } catch { /* keep local data on cloud error */ }
    }
  }, [user?.id]);

  useEffect(() => { loadContinueItems(); }, [loadContinueItems]);

  // Refresh "Continue Assistindo" every time the tab gains focus (e.g. returning from player)
  useFocusEffect(
    useCallback(() => {
      loadContinueItems();
    }, [loadContinueItems])
  );

  // ── apply catalog data to state ───────────────────────────────────────────
  const applyCatalog = useCallback((
    raw: { movies: any[]; series: any[]; animes: any[] }
  ) => {
    // Accept items with tmdb_id=0 if they have a flix2 item id and title.
    // tmdb_id=0 means Flix 2.0 doesn't have the TMDB mapping yet — content is still playable.
    const hasId = (i: any) => i.tmdb_id > 0 || (i.id != null && String(i.id).length > 0);
    const m = raw.movies.filter((i: any) => hasId(i) && i.poster && i.title).map(flix2ToContent);
    const s = raw.series.filter((i: any) => hasId(i) && i.poster && i.title).map(flix2ToContent);
    const a = raw.animes.filter((i: any) => hasId(i) && i.poster && i.title).map(flix2ToContent);

    // Deduplicate: remove from animes any item already in movies or series
    // (Xtream APIs often have the same title in multiple categories)
    const seriesAndMovieIds = new Set([...m, ...s].map((i) => i.id));
    const aDeduped = a.filter((i) => !seriesAndMovieIds.has(i.id));

    // Helper: sort catalog by rating DESC, using year as tiebreaker
    const byRating = <T extends { rating?: number; year?: number }>(arr: T[]): T[] =>
      [...arr].sort((a, b) => {
        const rd = (b.rating ?? 0) - (a.rating ?? 0);
        return rd !== 0 ? rd : (b.year ?? 0) - (a.year ?? 0);
      });

    if (m.length) {
      setMovies(m);
      setTop10Movies(byRating(m).slice(0, 10));
      setTotals((t) => ({ ...t, movies: m.length }));
    }
    if (s.length) {
      setSeries(s);
      setTop10Series(byRating(s).slice(0, 10));
      setTotals((t) => ({ ...t, series: s.length }));
    }

    // ── Hero pool: fetch TMDB images first, then set items (no broken flix2 URLs) ──
    if (m.length || s.length) {
      // TMDB genre IDs: 10762=Kids, 10751=Family, 16=Animation (only excluded when sole genre)
      const HERO_KIDS_GENRES = new Set([10762]);
      const isHeroSuitable = (x: ContentItem) => {
        if (!x.genres || x.genres.length === 0) return true;
        if (x.genres.some((g) => HERO_KIDS_GENRES.has(g))) return false;
        if (x.genres.length === 1 && x.genres[0] === 16) return false;
        return true;
      };
      const goodRating = (x: ContentItem) =>
        (x.tmdbId ?? 0) > 0 && (x.rating ?? 0) >= 7.0 && isHeroSuitable(x);

      const hm = [...m.filter(goodRating)].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      const hs = [...s.filter(goodRating)].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

      // Interleave: movie, series … for visual variety
      const heroMixed: ContentItem[] = [];
      let mi = 0, si = 0;
      while (heroMixed.length < 8 && (mi < hm.length || si < hs.length)) {
        if (mi < hm.length) heroMixed.push(hm[mi++]);
        if (heroMixed.length < 8 && si < hs.length) heroMixed.push(hs[si++]);
      }

      const heroCandidates = heroMixed.length >= 5
        ? heroMixed.slice(0, 8)
        : [...m, ...s].filter((x) => (x.tmdbId ?? 0) > 0).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 8);

      // Fetch TMDB images BEFORE showing banner — skeleton stays visible until ready
      (async () => {
        try {
          const { getApiBase } = await import("@/lib/api");
          const base = getApiBase();
          const isTmdbUrl = (u?: string) => !!u && u.startsWith("https://image.tmdb.org/");
          const enriched = (await Promise.all(
            heroCandidates.map(async (item) => {
              if ((item.tmdbId ?? 0) <= 0) return null;
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 6000);
              try {
                const mt = item.type === "movie" || item.mediaType === "movie" ? "movie" : "tv";
                const r = await fetch(`${base}/tmdb/${mt}/${item.tmdbId}`, { signal: ctrl.signal });
                clearTimeout(tid);
                if (r.ok) {
                  const d = await r.json();
                  const posterPath = d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : "";
                  const backdropPath = d.backdrop_path
                    ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}`
                    : d.poster_path
                    ? `https://image.tmdb.org/t/p/w780${d.poster_path}`
                    : "";
                  if (!posterPath && !backdropPath) return null; // no TMDB images → skip
                  return {
                    ...item,
                    title: d.title || d.name || item.title,
                    description: d.overview || item.description,
                    genres: d.genre_ids ?? (d.genres?.map((g: any) => g.id) ?? item.genres),
                    year: Number((d.release_date || d.first_air_date || "").slice(0, 4)) || item.year,
                    rating: d.vote_average ?? item.rating,
                    posterPath,
                    backdropPath,
                  };
                }
              } catch { clearTimeout(tid); }
              return null; // TMDB failed → exclude from hero
            })
          )).filter(Boolean) as ContentItem[];

          // Only show if we have at least 1 item with real TMDB images, excluding kids content
          const HERO_KIDS_IDS = new Set([10762]);
          const heroSuitable = (x: ContentItem) => {
            if (!x.genres || x.genres.length === 0) return true;
            if (x.genres.some((g) => HERO_KIDS_IDS.has(g))) return false;
            if (x.genres.length === 1 && x.genres[0] === 16) return false;
            return true;
          };
          const filtered = enriched.filter((x) => (isTmdbUrl(x.backdropPath) || isTmdbUrl(x.posterPath)) && heroSuitable(x));
          if (filtered.length >= 1) {
            setHeroItems(filtered);
          } else {
            setHeroItems(heroCandidates); // last resort
          }
        } catch {
          // Last resort: set candidates as-is
          setHeroItems(heroCandidates);
        }
      })();
    }

    // Async: reorder Top 10 using TMDB weekly trending + real play counts
    if (m.length > 0 || s.length > 0) {
      (async () => {
        try {
          const { getApiBase } = await import("@/lib/api");
          const base = getApiBase();

          // Fetch TMDB trending + real play counts in parallel
          const [trendRes, realMovieRes, realTvRes] = await Promise.allSettled([
            fetch(`${base}/tmdb/trending`, { signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 7000); return c.signal; })() }),
            fetch(`${base}/content/top10?type=movie&days=7`, { signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 7000); return c.signal; })() }),
            fetch(`${base}/content/top10?type=tv&days=7`, { signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 7000); return c.signal; })() }),
          ]);

          const trendData = trendRes.status === "fulfilled" && trendRes.value.ok ? await trendRes.value.json().catch(() => ({})) : {};
          const realMovieData = realMovieRes.status === "fulfilled" && realMovieRes.value.ok ? await realMovieRes.value.json().catch(() => ({})) : {};
          const realTvData = realTvRes.status === "fulfilled" && realTvRes.value.ok ? await realTvRes.value.json().catch(() => ({})) : {};

          const trendMovieIds: number[] = (Array.isArray(trendData.movies) ? trendData.movies : (trendData.movies?.results ?? [])).map((i: any) => i.id);
          const trendTvIds: number[]    = (Array.isArray(trendData.tv)     ? trendData.tv     : (trendData.tv?.results ?? [])).map((i: any) => i.id);
          const realMovieIds: number[] = (realMovieData.items ?? []).map((i: any) => i.tmdbId);
          const realTvIds: number[]    = (realTvData.items ?? []).map((i: any) => i.tmdbId);

          // Normalize title for fuzzy matching (lowercase, remove accents, punctuation)
          const normTitle = (t: string) =>
            t.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

          // Helper: blend [real views] + [TMDB trending by title] + [rating-sorted fallback]
          function blendTop10<T extends { tmdbId?: number | null; title?: string; rating?: number; year?: number }>(
            catalog: T[],
            priorityIds: number[],
            fillIds: number[],
            trendTitles: string[]
          ): T[] {
            const ratedCatalog = byRating(catalog);
            // Build lookup maps
            const idMap = new Map<number, T>();
            const titleMap = new Map<string, T>();
            for (const item of ratedCatalog) {
              if ((item.tmdbId ?? 0) > 0 && !idMap.has(item.tmdbId!)) idMap.set(item.tmdbId!, item);
              const nt = normTitle(item.title ?? "");
              if (nt && !titleMap.has(nt)) titleMap.set(nt, item);
            }

            const result: T[] = [];
            const usedItems = new Set<T>();

            // 1. Priority: real view counts (by tmdbId)
            for (const id of priorityIds) {
              const item = idMap.get(id);
              if (item && !usedItems.has(item)) { result.push(item); usedItems.add(item); }
              if (result.length >= 10) return result;
            }

            // 2. Fill: TMDB trending matched by tmdbId first, then by title
            for (const id of fillIds) {
              const byId = idMap.get(id);
              if (byId && !usedItems.has(byId)) { result.push(byId); usedItems.add(byId); }
              if (result.length >= 10) return result;
            }
            for (const title of trendTitles) {
              const nt = normTitle(title);
              const byTitle = titleMap.get(nt);
              if (byTitle && !usedItems.has(byTitle)) { result.push(byTitle); usedItems.add(byTitle); }
              if (result.length >= 10) return result;
            }

            // 3. Fallback: rating-sorted catalog items
            for (const item of ratedCatalog) {
              if (!usedItems.has(item)) { result.push(item); usedItems.add(item); }
              if (result.length >= 10) return result;
            }
            return result;
          }

          const trendMovieTitles: string[] = (Array.isArray(trendData.movies) ? trendData.movies : []).map((i: any) => i.title ?? i.name ?? "");
          const trendTvTitles: string[]    = (Array.isArray(trendData.tv)     ? trendData.tv     : []).map((i: any) => i.name ?? i.title ?? "");

          // Build TMDB poster map (tmdbId → full URL) from trending data.
          // Same source used by "Estreando na TV" — always valid TMDB CDN URLs.
          const tmdbPosterMap = new Map<number, string>();
          const tmdbBackdropMap = new Map<number, string>();
          for (const ti of [...(Array.isArray(trendData.movies) ? trendData.movies : []), ...(Array.isArray(trendData.tv) ? trendData.tv : [])]) {
            if (ti.id) {
              if (ti.poster_path)   tmdbPosterMap.set(ti.id,   `https://image.tmdb.org/t/p/w342${ti.poster_path}`);
              if (ti.backdrop_path) tmdbBackdropMap.set(ti.id, `https://image.tmdb.org/t/p/w780${ti.backdrop_path}`);
            }
          }

          // Enrich Top 10 items: use TMDB poster/backdrop when Flix2 catalog poster is missing or broken
          function enrichTop10Posters(items: ContentItem[]): ContentItem[] {
            return items.map((item) => {
              const hasPoster = item.posterPath && item.posterPath.startsWith("http");
              const hasBackdrop = item.backdropPath && item.backdropPath.startsWith("http");
              if (hasPoster && hasBackdrop) return item;
              const tmdbId = item.tmdbId ?? 0;
              const tmdbPoster   = tmdbId > 0 ? tmdbPosterMap.get(tmdbId)   : undefined;
              const tmdbBackdrop = tmdbId > 0 ? tmdbBackdropMap.get(tmdbId) : undefined;
              if (!tmdbPoster && !tmdbBackdrop) return item;
              return {
                ...item,
                posterPath:   !hasPoster   && tmdbPoster   ? tmdbPoster   : item.posterPath,
                backdropPath: !hasBackdrop && tmdbBackdrop ? tmdbBackdrop : item.backdropPath,
              };
            });
          }

          // Fetch TMDB poster/backdrop for items that have tmdbId but no valid image.
          // Uses AbortController (not AbortSignal.timeout — crashes on Hermes/Android).
          const fetchTmdbPosters = async (items: ContentItem[]): Promise<ContentItem[]> => {
            const missing = items.filter(
              (i) => (i.tmdbId ?? 0) > 0 && !(i.posterPath && i.posterPath.startsWith("http"))
            );
            if (!missing.length) return items;
            const patchMap = new Map<number, { posterPath: string; backdropPath?: string }>();
            await Promise.allSettled(
              missing.slice(0, 8).map(async (item) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 4000);
                try {
                  const type = (item as any).type === "movie" ? "movie" : "tv";
                  const r = await fetch(`${base}/tmdb/${type}/${item.tmdbId}`, { signal: ctrl.signal });
                  if (r.ok) {
                    const d = await r.json();
                    if (d.poster_path) {
                      patchMap.set(item.tmdbId!, {
                        posterPath:   `https://image.tmdb.org/t/p/w342${d.poster_path}`,
                        backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : undefined,
                      });
                    }
                  }
                } catch {}
                finally { clearTimeout(t); }
              })
            );
            if (!patchMap.size) return items;
            return items.map((item) => {
              const p = (item.tmdbId ?? 0) > 0 ? patchMap.get(item.tmdbId!) : undefined;
              if (!p) return item;
              return {
                ...item,
                posterPath:   !(item.posterPath && item.posterPath.startsWith("http"))   ? p.posterPath   : item.posterPath,
                backdropPath: !(item.backdropPath && item.backdropPath.startsWith("http")) && p.backdropPath ? p.backdropPath : item.backdropPath,
              };
            });
          };

          if (m.length > 0) {
            const blended = enrichTop10Posters(blendTop10(m, realMovieIds, trendMovieIds, trendMovieTitles) as ContentItem[]);
            if (blended.length > 0) setTop10Movies(blended.slice(0, 10));
            // Second pass: fetch TMDB for any still-missing posters
            fetchTmdbPosters(blended).then((enriched) => {
              if (enriched.some((i, idx) => i.posterPath !== blended[idx]?.posterPath)) {
                setTop10Movies(enriched.slice(0, 10));
              }
            }).catch(() => {});

            // Enrich hero items: blend trending movies/series into hero pool
            // Prefer items with backdropPath (landscape = better banner visuals)
            const buildHeroCandidates = () => {
              const movieHits = trendMovieIds
                .map((id) => m.find((x) => x.tmdbId === id))
                .filter(Boolean) as ContentItem[];
              const tvHits = trendTvIds
                .map((id) => s.find((x) => x.tmdbId === id))
                .filter(Boolean) as ContentItem[];
              const combined = [...movieHits, ...tvHits];
              // Enrich with TMDB backdrop/poster URLs from the trending map
              const enriched = combined.map((item) => {
                const hasBackdrop = item.backdropPath && item.backdropPath.startsWith("http");
                const hasPoster   = item.posterPath   && item.posterPath.startsWith("http");
                const tBackdrop = (item.tmdbId ?? 0) > 0 ? tmdbBackdropMap.get(item.tmdbId!) : undefined;
                const tPoster   = (item.tmdbId ?? 0) > 0 ? tmdbPosterMap.get(item.tmdbId!)   : undefined;
                return {
                  ...item,
                  backdropPath: hasBackdrop ? item.backdropPath : (tBackdrop ?? item.backdropPath),
                  posterPath:   hasPoster   ? item.posterPath   : (tPoster   ?? item.posterPath),
                };
              });
              // Only items with images, tmdbId, and not kids-only content
              const TREND_KIDS_IDS = new Set([10762]);
              const trendHeroOk = (x: ContentItem) => {
                if (!x.genres || x.genres.length === 0) return true;
                if (x.genres.some((g) => TREND_KIDS_IDS.has(g))) return false;
                if (x.genres.length === 1 && x.genres[0] === 16) return false;
                return true;
              };
              return enriched.filter((x) => (x.backdropPath || x.posterPath) && (x.tmdbId ?? 0) > 0 && trendHeroOk(x));
            };

            const heroCandidates = buildHeroCandidates();
            if (heroCandidates.length >= 4) {
              setHeroItems(heroCandidates.slice(0, 8));
            }

            // ── Fetch high-res TMDB backdrops for ALL hero items with tmdbId ──
            // Uses the TMDB server proxy. w1280 gives a beautiful wide cinematic backdrop.
            const fetchHeroBackdrops = async (heroes: ContentItem[]): Promise<void> => {
              const needsBd = heroes.filter((x) => (x.tmdbId ?? 0) > 0);
              if (!needsBd.length) return;

              const patches = new Map<number, { backdropPath: string; posterPath?: string }>();
              await Promise.allSettled(
                needsBd.map(async (item) => {
                  const ctrl = new AbortController();
                  const tid  = setTimeout(() => ctrl.abort(), 5000);
                  try {
                    const mt = item.type === "movie" || (item as any).mediaType === "movie" ? "movie" : "tv";
                    const r  = await fetch(`${base}/tmdb/${mt}/${item.tmdbId}`, { signal: ctrl.signal });
                    if (r.ok) {
                      const d = await r.json();
                      const bd = d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : undefined;
                      const pt = d.poster_path   ? `https://image.tmdb.org/t/p/w342${d.poster_path}`   : undefined;
                      if (bd || pt) patches.set(item.tmdbId!, { backdropPath: bd ?? pt ?? "", posterPath: pt });
                    }
                  } catch {} finally { clearTimeout(tid); }
                })
              );

              if (!patches.size) return;
              setHeroItems((prev) =>
                prev.map((item) => {
                  const p = (item.tmdbId ?? 0) > 0 ? patches.get(item.tmdbId!) : undefined;
                  if (!p) return item;
                  return {
                    ...item,
                    backdropPath: p.backdropPath || item.backdropPath,
                    posterPath: p.posterPath || item.posterPath,
                  };
                })
              );
            };

            // Build the final hero list for backdrop enrichment:
            // Use trending candidates if available, otherwise fall back to rating-sorted movies+series
            const heroFinalList = heroCandidates.length >= 4
              ? heroCandidates.slice(0, 8)
              : [...m, ...s]
                  .filter((x) => (x.tmdbId ?? 0) > 0 && (x.rating ?? 0) >= 6.5)
                  .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                  .slice(0, 8);

            // Run concurrently — don't await, backdrop fetch is non-blocking
            fetchHeroBackdrops(heroFinalList).catch(() => {});
          }
          if (s.length > 0) {
            const blended = enrichTop10Posters(blendTop10(s, realTvIds, trendTvIds, trendTvTitles) as ContentItem[]);
            if (blended.length > 0) setTop10Series(blended.slice(0, 10));
            // Second pass: fetch TMDB for any still-missing posters
            fetchTmdbPosters(blended).then((enriched) => {
              if (enriched.some((i, idx) => i.posterPath !== blended[idx]?.posterPath)) {
                setTop10Series(enriched.slice(0, 10));
              }
            }).catch(() => {});
          }
        } catch {}
      })();
    }
    if (aDeduped.length) {
      setAnimes(aDeduped);
      setTotals((t) => ({ ...t, animes: aDeduped.length }));
    }

    const availableIds = new Set<number>();
    [...m, ...s, ...a].forEach((i) => { if (i.tmdbId) availableIds.add(i.tmdbId); });

    clearPreloadQueue();
    const heroUrls   = m.slice(0, 6).map((i) => i.posterPath).filter(Boolean) as string[];
    const row1Movies = m.slice(0, 6).map((i) => i.posterPath).filter(Boolean) as string[];
    const row1Series = s.slice(0, 6).map((i) => i.posterPath).filter(Boolean) as string[];
    if (Platform.OS === "web") {
      preloadImages([...heroUrls, ...row1Movies, ...row1Series], "high");
      setTimeout(() => {
        const restMovies = m.slice(6, 30).map((i) => i.posterPath).filter(Boolean) as string[];
        const restSeries = s.slice(6, 24).map((i) => i.posterPath).filter(Boolean) as string[];
        const restAnimes = a.slice(0, 18).map((i) => i.posterPath).filter(Boolean) as string[];
        preloadImages([...restMovies, ...restSeries, ...restAnimes], "low");
      }, 1500);
    }

    if (availableIds.size > 0) checkCatalogWatchAndNotify(availableIds).catch(() => {});

    getCacheTimestamp("movies").then((ts) => { if (ts) setCacheTs(ts); }).catch(() => {});
  }, []);

  // ── fetch fresh from API and store in cache ────────────────────────────────
  const fetchAndCache = useCallback(async (): Promise<{ movies: any[]; series: any[]; animes: any[] }> => {
    const fetchAll = async (type: string) => {
      try {
        const res = await r2Route<{ success: boolean; data: any[] }>(`/flix2/catalog-full?type=${type}`);
        return res.success ? (res.data ?? []) : [];
      } catch {
        return [];
      }
    };

    const [movRaw, serRaw, aniRaw] = await Promise.all([
      fetchAll("movies"),
      fetchAll("series"),
      fetchAll("animes"),
    ]);

    // Só sobrescreve se o novo fetch tem >= items que o cache atual
    // (evita que 1 página sobreescreva o catálogo completo do prefetch)
    const [existM, existS, existA] = await Promise.all([
      getCacheItemCount("movies"),
      getCacheItemCount("series"),
      getCacheItemCount("animes"),
    ]);
    if (movRaw.length && movRaw.length >= existM) setCached("movies", movRaw);
    if (serRaw.length && serRaw.length >= existS) setCached("series", serRaw);
    if (aniRaw.length && aniRaw.length >= existA) setCached("animes", aniRaw);

    return { movies: movRaw, series: serRaw, animes: aniRaw };
  }, []);

  // ── load data — cache-first with background revalidation ─────────────────
  const loadData = useCallback(async () => {
    try {
      // Phase 1: try cache — display instantly if available
      const [cachedMov, cachedSer, cachedAni] = await Promise.all([
        getCached("movies"),
        getCached("series"),
        getCached("animes"),
      ]);

      const hasCached = cachedMov?.length || cachedSer?.length;
      if (hasCached) {
        applyCatalog({
          movies: cachedMov ?? [],
          series: cachedSer ?? [],
          animes: cachedAni ?? [],
        });
        setLoading(false);
        setRefreshing(false);
        setTimeout(startEntranceAnims, 60);
        InteractionManager.runAfterInteractions(() => setBelowFoldReady(true));

        // Phase 2: background revalidation — silent, no loading state
        fetchAndCache().then((fresh) => applyCatalog(fresh)).catch(() => {});
        return;
      }

      // Phase 1 fallback: no cache — fetch normally (with loading state)
      const fresh = await fetchAndCache();
      applyCatalog(fresh);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
      setTimeout(startEntranceAnims, 100);
      InteractionManager.runAfterInteractions(() => setBelowFoldReady(true));
    }
  }, [startEntranceAnims, applyCatalog, fetchAndCache]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Recomendações personalizadas + IA Gemini ──────────────────────────────
  // Roda em background depois que o catálogo carrega; não bloqueia a UI.
  useEffect(() => {
    const allContent = [...movies, ...series, ...animes];
    if (allContent.length === 0) return;
    const userId = user?.id ?? "";

    computeRecommendations(allContent, userId, 100)
      .then((recs) => {
        setRecommendations(recs);

        // Enviar as top recomendações para a IA Gemini personalizar
        if (recs.length < 4) return;
        getBehaviorProfile().then((profile) => {
          const candidates = recs.slice(0, 30).map((item) => ({
            id: item.id,
            title: item.title,
            genreIds: (item as any).genreIds ?? [],
            type: item.type === "movie" ? "movie" : "tv",
            year: item.year ?? 2024,
            rating: item.rating ?? 0,
          }));
          return geminiPersonalizeHome({ ...profile, candidates });
        }).then((result) => {
          if (!result || !result.rankedIds.length) return;
          const idMap = new Map(recs.map((r) => [r.id, r]));
          const ordered: ContentItem[] = [];
          for (const id of result.rankedIds) {
            const found = idMap.get(id);
            if (found) ordered.push(found);
          }
          if (ordered.length >= 4) {
            setAiRowItems(ordered.slice(0, 8));
            setAiRowLabel(result.rowLabel || "Para Você");
            setAiRowSubtitle(result.rowSubtitle || "Escolhido pela IA");
          }
        }).catch(() => {});
      })
      .catch(() => {});
  }, [movies, series, animes, user?.id]);

  // ── Prefetch em segundo plano ─────────────────────────────────────────────
  // Quando o catálogo completo termina de baixar, recarrega a home com mais itens
  useEffect(() => {
    const unsub = subscribePrefetch(async (s) => {
      setPrefetchPhase(s.phase);
      if (s.phase === "done") {
        // Recarrega do cache — agora tem o catálogo completo
        const [m, ser, ani] = await Promise.all([
          getCached("movies"),
          getCached("series"),
          getCached("animes"),
        ]);
        if (m?.length || ser?.length) {
          applyCatalog({ movies: m ?? [], series: ser ?? [], animes: ani ?? [] });
        }
        getCacheTimestamp("movies").then((ts) => { if (ts) setCacheTs(ts); }).catch(() => {});
      }
    });
    return unsub;
  }, [applyCatalog]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    sectionAnims.forEach((a) => a.setValue(0));
    loadData();
    // Força novo sync completo do catálogo ao puxar para atualizar
    forceRefreshCatalog().catch(() => {});
  }, [loadData]);

  // ── navigation ────────────────────────────────────────────────────────────
  const goTo = useCallback((item: ContentItem) => {
    trackOpen(
      item.tmdbId ?? 0,
      item.title,
      item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
      (item as any).genreIds ?? [],
    ).catch(() => {});
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
  }, [router]);

  const BROWSE_GENRE: Record<string, number> = {
    // Action/Adventure
    "Ação & Aventura": 28, "Aventura": 12,
    // Drama
    "Drama": 18, "Dramas": 18,
    // Comedy
    "Comédia": 35,
    // Horror / Thriller
    "Terror": 27, "Thriller": 53,
    // Sci-fi
    "Ficção Científica": 878,
    // Animation / Anime
    "Animações": 16, "Animes": 16,
    // Series genres
    "Mini-Séries": 18, "Episódios": 0, "Novos Episódios": 0,
    // Family / Documentary
    "Família": 10751, "Documentários": 99,
    // Misc — genre_id=0 → popular (no filter)
    "Em Alta": 0, "Top 10 Filmes": 0, "Top 10 Séries": 0,
    "Séries em Alta": 0, "Séries do Momento": 0,
    "Para Você": 0, "Panorâmicos": 0,
    "Clássicos": 0, "Clássicos Imortais": 0,
    "Internacional": 18, "Premiados": 18,
    "Anos 80": 0, "Explorar": 0,
  };
  const browseTo = useCallback((flix2Type: "movies" | "series" | "animes", title: string, sortBy?: string) => {
    router.push({
      pathname: "/genre-browse",
      params: { title, source: "flix2", flix2_type: flix2Type, ...(sortBy ? { sort_by: sortBy } : {}) },
    });
  }, [router]);

  const emAltaAnimes = useMemo(() => animes.slice(0, 6), [animes]);

  // ── Global section pools — each item appears in AT MOST ONE section ────────
  // Items are distributed in render order: each "take" call consumes from a
  // global seen-set so subsequent sections never duplicate earlier ones.
  const {
    pool_cinematic,
    pool_emAltaMovies,
    pool_daily,
    pool_glass,
    pool_award,
    pool_quickPlay,
    pool_squareDestaques,
    pool_masonry,
    pool_duoMovie,
    pool_netplayMovies,
    pool_categoryShowcase,
    pool_newWeekMovies,
    pool_binge,
    pool_emAltaSeries,
    pool_immersiveHero,
    pool_duoSeries,
    pool_editorPick,
    pool_seriesMaraton,
    pool_netplaySeries,
    pool_premiumSeries,
    pool_newWeekSeries,
  } = useMemo(() => {
    const seenM = new Set<string>(top10Movies.map((i) => i.id));
    const seenS = new Set<string>(top10Series.map((i) => i.id));

    const takeM = (n: number, filter?: (i: ContentItem) => boolean): ContentItem[] => {
      const r: ContentItem[] = [];
      for (const item of movies) {
        if (r.length >= n) break;
        if (!seenM.has(item.id) && (!filter || filter(item))) { seenM.add(item.id); r.push(item); }
      }
      return r;
    };
    const takeS = (n: number, filter?: (i: ContentItem) => boolean): ContentItem[] => {
      const r: ContentItem[] = [];
      for (const item of series) {
        if (r.length >= n) break;
        if (!seenS.has(item.id) && (!filter || filter(item))) { seenS.add(item.id); r.push(item); }
      }
      return r;
    };

    // Allocation order matches render order so first-visible sections claim items first
    const pool_cinematic        = takeM(5);
    const pool_daily            = takeM(1);
    const pool_emAltaMovies     = takeM(6);
    const pool_glass            = takeM(1);
    const pool_award            = takeM(8);
    const pool_quickPlay        = takeM(6);
    const pool_squareDestaques  = takeM(8);
    const pool_masonry          = takeM(4);
    const pool_duoMovie         = takeM(1);
    const pool_netplayMovies    = takeM(4);
    const pool_categoryShowcase = takeM(1);
    const pool_newWeekMovies    = takeM(4);

    const pool_binge            = takeS(8);
    const pool_immersiveHero    = takeS(1);
    const pool_duoSeries        = takeS(1);
    const pool_editorPick       = takeS(1);
    const pool_emAltaSeries     = takeS(6);
    const pool_seriesMaraton    = takeS(10);
    const pool_netplaySeries    = takeS(4);
    const pool_premiumSeries    = takeS(6);
    const pool_newWeekSeries    = takeS(3);

    return {
      pool_cinematic, pool_emAltaMovies, pool_daily, pool_glass,
      pool_award, pool_quickPlay, pool_squareDestaques, pool_masonry,
      pool_duoMovie, pool_netplayMovies,
      pool_categoryShowcase, pool_newWeekMovies,
      pool_binge, pool_emAltaSeries, pool_immersiveHero, pool_duoSeries,
      pool_editorPick, pool_seriesMaraton, pool_netplaySeries,
      pool_premiumSeries, pool_newWeekSeries,
    };
  }, [movies, series, top10Movies, top10Series]);

  // Convenience aliases so guards like `emAltaMovies.length > 0` still work
  const emAltaMovies = pool_emAltaMovies;
  const emAltaSeries = pool_emAltaSeries;

  // ── Em Destaque Esta Semana — top-rated mix, offset past Top 10 ──────────────
  const weeklyFeatured = useMemo(() => {
    const top10Ids = new Set([...top10Movies, ...top10Series].map((i) => i.id));
    return [...movies, ...series]
      .filter((i) => (i.rating ?? 0) >= 7.0 && !top10Ids.has(i.id))
      .sort((a, b) => {
        const rd = (b.rating ?? 0) - (a.rating ?? 0);
        return rd !== 0 ? rd : (b.year ?? 0) - (a.year ?? 0);
      })
      .slice(0, 12);
  }, [movies, series, top10Movies, top10Series]);

  const showMovies     = activeCategory === "all" || activeCategory === "movie";
  const showSeries     = activeCategory === "all" || activeCategory === "tv";
  const showAnimes     = activeCategory === "all" || activeCategory === "anime";
  const showAnimations = activeCategory === "all" || activeCategory === "animation";
  const showTop10      = activeCategory === "all" || activeCategory === "top";
  const showAll        = activeCategory === "all";

  const stats = useMemo(() => [
    { label: "Filmes",  value: totals.movies > 0 ? totals.movies.toLocaleString("pt-BR") : "–", icon: "film" as const,  color: RED },
    { label: "Séries",  value: totals.series > 0 ? totals.series.toLocaleString("pt-BR") : "–", icon: "tv" as const,    color: BLUE },
    { label: "Animes",  value: totals.animes > 0 ? totals.animes.toLocaleString("pt-BR") : "–", icon: "star" as const,  color: PURPLE },
  ], [totals]);


  const s = sectionAnims; // shorthand

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ SCROLL BODY ═════════════════════════════════════════════════════ */}
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const y = e.nativeEvent.contentOffset.y;
              _homeScrollY.current = y; // feed LazySection progressive reveal
              // Only trigger state update when crossing threshold (avoid 60fps re-renders)
              const shouldShow = y > 700;
              setShowScrollTop((prev) => (prev !== shouldShow ? shouldShow : prev));
            },
          }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={RED} colors={[RED]} />
        }
      >
        {/* ── 1. CATEGORY PILLS (island above the hero banner) ────────────── */}
        <AnimatedSection anim={s[0]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsRow} style={{ marginTop: topPad + 54, marginBottom: 12 }}>
            {CATEGORIES.map((cat) => (
              <CategoryPill key={cat.id} label={cat.label}
                active={activeCategory === cat.id}
                onPress={() => {
                  if (cat.id === "new") {
                    router.push("/(tabs)/novidades" as any);
                  } else {
                    setActiveCategory(cat.id);
                  }
                }} />
            ))}
          </ScrollView>
        </AnimatedSection>

        {/* ── 2. HERO BANNER ─────────────────────────────────────────────── */}
        <Animated.View style={{ transform: [{ translateY: heroParallax }] }}>
          <HeroBanner
            items={activeBannerItems}
            onItemPress={goTo}
          />
        </Animated.View>

        <View style={styles.body}>
          {/* ── 4. PLATAFORMAS DE STREAMING ────────────────────────────── */}
          <AnimatedSection anim={s[2]}>
            <View style={{ marginBottom: 20 }}>
              <SectionHeader title="Plataformas" icon="tv" accentColor={RED}
                subtitle="Explore por serviço" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.streamingRow, { paddingBottom: 4 }]}
                decelerationRate="fast">
                {MAIN_PLATFORMS.map((platform) => (
                  <StreamingChip key={platform.id} platform={platform}
                    onPress={() => router.push({ pathname: "/streaming", params: { id: platform.id } })} />
                ))}
                <Pressable style={styles.seeAllChip}
                  onPress={() => router.push("/streamings-all")}>
                  <View style={styles.seeAllChipInner}>
                    <Feather name="grid" size={14} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.seeAllChipText}>Ver todas</Text>
                  </View>
                </Pressable>
              </ScrollView>
            </View>
          </AnimatedSection>

          {loading ? (
            // ── SKELETON ──────────────────────────────────────────────────
            <View style={{ marginTop: 8 }}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={{ marginBottom: 32 }}>
                  <View style={styles.skeletonHeader} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                    {[1,2,3,4,5,6].map((j) => (
                      <View key={j} style={[styles.skeletonCard, { opacity: 1 - j * 0.1 }]} />
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
          ) : (
            <>
              {/* ── 6. CONTINUE ASSISTINDO ───────────────────────────────────── */}
              {continueItems.length > 0 && (
                <AnimatedSection anim={s[4]}>
                  <GradientSectionHeader
                    title="Continue Assistindo"
                    subtitle="Retome de onde parou"
                    accent={GREEN}
                    icon="play"
                    onSeeAll={() => router.push("/(tabs)/list")}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    removeClippedSubviews={Platform.OS !== "web"}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
                    {continueItems.slice(0, 8).map((item) => (
                      <PremiumContinueCard
                        key={item.id}
                        item={item}
                        onPress={() => goTo(item)}
                        onRemove={() => {
                          if (item.contentId) {
                            clearLocalProgress(item.contentId);
                          }
                          if (user?.id && isSupabaseConfigured && item.tmdbId) {
                            const t = item.mediaType === "movie" ? "movie" : "tv";
                            db.progress.deleteOne(user.id, item.tmdbId, t as "movie" | "tv").catch(() => {});
                          }
                          setContinueItems((prev) =>
                            prev.filter((i) => i.id !== item.id)
                          );
                        }}
                      />
                    ))}
                  </ScrollView>
                </AnimatedSection>
              )}

              {/* ── 6.5 IA GEMINI — PARA VOCÊ ────────────────────────────────── */}
              {(aiRowItems.length > 0 || recommendations.length > 0) && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title={aiRowItems.length > 0 ? aiRowLabel : "Recomendados para Você"}
                      icon="cpu"
                      badge="IA ✦"
                      accentColor={INDIGO}
                      subtitle={aiRowItems.length > 0 ? aiRowSubtitle : "Baseado no seu histórico"}
                      onSeeAll={() => openModal(
                        aiRowItems.length > 0 ? aiRowLabel : "Recomendados para Você",
                        aiRowItems.length > 0 ? aiRowItems : recommendations,
                        INDIGO,
                      )}
                    />
                    <PosterRow items={aiRowItems.length > 0 ? aiRowItems : recommendations.slice(0, 4)} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 6.6 DOS SEUS ATORES ───────────────────────────────────────── */}
              {actorCarouselItems.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title={actorCarouselLabel}
                      icon="user"
                      badge="♥ ATORES"
                      accentColor="#ec4899"
                      subtitle={`Com ${followedActors.slice(0, 2).map((a) => a.name.split(" ")[0]).join(" & ")}${followedActors.length > 2 ? ` +${followedActors.length - 2}` : ""}`}
                      onSeeAll={() => openModal(actorCarouselLabel, actorCarouselItems, "#ec4899")}
                    />
                    <PosterRow items={actorCarouselItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <LazySection threshold={250} minHeight={500}>
              {/* ── 6.7 SHORTS PARA VOCÊ ─────────────────────────────────────── */}
              {shortsForYou.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title="Shorts para Você"
                      icon="zap"
                      badge="IA"
                      accentColor="#7c3aed"
                      subtitle={shortsGenreLabel}
                      onSeeAll={() => router.push("/(tabs)/shorts" as any)}
                    />
                    <PosterRow items={shortsForYou} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 6.8 CONTINUAR SHORTS ─────────────────────────────────────── */}
              {continueShorts.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title="Continuar Shorts"
                      icon="play-circle"
                      accentColor={RED}
                      subtitle={`${continueShorts.length} título${continueShorts.length > 1 ? "s" : ""} assistido${continueShorts.length > 1 ? "s" : ""}`}
                      onSeeAll={() => router.push("/(tabs)/shorts" as any)}
                    />

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                    >
                      {continueShorts.map((sh) => (
                        <TouchableOpacity
                          key={sh.id}
                          activeOpacity={0.85}
                          onPress={() => router.push({ pathname: "/detail", params: { type: sh.type, id: String(sh.tmdbId), title: sh.title } } as any)}
                          style={{ width: 100 }}
                        >
                          <View style={{ width: 100, height: 148, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" }}>
                            {sh.poster ? (
                              <Image source={{ uri: sh.poster }} style={{ width: 100, height: 148 }} contentFit="cover" />
                            ) : (
                              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <Feather name="film" size={28} color="rgba(255,255,255,0.2)" />
                              </View>
                            )}
                            {/* Progress bar overlay */}
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.15)" }}>
                              <View style={{ height: 3, width: `${Math.round(sh.progress * 100)}%`, backgroundColor: RED, borderRadius: 2 }} />
                            </View>
                            {/* Play icon */}
                            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 3, alignItems: "center", justifyContent: "center" }}>
                              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                                <Feather name="play" size={13} color="#fff" />
                              </View>
                            </View>
                          </View>
                          <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "600", marginTop: 5, lineHeight: 14 }}>
                            {sh.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              {/* ── 6.9 CURTIDOS POR VOCÊ ────────────────────────────────────── */}
              {shortsLikes.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title="Curtidos por Você"
                      icon="heart"
                      accentColor="#e50914"
                      subtitle="Seus Shorts favoritos"
                      onSeeAll={() => router.push("/(tabs)/shorts" as any)}
                    />
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                    >
                      {shortsLikes.map((sh, idx) => (
                        <TouchableOpacity
                          key={sh.id}
                          activeOpacity={0.85}
                          onPress={() => router.push({ pathname: "/detail", params: { type: sh.type, id: String(sh.tmdbId), title: sh.title } } as any)}
                          style={{ width: 110 }}
                        >
                          <View style={{ width: 110, height: 162, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" }}>
                            {sh.poster ? (
                              <Image source={{ uri: sh.poster }} style={{ width: 110, height: 162 }} contentFit="cover" />
                            ) : (
                              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <Feather name="film" size={28} color="rgba(255,255,255,0.2)" />
                              </View>
                            )}
                            {/* Gradient overlay at bottom */}
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, backgroundColor: "transparent" }}>
                              <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48, backgroundColor: "rgba(0,0,0,0.55)" }} />
                            </View>
                            {/* Rank badge — top left */}
                            <View style={{
                              position: "absolute", top: 0, left: 0,
                              backgroundColor: "#e50914",
                              paddingHorizontal: 7, paddingVertical: 3,
                              borderBottomRightRadius: 8,
                            }}>
                              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>{idx + 1}</Text>
                            </View>
                            {/* Heart icon — bottom right */}
                            <View style={{ position: "absolute", bottom: 7, right: 8 }}>
                              <Feather name="heart" size={14} color="#e50914" />
                            </View>
                          </View>
                          <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", marginTop: 5, lineHeight: 14 }}>
                            {sh.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              {/* ── 6.10 SHORTS DE AMIGOS ────────────────────────────────────── */}
              {fromFriendsShorts.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title="De Amigos"
                      icon="users"
                      accentColor="#e50914"
                      subtitle={`${fromFriendsShorts.length} indicação${fromFriendsShorts.length > 1 ? "ões" : ""} recebida${fromFriendsShorts.length > 1 ? "s" : ""}`}
                      onSeeAll={() => router.push("/shorts-shares" as any)}
                    />
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                    >
                      {fromFriendsShorts.map((sh) => (
                        <TouchableOpacity
                          key={`${sh.tmdbId}-${sh.receivedAt}`}
                          activeOpacity={0.85}
                          onPress={() => router.push({
                            pathname: "/shorts-reaction",
                            params: {
                              tmdbId: String(sh.tmdbId),
                              contentType: sh.contentType,
                              title: sh.title,
                              poster: sh.poster ?? "",
                              senderId: sh.senderId,
                              senderName: sh.senderName,
                            },
                          } as any)}
                          style={{ width: 110 }}
                        >
                          <View style={{ width: 110, height: 162, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" }}>
                            {sh.poster ? (
                              <Image source={{ uri: sh.poster }} style={{ width: 110, height: 162 }} contentFit="cover" />
                            ) : (
                              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <Feather name="film" size={28} color="rgba(255,255,255,0.2)" />
                              </View>
                            )}
                            {/* Gradient overlay */}
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 56, backgroundColor: "rgba(0,0,0,0.7)" }} />
                            {/* Sender name at bottom */}
                            <View style={{ position: "absolute", bottom: 6, left: 6, right: 6 }}>
                              <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontWeight: "600" }}>
                                {"✈️ " + sh.senderName}
                              </Text>
                            </View>
                            {/* Reaction emoji badge — top right */}
                            {sh.reactedEmoji ? (
                              <View style={{
                                position: "absolute", top: 5, right: 6,
                                width: 26, height: 26, borderRadius: 13,
                                backgroundColor: "rgba(0,0,0,0.65)",
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <Text style={{ fontSize: 14 }}>{sh.reactedEmoji}</Text>
                              </View>
                            ) : (
                              /* Unread dot */
                              <View style={{
                                position: "absolute", top: 7, right: 8,
                                width: 8, height: 8, borderRadius: 4,
                                backgroundColor: "#e50914",
                              }} />
                            )}
                          </View>
                          <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", marginTop: 5, lineHeight: 14 }}>
                            {sh.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              {/* ── 6.11 TOP SHORTS DA SEMANA ────────────────────────────────── */}
              {topShortsWeek.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title="Top Shorts da Semana"
                      icon="zap"
                      accentColor="#7c3aed"
                      badge="TRENDING"
                      subtitle="Os mais assistidos agora no mundo"
                      onSeeAll={() => router.push("/(tabs)/shorts" as any)}
                    />
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                    >
                      {topShortsWeek.map((item, idx) => (
                        <TouchableOpacity
                          key={item.id}
                          activeOpacity={0.85}
                          onPress={() => goTo(item)}
                          style={{ width: 110 }}
                        >
                          <View style={{ width: 110, height: 162, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" }}>
                            {item.posterPath ? (
                              <Image source={{ uri: item.posterPath }} style={{ width: 110, height: 162 }} contentFit="cover" />
                            ) : (
                              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                                <Feather name="film" size={28} color="rgba(255,255,255,0.2)" />
                              </View>
                            )}
                            {/* Dark gradient at bottom */}
                            <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 52, backgroundColor: "rgba(0,0,0,0.72)" }} />
                            {/* Rating bottom-right */}
                            <View style={{ position: "absolute", bottom: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="star" size={9} color="#fbbf24" />
                              <Text style={{ color: "#fbbf24", fontSize: 10, fontWeight: "700" }}>{item.rating}</Text>
                            </View>
                            {/* ⚡ Shorts badge — bottom-left */}
                            <View style={{ position: "absolute", bottom: 7, left: 7, flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Feather name="zap" size={9} color="#a78bfa" />
                              <Text style={{ color: "#a78bfa", fontSize: 9, fontWeight: "700" }}>SHORTS</Text>
                            </View>
                            {/* Rank badge — top-left */}
                            <View style={{
                              position: "absolute", top: 0, left: 0,
                              minWidth: 26, paddingHorizontal: 7, paddingVertical: 4,
                              backgroundColor: "#7c3aed",
                              borderBottomRightRadius: 8,
                              alignItems: "center",
                            }}>
                              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900", lineHeight: 14 }}>
                                {idx + 1}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700", marginTop: 5, lineHeight: 14 }}>
                            {item.title}
                          </Text>
                          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>
                            {item.year} · {item.type === "movie" ? "Filme" : "Série"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              </LazySection>

              <LazySection threshold={550} minHeight={400}>
              {/* ── 6.95 CINEMATIC BANNER ────────────────────────────────────── */}
              {showAll && movies.length > 3 && (
                <AnimatedSection anim={s[5]}>
                  <FadeInSection>
                    <CinematicBanner items={pool_cinematic} onPress={goTo} />
                  </FadeInSection>
                </AnimatedSection>
              )}

              {/* ── 7. EM ALTA AGORA ─────────────────────────────────────────── */}
              {showMovies && emAltaMovies.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <GradientSectionHeader
                      title="Em Alta Agora"
                      subtitle="Os mais vistos desta semana"
                      accent={RED}
                      icon="trending-up"
                      onSeeAll={() => browseTo("movies", "Em Alta")}
                    />
                    <PosterRow items={emAltaMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 7.5 DAILY PICK ───────────────────────────────────────────── */}
              {showAll && movies.length > 5 && (
                <AnimatedSection anim={s[5]}>
                  {pool_daily.length > 0 && <DailyPickBanner item={pool_daily[0]} onPress={() => goTo(pool_daily[0])} />}
                </AnimatedSection>
              )}

              </LazySection>

              <LazySection threshold={800} minHeight={300}>
              {/* ── 8.5. CATÁLOGO DRIVE ──────────────────────────────────────── */}
              {(r2Movies.length > 0 || r2Series.length > 0) && (
                <AnimatedSection anim={s[6]}>
                  <View style={styles.section}>
                    <SectionHeader
                      title="Catálogo Drive"
                      icon="hard-drive"
                      badge="DRIVE"
                      accentColor={PURPLE}
                      subtitle={`${r2Movies.length + r2Series.length} títulos exclusivos`}
                      onSeeAll={() => openModal("Catálogo Drive", [...r2Movies, ...r2Series], PURPLE)}
                    />
                    <PosterRow items={[...r2Movies, ...r2Series].slice(0, 4)} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 9. TOP 10 FILMES ─────────────────────────────────────────── */}
              {(showTop10 || showMovies) && top10Movies.length > 0 && (
                <AnimatedSection anim={s[7]}>
                  <View style={styles.section}>
                    <SectionHeader title="Top 10 Filmes" icon="award"
                      badge="SEMANAL" accentColor={AMBER}
                      onSeeAll={() => browseTo("movies", "Top 10 Filmes", "rating_desc")} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      removeClippedSubviews={Platform.OS !== "web"}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }} decelerationRate="fast">
                      {top10Movies.slice(0, 5).map((item, i) => (
                        <TopTenCard key={item.id} item={item} rank={i + 1}
                          onPress={() => goTo(item)} />
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              </LazySection>

              {/* Below-fold: deferred until after first render interactions complete */}
              {belowFoldReady && (
              <>
              {/* ── GROUP A: lazy-reveal at 500px ─────────────────────────────── */}
              <LazySection threshold={1100} minHeight={1200}>
              <>

              {/* ── 10.8 ORIGINALS BANNER ────────────────────────────────────── */}
              {showAll && (
                <AnimatedSection anim={s[8]}>
                  <OriginalsBanner onPress={() => router.push("/streamings-all" as any)} accentColor={RED} />
                </AnimatedSection>
              )}

              {/* ── 10.9 GLASS FEATURED ──────────────────────────────────────── */}
              {showAll && pool_glass.length > 0 && (
                <AnimatedSection anim={s[8]}>
                  <GlassFeaturedCard
                    item={pool_glass[0]}
                    accent={PURPLE}
                    onPress={() => goTo(pool_glass[0])}
                  />
                </AnimatedSection>
              )}

              {/* ── 11. SÉRIES EM ALTA ───────────────────────────────────────── */}
              {showSeries && emAltaSeries.length > 0 && (
                <AnimatedSection anim={s[9]}>
                  <View style={styles.section}>
                    <GradientSectionHeader
                      title="Séries em Alta"
                      subtitle="Maratone agora"
                      accent={PURPLE}
                      icon="trending-up"
                      onSeeAll={() => browseTo("series", "Séries em Alta")}
                    />
                    <PosterRow items={emAltaSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 11.5 BINGE WORTHY ROW ────────────────────────────────────── */}
              {(showSeries || showAll) && series.length > 6 && (
                <AnimatedSection anim={s[9]}>
                  <View style={styles.section}>
                    <GradientSectionHeader
                      title="Para Maratonar"
                      subtitle="Séries completas esperando por você"
                      accent={GREEN}
                      icon="layers"
                      onSeeAll={() => browseTo("series", "Para Maratonar")}
                    />
                    <BingeWorthyRow items={series.slice(0, 8)} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 11.7 EDITOR PICK ─────────────────────────────────────────── */}
              {showAll && pool_editorPick.length > 0 && (
                <AnimatedSection anim={s[9]}>
                  <EditorPickBanner
                    item={pool_editorPick[0]}
                    editorName="Curadoria NETPLAY"
                    onPress={() => goTo(pool_editorPick[0])}
                  />
                </AnimatedSection>
              )}

              {/* ── 12. TOP 10 SÉRIES ────────────────────────────────────────── */}
              {(showTop10 || showSeries) && top10Series.length > 0 && (
                <AnimatedSection anim={s[10]}>
                  <View style={styles.section}>
                    <SectionHeader title="Top 10 Séries" icon="award"
                      badge="SEMANAL" accentColor={AMBER}
                      onSeeAll={() => browseTo("series", "Top 10 Séries", "rating_desc")} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }} decelerationRate="fast">
                      {top10Series.slice(0, 5).map((item, i) => (
                        <TopTenCard key={item.id} item={item} rank={i + 1}
                          onPress={() => goTo(item)} />
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              {/* ── 13. ANIMES ───────────────────────────────────────────────── */}
              {showAnimes && emAltaAnimes.length > 0 && (
                <>
                  <SectionDivider label="ANIMES" accentColor={AMBER} />
                  <AnimatedSection anim={s[11]}>
                    <View style={styles.section}>
                      <SectionHeader title="Animes em Alta" icon="star"
                        accentColor={AMBER}
                        onSeeAll={() => browseTo("animes", "Animes em Alta")} />
                      <PosterRow items={emAltaAnimes} onPress={goTo} />
                    </View>
                  </AnimatedSection>
                </>
              )}

              {/* ── 13.5. ANIMAÇÕES ──────────────────────────────────────────── */}
              {showAnimations && animations.length > 0 && (
                <>
                  <SectionDivider label="ANIMAÇÕES" accentColor="#f97316" />
                  <AnimatedSection anim={s[11]}>
                    <View style={styles.section}>
                      <SectionHeader title="Animações em Destaque" icon="film"
                        accentColor="#f97316"
                        onSeeAll={() => router.push({
                          pathname: "/genre-browse",
                          params: { genre_id: "16", type: "movie", title: "Animações" },
                        })} />
                      <PosterRow items={animations.slice(0, 10)} onPress={goTo} />
                    </View>
                  </AnimatedSection>
                  <AnimatedSection anim={s[11]}>
                    <View style={styles.section}>
                      <SectionHeader title="Mais Animações" icon="star"
                        accentColor="#f97316"
                        onSeeAll={() => router.push({
                          pathname: "/genre-browse",
                          params: { genre_id: "16", type: "movie", title: "Animações" },
                        })} />
                      <WideRow items={animations.slice(10, 18)} onPress={goTo} />
                    </View>
                  </AnimatedSection>
                </>
              )}

              {/* ── 13.8 AWARD WINNERS ROW ───────────────────────────────────── */}
              {showAll && pool_award.length > 0 && (
                <AnimatedSection anim={s[11]}>
                  <View style={styles.section}>
                    <GradientSectionHeader
                      title="Ganhadores do Oscar"
                      subtitle="Premiados pela academia"
                      accent={AMBER}
                      icon="award"
                      onSeeAll={() => openModal("Ganhadores do Oscar", pool_award, AMBER)}
                    />
                    <AwardWinnersRow items={pool_award} onPress={goTo} award="Oscar" />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 13.9 QUICK PLAY ROW ──────────────────────────────────────── */}
              {showAll && pool_quickPlay.length > 0 && (
                <AnimatedSection anim={s[11]}>
                  <View style={styles.section}>
                    <GradientSectionHeader
                      title="Assistir Agora"
                      subtitle="Aperte play e relaxe"
                      accent={TEAL}
                      icon="play-circle"
                      onSeeAll={() => openModal("Assistir Agora", pool_quickPlay, TEAL)}
                    />
                    <QuickPlayRow items={pool_quickPlay} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}


              {/* ── 15. FRANQUIAS ── círculos com logo sobre gradiente ──────── */}
              {(showAll || showMovies) && (
                <>
                  <SectionDivider label="FRANQUIAS" accentColor={INDIGO} />
                  <View style={styles.section}>
                    <SectionHeader title="Franquias" icon="layers"
                      subtitle="Sagas e universos cinematográficos"
                      accentColor={INDIGO}
                      onSeeAll={() => router.push("/(tabs)/franquias" as any)} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }} decelerationRate="fast">
                      {CURATED_FRANCHISES.map((f) => (
                        <FranchiseKnownCircleItem
                          key={f.id}
                          franchise={f}
                          onPress={() => router.push({
                            pathname: "/franchise",
                            params: { id: f.id, name: f.name },
                          })}
                        />
                      ))}
                    </ScrollView>
                  </View>
                </>
              )}

              {/* ── 16. EM CARTAZ (wide 16:9 landscape cards) ───────────────── */}
              {showMovies && nowPlayingItems.length > 0 && (
                <>
                  <SectionDivider label="LANÇAMENTOS" accentColor={ORANGE} />
                  <View style={styles.section}>
                    <SectionHeader title="Em Cartaz" icon="film"
                      badge="NOVO" accentColor={ORANGE}
                      subtitle="Últimos lançamentos no cinema"
                      onSeeAll={() => openModal("Em Cartaz", nowPlayingItems, ORANGE)} />
                    <WideRow items={nowPlayingItems} onPress={goTo} />
                  </View>
                </>
              )}

              {/* ── 17. EM DESTAQUE ESTA SEMANA (top-rated mix) ─────────────── */}
              {weeklyFeatured.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader
                    title="Em Destaque Esta Semana"
                    icon="star"
                    accentColor={AMBER}
                    onSeeAll={() => openModal("Em Destaque Esta Semana", weeklyFeatured, AMBER)}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
                    {weeklyFeatured.map((item) => (
                      <FeaturedCard key={item.id} item={item} onPress={() => goTo(item)} accentColor={AMBER} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── 18. SÉRIES MARATONA (tall portrait cards) ───────────────── */}
              {showSeries && pool_seriesMaraton.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader title="Séries para Maratonar" icon="play-circle"
                    accentColor={GREEN}
                    onSeeAll={() => openModal("Séries para Maratonar", pool_seriesMaraton, GREEN)} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
                    {pool_seriesMaraton.map((item) => (
                      <TallCard key={item.id} item={item} onPress={() => goTo(item)} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── 19. ESTREANDO NA TV (featured cards) ────────────────────── */}
              {showSeries && onTheAirItems.length > 0 && (
                <View style={styles.section}>
                  <SectionHeader title="Estreando na TV" icon="tv"
                    badge="AO VIVO" accentColor={TEAL}
                    subtitle="Séries que estão no ar agora"
                    onSeeAll={() => openModal("Estreando na TV", onTheAirItems, TEAL)} />
                  <FeaturedRow items={onTheAirItems.slice(0, 6)} onPress={goTo} accentColor={TEAL} />
                </View>
              )}

              {/* ── 20. EXPLORE POR HUMOR ───────────────────────────────────── */}
              {showAll && (
                <>
                  <SectionDivider label="EXPLORE" accentColor={PURPLE} />
                  <View style={styles.section}>
                    <SectionHeader title="Que Tal Assistir?" icon="zap"
                      subtitle="Escolha pelo seu humor"
                      accentColor={PURPLE} />
                    <MoodRowComp
                      moods={MOODS}
                      onPress={(m) => router.push({
                        pathname: "/genre-browse",
                        params: { genre_id: String(m.genreId), type: "movie", title: m.label },
                      })}
                    />
                  </View>
                </>
              )}

              {/* ── 21. GÊNEROS (circle icons) ──────────────────────────────── */}
              {showAll && (
                <View style={{ marginBottom: 28 }}>
                  <SectionHeader title="Gêneros" icon="grid"
                    subtitle="Explore por categoria"
                    accentColor={BLUE} />
                  <CircleGenreRow
                    genres={GENRE_CIRCLES}
                    onPress={(g) => router.push({
                      pathname: "/genre-browse",
                      params: { genre_id: String(g.id), type: "movie", title: g.label },
                    })}
                  />
                </View>
              )}

              {/* ── 22. ATORES EM DESTAQUE ───────────────────────────────────── */}
              {showAll && (
                <>
                  <SectionDivider label="TALENTOS" accentColor={AMBER} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 14 }}>
                    <View>
                      <Text style={{ fontSize: 18, fontWeight: "900", color: "#fff" }}>Atores em Destaque</Text>
                      <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Toque para explorar a filmografia</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push("/atores" as any)}
                      activeOpacity={0.75}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${AMBER}18`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: `${AMBER}40` }}
                    >
                      <Text style={{ color: AMBER, fontSize: 12, fontWeight: "700" }}>Ver tudo</Text>
                      <Feather name="chevron-right" size={13} color={AMBER} />
                    </TouchableOpacity>
                  </View>
                  <ActorCirclesRow
                    actors={ACTOR_CATEGORIES.flatMap(c => c.actors).slice(0, 14)}
                    onPress={(a) => router.push({ pathname: "/actor-browse", params: { name: a.name, color: a.color } })}
                  />
                  <View style={{ height: 24 }} />
                </>
              )}

              <LazySection threshold={1800} minHeight={400}>

              {/* ── 28. IMERSIVE HERO CARD ──────────────────────────────────── */}
              {showAll && pool_immersiveHero.length > 0 && (
                <FadeInSection delay={130}>
                  <SectionDivider label="SÉRIE DA SEMANA" accentColor={PURPLE} />
                  <GradientSectionHeader
                    title="Série em Destaque"
                    subtitle="Escolha da equipe NETPLAY"
                    icon="award"
                    accentColor={PURPLE}
                  />
                  <ImmersiveHeroCard
                    item={pool_immersiveHero[0]}
                    accent={PURPLE}
                    label="ESCOLHA DOS EDITORES"
                    onPress={() => goTo(pool_immersiveHero[0])}
                  />
                </FadeInSection>
              )}

              {/* ── 29. NOVO ESTA SEMANA ─────────────────────────────────────── */}
              {showAll && (pool_newWeekMovies.length > 0 || pool_newWeekSeries.length > 0) && (
                <FadeInSection delay={120}>
                  <SectionDivider label="NOVIDADES" accentColor={GREEN} />
                  <GradientSectionHeader
                    title="Novo Esta Semana"
                    subtitle="Adicionados recentemente"
                    icon="calendar"
                    accentColor={GREEN}
                    onSeeAll={() => openModal("Novo Esta Semana", [...pool_newWeekMovies, ...pool_newWeekSeries], GREEN)}
                  />
                  <NewThisWeekRow
                    items={[...pool_newWeekMovies, ...pool_newWeekSeries]}
                    onPress={goTo}
                  />
                </FadeInSection>
              )}

              {/* ── 30. MASONRY GRID ────────────────────────────────────────── */}
              {showAll && pool_masonry.length > 0 && (
                <FadeInSection delay={120}>
                  <SectionDivider label="DESCOBERTAS" accentColor={TEAL} />
                  <GradientSectionHeader
                    title="Descubra Mais"
                    subtitle="Seleção especial para você"
                    icon="grid"
                    accentColor={TEAL}
                  />
                  <MasonryRow
                    items={pool_masonry}
                    onPress={goTo}
                  />
                </FadeInSection>
              )}

              {/* ── 31. MINI BANNER TRIPLE ──────────────────────────────────── */}
              {showAll && (
                <FadeInSection delay={100}>
                  <MiniBannerTriple
                    banners={MINI_BANNERS}
                    onPress={(i) => {
                      if (i === 0) router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: "4K Ultra HD" } } as any);
                      else if (i === 1) router.push({ pathname: "/genre-browse", params: { genre_id: "18", type: "tv", title: "Série Maratona" } } as any);
                      else router.push("/novidades" as any);
                    }}
                  />
                </FadeInSection>
              )}

              {/* ── 35. NETPLAY EXCLUSIVOS ──────────────────────────────────── */}
              {showAll && (pool_netplayMovies.length > 0 || pool_netplaySeries.length > 0) && (
                <FadeInSection delay={140}>
                  <SectionDivider label="EXCLUSIVOS" accentColor={RED} />
                  <GradientSectionHeader
                    title="Destaques NETPLAY"
                    subtitle="Títulos em evidência"
                    icon="zap"
                    accentColor={RED}
                    onSeeAll={() => openModal("Destaques NETPLAY", [...pool_netplayMovies, ...pool_netplaySeries], RED)}
                  />
                  <NetplayExclusiveRow
                    items={[...pool_netplayMovies, ...pool_netplaySeries]}
                    onPress={goTo}
                  />
                  <View style={{ height: 20 }} />
                </FadeInSection>
              )}

              {/* ── 36. CATEGORY SHOWCASE (Filmes de Ação) ──────────────────── */}
              {showAll && pool_categoryShowcase.length > 0 && (
                <FadeInSection delay={130}>
                  <CategoryShowcaseCard
                    item={pool_categoryShowcase[0]}
                    categoryLabel="AÇÃO"
                    accent={ORANGE}
                    onPress={() => goTo(pool_categoryShowcase[0])}
                  />
                </FadeInSection>
              )}



              {/* ── 40. PREMIUM LARGE POSTER ROW (Séries Premium) ───────────── */}
              {showAll && pool_premiumSeries.length > 0 && (
                <FadeInSection delay={130}>
                  <SectionDivider label="SÉRIES PREMIUM" accentColor={PURPLE} />
                  <GradientSectionHeader
                    title="Séries Premium"
                    subtitle="Alta definição, alta qualidade"
                    icon="tv"
                    accentColor={PURPLE}
                    onSeeAll={() => openModal("Séries Premium", pool_premiumSeries, PURPLE)}
                  />
                  <PremiumLargePosterRow
                    items={pool_premiumSeries}
                    onPress={goTo}
                  />
                  <View style={{ height: 20 }} />
                </FadeInSection>
              )}

              </LazySection>

              {/* ── GENRE CAROUSELS (quando categoria específica selecionada) ── */}
              {!showAll && activeCategory !== "new" && activeCategory !== "top" && (() => {
                const accentColor = CATEGORY_ACCENT[activeCategory] ?? RED;
                const catGenres   = CATEGORY_GENRE_CONFIG[activeCategory] ?? [];

                // "Feito para você" — primeiros 12 itens do catálogo dessa categoria
                const forYou: ContentItem[] =
                  activeCategory === "movie"     ? movies.slice(0, 12)
                  : activeCategory === "tv"      ? series.slice(0, 12)
                  : activeCategory === "anime"   ? animes.slice(0, 12)
                  : activeCategory === "animation" ? animations.slice(0, 12)
                  : [];

                // Deduplicate across genre rows: each title appears only in the first row
                // that claims it — prevents popular items (multi-genre) from repeating.
                // Pre-seed with forYou items so they don't also appear in genre rows.
                const seenIds = new Set<number | string>();
                for (const item of forYou) { seenIds.add(item.tmdbId ?? item.id); }
                const dedupedGenreRows: Record<string, ContentItem[]> = {};
                for (const g of catGenres) {
                  const k = `${activeCategory}_${g.genreId}_${g.genreIds ?? ""}`;
                  const raw = genreRows[k] ?? [];
                  dedupedGenreRows[k] = raw.filter((item) => {
                    const uid = item.tmdbId ?? item.id;
                    if (seenIds.has(uid)) return false;
                    seenIds.add(uid);
                    return true;
                  });
                }

                return (
                  <>
                    {/* ── Banner da categoria ───────────────────────────────── */}
                    {(() => {
                      const featuredItem =
                        activeCategory === "movie" ? (movies[3] ?? movies[0])
                        : activeCategory === "tv"  ? (series[3] ?? series[0])
                        : activeCategory === "anime" ? (animes[3] ?? animes[0])
                        : activeCategory === "animation" ? (animations[3] ?? animations[0])
                        : null;
                      if (!featuredItem) return null;
                      const img = featuredItem.backdropPath ?? featuredItem.posterPath;
                      const catLabel =
                        activeCategory === "movie" ? "Filmes"
                        : activeCategory === "tv" ? "Séries"
                        : activeCategory === "anime" ? "Animes"
                        : "Animação";
                      return (
                        <View style={{ marginHorizontal: 16, marginBottom: 20, marginTop: 4, borderRadius: 16, overflow: "hidden" }}>
                          {img ? (
                            <Image source={{ uri: img }} style={{ width: "100%", height: 180, borderRadius: 16 }}
                              resizeMode="cover" />
                          ) : (
                            <LinearGradient colors={[accentColor + "66", "#000"]}
                              style={{ width: "100%", height: 180, borderRadius: 16 }} />
                          )}
                          <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.85)"]}
                            style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 100, borderRadius: 16, justifyContent: "flex-end", padding: 14 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <View style={{ backgroundColor: accentColor, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{catLabel.toUpperCase()}</Text>
                              </View>
                              <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                                {featuredItem.title}
                              </Text>
                            </View>
                            <TouchableOpacity onPress={() => goTo(featuredItem)}
                              style={{ marginTop: 8, backgroundColor: accentColor, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 18, alignSelf: "flex-start" }}>
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>▶ Assistir</Text>
                            </TouchableOpacity>
                          </LinearGradient>
                        </View>
                      );
                    })()}

                    {/* ── Feito para Você ──────────────────────────────────── */}
                    {forYou.length > 0 && (
                      <View style={styles.section}>
                        <SectionHeader title="Feito para Você" icon="heart"
                          accentColor={accentColor}
                          onSeeAll={() => openModal("Feito para Você", forYou, accentColor)} />
                        <PosterRow items={forYou.slice(0, 6)} onPress={goTo} />
                        {forYou.length > 6 && (
                          <TouchableOpacity onPress={() => openModal("Feito para Você", forYou, accentColor)}
                            style={{ alignSelf: "center", marginTop: 10, paddingVertical: 7, paddingHorizontal: 24,
                              borderRadius: 20, borderWidth: 1, borderColor: accentColor + "88" }}>
                            <Text style={{ color: accentColor, fontWeight: "600", fontSize: 13 }}>Ver Mais</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* ── Gêneros ───────────────────────────────────────────── */}
                    <SectionDivider label="GÊNEROS" accentColor={accentColor} />
                    {catGenres.map((genre) => {
                      const key   = `${activeCategory}_${genre.genreId}_${genre.genreIds ?? ""}`;
                      // Use deduplicated items — each title only appears in its first genre row
                      const rawLoaded = genreRows[key] !== undefined;
                      const items = dedupedGenreRows[key] ?? [];
                      const goToGenreBrowse = () => router.push({
                        pathname: "/genre-browse",
                        params: {
                          genre_id: String(genre.genreId),
                          genre_ids: genre.genreIds ?? "",
                          type: genre.type,
                          title: genre.label,
                        },
                      });
                      // Skip rows that had data but are empty after dedup (nothing unique left)
                      if (rawLoaded && items.length === 0) return null;
                      return (
                        <View key={key} style={styles.section}>
                          <SectionHeader
                            title={genre.label}
                            icon="film"
                            accentColor={genre.color}
                            onSeeAll={goToGenreBrowse} />
                          {items.length === 0 ? (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                              {[0,1,2,3,4,5].map((i) => (
                                <View key={i} style={{ width: 100, height: 148, borderRadius: 10,
                                  backgroundColor: "rgba(255,255,255,0.06)" }} />
                              ))}
                            </ScrollView>
                          ) : (
                            <>
                              <PosterRow items={items.slice(0, 6)} onPress={goTo} />
                              <TouchableOpacity
                                onPress={goToGenreBrowse}
                                style={{ alignSelf: "center", marginTop: 10, paddingVertical: 7,
                                  paddingHorizontal: 24, borderRadius: 20,
                                  borderWidth: 1, borderColor: genre.color + "88" }}>
                                <Text style={{ color: genre.color, fontWeight: "600", fontSize: 13 }}>Ver Mais</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      );
                    })}

                    <View style={{ height: 32 }} />
                  </>
                );
              })()}

              </>
              </LazySection>
              </>
              )}
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* ═══ HEADER ANIMADO ══════════════════════════════════════════════════ */}
      <Animated.View style={[styles.header, { paddingTop: topPad, top: 0 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, {
          backgroundColor: colors.background, opacity: headerOpacity,
          borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
        }]} />
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <View>
              <NetplayLogo
                netStyle={styles.logo}
                playStyle={styles.logoWhite}
              />
              {(prefetchPhase !== "idle" && prefetchPhase !== "done" && prefetchPhase !== "checking") ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <ActivityIndicator size="small" color="rgba(229,9,20,0.75)" style={{ transform: [{ scale: 0.6 }] }} />
                  <Text style={styles.syncLabel}>
                    {prefetchPhase === "movies" ? "Baixando filmes..." :
                     prefetchPhase === "series" ? "Baixando séries..." :
                     "Baixando animes..."}
                  </Text>
                </View>
              ) : !!timeAgoStr ? (
                <Text style={styles.cacheLabel}>{timeAgoStr}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.headerActions}>
            <NotificationBell onPress={() => router.push("/notification-history")} />
            <TouchableOpacity style={styles.iconBtn}
              onPress={() => router.push("/buscar")}
              activeOpacity={0.75}>
              <Feather name="search" size={21} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/profile")} activeOpacity={0.75}>
              {activeProfile?.avatarUrl ? (
                <Image source={{ uri: activeProfile.avatarUrl }}
                  style={{ width: 30, height: 30, borderRadius: 15 }} contentFit="cover" />
              ) : (
                <LinearGradient colors={[RED, "#b5060f"]} style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>
                    {(activeProfile?.name ?? user?.name ?? "N")[0]?.toUpperCase()}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ═══ SCROLL TO TOP ═══════════════════════════════════════════════════ */}
      <ScrollTopBtn scrollRef={scrollRef} visible={showScrollTop} />

      {/* ═══ VER MAIS MODAL ══════════════════════════════════════════════════ */}
      <VerMaisModal
        visible={verMaisModal.visible}
        title={verMaisModal.title}
        items={verMaisModal.items}
        accentColor={verMaisModal.accentColor}
        userId={user?.id ?? ""}
        onClose={closeModal}
        onItemPress={goTo}
      />
    </View>
  );
}

// ── STYLES ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:  { flex: 1 },
  body:       { marginTop: -12 },
  section:    { marginBottom: 32 },

  // Header
  header: {
    position: "absolute", left: 0, right: 0, zIndex: 10,
  },
  headerContent: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 8,
  },
  headerLeft:    { flexDirection: "row", alignItems: "flex-start" },
  cacheLabel:    { fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.3, marginTop: 1 },
  syncLabel:     { fontSize: 9, color: "rgba(229,9,20,0.75)",   letterSpacing: 0.3 },
  logo:          { fontSize: 23, fontWeight: "900", letterSpacing: 1.5 },
  logoWhite:     { fontSize: 23, fontWeight: "900", letterSpacing: 1.5, color: "#fff" },
  headerActions: { flexDirection: "row", gap: 4, alignItems: "center" },
  iconBtn:       { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  avatarCircle:  { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  avatarLetter:  { color: "#fff", fontSize: 13, fontWeight: "800" },

  // Search
  searchBar:     { paddingHorizontal: 16, marginBottom: 14, marginTop: 6 },
  searchInner:   {
    flexDirection: "row", alignItems: "center", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14, paddingVertical: 13, gap: 10,
  },
  searchIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(229,9,20,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  searchPlaceholder: { flex: 1, fontSize: 14, color: "rgba(255,255,255,0.32)" },
  searchMic:     {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  // Category pills
  pillsRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  categoryPill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1,
  },
  categoryPillText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.1 },

  // Streaming chips
  streamingRow: { paddingHorizontal: 16, gap: 10, alignItems: "center" },
  streamingChip: {
    borderRadius: 22, borderWidth: 1, width: 130, height: 94, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  streamingChipGrad: {
    flex: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  streamingGlow: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 22,
  },
  streamingLogoArea: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  streamingChipInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6 },
  streamingLogo: { width: "92%", height: 68, alignSelf: "center" },
  streamingName: { fontSize: 18, fontWeight: "900", letterSpacing: 0.5, textAlign: "center" },
  streamingTagline: { position: "absolute", bottom: 8, left: 0, right: 0, fontSize: 8, fontWeight: "700", letterSpacing: 1.5, textAlign: "center" },
  seeAllChip:    { borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", width: 94, height: 94, overflow: "hidden" },
  seeAllChipInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  seeAllChipText:  { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.4)" },

  // Stats banner
  statsBanner: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 28 },
  statPill: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden",
  },
  statValue: { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  statLabel: { fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: "500", marginTop: 1 },

  // Section header
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionLeft:   { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  accentBar:     { width: 3, height: 18, borderRadius: 2 },
  iconWrap:      { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle:  { fontSize: 17, fontWeight: "800", letterSpacing: -0.4, color: "#fff" },
  sectionSubtitle: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  seeAllText: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.4)" },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  dividerText: { fontSize: 9, fontWeight: "900", letterSpacing: 2 },

  // Poster card
  posterCard: {
    borderRadius: 12, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  posterFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600", marginTop: 6, textAlign: "center" },

  // Wide card
  wideCard: {
    width: 185, height: 108, borderRadius: 14, overflow: "hidden", marginRight: 0,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 7 },
    }),
  },
  wideBadge: {
    position: "absolute", top: 10, left: 10,
    backgroundColor: RED, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  wideBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  wideInfo:  { position: "absolute", bottom: 10, left: 12, right: 12 },
  wideTitle: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
  wideMeta:  { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },

  // Featured card
  featuredCard: {
    width: 148, height: 218, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  featuredInfo: { position: "absolute", bottom: 14, left: 12, right: 12, gap: 6 },
  featuredRatingBadge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  featuredRatingText: { fontSize: 10, fontWeight: "700" },
  featuredTitle: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.2, lineHeight: 17 },
  featuredPlay: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", alignSelf: "flex-start",
  },

  // Compact list item
  compactList: { paddingHorizontal: 16, gap: 0 },
  compactItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  compactRank:  { color: "rgba(255,255,255,0.2)", fontSize: 18, fontWeight: "900", width: 28, textAlign: "center" },
  compactThumb: { width: 56, height: 56, borderRadius: 10, overflow: "hidden" },
  compactInfo:  { flex: 1 },
  compactTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  compactMeta:  { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 3 },

  // Continue watching card
  continueCard: {
    width: 200, height: 115, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 7 },
    }),
  },
  continuePlayOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  continuePlayBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(229,9,20,0.9)", alignItems: "center", justifyContent: "center",
  },
  continueBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, gap: 5 },
  continueTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },
  progressBar: { height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2 },
  progressFill: { height: 3, borderRadius: 2 },

  // Spotlight banner
  spotPad:    { paddingHorizontal: 16, marginBottom: 28 },
  spotCard: {
    height: 190, borderRadius: 18, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18 },
      android: { elevation: 12 },
    }),
  },
  spotContent: { position: "absolute", bottom: 16, left: 18, right: 18, gap: 7 },
  spotLabel: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  spotLabelText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  spotTitle: {
    color: "#fff", fontSize: 21, fontWeight: "900", letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  spotMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  spotRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  spotRatingText: { color: AMBER, fontSize: 12, fontWeight: "700" },
  spotYear: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  spotType: { color: "rgba(255,255,255,0.45)", fontSize: 12 },
  spotPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start",
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9, marginTop: 2,
  },
  spotPlayText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  // Promo banner
  promoPad:   { paddingHorizontal: 16, marginBottom: 28 },
  promoCard:  { borderRadius: 18, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  promoContent: { flexDirection: "row", alignItems: "center", padding: 18, gap: 14 },
  promoIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
  },
  promoTitle:       { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  promoSub:         { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },
  promoAction:      { flexDirection: "row", alignItems: "center", gap: 4 },
  promoActionText:  { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Skeleton
  skeletonHeader: {
    height: 20, width: 160, borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 20, marginBottom: 14,
  },
  skeletonCard: {
    width: 118, height: 172, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  // Sync
  syncWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 20 },

  // Scroll top
  scrollTopBtn:  { position: "absolute", bottom: TAB_BAR_CLEARANCE + 16, right: 20, zIndex: 50 },
  scrollTopGrad: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: RED, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },

  // ── Continue Assistindo extras ────────────────────────────────────────────
  continueRemoveBtn: {
    position: "absolute", top: 6, right: 6, zIndex: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  continueEpBadge: {
    position: "absolute", top: 6, left: 8,
    backgroundColor: "rgba(229,9,20,0.88)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  continueEpText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  continueRemaining: {
    color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "500", marginTop: 3,
  },

  // ── Mood card ─────────────────────────────────────────────────────────────
  moodCard: {
    width: 110, height: 80, borderRadius: 16, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 4,
    borderWidth: 1, marginBottom: 4,
  },
  moodIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  moodLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.1 },

  // ── Circle genre ──────────────────────────────────────────────────────────
  circleGenre: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, overflow: "hidden",
  },
  circleLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.2, textAlign: "center" },

  // ── Square card (merged with tall + rating styles below) ──────────────────

  // ── Panoramic card ────────────────────────────────────────────────────────
  panoramicCard: {
    width: 240, height: 120, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 7 },
    }),
  },
  panoramicInfo: { position: "absolute", bottom: 12, left: 14, right: 40 },
  panoramicTitle: { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
  panoramicMeta: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },
  panoramicPlay: {
    position: "absolute", bottom: 12, right: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(229,9,20,0.85)",
    alignItems: "center", justifyContent: "center",
  },

  // ── Studio card ───────────────────────────────────────────────────────────
  studioCard: {
    width: 100, height: 90, borderRadius: 14, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1,
  },
  studioIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  studioLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3, textAlign: "center" },

  // ── Decade card ───────────────────────────────────────────────────────────
  decadeCard: {
    width: 120, height: 90, borderRadius: 16, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 4,
    borderWidth: 1,
  },
  decadeIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  decadeLabel: { fontSize: 12, fontWeight: "800" },

  // ── Film nation card ──────────────────────────────────────────────────────
  nationCard: {
    width: 90, height: 80, borderRadius: 14, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 4,
    borderWidth: 1,
  },
  nationFlagImg: { width: 36, height: 26, borderRadius: 4 },
  nationLabel: { fontSize: 10, fontWeight: "700" },

  // ── Cinematic banner ──────────────────────────────────────────────────────
  cinematicCard: {
    height: 270, borderRadius: 20, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.55, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  cinematicContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 20, gap: 8,
  },
  cinematicBadge: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  cinematicBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  cinematicTitle: {
    color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6,
  },
  cinematicMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  cinematicRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  cinematicRatingText: { color: "#f59e0b", fontSize: 12, fontWeight: "700" },
  cinematicYear: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  cinematicActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  cinematicPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  cinematicPlayText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  cinematicMoreBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  cinematicMoreText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700" },

  // ── Surprise banner — extra reveal styles ────────────────────────────────
  surpriseReveal: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    paddingHorizontal: 18, paddingTop: 0, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)",
    marginTop: 4,
  },
  surprisePosterWrap: { borderRadius: 10, overflow: "hidden" },
  surprisePoster: { width: 58, height: 84, borderRadius: 10 },
  surpriseRevealTitle: {
    color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: -0.2, lineHeight: 19,
  },
  surpriseRevealMeta: {
    color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "500",
  },
  surpriseRevealDesc: {
    color: "rgba(255,255,255,0.35)", fontSize: 11, lineHeight: 15,
  },
  surprisePlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: PURPLE, alignSelf: "flex-start",
  },
  surprisePlayText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // ── Originals banner ──────────────────────────────────────────────────────
  originalsCard: {
    borderRadius: 18, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#e50914", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 14 },
      android: { elevation: 10 },
    }),
  },
  originalsContent: {
    flexDirection: "row", alignItems: "center",
    padding: 18, gap: 14,
  },
  originalsBadge: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center", justifyContent: "center",
  },
  originalsBadgeText: { color: "#fff", fontSize: 22, fontWeight: "900", fontStyle: "italic" },
  originalsTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },
  originalsSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },

  // ── Surprise banner ───────────────────────────────────────────────────────
  surpriseCard: {
    borderRadius: 18, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#8b5cf6", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14 },
      android: { elevation: 9 },
    }),
  },
  surpriseContent: {
    flexDirection: "row", alignItems: "center",
    padding: 18, gap: 14,
  },
  surpriseIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(192,132,252,0.15)",
  },
  surpriseTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  surpriseSub: { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },
  surpriseBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  surpriseBtnText: { color: "#fff", fontSize: 12, fontWeight: "800" },

  // ── Countdown banner ──────────────────────────────────────────────────────
  countdownCard: {
    borderRadius: 16, overflow: "hidden",
    borderWidth: 1, padding: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  countdownContent: { gap: 8, flex: 1 },
  countdownBadge: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  countdownBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  countdownTitle: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: -0.2 },
  countdownTimer: { flexDirection: "row", alignItems: "center", gap: 4 },
  countdownSep: { fontSize: 18, fontWeight: "900" },
  countdownUnit: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    alignItems: "center", minWidth: 42,
  },
  countdownNum: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  countdownUnitLabel: { color: "rgba(255,255,255,0.4)", fontSize: 8, fontWeight: "600", marginTop: 1 },
  countdownNotifyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  countdownNotifyText: { fontSize: 11, fontWeight: "700" },

  // ── Genre matrix ──────────────────────────────────────────────────────────
  genreMatrixItem: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, overflow: "hidden",
    paddingHorizontal: 12, paddingVertical: 12,
  },
  genreMatrixLabel: { fontSize: 13, fontWeight: "700" },

  // ── Hot tags ──────────────────────────────────────────────────────────────
  hotTagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hotTag: {
    borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(229,9,20,0.3)",
    paddingHorizontal: 12, paddingVertical: 7,
  },
  hotTagText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },

  // ── Actor circles ─────────────────────────────────────────────────────────
  actorCircle: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, overflow: "hidden",
  },
  actorInitial: { fontSize: 18, fontWeight: "900" },
  actorName: { color: "rgba(255,255,255,0.65)", fontSize: 9, fontWeight: "600", textAlign: "center" },

  // ── Double feature ────────────────────────────────────────────────────────
  doubleItem: {
    height: 200, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  doubleTag: {
    position: "absolute", top: 10, left: 10,
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  doubleTagText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  doubleInfo: { position: "absolute", bottom: 12, left: 10, right: 10 },
  doubleTitle: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: -0.2, lineHeight: 16 },
  doubleMeta: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 3 },

  // ── Award banner ──────────────────────────────────────────────────────────
  awardCard: {
    height: 160, borderRadius: 18, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#f59e0b", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
  awardContent: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 18, gap: 6,
  },
  awardTrophies: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  awardTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  awardSub: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  awardPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
  },
  awardPlayText: { fontSize: 12, fontWeight: "800" },

  // ── Episode preview card ──────────────────────────────────────────────────
  episodeCard: {
    width: 210, height: 120, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 },
      android: { elevation: 7 },
    }),
  },
  epBadge: {
    position: "absolute", top: 10, left: 10,
    backgroundColor: "rgba(229,9,20,0.9)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  epBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  episodeInfo: { position: "absolute", bottom: 12, left: 14, right: 40 },
  episodeTitle: { color: "#fff", fontSize: 12, fontWeight: "800" },
  episodeMeta: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },
  episodePlayBtn: {
    position: "absolute", bottom: 12, right: 12,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(229,9,20,0.9)",
    alignItems: "center", justifyContent: "center",
  },

  // ── Family banner ─────────────────────────────────────────────────────────
  familyHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 16, padding: 16,
    ...Platform.select({
      ios: { shadowColor: "#22c55e", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
      android: { elevation: 6 },
    }),
  },
  familyEmoji: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(52,211,153,0.15)",
  },
  familyTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  familySub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 2 },
  familyBtn: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  familyBtnText: { color: "#fff", fontSize: 11, fontWeight: "800" },

  // ── Franchise banner (replaces circle) ───────────────────────────────────
  franchiseBanner: {
    width: 155, height: 100, borderRadius: 14,
    overflow: "hidden", backgroundColor: "#1a1a1a",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.5, shadowRadius: 10 },
      android: { elevation: 7 },
    }),
  },
  franchiseBannerAccent: {
    position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 3,
  },
  franchiseBannerLogoArea: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: 22,
  },
  franchiseBannerLogo: { width: 130, height: 50, zIndex: 2 },
  franchiseBannerText: {
    fontSize: 17, fontWeight: "900", textAlign: "center",
    letterSpacing: 1.5, lineHeight: 21, zIndex: 2,
  },
  franchiseBannerBottom: {
    position: "absolute", bottom: 7, left: 8, right: 8, zIndex: 3,
  },
  franchiseBannerBadge: {
    alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  franchiseBannerBadgeText: { fontSize: 9, fontWeight: "800" },
  franchiseCircle: {
    width: 82, height: 82, borderRadius: 41,
    overflow: "hidden", backgroundColor: "#1a1a1a",
    alignItems: "center", justifyContent: "center",
  },
  franchiseLogoImg: { width: 60, height: 34, zIndex: 2 },
  franchiseCircleRing: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 41, borderWidth: 2,
    borderColor: "rgba(99,102,241,0.55)",
  },
  franchiseCircleLabel: {
    color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "600",
    textAlign: "center", lineHeight: 13, maxWidth: 155,
  },

  // ── Square card (1:1) ─────────────────────────────────────────────────────
  squareCard: {
    width: 130, height: 130, borderRadius: 14,
    overflow: "hidden", backgroundColor: "#1a1a1a",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 5 },
    }),
  },
  squareInfo: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, gap: 3,
  },
  squareRating: {
    flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2,
  },
  squareRatingText: { fontSize: 8, fontWeight: "700" },
  squareTitle: { color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 13 },
  squareMeta: { color: "rgba(255,255,255,0.4)", fontSize: 9 },

  // ── Tall portrait card ────────────────────────────────────────────────────
  tallCard: {
    width: 100, height: 186, borderRadius: 12,
    overflow: "hidden", backgroundColor: "#1a1a1a",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 5 },
    }),
  },
  tallInfo: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 7, gap: 3,
  },
  tallRating: { flexDirection: "row", alignItems: "center", gap: 2 },
  tallRatingText: { color: "#f59e0b", fontSize: 8, fontWeight: "700" },
  tallTitle: { color: "#fff", fontSize: 9, fontWeight: "700", lineHeight: 12 },
});
