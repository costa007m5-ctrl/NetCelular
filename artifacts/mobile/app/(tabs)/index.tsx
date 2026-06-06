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
import { TopTenCard } from "@/components/TopTenCard";
import { SyncBar } from "@/components/SyncBar";
import { NotificationBell } from "@/components/NotificationBell";
import { r2Route } from "@/lib/r2-direct";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { HERO_ITEMS } from "@/constants/content";
import { MAIN_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";

const TAB_BAR_CLEARANCE = 120;
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
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const flix2ToContent = (item: any): ContentItem => {
  const isMovie = item.type === "filme" || item.type === "movie";
  return {
    id: String(item.tmdb_id || item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? "",
    year: Number(item.year) || 2024,
    rating: parseFloat(item.rating ?? "0") || 0,
    posterPath: item.poster ?? "",
    backdropPath: item.backdrop ?? item.poster ?? "",
    description: item.synopsis ?? "",
    genres: [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
};

// ── MINI COMPONENTS ────────────────────────────────────────────────────────────

// Standard poster card
function PosterCard({ item, onPress, width = 118, height = 172, showTitle = false }: {
  item: ContentItem; onPress: () => void;
  width?: number; height?: number; showTitle?: boolean;
}) {
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
        </View>
        {showTitle && (
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Wide landscape card
function WideCard({ item, onPress, badge }: {
  item: ContentItem; onPress: () => void; badge?: string;
}) {
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
      </Animated.View>
    </Pressable>
  );
}

// Large featured card with gradient and rating
function FeaturedCard({ item, onPress, accentColor = RED }: {
  item: ContentItem; onPress: () => void; accentColor?: string;
}) {
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
function ContinueCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const progress = item.progress ?? 0;
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
        </View>
      </Animated.View>
    </Pressable>
  );
}

// Streaming platform chip
function StreamingChip({ platform, onPress }: { platform: StreamingPlatform; onPress: () => void }) {
  const [err, setErr] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const logoUrl = platform.logoPath ? `https://image.tmdb.org/t/p/w185${platform.logoPath}` : null;
  const pressIn  = () => Animated.spring(scale, { toValue: 0.91, useNativeDriver: true, speed: 28 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[styles.streamingChip, { transform: [{ scale }] }]}>
        <LinearGradient colors={platform.bgGradient} style={styles.streamingChipGrad}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={[styles.streamingAccent, { backgroundColor: platform.brandColor }]} />
          {logoUrl && !err ? (
            <Image source={{ uri: logoUrl }} style={styles.streamingLogo}
              contentFit="contain" onError={() => setErr(true)} cachePolicy="memory-disk" />
          ) : (
            <Text style={[styles.streamingName, { color: platform.brandColor }]} numberOfLines={1}>
              {platform.name.split(" ")[0]}
            </Text>
          )}
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
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.1)" },
        { transform: [{ scale }] },
      ]}>
        <Text style={[styles.categoryPillText, { color: active ? "#fff" : "rgba(255,255,255,0.5)" }]}>
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
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLeft}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        {icon && (
          <View style={[styles.iconWrap, { backgroundColor: `${accentColor}18` }]}>
            <Feather name={icon} size={13} color={accentColor} />
          </View>
        )}
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
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

// Animated section wrapper — fades + slides up on mount
function AnimatedSection({ anim, children }: { anim: Animated.Value; children: React.ReactNode }) {
  const opacity    = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// Promo action banner
function PromoBanner({ title, subtitle, actionLabel, onPress, gradient, icon }: {
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
}

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
    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
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
      {items.slice(0, 6).map((item) => (
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
      {items.slice(0, 6).map((item) => (
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

// ── MAIN SCREEN ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "all",   label: "Tudo" },
  { id: "movie", label: "Filmes" },
  { id: "tv",    label: "Séries" },
  { id: "anime", label: "Animes" },
  { id: "new",   label: "Novidades" },
  { id: "top",   label: "Top 10" },
];

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
  const [syncProgress, setSyncProgress]   = useState(2);
  const [showSync, setShowSync]           = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [heroItems, setHeroItems]         = useState<ContentItem[]>(HERO_ITEMS);
  const [movies, setMovies]               = useState<ContentItem[]>([]);
  const [series, setSeries]               = useState<ContentItem[]>([]);
  const [animes, setAnimes]               = useState<ContentItem[]>([]);
  const [top10Movies, setTop10Movies]     = useState<ContentItem[]>([]);
  const [top10Series, setTop10Series]     = useState<ContentItem[]>([]);
  const [totals, setTotals]               = useState({ movies: 0, series: 0, animes: 0 });
  const [continueItems, setContinueItems] = useState<ContentItem[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);

  // ── section entrance animations (28 sections) ────────────────────────────
  const SECTION_COUNT = 28;
  const sectionAnims = useRef(
    Array.from({ length: SECTION_COUNT }, () => new Animated.Value(0))
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

  // ── pulse animation ──────────────────────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 900,  useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900,  useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── stagger entrance animations after load ────────────────────────────────
  const startEntranceAnims = useCallback(() => {
    Animated.stagger(
      90,
      sectionAnims.map((anim) =>
        Animated.timing(anim, { toValue: 1, duration: 480, useNativeDriver: true })
      )
    ).start();
  }, []);

  // ── sync bar ──────────────────────────────────────────────────────────────
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

  // ── profile ───────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("netplay_active_profile_v2")
      .then((raw) => { if (raw) setActiveProfile(JSON.parse(raw)); })
      .catch(() => {});
  }, [user?.id]);

  // ── continue watching ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured) return;
    db.progress.getAll(user.id).then((items) =>
      setContinueItems(items.map((p: any) => ({
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
    ).catch(() => {});
  }, [user?.id]);

  // ── load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const fetchSample = async (type: string) => {
        const [p1, p2] = await Promise.allSettled([
          r2Route<{ success: boolean; pagination: any; data: any[] }>(`/flix2/catalog?type=${type}&page=1`),
          r2Route<{ success: boolean; pagination: any; data: any[] }>(`/flix2/catalog?type=${type}&page=2`),
        ]);
        const items: any[] = [];
        for (const r of [p1, p2]) {
          if (r.status === "fulfilled" && r.value.success) items.push(...(r.value.data ?? []));
        }
        const total = p1.status === "fulfilled" && p1.value.success
          ? (p1.value.pagination?.total_count ?? items.length) : items.length;
        return { items, total };
      };

      const [movRes, serRes, aniRes] = await Promise.allSettled([
        fetchSample("movies"),
        fetchSample("series"),
        fetchSample("animes"),
      ]);

      if (movRes.status === "fulfilled") {
        const m = movRes.value.items.filter((i: any) => i.tmdb_id > 0 && i.poster).map(flix2ToContent);
        setMovies(m);
        const heroPool = m.filter((x) => x.posterPath);
        if (heroPool.length >= 2) setHeroItems(heroPool.slice(0, 6));
        setTop10Movies(m.slice(0, 10));
        setTotals((t) => ({ ...t, movies: movRes.value.total }));
      }
      if (serRes.status === "fulfilled") {
        const s = serRes.value.items.filter((i: any) => i.tmdb_id > 0).map(flix2ToContent);
        setSeries(s);
        setTop10Series(s.slice(0, 10));
        setTotals((t) => ({ ...t, series: serRes.value.total }));
      }
      if (aniRes.status === "fulfilled") {
        const a = aniRes.value.items.filter((i: any) => i.tmdb_id > 0).map(flix2ToContent);
        setAnimes(a);
        setTotals((t) => ({ ...t, animes: aniRes.value.total }));
      }
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
      setTimeout(startEntranceAnims, 100);
    }
  }, [startEntranceAnims]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    sectionAnims.forEach((a) => a.setValue(0));
    loadData();
  }, [loadData]);

  // ── navigation ────────────────────────────────────────────────────────────
  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  }, [router]);

  const browseTo = useCallback((type: string, title: string) => {
    router.push({ pathname: "/genre-browse", params: { genre_id: "0", type, title } });
  }, [router]);

  // ── derived slices (sections use different offsets for variety) ───────────
  const emAltaMovies   = useMemo(() => movies.slice(0, 6),   [movies]);
  const lancamentos    = useMemo(() => movies.slice(6, 12),  [movies]);
  const acaoMovies     = useMemo(() => movies.slice(2, 8),   [movies]);
  const dramaMovies    = useMemo(() => movies.slice(8, 14),  [movies]);
  const comediaMovies  = useMemo(() => movies.slice(14, 20), [movies]);
  const terrorMovies   = useMemo(() => movies.slice(4, 10),  [movies]);
  const scifiMovies    = useMemo(() => movies.slice(10, 16), [movies]);
  const paraVoce       = useMemo(() => movies.slice(12, 18), [movies]);
  const internMovies   = useMemo(() => movies.slice(16, 22), [movies]);
  const premiadosM     = useMemo(() => movies.slice(20, 26), [movies]);

  const emAltaSeries   = useMemo(() => series.slice(0, 6),   [series]);
  const dramasSeries   = useMemo(() => series.slice(6, 12),  [series]);
  const thrillerSeries = useMemo(() => series.slice(4, 10),  [series]);
  const miniSeries     = useMemo(() => series.slice(12, 18), [series]);
  const franquias      = useMemo(() => series.slice(2, 8),   [series]);
  const internSeries   = useMemo(() => series.slice(16, 22), [series]);

  const emAltaAnimes   = useMemo(() => animes.slice(0, 6),  [animes]);
  const animacaoRow    = useMemo(() => animes.slice(6, 12), [animes]);
  const aventuraAnimes = useMemo(() => animes.slice(3, 9),  [animes]);

  const spotlightMovie  = useMemo(() => movies[3]  ?? null, [movies]);
  const spotlightSeries = useMemo(() => series[4]  ?? null, [series]);
  const spotlightAnime  = useMemo(() => animes[2]  ?? null, [animes]);

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
            listener: (e: any) => setShowScrollTop(e.nativeEvent.contentOffset.y > 700),
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
        {/* ── 1. HERO BANNER ─────────────────────────────────────────────── */}
        <Animated.View style={{ transform: [{ translateY: heroParallax }] }}>
          <HeroBanner
            items={heroItems.length > 0 ? heroItems : HERO_ITEMS}
            onItemPress={goTo}
          />
        </Animated.View>

        <View style={styles.body}>
          {/* ── 2. SEARCH BAR ──────────────────────────────────────────────── */}
          <AnimatedSection anim={s[0]}>
            <Pressable onPress={() => router.push("/(tabs)/search")}
              style={({ pressed }) => [styles.searchBar, { opacity: pressed ? 0.85 : 1 }]}>
              <LinearGradient colors={["rgba(255,255,255,0.07)","rgba(255,255,255,0.03)"]}
                style={styles.searchInner}>
                <View style={styles.searchIconWrap}>
                  <Feather name="search" size={15} color={RED} />
                </View>
                <Text style={styles.searchPlaceholder}>Buscar filmes, séries, atores...</Text>
                <View style={styles.searchMic}>
                  <Feather name="mic" size={13} color="rgba(255,255,255,0.35)" />
                </View>
              </LinearGradient>
            </Pressable>
          </AnimatedSection>

          {/* ── 3. CATEGORY PILLS ──────────────────────────────────────────── */}
          <AnimatedSection anim={s[1]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsRow} style={{ marginBottom: 18 }}>
              {CATEGORIES.map((cat) => (
                <CategoryPill key={cat.id} label={cat.label}
                  active={activeCategory === cat.id}
                  onPress={() => setActiveCategory(cat.id)} />
              ))}
            </ScrollView>
          </AnimatedSection>

          {/* ── 4. STREAMING PLATFORMS ─────────────────────────────────────── */}
          <AnimatedSection anim={s[2]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.streamingRow} style={{ marginBottom: 24 }}
              decelerationRate="fast">
              {MAIN_PLATFORMS.slice(0, 7).map((p) => (
                <StreamingChip key={p.id} platform={p}
                  onPress={() => router.push({ pathname: "/streaming", params: { id: p.id } })} />
              ))}
              <Pressable onPress={() => router.push("/streamings-all")} style={styles.seeAllChip}>
                <LinearGradient colors={["rgba(255,255,255,0.06)","rgba(255,255,255,0.02)"]}
                  style={styles.seeAllChipInner}>
                  <Feather name="grid" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.seeAllChipText}>Todos</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
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
              {/* ── 5. STATS BANNER ──────────────────────────────────────────── */}
              <AnimatedSection anim={s[3]}>
                <StatsBanner stats={stats} />
              </AnimatedSection>

              {/* ── 6. CONTINUE ASSISTINDO ───────────────────────────────────── */}
              {continueItems.length > 0 && (
                <AnimatedSection anim={s[4]}>
                  <SectionHeader title="Continue Assistindo" icon="play"
                    accentColor={GREEN} subtitle="Retome de onde parou"
                    onSeeAll={() => router.push("/(tabs)/list")} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
                    {continueItems.slice(0, 6).map((item) => (
                      <ContinueCard key={item.id} item={item} onPress={() => goTo(item)} />
                    ))}
                  </ScrollView>
                </AnimatedSection>
              )}

              {/* ── 7. EM ALTA AGORA ─────────────────────────────────────────── */}
              {emAltaMovies.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader title="Em Alta Agora" icon="trending-up"
                      badge="AO VIVO" accentColor={RED}
                      onSeeAll={() => browseTo("movie", "Em Alta")} />
                    <PosterRow items={emAltaMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 8. SPOTLIGHT — FILME DESTAQUE ────────────────────────────── */}
              {spotlightMovie && (
                <AnimatedSection anim={s[6]}>
                  <SpotlightBanner item={spotlightMovie} label="DESTAQUE DO DIA"
                    onPress={() => goTo(spotlightMovie)} accentColor={RED} />
                </AnimatedSection>
              )}

              {/* ── 9. TOP 10 FILMES ─────────────────────────────────────────── */}
              {top10Movies.length > 0 && (
                <AnimatedSection anim={s[7]}>
                  <View style={styles.section}>
                    <SectionHeader title="Top 10 Filmes" icon="award"
                      badge="SEMANAL" accentColor={AMBER}
                      onSeeAll={() => browseTo("movie", "Top 10 Filmes")} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }} decelerationRate="fast">
                      {top10Movies.map((item, i) => (
                        <TopTenCard key={item.id} item={item} rank={i + 1}
                          onPress={() => goTo(item)} />
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              {/* ── 10. LANÇAMENTOS DA SEMANA ────────────────────────────────── */}
              {lancamentos.length > 0 && (
                <AnimatedSection anim={s[8]}>
                  <View style={styles.section}>
                    <SectionHeader title="Lançamentos da Semana" icon="zap"
                      accentColor={GREEN}
                      onSeeAll={() => router.push("/(tabs)/novidades")} />
                    <WideRow items={lancamentos} onPress={goTo}
                      badgeFn={() => "NOVO"} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 11. PROMO — EXPLORAR SÉRIES ──────────────────────────────── */}
              <AnimatedSection anim={s[9]}>
                <PromoBanner
                  icon="tv"
                  title="Maratone Séries"
                  subtitle="Centenas de séries para você assistir"
                  actionLabel="Explorar"
                  onPress={() => router.push("/(tabs)/descobrir")}
                  gradient={[PURPLE, INDIGO]}
                />
              </AnimatedSection>

              {/* ── 12. SÉRIES EM ALTA ───────────────────────────────────────── */}
              {emAltaSeries.length > 0 && (
                <AnimatedSection anim={s[10]}>
                  <View style={styles.section}>
                    <SectionHeader title="Séries em Alta" icon="trending-up"
                      accentColor={PURPLE}
                      onSeeAll={() => browseTo("tv", "Séries em Alta")} />
                    <PosterRow items={emAltaSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="SÉRIES" accentColor={PURPLE} />

              {/* ── 13. TOP 10 SÉRIES ────────────────────────────────────────── */}
              {top10Series.length > 0 && (
                <AnimatedSection anim={s[11]}>
                  <View style={styles.section}>
                    <SectionHeader title="Top 10 Séries" icon="award"
                      badge="SEMANAL" accentColor={AMBER}
                      onSeeAll={() => browseTo("tv", "Top 10 Séries")} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }} decelerationRate="fast">
                      {top10Series.map((item, i) => (
                        <TopTenCard key={item.id} item={item} rank={i + 1}
                          onPress={() => goTo(item)} />
                      ))}
                    </ScrollView>
                  </View>
                </AnimatedSection>
              )}

              {/* ── 14. SPOTLIGHT — SÉRIE DESTAQUE ───────────────────────────── */}
              {spotlightSeries && (
                <AnimatedSection anim={s[12]}>
                  <SpotlightBanner item={spotlightSeries} label="SERIE DA SEMANA"
                    onPress={() => goTo(spotlightSeries)} accentColor={PURPLE} />
                </AnimatedSection>
              )}

              {/* ── 15. AÇÃO & AVENTURA ──────────────────────────────────────── */}
              {acaoMovies.length > 0 && (
                <AnimatedSection anim={s[13]}>
                  <View style={styles.section}>
                    <SectionHeader title="Ação & Aventura" icon="zap"
                      accentColor={ORANGE}
                      onSeeAll={() => browseTo("movie", "Ação & Aventura")} />
                    <WideRow items={acaoMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 16. DRAMA ────────────────────────────────────────────────── */}
              {dramaMovies.length > 0 && (
                <AnimatedSection anim={s[14]}>
                  <View style={styles.section}>
                    <SectionHeader title="Drama" icon="heart"
                      accentColor={PINK}
                      onSeeAll={() => browseTo("movie", "Drama")} />
                    <PosterRow items={dramaMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 17. PROMO — MINHA LISTA ──────────────────────────────────── */}
              <AnimatedSection anim={s[15]}>
                <PromoBanner
                  icon="bookmark"
                  title="Minha Lista Pessoal"
                  subtitle="Salve filmes e séries para assistir depois"
                  actionLabel="Ver lista"
                  onPress={() => router.push("/(tabs)/list")}
                  gradient={[TEAL, "#0e7490"]}
                />
              </AnimatedSection>

              {/* ── 18. DRAMAS DE SÉRIE ──────────────────────────────────────── */}
              {dramasSeries.length > 0 && (
                <AnimatedSection anim={s[16]}>
                  <View style={styles.section}>
                    <SectionHeader title="Dramas Envolventes" icon="heart"
                      accentColor={PINK}
                      onSeeAll={() => browseTo("tv", "Dramas")} />
                    <FeaturedRow items={dramasSeries} onPress={goTo} accentColor={PINK} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 19. ANIMES ───────────────────────────────────────────────── */}
              {emAltaAnimes.length > 0 && (
                <>
                  <SectionDivider label="ANIMES" accentColor={AMBER} />
                  <AnimatedSection anim={s[17]}>
                    <View style={styles.section}>
                      <SectionHeader title="Animes em Alta" icon="star"
                        accentColor={AMBER}
                        onSeeAll={() => browseTo("tv", "Animes")} />
                      <PosterRow items={emAltaAnimes} onPress={goTo} />
                    </View>
                  </AnimatedSection>
                </>
              )}

              {/* ── 20. SPOTLIGHT ANIME ──────────────────────────────────────── */}
              {spotlightAnime && (
                <AnimatedSection anim={s[18]}>
                  <SpotlightBanner item={spotlightAnime} label="ANIME DESTAQUE"
                    onPress={() => goTo(spotlightAnime)} accentColor={AMBER} />
                </AnimatedSection>
              )}

              {/* ── 21. COMÉDIA ──────────────────────────────────────────────── */}
              {comediaMovies.length > 0 && (
                <AnimatedSection anim={s[18]}>
                  <View style={styles.section}>
                    <SectionHeader title="Comédia" icon="smile"
                      accentColor={GREEN}
                      onSeeAll={() => browseTo("movie", "Comédia")} />
                    <PosterRow items={comediaMovies} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 22. TERROR & SUSPENSE ────────────────────────────────────── */}
              {terrorMovies.length > 0 && (
                <AnimatedSection anim={s[19]}>
                  <View style={styles.section}>
                    <SectionHeader title="Terror & Suspense" icon="eye"
                      accentColor="#dc2626"
                      onSeeAll={() => browseTo("movie", "Terror")} />
                    <FeaturedRow items={terrorMovies} onPress={goTo} accentColor="#dc2626" />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 23. THRILLER SÉRIES ──────────────────────────────────────── */}
              {thrillerSeries.length > 0 && (
                <AnimatedSection anim={s[20]}>
                  <View style={styles.section}>
                    <SectionHeader title="Thriller & Crime" icon="shield"
                      accentColor={INDIGO}
                      onSeeAll={() => browseTo("tv", "Thriller")} />
                    <WideRow items={thrillerSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 24. PROMO — ACERVO ───────────────────────────────────────── */}
              <AnimatedSection anim={s[21]}>
                <PromoBanner
                  icon="archive"
                  title="Acervo Completo"
                  subtitle="Explore todo o catálogo disponível"
                  actionLabel="Explorar"
                  onPress={() => router.push("/(tabs)/franquias")}
                  gradient={["#1e1b4b", INDIGO]}
                />
              </AnimatedSection>

              {/* ── 25. FICÇÃO CIENTÍFICA ────────────────────────────────────── */}
              {scifiMovies.length > 0 && (
                <AnimatedSection anim={s[22]}>
                  <View style={styles.section}>
                    <SectionHeader title="Ficção Científica" icon="cpu"
                      accentColor={BLUE}
                      onSeeAll={() => browseTo("movie", "Ficção Científica")} />
                    <WideRow items={scifiMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 26. ANIMAÇÃO ─────────────────────────────────────────────── */}
              {animacaoRow.length > 0 && (
                <AnimatedSection anim={s[22]}>
                  <View style={styles.section}>
                    <SectionHeader title="Animações" icon="film"
                      accentColor="#f97316"
                      onSeeAll={() => browseTo("tv", "Animações")} />
                    <PosterRow items={animacaoRow} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 27. FRANQUIAS & UNIVERSOS ────────────────────────────────── */}
              {franquias.length > 0 && (
                <AnimatedSection anim={s[23]}>
                  <View style={styles.section}>
                    <SectionHeader title="Franquias & Universos" icon="layers"
                      accentColor={AMBER}
                      onSeeAll={() => router.push("/(tabs)/franquias")} />
                    <FeaturedRow items={franquias} onPress={goTo} accentColor={AMBER} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 28. MAIS BEM AVALIADOS ───────────────────────────────────── */}
              {premiadosM.length > 0 && (
                <AnimatedSection anim={s[24]}>
                  <View style={styles.section}>
                    <SectionHeader title="Mais Bem Avaliados" icon="award"
                      badge="PREMIADOS" accentColor={AMBER}
                      onSeeAll={() => browseTo("movie", "Premiados")} />
                    <PosterRow items={premiadosM} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 29. PARA VOCÊ ────────────────────────────────────────────── */}
              {paraVoce.length > 0 && (
                <AnimatedSection anim={s[24]}>
                  <View style={styles.section}>
                    <SectionHeader title="Selecionado para Você" icon="heart"
                      accentColor={PINK}
                      onSeeAll={() => browseTo("movie", "Para Você")} />
                    <PosterRow items={paraVoce} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 30. MINI-SÉRIES ──────────────────────────────────────────── */}
              {miniSeries.length > 0 && (
                <AnimatedSection anim={s[25]}>
                  <View style={styles.section}>
                    <SectionHeader title="Mini-Séries" icon="tv"
                      accentColor={TEAL}
                      onSeeAll={() => browseTo("tv", "Mini-Séries")} />
                    <CompactRow items={miniSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 31. AVENTURA ANIMES ──────────────────────────────────────── */}
              {aventuraAnimes.length > 0 && (
                <AnimatedSection anim={s[25]}>
                  <View style={styles.section}>
                    <SectionHeader title="Aventura & Fantasia" icon="compass"
                      accentColor="#f97316"
                      onSeeAll={() => browseTo("tv", "Aventura")} />
                    <WideRow items={aventuraAnimes} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 32. INTERNACIONAL ────────────────────────────────────────── */}
              {internMovies.length > 0 && (
                <AnimatedSection anim={s[26]}>
                  <View style={styles.section}>
                    <SectionHeader title="Cinema Internacional" icon="globe"
                      accentColor={TEAL}
                      onSeeAll={() => browseTo("movie", "Internacional")} />
                    <FeaturedRow items={internMovies} onPress={goTo} accentColor={TEAL} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 33. SÉRIES INTERNACIONAIS ────────────────────────────────── */}
              {internSeries.length > 0 && (
                <AnimatedSection anim={s[26]}>
                  <View style={styles.section}>
                    <SectionHeader title="Séries Internacionais" icon="globe"
                      accentColor={BLUE}
                      onSeeAll={() => browseTo("tv", "Internacional")} />
                    <PosterRow items={internSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 34. PROMO FINAL ───────────────────────────────────────────── */}
              <AnimatedSection anim={s[27]}>
                <PromoBanner
                  icon="download"
                  title="Baixe e Assista Offline"
                  subtitle="Salve conteúdos para assistir sem internet"
                  actionLabel="Downloads"
                  onPress={() => router.push("/(tabs)/downloads")}
                  gradient={["#134e4a", "#0f766e"]}
                />
              </AnimatedSection>
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
            <Text style={[styles.logo, { color: RED }]}>NET</Text>
            <Text style={[styles.logoWhite]}>PLAY</Text>
          </View>
          <View style={styles.headerActions}>
            <NotificationBell onPress={() => router.push("/(tabs)/profile")} />
            <TouchableOpacity style={styles.iconBtn}
              onPress={() => router.push("/(tabs)/search")} activeOpacity={0.75}>
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

      {/* ═══ SYNC BAR ════════════════════════════════════════════════════════ */}
      {showSync && (
        <View style={[styles.syncWrap, { top: topPad + 50 }]}>
          <SyncBar progress={Math.min(syncProgress, 100)} visible={showSync} />
        </View>
      )}

      {/* ═══ SCROLL TO TOP ═══════════════════════════════════════════════════ */}
      <ScrollTopBtn scrollRef={scrollRef} visible={showScrollTop} />
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
  headerLeft:    { flexDirection: "row", alignItems: "center" },
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
  streamingRow: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  streamingChip: {
    borderRadius: 12, overflow: "hidden", width: 104, height: 58,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 5 },
    }),
  },
  streamingChipGrad: { flex: 1, alignItems: "center", justifyContent: "center", padding: 6 },
  streamingAccent: {
    position: "absolute", top: 0, left: 0, right: 0, height: 2.5,
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
  },
  streamingLogo: { width: 88, height: 36 },
  streamingName: { fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  seeAllChip:    { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", width: 82, height: 58, overflow: "hidden" },
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
});
