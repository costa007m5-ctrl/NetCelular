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
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { getAllLocalProgress, clearLocalProgress } from "@/hooks/useWatchProgress";
import type { WatchEntry } from "@/hooks/useWatchProgress";
import { HeroBanner } from "@/components/HeroBanner";
import { TopTenCard } from "@/components/TopTenCard";
import { NotificationBell } from "@/components/NotificationBell";
import { SearchTriggerBar } from "@/components/SearchTriggerBar";
import { r2Route } from "@/lib/r2-direct";
import { checkCatalogWatchAndNotify } from "@/lib/catalog-watch";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { ContentItem } from "@/constants/content";
import { MAIN_PLATFORMS } from "@/constants/streamings";
import type { StreamingPlatform } from "@/constants/streamings";
import { preloadImages, clearPreloadQueue } from "@/lib/image-preloader";

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
    <View style={[styles.sectionHeader, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[`${accentColor}28`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={styles.sectionLeft}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        {icon && (
          <View style={[styles.iconWrap, { backgroundColor: `${accentColor}18` }]}>
            <Feather name={icon} size={13} color={accentColor} />
          </View>
        )}
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

const COUNTRIES = [
  { id: "BR", label: "Brasil",      flagCode: "br", color: "#22c55e" },
  { id: "US", label: "EUA",         flagCode: "us", color: "#3b82f6" },
  { id: "KR", label: "Coreia",      flagCode: "kr", color: "#ec4899" },
  { id: "JP", label: "Japão",       flagCode: "jp", color: "#e50914" },
  { id: "GB", label: "Reino Unido", flagCode: "gb", color: "#8b5cf6" },
  { id: "FR", label: "França",      flagCode: "fr", color: "#f59e0b" },
  { id: "IT", label: "Itália",      flagCode: "it", color: "#f97316" },
  { id: "ES", label: "Espanha",     flagCode: "es", color: "#dc2626" },
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
  const pi = () => Animated.spring(sc, { toValue: 0.88, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.moodCard, { borderColor: `${mood.color}40`, transform: [{ scale: sc }] }]}>
        <LinearGradient colors={[`${mood.color}28`, `${mood.color}08`, "transparent"]}
          style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={[styles.moodIconWrap, { backgroundColor: `${mood.color}20` }]}>
          <Feather name={mood.icon} size={22} color={mood.color} />
        </View>
        <Text style={[styles.moodLabel, { color: mood.color }]}>{mood.label}</Text>
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
  const pi = () => Animated.spring(sc, { toValue: 0.87, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[{ alignItems: "center", gap: 6, transform: [{ scale: sc }] }]}>
        <View style={[styles.circleGenre, { borderColor: `${genre.color}50` }]}>
          <LinearGradient colors={[`${genre.color}35`, `${genre.color}10`]} style={StyleSheet.absoluteFill} />
          <Feather name={genre.icon} size={20} color={genre.color} />
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

// ── Square card (1:1 ratio) ────────────────────────────────────────────────────
function SquareCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.squareCard, { transform: [{ scale: sc }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.9)"]} locations={[0.5,1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.squareInfo}>
          <Text style={styles.squareTitle} numberOfLines={2}>{item.title}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
function SquareRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 8).map((item) => <SquareCard key={item.id} item={item} onPress={() => onPress(item)} />)}
    </ScrollView>
  );
}

// ── Panoramic card (ultra-wide 2:1) ───────────────────────────────────────────
function PanoramicCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.95, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[styles.panoramicCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#0d0a1a","#060408"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.88)"]} locations={[0.35,1]}
          style={StyleSheet.absoluteFill} />
        <View style={styles.panoramicInfo}>
          <Text style={styles.panoramicTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.panoramicMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        <View style={styles.panoramicPlay}>
          <Feather name="play" size={14} color="#fff" />
        </View>
      </Animated.View>
    </Pressable>
  );
}
function PanoramicRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 6).map((item) => <PanoramicCard key={item.id} item={item} onPress={() => onPress(item)} />)}
    </ScrollView>
  );
}

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
function ActorCategorySection({
  category,
  onActorPress,
}: {
  category: typeof ACTOR_CATEGORIES[0];
  onActorPress: (a: typeof ACTOR_CATEGORIES[0]["actors"][0]) => void;
}) {
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
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} decelerationRate="fast">
        {category.actors.map((a) => (
          <ActorCircleItem key={`${category.id}-${a.name}`} actor={a} onPress={() => onActorPress(a)} />
        ))}
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

  // ── section entrance animations ────────────────────────────────────────────
  const SECTION_COUNT = 49;
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

  // ── continue watching — load from local AsyncStorage (always works) ────────
  const loadContinueItems = useCallback(async () => {
    const entries = await getAllLocalProgress();
    if (!entries.length) {
      // fallback: try Supabase if logged in
      if (user?.id && isSupabaseConfigured) {
        db.progress.getAll(user.id).then((items: any[]) =>
          setContinueItems(items.map((p) => ({
            id: String(p.tmdb_id),
            contentId: `${p.type}_${p.tmdb_id}`,
            tmdbId: p.tmdb_id,
            title: p.title ?? "Sem título",
            year: 2024, rating: 0,
            posterPath: p.poster_path ?? "",
            backdropPath: p.backdrop_path ?? "",
            description: "", genres: [],
            type: p.type === "movie" ? ("movie" as const) : ("series" as const),
            mediaType: p.type,
            progress: p.progress ?? 0,
            positionMs: 0, durationMs: 0,
          })))
        ).catch(() => {});
      }
      return;
    }
    setContinueItems(entries.map((e) => ({
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
    })));
  }, [user?.id]);

  useEffect(() => { loadContinueItems(); }, [loadContinueItems]);

  // Refresh "Continue Assistindo" every time the tab gains focus (e.g. returning from player)
  useFocusEffect(
    useCallback(() => {
      loadContinueItems();
    }, [loadContinueItems])
  );

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

      const availableIds = new Set<number>();

      let allMovies: ContentItem[] = [];
      let allSeries: ContentItem[] = [];
      let allAnimes: ContentItem[] = [];

      if (movRes.status === "fulfilled") {
        const m = movRes.value.items.filter((i: any) => i.tmdb_id > 0 && i.poster).map(flix2ToContent);
        m.forEach((i) => { if (i.tmdbId) availableIds.add(i.tmdbId); });
        allMovies = m;
        setMovies(m);
        const heroPool = m.filter((x) => x.posterPath);
        if (heroPool.length >= 2) setHeroItems(heroPool.slice(0, 6));
        setTop10Movies(m.slice(0, 10));
        setTotals((t) => ({ ...t, movies: movRes.value.total }));
      }
      if (serRes.status === "fulfilled") {
        const s = serRes.value.items.filter((i: any) => i.tmdb_id > 0).map(flix2ToContent);
        s.forEach((i) => { if (i.tmdbId) availableIds.add(i.tmdbId); });
        allSeries = s;
        setSeries(s);
        setTop10Series(s.slice(0, 10));
        setTotals((t) => ({ ...t, series: serRes.value.total }));
      }
      if (aniRes.status === "fulfilled") {
        const a = aniRes.value.items.filter((i: any) => i.tmdb_id > 0).map(flix2ToContent);
        a.forEach((i) => { if (i.tmdbId) availableIds.add(i.tmdbId); });
        allAnimes = a;
        setAnimes(a);
        setTotals((t) => ({ ...t, animes: aniRes.value.total }));
      }

      // ── Progressive image preloading ──────────────────────────────────────
      // High priority: hero + first visible row of each category (above the fold)
      clearPreloadQueue();
      const heroUrls   = allMovies.slice(0, 6).map((i) => i.posterPath).filter(Boolean) as string[];
      const row1Movies = allMovies.slice(0, 6).map((i) => i.posterPath).filter(Boolean) as string[];
      const row1Series = allSeries.slice(0, 6).map((i) => i.posterPath).filter(Boolean) as string[];
      preloadImages([...heroUrls, ...row1Movies, ...row1Series], "high");

      // Low priority: next few rows loaded in the background after UI settles
      setTimeout(() => {
        const restMovies = allMovies.slice(6, 30).map((i) => i.posterPath).filter(Boolean) as string[];
        const restSeries = allSeries.slice(6, 24).map((i) => i.posterPath).filter(Boolean) as string[];
        const restAnimes = allAnimes.slice(0, 18).map((i) => i.posterPath).filter(Boolean) as string[];
        preloadImages([...restMovies, ...restSeries, ...restAnimes], "low");
      }, 1500);

      if (availableIds.size > 0) checkCatalogWatchAndNotify(availableIds).catch(() => {});
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
  const browseTo = useCallback((flix2Type: "movies" | "series" | "animes", title: string) => {
    router.push({
      pathname: "/genre-browse",
      params: { title, source: "flix2", flix2_type: flix2Type },
    });
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

  // ── new derived slices for extra sections ─────────────────────────────────
  const squareItems    = useMemo(() => series.slice(8, 16),  [series]);
  const panoramicItems = useMemo(() => movies.slice(18, 24), [movies]);
  const classicsItems  = useMemo(() => premiadosM,           [premiadosM]);
  const episodeItems   = useMemo(() => series.slice(18, 24), [series]);
  const newEpItems     = useMemo(() => series.slice(14, 20), [series]);
  const familyItems    = useMemo(() => animes.slice(8, 14),  [animes]);
  const docsItems      = useMemo(() => movies.slice(22, 28), [movies]);
  const cinemaItem     = useMemo(() => movies[5] ?? null,    [movies]);
  const doubleLeft     = useMemo(() => movies[7] ?? null,    [movies]);
  const doubleRight    = useMemo(() => series[9] ?? null,    [series]);
  const awardItem      = useMemo(() => premiadosM[2] ?? null,[premiadosM]);
  // ── Surpreenda-me — real random pick ──────────────────────────────────────
  const [surpriseItem, setSurpriseItem] = useState<ContentItem | null>(null);

  const pickSurprise = useCallback(() => {
    const pool = [...movies, ...series, ...animes];
    if (!pool.length) return;
    const idx = Math.floor(Math.random() * Math.min(pool.length, 60));
    setSurpriseItem(pool[idx]);
  }, [movies, series, animes]);

  // auto-pick on first catalog load
  useEffect(() => {
    if (!surpriseItem && (movies.length || series.length || animes.length)) {
      pickSurprise();
    }
  }, [movies.length, series.length, animes.length]);

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
        {/* ── 1. HERO BANNER ─────────────────────────────────────────────── */}
        <Animated.View style={{ transform: [{ translateY: heroParallax }] }}>
          <HeroBanner
            items={heroItems}
            onItemPress={goTo}
          />
        </Animated.View>

        <View style={styles.body}>
          {/* ── 2. SEARCH BAR ──────────────────────────────────────────────── */}
          <AnimatedSection anim={s[0]}>
            <SearchTriggerBar placeholder="Buscar filmes, séries, atores, canais..." />
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
                      <ContinueCard
                        key={item.id}
                        item={item}
                        onPress={() => goTo(item)}
                        onRemove={() => {
                          if (item.contentId) {
                            clearLocalProgress(item.contentId);
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

              {/* ── 7. EM ALTA AGORA ─────────────────────────────────────────── */}
              {emAltaMovies.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={styles.section}>
                    <SectionHeader title="Em Alta Agora" icon="trending-up"
                      badge="AO VIVO" accentColor={RED}
                      onSeeAll={() => browseTo("movies", "Em Alta")} />
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
                      onSeeAll={() => browseTo("movies", "Top 10 Filmes")} />
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
                      onSeeAll={() => browseTo("series", "Séries em Alta")} />
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
                      onSeeAll={() => browseTo("series", "Top 10 Séries")} />
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
                      onSeeAll={() => browseTo("movies", "Ação & Aventura")} />
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
                      onSeeAll={() => browseTo("movies", "Drama")} />
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
                      onSeeAll={() => browseTo("series", "Dramas")} />
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
                        onSeeAll={() => browseTo("animes", "Animes em Alta")} />
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
                      onSeeAll={() => browseTo("movies", "Comédia")} />
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
                      onSeeAll={() => browseTo("movies", "Terror")} />
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
                      onSeeAll={() => browseTo("series", "Thriller")} />
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
                      onSeeAll={() => browseTo("movies", "Ficção Científica")} />
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
                      onSeeAll={() => browseTo("animes", "Animações")} />
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
                      onSeeAll={() => browseTo("movies", "Premiados")} />
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
                      onSeeAll={() => browseTo("movies", "Para Você")} />
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
                      onSeeAll={() => browseTo("series", "Mini-Séries")} />
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
                      onSeeAll={() => browseTo("animes", "Aventura")} />
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
                      onSeeAll={() => browseTo("movies", "Internacional")} />
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
                      onSeeAll={() => browseTo("series", "Internacional")} />
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

              {/* ══════════════════════════════════════════════════════════════ */}
              {/* ── NOVAS SEÇÕES — TIPOS PREMIUM ──────────────────────────── */}
              {/* ══════════════════════════════════════════════════════════════ */}

              {/* ── 35. MOOD / CLIMA ─────────────────────────────────────── */}
              <AnimatedSection anim={s[28]}>
                <View style={styles.section}>
                  <SectionHeader title="O que você quer sentir?" icon="heart"
                    accentColor={PINK} subtitle="Escolha pelo clima" />
                  <MoodRowComp moods={MOODS}
                    onPress={(m) => router.push({ pathname: "/genre-browse",
                      params: { title: m.label, source: "flix2", flix2_type: "movies" } })} />
                </View>
              </AnimatedSection>

              {/* ── 36. GÊNEROS EM CÍRCULO ──────────────────────────────── */}
              <SectionDivider label="GÊNEROS" accentColor={BLUE} />
              <AnimatedSection anim={s[29]}>
                <View style={styles.section}>
                  <SectionHeader title="Explorar por Gênero" icon="grid"
                    accentColor={BLUE} />
                  <CircleGenreRow genres={GENRE_CIRCLES}
                    onPress={(g) => router.push({ pathname: "/genre-browse",
                      params: { title: g.label, source: "flix2", flix2_type: "movies" } })} />
                </View>
              </AnimatedSection>

              {/* ── 37. MATRIX DE GÊNEROS ───────────────────────────────── */}
              <AnimatedSection anim={s[30]}>
                <View style={styles.section}>
                  <SectionHeader title="Todos os Gêneros" icon="layout"
                    accentColor={PURPLE} />
                  <GenreMatrixComp genres={GENRE_CIRCLES}
                    onPress={(g) => router.push({ pathname: "/genre-browse",
                      params: { title: g.label, source: "flix2", flix2_type: "movies" } })} />
                </View>
              </AnimatedSection>

              {/* ── 38. TAGS EM ALTA ────────────────────────────────────── */}
              <AnimatedSection anim={s[30]}>
                <View style={styles.section}>
                  <SectionHeader title="Tags em Alta" icon="hash"
                    accentColor={RED} badge="TRENDING" />
                  <HotTagsComp tags={HOT_TAGS}
                    onPress={(tag) => router.push({ pathname: "/buscar", params: { q: tag.replace("#","") } })} />
                </View>
              </AnimatedSection>

              {/* ── 39. CINEMATIC BANNER ────────────────────────────────── */}
              {cinemaItem && (
                <AnimatedSection anim={s[31]}>
                  <SectionHeader title="Destaque Cinemático" icon="film"
                    accentColor={AMBER} />
                  <CinematicBannerComp item={cinemaItem}
                    onPress={() => goTo(cinemaItem)} label="DESTAQUE" />
                </AnimatedSection>
              )}

              {/* ── 40. CARDS QUADRADOS ─────────────────────────────────── */}
              {squareItems.length > 0 && (
                <AnimatedSection anim={s[32]}>
                  <View style={styles.section}>
                    <SectionHeader title="Séries do Momento" icon="square"
                      accentColor={TEAL}
                      onSeeAll={() => browseTo("series", "Séries do Momento")} />
                    <SquareRow items={squareItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 41. CARROSSEL PANORÂMICO ────────────────────────────── */}
              {panoramicItems.length > 0 && (
                <AnimatedSection anim={s[33]}>
                  <View style={styles.section}>
                    <SectionHeader title="Vista Panorâmica" icon="monitor"
                      accentColor={INDIGO}
                      onSeeAll={() => browseTo("movies", "Panorâmicos")} />
                    <PanoramicRow items={panoramicItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 42. ESTÚDIOS ────────────────────────────────────────── */}
              <SectionDivider label="ESTÚDIOS" accentColor={AMBER} />
              <AnimatedSection anim={s[34]}>
                <View style={styles.section}>
                  <SectionHeader title="Por Estúdio" icon="briefcase"
                    accentColor={AMBER} subtitle="Marvel, DC, Pixar e mais" />
                  <StudioRowComp studios={STUDIOS}
                    onPress={(s) => router.push({ pathname: "/buscar", params: { q: s.label } })} />
                </View>
              </AnimatedSection>

              {/* ── 43. DOUBLE FEATURE ──────────────────────────────────── */}
              <AnimatedSection anim={s[35]}>
                <View style={styles.section}>
                  <SectionHeader title="Double Feature" icon="copy"
                    accentColor={BLUE} subtitle="Dois títulos imperdíveis" />
                  <DoubleFeatureComp
                    left={doubleLeft} right={doubleRight}
                    onPressLeft={() => doubleLeft && goTo(doubleLeft)}
                    onPressRight={() => doubleRight && goTo(doubleRight)}
                    tagLeft="FILME" tagRight="SÉRIE"
                  />
                </View>
              </AnimatedSection>

              {/* ── 44. BANNER PREMIADOS ────────────────────────────────── */}
              <AnimatedSection anim={s[36]}>
                <SectionHeader title="Aclamados pela Crítica" icon="award"
                  accentColor={AMBER} badge="PREMIADOS" />
                <AwardBannerComp item={awardItem}
                  onPress={() => awardItem && goTo(awardItem)} />
              </AnimatedSection>

              {/* ── 45. EPISÓDIOS (formato especial) ────────────────────── */}
              {episodeItems.length > 0 && (
                <AnimatedSection anim={s[37]}>
                  <View style={styles.section}>
                    <SectionHeader title="Próximos Episódios" icon="play-circle"
                      accentColor={GREEN}
                      onSeeAll={() => browseTo("series", "Episódios")} />
                    <EpisodeRow items={episodeItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 46. DÉCADAS ─────────────────────────────────────────── */}
              <SectionDivider label="CLÁSSICOS" accentColor={TEAL} />
              <AnimatedSection anim={s[38]}>
                <View style={styles.section}>
                  <SectionHeader title="Navegar por Década" icon="clock"
                    accentColor={TEAL} subtitle="Do passado ao presente" />
                  <DecadeRowComp decades={DECADES}
                    onPress={(d) => router.push({ pathname: "/genre-browse",
                      params: { title: `Anos ${d.year.slice(2)}`, source: "flix2", flix2_type: "movies" } })} />
                </View>
              </AnimatedSection>

              {/* ── 47. CLÁSSICOS (featured format) ─────────────────────── */}
              {classicsItems.length > 0 && (
                <AnimatedSection anim={s[39]}>
                  <View style={styles.section}>
                    <SectionHeader title="Clássicos Imortais" icon="star"
                      accentColor={AMBER}
                      onSeeAll={() => browseTo("movies", "Clássicos")} />
                    <FeaturedRow items={classicsItems} onPress={goTo} accentColor={AMBER} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 48. CINEMA POR PAÍS ─────────────────────────────────── */}
              <AnimatedSection anim={s[40]}>
                <View style={styles.section}>
                  <SectionHeader title="Cinema do Mundo" icon="globe"
                    accentColor={TEAL} subtitle="Explore por país" />
                  <FilmNationRow countries={COUNTRIES}
                    onPress={(c) => router.push({
                      pathname: "/genre-browse",
                      params: { title: c.label, source: "flix2", flix2_type: "movies" },
                    })} />
                </View>
              </AnimatedSection>

              {/* ── 49. ATORES EM DESTAQUE ──────────────────────────────── */}
              <AnimatedSection anim={s[41]}>
                <View style={styles.section}>
                  <SectionHeader title="Atores em Destaque" icon="users"
                    accentColor={PINK} />
                  {ACTOR_CATEGORIES.map((cat) => (
                    <ActorCategorySection
                      key={cat.id}
                      category={cat}
                      onActorPress={(a) => router.push({
                        pathname: "/actor-browse",
                        params: { name: a.name, color: a.color },
                      })}
                    />
                  ))}
                </View>
              </AnimatedSection>

              {/* ── 50. MODO FAMÍLIA ────────────────────────────────────── */}
              {familyItems.length > 0 && (
                <AnimatedSection anim={s[42]}>
                  <FamilyBannerComp items={familyItems}
                    onPress={() => browseTo("animes", "Família")}
                    onItem={goTo} />
                </AnimatedSection>
              )}

              {/* ── 51. DOCUMENTÁRIOS ───────────────────────────────────── */}
              {docsItems.length > 0 && (
                <AnimatedSection anim={s[43]}>
                  <View style={styles.section}>
                    <SectionHeader title="Documentários" icon="camera"
                      accentColor={TEAL}
                      onSeeAll={() => browseTo("movies", "Documentários")} />
                    <WideRow items={docsItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 52. NOVOS EPISÓDIOS ──────────────────────────────────── */}
              {newEpItems.length > 0 && (
                <AnimatedSection anim={s[44]}>
                  <View style={styles.section}>
                    <SectionHeader title="Novos Episódios" icon="rss"
                      badge="HOJE" accentColor={GREEN}
                      onSeeAll={() => browseTo("series", "Novos Episódios")} />
                    <PosterRow items={newEpItems} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 53. EM BREVE (contagens regressivas) ────────────────── */}
              <SectionDivider label="EM BREVE" accentColor={AMBER} />
              <AnimatedSection anim={s[45]}>
                <View style={styles.section}>
                  <SectionHeader title="Chegando em Breve" icon="clock"
                    accentColor={AMBER} badge="AGUARDADO" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal:16, gap:12 }} decelerationRate="fast">
                    {UPCOMING_MOVIES.map((u) => (
                      <View key={u.title} style={{ width: 260 }}>
                        <CountdownBannerComp
                          title={u.title} daysLeft={u.daysLeft}
                          accentColor={u.accentColor}
                          onPress={() => router.push("/(tabs)/novidades")} />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </AnimatedSection>

              {/* ── 54. ORIGINALS BANNER ────────────────────────────────── */}
              <AnimatedSection anim={s[46]}>
                <OriginalsBannerComp onPress={() => router.push("/(tabs)/novidades")} />
              </AnimatedSection>

              {/* ── 55. SURPREENDA-ME ────────────────────────────────────── */}
              <AnimatedSection anim={s[47]}>
                <SectionHeader title="Não sabe o que assistir?" icon="shuffle"
                  accentColor={PURPLE} />
                <SurpriseBannerComp
                  item={surpriseItem}
                  onPick={pickSurprise}
                  onPlay={() => surpriseItem && goTo(surpriseItem)}
                />
              </AnimatedSection>

              {/* ── 56. PROMO FINAL ─────────────────────────────────────── */}
              <AnimatedSection anim={s[48]}>
                <PromoBanner
                  icon="wifi"
                  title="TV ao Vivo"
                  subtitle="Canais ao vivo com programação completa"
                  actionLabel="Ao Vivo"
                  onPress={() => router.push("/(tabs)/descobrir")}
                  gradient={[GREEN, "#15803d"]}
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

  // ── Square card ───────────────────────────────────────────────────────────
  squareCard: {
    width: 128, height: 128, borderRadius: 14, overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  squareInfo: { position: "absolute", bottom: 8, left: 8, right: 8 },
  squareTitle: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14 },

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
});
