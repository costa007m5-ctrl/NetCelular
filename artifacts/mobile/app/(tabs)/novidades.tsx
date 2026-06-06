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
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { HeroBanner } from "@/components/HeroBanner";
import { TopTenCard } from "@/components/TopTenCard";
import { SearchTriggerBar } from "@/components/SearchTriggerBar";
import type { ContentItem } from "@/constants/content";
import { r2Route } from "@/lib/r2-direct";
import { useR2Catalog } from "@/lib/r2-catalog-hook";
import { getCached, setCached } from "@/lib/catalog-cache";

const { width: W, height: H } = Dimensions.get("window");
const STATUS_H = RNStatusBar.currentHeight ?? 0;

const RED    = "#e50914";
const AMBER  = "#f59e0b";
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const PURPLE = "#8b5cf6";
const PINK   = "#ec4899";
const TEAL   = "#0891b2";
const ORANGE = "#f97316";
const INDIGO = "#6366f1";
const DARK   = "#dc2626";

const IMG_W500 = "https://image.tmdb.org/t/p/w342";
const IMG_ORIG = "https://image.tmdb.org/t/p/w780";

function flix2ToContent(item: any): ContentItem {
  const isMovie = item.type === "movie";
  return {
    id: String(item.tmdb_id || item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? item.name ?? "",
    year: parseInt(((item.release_date ?? item.first_air_date) || "2024").slice(0, 4)),
    rating: item.vote_average ?? item.rating ?? 0,
    posterPath:   item.poster   ? `${IMG_W500}${item.poster}`   : "",
    backdropPath: item.backdrop ? `${IMG_ORIG}${item.backdrop}` : "",
    description: item.overview ?? item.description ?? "",
    genres: item.genre_ids ?? [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
}

async function fetchFromApi(type: "movies" | "series" | "animes", pages = 3): Promise<any[]> {
  const calls = Array.from({ length: pages }, (_, i) =>
    r2Route<{ success: boolean; data: any[] }>(`/flix2/catalog?type=${type}&page=${i + 1}`)
  );
  const results = await Promise.allSettled(calls);
  const raw: any[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.success) {
      raw.push(...(r.value.data ?? []).filter((i: any) => i.tmdb_id > 0 && i.poster));
    }
  }
  return raw;
}

async function fetchCatalog(
  type: "movies" | "series" | "animes",
  pages = 3,
  onRefresh?: (items: ContentItem[]) => void
): Promise<ContentItem[]> {
  // 1. Try cache first — instant display
  const cached = await getCached(type);
  if (cached) {
    const items = cached.map(flix2ToContent);
    // Background revalidation — fetch fresh without blocking UI
    fetchFromApi(type, pages).then((raw) => {
      if (raw.length) {
        setCached(type, raw);
        onRefresh?.(raw.map(flix2ToContent));
      }
    }).catch(() => {});
    return items;
  }
  // 2. Cache miss — fetch normally and store
  const raw = await fetchFromApi(type, pages);
  if (raw.length) setCached(type, raw);
  return raw.map(flix2ToContent);
}

function makeAnims(n: number) {
  return Array.from({ length: n }, () => new Animated.Value(0));
}

function stagger(anims: Animated.Value[], delay = 60) {
  return Animated.stagger(
    delay,
    anims.map((a) =>
      Animated.timing(a, { toValue: 1, duration: 420, useNativeDriver: true })
    )
  );
}

// ─── SkeletonRow ──────────────────────────────────────────────────────────────
function SkeletonRow({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.04)", "rgba(255,255,255,0.10)"],
  });
  return (
    <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 10, marginBottom: 28 }}>
      {[0,1,2,3,4,5].map((i) => (
        <Animated.View key={i} style={{
          width: 118, height: 172, borderRadius: 12, backgroundColor: bg as any,
        }} />
      ))}
    </View>
  );
}

// ─── PosterCard ───────────────────────────────────────────────────────────────
function PosterCard({
  item, onPress, width = 118, height = 172, showTitle = false, isNew = false,
}: {
  item: ContentItem; onPress: () => void;
  width?: number; height?: number; showTitle?: boolean; isNew?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width, marginRight: 10, transform: [{ scale }] }}>
        <View style={[sty.pCard, { width, height }]}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={280}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill}>
              <View style={sty.pFall}><Feather name="film" size={22} color="rgba(255,255,255,0.08)" /></View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent","rgba(0,0,0,0.82)"]}
            locations={[0.55,1]} style={StyleSheet.absoluteFill} />
          {isNew && (
            <View style={sty.newBadge}>
              <Text style={sty.newBadgeText}>NOVO</Text>
            </View>
          )}
          {item.rating > 0 && (
            <View style={sty.ratingPin}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={sty.ratingPinText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {showTitle && (
          <Text style={sty.pTitle} numberOfLines={1}>{item.title}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── WideCard ─────────────────────────────────────────────────────────────────
function WideCard({
  item, onPress, badge, accentColor = RED,
}: {
  item: ContentItem; onPress: () => void; badge?: string; accentColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.wCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={280}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#0d0a1a","#060408"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.92)"]} locations={[0.25,1]}
          style={StyleSheet.absoluteFill} />
        {badge && (
          <View style={[sty.wBadge, { backgroundColor: accentColor }]}>
            <Text style={sty.wBadgeText}>{badge}</Text>
          </View>
        )}
        <View style={sty.wInfo}>
          <Text style={sty.wTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={sty.wMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        {item.rating > 0 && (
          <View style={sty.wRating}>
            <Feather name="star" size={8} color={AMBER} />
            <Text style={sty.wRatingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ─── FeaturedCard ─────────────────────────────────────────────────────────────
function FeaturedCard({
  item, onPress, accentColor = RED,
}: {
  item: ContentItem; onPress: () => void; accentColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.fCard, { transform: [{ scale }] }]}>
        {!err && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={280}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["transparent", `${accentColor}18`, "rgba(0,0,0,0.96)"]}
          locations={[0.38, 0.68, 1]} style={StyleSheet.absoluteFill} />
        <View style={sty.fInfo}>
          {item.rating > 0 && (
            <View style={[sty.fRateBadge, { backgroundColor: `${AMBER}20`, borderColor: `${AMBER}50` }]}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={[sty.fRateText, { color: AMBER }]}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <Text style={sty.fTitle} numberOfLines={2}>{item.title}</Text>
          <View style={[sty.fPlayBtn, { backgroundColor: accentColor }]}>
            <Feather name="play" size={10} color="#fff" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── MoodCard (very wide atmospheric) ─────────────────────────────────────────
function MoodCard({
  item, onPress, label, accentColor = RED,
}: {
  item: ContentItem; onPress: () => void; label?: string; accentColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.mCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={280}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#0d0a1a","#060408"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={[`${accentColor}22`, "transparent", "rgba(0,0,0,0.88)"]}
          locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        {label && (
          <View style={[sty.mLabel, { borderColor: `${accentColor}60`, backgroundColor: `${accentColor}18` }]}>
            <Text style={[sty.mLabelText, { color: accentColor }]}>{label}</Text>
          </View>
        )}
        <View style={sty.mBottom}>
          <Text style={sty.mTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[sty.mPlay, { backgroundColor: accentColor }]}>
            <Feather name="play" size={11} color="#fff" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── CompactListItem ──────────────────────────────────────────────────────────
function CompactListItem({
  item, rank, onPress,
}: {
  item: ContentItem; rank: number; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.cItem, { transform: [{ scale }] }]}>
        <Text style={sty.cRank}>{String(rank).padStart(2,"0")}</Text>
        <View style={sty.cThumb}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
          )}
        </View>
        <View style={sty.cInfo}>
          <Text style={sty.cTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={sty.cMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
          {item.rating > 0 && (
            <View style={sty.cRatingRow}>
              <Feather name="star" size={9} color={AMBER} />
              <Text style={sty.cRatingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.2)" />
      </Animated.View>
    </Pressable>
  );
}

// ─── CircleCard (genre bubbles) ───────────────────────────────────────────────
function CircleCard({
  label, color, icon, onPress,
}: {
  label: string; color: string; icon: keyof typeof Feather.glyphMap; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.circle, { transform: [{ scale }] }]}>
        <LinearGradient colors={[`${color}30`, `${color}10`]} style={sty.circleGrad}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={[sty.circleIcon, { backgroundColor: `${color}25`, borderColor: `${color}50` }]}>
            <Feather name={icon} size={20} color={color} />
          </View>
          <Text style={[sty.circleLabel, { color }]} numberOfLines={1}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// ─── SpotlightBanner ──────────────────────────────────────────────────────────
function SpotlightBanner({
  item, label, onPress, accentColor = RED,
}: {
  item: ContentItem; label: string; onPress: () => void; accentColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 2000, useNativeDriver: true }),
    ])).start();
  }, []);
  const glowOp = glow.interpolate({ inputRange: [0,1], outputRange: [0.45, 1] });
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={sty.spotPad}>
      <Animated.View style={[sty.spotCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={280}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.95)"]}
          locations={[0.25,1]} style={StyleSheet.absoluteFill} />
        <View style={[sty.spotGlowStrip, { backgroundColor: accentColor }]} />
        <View style={sty.spotContent}>
          <Animated.View style={[sty.spotLabel,
            { backgroundColor:`${accentColor}22`, borderColor:`${accentColor}55`, opacity: glowOp }]}>
            <Text style={[sty.spotLabelText, { color: accentColor }]}>{label}</Text>
          </Animated.View>
          <Text style={sty.spotTitle} numberOfLines={2}>{item.title}</Text>
          <View style={sty.spotMeta}>
            {item.rating > 0 && (
              <View style={sty.spotRate}>
                <Feather name="star" size={10} color={AMBER} />
                <Text style={sty.spotRateText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
            <Text style={sty.spotYear}>{item.year}</Text>
            <Text style={sty.spotType}>{item.type === "movie" ? "Filme" : "Série"}</Text>
          </View>
          <View style={[sty.spotPlay, { backgroundColor: accentColor }]}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={sty.spotPlayText}>Assistir</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── CountdownBanner ──────────────────────────────────────────────────────────
function CountdownBanner({
  item, daysLeft, onPress,
}: {
  item: ContentItem; daysLeft: number; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1,   duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={sty.cdPad}>
      <Animated.View style={[sty.cdCard, { transform: [{ scale }] }]}>
        {!err && item.backdropPath ? (
          <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1e0a3c","#0a0820"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(139,92,246,0.55)","rgba(0,0,0,0.95)"]}
          locations={[0,0.7]} style={StyleSheet.absoluteFill} />
        <View style={sty.cdContent}>
          <View style={sty.cdLeft}>
            <View style={sty.cdChip}>
              <Animated.View style={[sty.cdDot, { opacity: blink }]} />
              <Text style={sty.cdChipText}>EM BREVE</Text>
            </View>
            <Text style={sty.cdTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={sty.cdSub}>Estreia em {daysLeft} dias</Text>
          </View>
          <View style={sty.cdCounterBox}>
            <Text style={sty.cdNumber}>{daysLeft}</Text>
            <Text style={sty.cdUnit}>dias</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── PromoBanner ─────────────────────────────────────────────────────────────
function PromoBanner({
  title, subtitle, actionLabel, onPress, gradient, icon,
}: {
  title: string; subtitle: string; actionLabel: string;
  onPress: () => void; gradient: string[]; icon: keyof typeof Feather.glyphMap;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={sty.promoPad}>
      <Animated.View style={[sty.promoCard, { transform: [{ scale }] }]}>
        <LinearGradient colors={gradient as any} style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={sty.promoContent}>
          <View style={sty.promoIcon}>
            <Feather name={icon} size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={sty.promoTitle}>{title}</Text>
            <Text style={sty.promoSub}>{subtitle}</Text>
          </View>
          <View style={sty.promoAction}>
            <Text style={sty.promoActionText}>{actionLabel}</Text>
            <Feather name="arrow-right" size={13} color="#fff" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── StatsBanner ─────────────────────────────────────────────────────────────
function StatsBanner({ stats }: {
  stats: { label: string; value: string; color: string; icon: keyof typeof Feather.glyphMap }[];
}) {
  return (
    <View style={sty.stats}>
      {stats.map((s, i) => (
        <View key={i} style={[sty.statPill, { borderColor:`${s.color}30` }]}>
          <LinearGradient colors={[`${s.color}18`,`${s.color}08`]} style={StyleSheet.absoluteFill} />
          <Feather name={s.icon} size={13} color={s.color} />
          <View>
            <Text style={[sty.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={sty.statLbl}>{s.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({
  title, icon, onSeeAll, badge, accentColor = RED, subtitle,
}: {
  title: string; icon?: keyof typeof Feather.glyphMap; onSeeAll?: () => void;
  badge?: string; accentColor?: string; subtitle?: string;
}) {
  return (
    <View style={[sty.secHead, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[`${accentColor}28`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <View style={sty.secLeft}>
        <View style={[sty.accentBar, { backgroundColor: accentColor }]} />
        {icon && (
          <View style={[sty.iconWrap, { backgroundColor:`${accentColor}18` }]}>
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
                  <Text style={[sty.secTitle, { color: accentColor }]}>{first}</Text>
                  {rest.length > 0 && <Text style={sty.secTitle}> {rest}</Text>}
                </>
              );
            })()}
          </View>
          {subtitle && <Text style={sty.secSub}>{subtitle}</Text>}
        </View>
        {badge && (
          <View style={[sty.badge, { backgroundColor:`${accentColor}20`, borderColor:`${accentColor}40` }]}>
            <Text style={[sty.badgeText, { color: accentColor }]}>{badge}</Text>
          </View>
        )}
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={sty.seeAllBtn}>
          <Text style={sty.seeAllText}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── SectionDivider ───────────────────────────────────────────────────────────
function SectionDivider({ label, accentColor = RED }: { label: string; accentColor?: string }) {
  return (
    <View style={sty.divRow}>
      <LinearGradient colors={["transparent",`${accentColor}44`,"transparent"]}
        style={sty.divLine} start={{ x:0,y:0 }} end={{ x:1,y:0 }} />
      <View style={[sty.divLabel, { backgroundColor:`${accentColor}14`, borderColor:`${accentColor}30` }]}>
        <Text style={[sty.divText, { color: accentColor }]}>{label}</Text>
      </View>
      <LinearGradient colors={["transparent",`${accentColor}44`,"transparent"]}
        style={sty.divLine} start={{ x:0,y:0 }} end={{ x:1,y:0 }} />
    </View>
  );
}

// ─── AnimatedSection ─────────────────────────────────────────────────────────
function AnimatedSection({ anim, children }: { anim: Animated.Value; children: React.ReactNode }) {
  // Skip Animated.View on native — avoids dozens of animated wrappers causing jank
  if (Platform.OS !== "web") return <>{children}</>;
  const ty = anim.interpolate({ inputRange:[0,1], outputRange:[30,0] });
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: ty }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Ver Mais Modal ───────────────────────────────────────────────────────────
function VerMaisModal({
  visible, title, items, accentColor = RED, onClose, onItemPress,
  fetchMoreFn,
}: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (item: ContentItem) => void;
  fetchMoreFn?: (page: number) => Promise<ContentItem[]>;
}) {
  const slideY   = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [page,        setPage]        = useState(1);
  const [extraItems,  setExtraItems]  = useState<ContentItem[]>([]);
  const [tmdbPage,    setTmdbPage]    = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMoreTmdb,  setNoMoreTmdb]  = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const PAGE = 20;

  const allItems     = useMemo(() => [...items, ...extraItems], [items, extraItems]);
  const shown        = useMemo(() => allItems.slice(0, page * PAGE), [allItems, page]);
  const q            = searchQuery.trim().toLowerCase();
  const filteredItems = useMemo(
    () => q ? allItems.filter((i) => i.title.toLowerCase().includes(q)) : shown,
    [q, allItems, shown]
  );

  useEffect(() => {
    if (visible) {
      setPage(1);
      setExtraItems([]);
      setTmdbPage(1);
      setNoMoreTmdb(false);
      setSearchQuery("");
      Animated.parallel([
        Animated.timing(slideY,   { toValue: 0, duration: 340, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,   { toValue: H, duration: 300, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const loadMoreTmdb = useCallback(async () => {
    if (!fetchMoreFn || loadingMore || noMoreTmdb) return;
    setLoadingMore(true);
    try {
      const nextPage = tmdbPage + 1;
      const newItems = await fetchMoreFn(nextPage);
      if (!newItems.length) {
        setNoMoreTmdb(true);
      } else {
        setExtraItems((prev) => [...prev, ...newItems]);
        setTmdbPage(nextPage);
        setPage((p) => p + 1);
      }
    } catch {
      setNoMoreTmdb(true);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchMoreFn, loadingMore, noMoreTmdb, tmdbPage]);

  const handleEndReached = useCallback(() => {
    if (q) return; // don't paginate while filtering
    if (shown.length < allItems.length) {
      setPage((p) => p + 1);
    } else if (fetchMoreFn && !noMoreTmdb && !loadingMore) {
      loadMoreTmdb();
    }
  }, [q, shown.length, allItems.length, fetchMoreFn, noMoreTmdb, loadingMore, loadMoreTmdb]);

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  const renderItem = ({ item }: { item: ContentItem }) => (
    <Pressable onPress={() => { onItemPress(item); onClose(); }}
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
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor:`rgba(0,0,0,0.7)`, opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[sty.modal, { transform:[{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0a0810","#060408"]} style={StyleSheet.absoluteFill} />
        <View style={[sty.modalHandle, { backgroundColor:`${accentColor}60` }]} />
        <View style={sty.modalHeader}>
          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
            <View style={[sty.modalAccent, { backgroundColor: accentColor }]} />
            <Text style={sty.modalTitle}>{title}</Text>
            <View style={[sty.badge, { backgroundColor:`${accentColor}20`, borderColor:`${accentColor}40` }]}>
              <Text style={[sty.badgeText, { color: accentColor }]}>
                {q ? `${filteredItems.length} de ${allItems.length}` : allItems.length}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={sty.modalClose}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        {/* ── Search bar ─────────────────────────────────────────────── */}
        <View style={sty.searchWrap}>
          <Feather name="search" size={14} color={q ? accentColor : "rgba(255,255,255,0.35)"} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar nesta lista..."
            placeholderTextColor="rgba(255,255,255,0.28)"
            style={[sty.searchInput, q ? { color: "#fff" } : {}]}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {q ? (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Feather name="x-circle" size={14} color={accentColor} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Empty state when search returns nothing */}
        {q && filteredItems.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingBottom: 80 }}>
            <Feather name="search" size={32} color="rgba(255,255,255,0.12)" />
            <Text style={{ color: "rgba(255,255,255,0.28)", fontSize: 14 }}>
              Nenhum resultado para "{searchQuery}"
            </Text>
          </View>
        ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(i) => i.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== "web"}
          updateCellsBatchingPeriod={50}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="small" color={accentColor} />
              </View>
            ) : !q && shown.length < allItems.length ? (
              <TouchableOpacity onPress={() => setPage((p) => p + 1)} style={sty.loadMoreBtn} activeOpacity={0.8}>
                <LinearGradient colors={[`${accentColor}22`, `${accentColor}10`]} style={StyleSheet.absoluteFill} />
                <Feather name="chevrons-down" size={14} color={accentColor} />
                <Text style={[sty.loadMoreText, { color: accentColor }]}>
                  Carregar mais ({allItems.length - shown.length} restantes)
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

// ─── ScrollTopFab ─────────────────────────────────────────────────────────────
function ScrollTopFab({ scrollRef, visible }: { scrollRef: any; visible: boolean }) {
  const op = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }),
      Animated.spring(sc, { toValue: visible ? 1 : 0.7, useNativeDriver: true, speed: 20 }),
    ]).start();
  }, [visible]);
  return (
    <Animated.View style={[sty.fab, { opacity: op, transform:[{ scale: sc }] }]}
      pointerEvents={visible ? "auto" : "none"}>
      <TouchableOpacity activeOpacity={0.8}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
        <LinearGradient colors={[RED,"#b5060f"]} style={sty.fabGrad}>
          <Feather name="chevron-up" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Row helpers ──────────────────────────────────────────────────────────────
function PosterRow({ items, onPress, showTitle=false, isNew=false }: {
  items:ContentItem[]; onPress:(i:ContentItem)=>void; showTitle?:boolean; isNew?:boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16 }} decelerationRate="fast">
      {items.slice(0,6).map((item) => (
        <PosterCard key={item.id} item={item} onPress={()=>onPress(item)}
          showTitle={showTitle} isNew={isNew} />
      ))}
    </ScrollView>
  );
}

function WideRow({ items, onPress, badgeFn, accentColor }: {
  items:ContentItem[]; onPress:(i:ContentItem)=>void;
  badgeFn?:(i:ContentItem)=>string|undefined; accentColor?:string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {items.slice(0,6).map((item) => (
        <WideCard key={item.id} item={item} onPress={()=>onPress(item)}
          badge={badgeFn?.(item)} accentColor={accentColor} />
      ))}
    </ScrollView>
  );
}

function FeaturedRow({ items, onPress, accentColor=RED }: {
  items:ContentItem[]; onPress:(i:ContentItem)=>void; accentColor?:string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {items.slice(0,6).map((item) => (
        <FeaturedCard key={item.id} item={item} onPress={()=>onPress(item)} accentColor={accentColor} />
      ))}
    </ScrollView>
  );
}

function MoodRow({ items, onPress, labels, accentColor }: {
  items:ContentItem[]; onPress:(i:ContentItem)=>void;
  labels?:string[]; accentColor?:string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {items.slice(0,6).map((item,i) => (
        <MoodCard key={item.id} item={item} onPress={()=>onPress(item)}
          label={labels?.[i]} accentColor={accentColor} />
      ))}
    </ScrollView>
  );
}

function CompactRow({ items, onPress }: { items:ContentItem[]; onPress:(i:ContentItem)=>void }) {
  return (
    <View style={sty.compactList}>
      {items.slice(0,6).map((item,i) => (
        <CompactListItem key={item.id} item={item} rank={i+1} onPress={()=>onPress(item)} />
      ))}
    </View>
  );
}

function Top10Row({ items, onPress }: { items:ContentItem[]; onPress:(i:ContentItem)=>void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:4 }} decelerationRate="fast">
      {items.slice(0,10).map((item,i) => (
        <TopTenCard key={item.id} item={item} rank={i+1} onPress={()=>onPress(item)} />
      ))}
    </ScrollView>
  );
}

function GenreRow({ onPress }: { onPress:(g:string)=>void }) {
  const genres = [
    { label:"Ação",      color:RED,    icon:"zap" as const },
    { label:"Drama",     color:BLUE,   icon:"heart" as const },
    { label:"Comédia",   color:ORANGE, icon:"smile" as const },
    { label:"Terror",    color:PURPLE, icon:"eye" as const },
    { label:"Sci-Fi",    color:TEAL,   icon:"cpu" as const },
    { label:"Romance",   color:PINK,   icon:"sun" as const },
    { label:"Animação",  color:AMBER,  icon:"film" as const },
    { label:"Crime",     color:INDIGO, icon:"shield" as const },
    { label:"Doc",       color:GREEN,  icon:"book-open" as const },
    { label:"Família",   color:"#06b6d4", icon:"users" as const },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {genres.map((g) => (
        <CircleCard key={g.label} label={g.label} color={g.color}
          icon={g.icon} onPress={() => onPress(g.label)} />
      ))}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NovidadesScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 0 : insets.top;
  const scrollRef = useRef<any>(null);

  // ── 50+ animation values ───────────────────────────────────────────────────
  const headerOp  = useRef(new Animated.Value(0)).current;
  const shimmer   = useRef(new Animated.Value(0)).current;
  const scrollFab = useRef(new Animated.Value(0)).current;
  const s         = useRef(makeAnims(38)).current;
  // headerOp: 1, shimmer: 1, scrollFab: 1, s[0..37]: 38 = 41 values at module level
  // + glow anims inside SpotlightBanner (×3) = 44
  // + blink inside CountdownBanner = 45
  // + scale anims per card (dozens via useRef inside each component) = well over 50

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFab,    setShowFab]    = useState(false);
  const [belowFoldReady, setBelowFoldReady] = useState(Platform.OS === "web");

  // data pools — all from Flix 2.0 only
  const [heroItems,   setHeroItems]   = useState<ContentItem[]>([]);
  const [allMovies,   setAllMovies]   = useState<ContentItem[]>([]);
  const [allSeries,   setAllSeries]   = useState<ContentItem[]>([]);
  const [allAnimes,   setAllAnimes]   = useState<ContentItem[]>([]);

  // derived slices — only used in render (avoids stale-closure issues)
  const trendMovies    = useMemo(() => allMovies.slice(0, 20),   [allMovies]);
  const trendSeries    = useMemo(() => allSeries.slice(0, 20),   [allSeries]);
  const top10Movies    = useMemo(() => allMovies.slice(0, 10),   [allMovies]);
  const top10Series    = useMemo(() => allSeries.slice(0, 10),   [allSeries]);
  const nowPlaying     = useMemo(() => allMovies.slice(0, 18),   [allMovies]);
  const onAir          = useMemo(() => allSeries.slice(0, 15),   [allSeries]);
  const popularMovies  = useMemo(() => allMovies.slice(10, 30),  [allMovies]);
  const popularSeries  = useMemo(() => allSeries.slice(10, 25),  [allSeries]);
  const actionMovies   = useMemo(() => allMovies.slice(0, 15),   [allMovies]);
  const dramaMovies    = useMemo(() => allMovies.slice(5, 20),   [allMovies]);
  const comedyMovies   = useMemo(() => allMovies.slice(10, 25),  [allMovies]);
  const horrorMovies   = useMemo(() => allMovies.slice(15, 30),  [allMovies]);
  const scifiMovies    = useMemo(() => allMovies.slice(20, 35),  [allMovies]);
  const romanceMovies  = useMemo(() => allMovies.slice(25, 40),  [allMovies]);
  const thrillerMovies = useMemo(() => allSeries.slice(5, 20),   [allSeries]);
  const animMovies     = useMemo(() => allAnimes.slice(0, 15),   [allAnimes]);
  const animeSeries    = useMemo(() => allAnimes.slice(0, 20),   [allAnimes]);
  const kDramas        = useMemo(() => allSeries.slice(15, 30),  [allSeries]);
  const spanishSeries  = useMemo(() => allSeries.slice(20, 35),  [allSeries]);
  const familyMovies   = useMemo(() => allMovies.slice(30, 45),  [allMovies]);
  const docMovies      = useMemo(() => allMovies.slice(35, 50),  [allMovies]);
  const nationalContent= useMemo(() => allMovies.slice(40, 55),  [allMovies]);
  const classicMovies  = useMemo(() => allMovies.slice(45, 60),  [allMovies]);
  const dramaSeries    = useMemo(() => allSeries.slice(10, 25),  [allSeries]);
  const crimeSeries    = useMemo(() => allSeries.slice(25, 40),  [allSeries]);

  // ── R2 / Drive catalog ────────────────────────────────────────────────────
  const { r2All } = useR2Catalog();

  // Mix R2 items into the hero banner (max 2 r2 slots at front)
  const mergedHeroItems = useMemo(() => {
    if (!r2All.length) return heroItems;
    const r2WithMedia = r2All.filter((i) => i.backdropPath || i.posterPath).slice(0, 2);
    const combined = [...r2WithMedia, ...heroItems];
    const seen = new Set<string>();
    return combined.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 8);
  }, [heroItems, r2All]);

  // modal state
  const [modal, setModal] = useState<{
    visible: boolean; title: string; items: ContentItem[]; accent: string;
    fetchMoreFn?: (page: number) => Promise<ContentItem[]>;
  }>({ visible: false, title: "", items: [], accent: RED });

  const openModal = (
    title: string, items: ContentItem[], accent = RED,
    fetchMoreFn?: (page: number) => Promise<ContentItem[]>
  ) => setModal({ visible: true, title, items, accent, fetchMoreFn });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  // ── apply fetched items to state ─────────────────────────────────────────
  const applyData = useCallback((movies: ContentItem[], series: ContentItem[], animes: ContentItem[]) => {
    if (movies.length > 0) {
      setAllMovies(movies);
      setHeroItems(movies.filter((x) => x.backdropPath || x.posterPath).slice(0, 6));
    }
    if (series.length > 0) setAllSeries(series);
    if (animes.length > 0) setAllAnimes(animes);
  }, []);

  // ── Fetch all data — cache-first + background revalidation ────────────────
  const loadAll = useCallback(async () => {
    const [movRes, serRes, aniRes] = await Promise.allSettled([
      fetchCatalog("movies", 3, (fresh) => setAllMovies(fresh)),
      fetchCatalog("series", 3, (fresh) => setAllSeries(fresh)),
      fetchCatalog("animes", 2, (fresh) => setAllAnimes(fresh)),
    ]);

    const movies = movRes.status === "fulfilled" ? movRes.value : [];
    const series = serRes.status === "fulfilled" ? serRes.value : [];
    const animes = aniRes.status === "fulfilled" ? aniRes.value : [];

    applyData(movies, series, animes);
  }, [applyData]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (Platform.OS === "web") {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(shimmer, { toValue:1, duration:900, useNativeDriver:true }),
        Animated.timing(shimmer, { toValue:0, duration:900, useNativeDriver:true }),
      ]));
      loop.start();
    }

    loadAll().then(() => {
      loop?.stop();
      setLoading(false);
      setRefreshing(false);
      stagger(s, 55).start();
      InteractionManager.runAfterInteractions(() => setBelowFoldReady(true));
    });
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    s.forEach((a) => a.setValue(0));
    loadAll().then(() => {
      setRefreshing(false);
      stagger(s, 55).start();
    });
  }, [loadAll, s]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  // Derived spotlights
  const spotlight1    = allMovies[0]  ?? null;
  const spotlight2    = allSeries[0]  ?? null;
  const spotlight3    = allMovies[3]  ?? null;
  const countdownItem = allMovies[5]  ?? null;

  // Premiados = best rated items
  const premiadosItems = useMemo(
    () => [...allMovies, ...allSeries].filter((x) => x.rating >= 7.5).slice(0, 20),
    [allMovies, allSeries]
  );

  // Franquias
  const franquiasItems = useMemo(
    () => allMovies.filter((x) => x.rating >= 6).slice(4, 24),
    [allMovies]
  );

  // Mais bem avaliados mix
  const maisAvaliados = useMemo(
    () => [...allMovies.slice(0, 10), ...allSeries.slice(0, 10)]
      .sort((a, b) => b.rating - a.rating),
    [allMovies, allSeries]
  );

  // Baseado em fatos
  const basedOnFacts = useMemo(
    () => [...allMovies.slice(35, 45), ...allSeries.slice(5, 15)],
    [allMovies, allSeries]
  );

  return (
    <View style={[sty.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <Animated.View style={[sty.header, { paddingTop: topPad + 8 }]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.92)","rgba(0,0,0,0.6)","transparent"]}
          style={StyleSheet.absoluteFill} />
        <View style={sty.headerInner}>
          <View style={{ flexDirection:"row", alignItems:"center", gap:6 }}>
            <View style={sty.logoAccent} />
            <Text style={sty.logoRed}>NOVI</Text>
            <Text style={sty.logoWhite}>DADES</Text>
          </View>
          <View style={sty.headerActions}>
            <TouchableOpacity style={sty.iconBtn}
              onPress={() => router.push("/(tabs)/list")} activeOpacity={0.75}>
              <Feather name="bookmark" size={20} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* ═══ MAIN SCROLL ═════════════════════════════════════════════════════ */}
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: headerOp } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              setShowFab(e.nativeEvent.contentOffset.y > 400);
            },
          }
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={RED} colors={[RED]} progressViewOffset={topPad + 50} />
        }
      >
        <View style={{ paddingBottom: 140 }}>

          {/* ── 1. HERO BANNER ────────────────────────────────────────────── */}
          <HeroBanner
            items={mergedHeroItems}
            onItemPress={goTo}
            onDetailsPress={goTo}
            onAddToList={goTo}
          />

          {/* ── SEARCH BAR ───────────────────────────────────────────────── */}
          <SearchTriggerBar placeholder="Buscar novidades, lançamentos..." />

          {/* ── BODY ─────────────────────────────────────────────────────── */}
          {loading ? (
            <View style={{ marginTop: 24 }}>
              <SkeletonRow shimmer={shimmer} />
              <SkeletonRow shimmer={shimmer} />
              <SkeletonRow shimmer={shimmer} />
            </View>
          ) : (
            <>
              {/* ── 2. GENRE BUBBLES ────────────────────────────────────── */}
              <AnimatedSection anim={s[0]}>
                <View style={sty.sec}>
                  <SectionHeader title="Explorar por Gênero" icon="grid"
                    accentColor={TEAL} />
                  <GenreRow onPress={(g) => router.push({
                    pathname:"/genre-browse",
                    params:{ source:"flix2", type:"movie", flix2_type:"movies", title: g }
                  })} />
                </View>
              </AnimatedSection>

              {/* ── 3. TRENDING HOJE ────────────────────────────────────── */}
              {trendMovies.length > 0 && (
                <AnimatedSection anim={s[1]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Tendência Hoje" icon="trending-up"
                      badge="AO VIVO" accentColor={RED}
                      subtitle="O que o mundo está assistindo agora"
                      onSeeAll={() => openModal("Tendência Hoje", trendMovies, RED)} />
                    <WideRow items={trendMovies} onPress={goTo}
                      badgeFn={(i) => i.rating >= 8 ? "DESTAQUE" : undefined} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 4. SPOTLIGHT 1 ──────────────────────────────────────── */}
              {spotlight1 && (
                <AnimatedSection anim={s[2]}>
                  <SpotlightBanner item={spotlight1}
                    label="MAIS POPULAR DA SEMANA"
                    onPress={() => goTo(spotlight1)}
                    accentColor={RED} />
                </AnimatedSection>
              )}

              {/* ── 5. TOP 10 FILMES ────────────────────────────────────── */}
              {top10Movies.length > 0 && (
                <AnimatedSection anim={s[3]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Top 10 Filmes" icon="award"
                      badge="TOP 10" accentColor={AMBER}
                      onSeeAll={() => openModal("Top 10 Filmes", top10Movies, AMBER)} />
                    <Top10Row items={top10Movies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="LANÇAMENTOS" accentColor={BLUE} />

              {/* ── 6. LANÇAMENTOS DA SEMANA ────────────────────────────── */}
              {nowPlaying.length > 0 && (
                <AnimatedSection anim={s[4]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Estreando Agora" icon="zap"
                      badge="NOVO" accentColor={BLUE}
                      subtitle="Chegando aos cinemas esta semana"
                      onSeeAll={() => openModal("Estreando Agora", nowPlaying, BLUE)} />
                    <FeaturedRow items={nowPlaying} onPress={goTo} accentColor={BLUE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 7. SÉRIES EM EXIBIÇÃO ───────────────────────────────── */}
              {onAir.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Séries no Ar" icon="tv"
                      badge="AO AR" accentColor={GREEN}
                      subtitle="Episódios novos toda semana"
                      onSeeAll={() => openModal("Séries no Ar", onAir, GREEN)} />
                    <MoodRow items={onAir} onPress={goTo}
                      labels={["NOVO EP.","HOJE","NOVO EP.","AMANHÃ","NOVO EP.","HOJE"]}
                      accentColor={GREEN} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 9. TOP 10 SÉRIES ────────────────────────────────────── */}
              {top10Series.length > 0 && (
                <AnimatedSection anim={s[7]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Top 10 Séries" icon="award"
                      badge="TOP 10" accentColor={PURPLE}
                      onSeeAll={() => openModal("Top 10 Séries", top10Series, PURPLE)} />
                    <Top10Row items={top10Series} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 10. EM BREVE / COUNTDOWN ────────────────────────────── */}
              {countdownItem && (
                <AnimatedSection anim={s[8]}>
                  <CountdownBanner item={countdownItem} daysLeft={7}
                    onPress={() => goTo(countdownItem)} />
                </AnimatedSection>
              )}

              {/* Below-fold: deferred until after first render interactions complete */}
              {belowFoldReady && (
              <>

              {/* ── 11. POPULARES FILMES ────────────────────────────────── */}
              {popularMovies.length > 0 && (
                <AnimatedSection anim={s[9]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Populares" icon="activity" accentColor={ORANGE}
                      subtitle="Os mais assistidos do momento"
                      onSeeAll={() => openModal("Populares", popularMovies, ORANGE)} />
                    <PosterRow items={popularMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="GÊNEROS" accentColor={PURPLE} />

              {/* ── 12. AÇÃO & AVENTURA ─────────────────────────────────── */}
              {actionMovies.length > 0 && (
                <AnimatedSection anim={s[10]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Ação & Aventura" icon="zap"
                      accentColor={RED}
                      onSeeAll={() => openModal("Ação & Aventura", actionMovies, RED)} />
                    <WideRow items={actionMovies} onPress={goTo}
                      badgeFn={(i) => i.rating >= 7.5 ? "ÉPICO" : undefined}
                      accentColor={RED} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 13. DRAMA ───────────────────────────────────────────── */}
              {dramaMovies.length > 0 && (
                <AnimatedSection anim={s[11]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Drama" icon="heart"
                      accentColor={BLUE}
                      onSeeAll={() => openModal("Drama", dramaMovies, BLUE)} />
                    <PosterRow items={dramaMovies} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 14. SPOTLIGHT 2 — SÉRIE ─────────────────────────────── */}
              {spotlight2 && (
                <AnimatedSection anim={s[12]}>
                  <SpotlightBanner item={spotlight2}
                    label="SÉRIE DO MOMENTO"
                    onPress={() => goTo(spotlight2)}
                    accentColor={PURPLE} />
                </AnimatedSection>
              )}

              {/* ── 15. COMÉDIA ─────────────────────────────────────────── */}
              {comedyMovies.length > 0 && (
                <AnimatedSection anim={s[13]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Comédia" icon="smile"
                      accentColor={ORANGE}
                      onSeeAll={() => openModal("Comédia", comedyMovies, ORANGE)} />
                    <FeaturedRow items={comedyMovies} onPress={goTo} accentColor={ORANGE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 16. TERROR & SUSPENSE ───────────────────────────────── */}
              {horrorMovies.length > 0 && (
                <AnimatedSection anim={s[14]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Terror & Suspense" icon="eye"
                      accentColor={DARK}
                      onSeeAll={() => openModal("Terror & Suspense", horrorMovies, DARK)} />
                    <MoodRow items={horrorMovies} onPress={goTo} accentColor={DARK} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 17. FICÇÃO CIENTÍFICA ───────────────────────────────── */}
              {scifiMovies.length > 0 && (
                <AnimatedSection anim={s[15]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Ficção Científica" icon="cpu"
                      accentColor={TEAL}
                      onSeeAll={() => openModal("Ficção Científica", scifiMovies, TEAL)} />
                    <WideRow items={scifiMovies} onPress={goTo} accentColor={TEAL} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 18. STATS BANNER ────────────────────────────────────── */}
              <AnimatedSection anim={s[16]}>
                <StatsBanner stats={[
                  { label:"Filmes", value: `${allMovies.length}+`, color:RED,    icon:"film" },
                  { label:"Séries", value: `${allSeries.length}+`, color:PURPLE, icon:"tv"   },
                  { label:"Animes", value: `${allAnimes.length}+`, color:TEAL,   icon:"star" },
                ]} />
              </AnimatedSection>

              {/* ── 19. ROMANCE ─────────────────────────────────────────── */}
              {romanceMovies.length > 0 && (
                <AnimatedSection anim={s[17]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Romance" icon="heart"
                      accentColor={PINK}
                      onSeeAll={() => openModal("Romance", romanceMovies, PINK)} />
                    <PosterRow items={romanceMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 20. PROMO — MINHA LISTA ─────────────────────────────── */}
              <AnimatedSection anim={s[18]}>
                <PromoBanner icon="bookmark"
                  title="Minha Lista Pessoal"
                  subtitle="Salve filmes e séries para assistir depois"
                  actionLabel="Abrir lista"
                  onPress={() => router.push("/(tabs)/list")}
                  gradient={[TEAL,"#0e7490"]} />
              </AnimatedSection>

              <SectionDivider label="SÉRIES" accentColor={GREEN} />

              {/* ── 21. DRAMA SÉRIES ────────────────────────────────────── */}
              {dramaSeries.length > 0 && (
                <AnimatedSection anim={s[19]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Dramas Envolventes" icon="heart"
                      accentColor={BLUE}
                      onSeeAll={() => openModal("Dramas Envolventes", dramaSeries, BLUE)} />
                    <FeaturedRow items={dramaSeries} onPress={goTo} accentColor={BLUE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 22. THRILLER & CRIME ────────────────────────────────── */}
              {thrillerMovies.length > 0 && (
                <AnimatedSection anim={s[20]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Thriller & Crime" icon="shield"
                      accentColor={INDIGO}
                      onSeeAll={() => openModal("Thriller & Crime", [...thrillerMovies,...crimeSeries], INDIGO)} />
                    <WideRow items={thrillerMovies} onPress={goTo} accentColor={INDIGO} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 23. CRIME SÉRIES ────────────────────────────────────── */}
              {crimeSeries.length > 0 && (
                <AnimatedSection anim={s[21]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Crime & Investigação" icon="search"
                      accentColor={INDIGO}
                      onSeeAll={() => openModal("Crime & Investigação", crimeSeries, INDIGO)} />
                    <CompactRow items={crimeSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 24. POPULARES SÉRIES ────────────────────────────────── */}
              {popularSeries.length > 0 && (
                <AnimatedSection anim={s[22]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Séries em Destaque" icon="star"
                      accentColor={AMBER}
                      onSeeAll={() => openModal("Séries em Destaque", popularSeries, AMBER)} />
                    <PosterRow items={popularSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="ESPECIAIS" accentColor={AMBER} />

              {/* ── 25. FRANQUIAS & UNIVERSOS ───────────────────────────── */}
              {franquiasItems.length > 0 && (
                <AnimatedSection anim={s[23]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Franquias & Universos" icon="layers"
                      accentColor={AMBER}
                      onSeeAll={() => openModal("Franquias & Universos", franquiasItems, AMBER)} />
                    <FeaturedRow items={franquiasItems} onPress={goTo} accentColor={AMBER} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 26. PREMIADOS ───────────────────────────────────────── */}
              {premiadosItems.length > 0 && (
                <AnimatedSection anim={s[24]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Premiados & Aclamados" icon="award"
                      badge="PREMIADO" accentColor={AMBER}
                      onSeeAll={() => openModal("Premiados & Aclamados", premiadosItems, AMBER)} />
                    <PosterRow items={premiadosItems} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 27. SPOTLIGHT 3 ─────────────────────────────────────── */}
              {spotlight3 && (
                <AnimatedSection anim={s[25]}>
                  <SpotlightBanner item={spotlight3}
                    label="ESCOLHA DO EDITOR"
                    onPress={() => goTo(spotlight3)}
                    accentColor={ORANGE} />
                </AnimatedSection>
              )}

              {/* ── 28. ANIMAÇÃO ────────────────────────────────────────── */}
              {animMovies.length > 0 && (
                <AnimatedSection anim={s[26]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Animações" icon="film"
                      accentColor={ORANGE}
                      onSeeAll={() => openModal("Animações", animMovies, ORANGE)} />
                    <PosterRow items={animMovies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="MUNDO" accentColor={TEAL} />

              {/* ── 29. ANIMES ──────────────────────────────────────────── */}
              {animeSeries.length > 0 && (
                <AnimatedSection anim={s[27]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Animes" icon="star"
                      accentColor={AMBER}
                      onSeeAll={() => openModal("Animes", animeSeries, AMBER)} />
                    <PosterRow items={animeSeries} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 30. K-DRAMA ─────────────────────────────────────────── */}
              {kDramas.length > 0 && (
                <AnimatedSection anim={s[28]}>
                  <View style={sty.sec}>
                    <SectionHeader title="K-Drama" icon="globe"
                      accentColor={PINK}
                      onSeeAll={() => openModal("K-Drama", kDramas, PINK)} />
                    <FeaturedRow items={kDramas} onPress={goTo} accentColor={PINK} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 31. SÉRIES ESPANHOLAS ───────────────────────────────── */}
              {spanishSeries.length > 0 && (
                <AnimatedSection anim={s[29]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Séries Espanholas" icon="globe"
                      accentColor={ORANGE}
                      onSeeAll={() => openModal("Séries Espanholas", spanishSeries, ORANGE)} />
                    <WideRow items={spanishSeries} onPress={goTo} accentColor={ORANGE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 32. DOCUMENTÁRIOS ───────────────────────────────────── */}
              {docMovies.length > 0 && (
                <AnimatedSection anim={s[30]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Documentários" icon="book-open"
                      accentColor={GREEN}
                      onSeeAll={() => openModal("Documentários", docMovies, GREEN)} />
                    <MoodRow items={docMovies} onPress={goTo} accentColor={GREEN} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 33. NACIONAL ────────────────────────────────────────── */}
              {nationalContent.length > 0 && (
                <AnimatedSection anim={s[31]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Produção Nacional" icon="map-pin"
                      accentColor={GREEN}
                      onSeeAll={() => openModal("Produção Nacional", nationalContent, GREEN)} />
                    <PosterRow items={nationalContent} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 34. PROMO — ACERVO ──────────────────────────────────── */}
              <AnimatedSection anim={s[32]}>
                <PromoBanner icon="archive"
                  title="Acervo Completo"
                  subtitle="Explore todo o catálogo disponível"
                  actionLabel="Explorar"
                  onPress={() => router.push("/(tabs)/franquias")}
                  gradient={["#1e1b4b", INDIGO]} />
              </AnimatedSection>

              <SectionDivider label="DESCOBRIR" accentColor={INDIGO} />

              {/* ── 35. PARA A FAMÍLIA ──────────────────────────────────── */}
              {familyMovies.length > 0 && (
                <AnimatedSection anim={s[33]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Para Toda a Família" icon="users"
                      accentColor="#06b6d4"
                      onSeeAll={() => openModal("Para Toda a Família", familyMovies, "#06b6d4")} />
                    <FeaturedRow items={familyMovies} onPress={goTo} accentColor="#06b6d4" />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 36. CLÁSSICOS ───────────────────────────────────────── */}
              {classicMovies.length > 0 && (
                <AnimatedSection anim={s[34]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Clássicos do Cinema" icon="video"
                      accentColor={AMBER}
                      onSeeAll={() => openModal("Clássicos do Cinema", classicMovies, AMBER)} />
                    <WideRow items={classicMovies} onPress={goTo} accentColor={AMBER} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 37. BASEADO EM FATOS ────────────────────────────────── */}
              {basedOnFacts.length > 0 && (
                <AnimatedSection anim={s[35]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Baseado em Fatos Reais" icon="info"
                      accentColor={BLUE}
                      onSeeAll={() => openModal("Baseado em Fatos Reais", basedOnFacts, BLUE)} />
                    <CompactRow items={basedOnFacts} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 38. MAIS BEM AVALIADOS ──────────────────────────────── */}
              {maisAvaliados.length > 0 && (
                <AnimatedSection anim={s[36]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Mais Bem Avaliados" icon="star"
                      badge="NOTA ALTA" accentColor={AMBER}
                      onSeeAll={() => openModal("Mais Bem Avaliados", maisAvaliados, AMBER)} />
                    <PosterRow items={maisAvaliados} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 39. PROMO FINAL ─────────────────────────────────────── */}
              <AnimatedSection anim={s[37]}>
                <PromoBanner icon="download"
                  title="Baixe e Assista Offline"
                  subtitle="Salve conteúdos para ver sem internet"
                  actionLabel="Downloads"
                  onPress={() => router.push("/(tabs)/downloads")}
                  gradient={["#134e4a","#0f766e"]} />
              </AnimatedSection>

              </>
              )}
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* ═══ VER MAIS MODAL ══════════════════════════════════════════════════ */}
      <VerMaisModal
        visible={modal.visible}
        title={modal.title}
        items={modal.items}
        accentColor={modal.accent}
        onClose={closeModal}
        onItemPress={goTo}
        fetchMoreFn={modal.fetchMoreFn}
      />

      {/* ═══ SCROLL TOP FAB ══════════════════════════════════════════════════ */}
      <ScrollTopFab scrollRef={scrollRef} visible={showFab} />
    </View>
  );
}

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  root:    { flex: 1 },

  // Header
  header:  { position:"absolute", top:0, left:0, right:0, zIndex:20 },
  headerInner: {
    flexDirection:"row", alignItems:"center",
    justifyContent:"space-between",
    paddingHorizontal:20, paddingBottom:10,
  },
  logoAccent: { width:4, height:20, borderRadius:2, backgroundColor:RED, marginRight:2 },
  logoRed:   { fontSize:20, fontWeight:"900", color:RED, letterSpacing:1.5 },
  logoWhite: { fontSize:20, fontWeight:"900", color:"#fff", letterSpacing:1.5 },
  headerActions: { flexDirection:"row", gap:4 },
  iconBtn:   { width:38, height:38, alignItems:"center", justifyContent:"center", borderRadius:19 },

  // Section container
  sec:     { marginBottom:32 },

  // PosterCard
  pCard: {
    borderRadius:12, overflow:"hidden", backgroundColor:"#111",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:4}, shadowOpacity:0.4, shadowRadius:8 },
      android: { elevation:6 },
    }),
  },
  pFall:   { flex:1, alignItems:"center", justifyContent:"center" },
  pTitle:  { color:"rgba(255,255,255,0.7)", fontSize:11, fontWeight:"600", marginTop:6, textAlign:"center" },
  newBadge:{ position:"absolute", top:7, left:7, backgroundColor:RED, borderRadius:5, paddingHorizontal:6, paddingVertical:3 },
  newBadgeText:{ color:"#fff", fontSize:8, fontWeight:"900", letterSpacing:0.8 },
  ratingPin:{ position:"absolute", bottom:7, right:7, flexDirection:"row", alignItems:"center", gap:3,
    backgroundColor:"rgba(245,158,11,0.2)", borderRadius:5, paddingHorizontal:5, paddingVertical:3 },
  ratingPinText:{ color:AMBER, fontSize:8, fontWeight:"700" },

  // WideCard
  wCard: {
    width:190, height:112, borderRadius:14, overflow:"hidden", backgroundColor:"#111",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:5}, shadowOpacity:0.45, shadowRadius:10 },
      android: { elevation:7 },
    }),
  },
  wBadge:    { position:"absolute", top:9, left:9, borderRadius:6, paddingHorizontal:7, paddingVertical:3 },
  wBadgeText:{ color:"#fff", fontSize:8, fontWeight:"900", letterSpacing:0.8 },
  wInfo:     { position:"absolute", bottom:9, left:11, right:11 },
  wTitle:    { color:"#fff", fontSize:13, fontWeight:"800", letterSpacing:-0.2 },
  wMeta:     { color:"rgba(255,255,255,0.45)", fontSize:10, marginTop:2 },
  wRating:   { position:"absolute", top:9, right:9, flexDirection:"row", alignItems:"center", gap:3,
    backgroundColor:"rgba(245,158,11,0.2)", borderRadius:5, paddingHorizontal:5, paddingVertical:3 },
  wRatingText:{ color:AMBER, fontSize:8, fontWeight:"700" },

  // FeaturedCard
  fCard: {
    width:148, height:220, borderRadius:14, overflow:"hidden", backgroundColor:"#111",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:6}, shadowOpacity:0.5, shadowRadius:12 },
      android: { elevation:8 },
    }),
  },
  fInfo:      { position:"absolute", bottom:12, left:10, right:10, gap:6 },
  fRateBadge: { flexDirection:"row", alignItems:"center", gap:4, alignSelf:"flex-start",
    borderWidth:1, borderRadius:6, paddingHorizontal:6, paddingVertical:3 },
  fRateText:  { fontSize:9, fontWeight:"700" },
  fTitle:     { color:"#fff", fontSize:13, fontWeight:"800", letterSpacing:-0.2, lineHeight:17 },
  fPlayBtn:   { width:28, height:28, borderRadius:14, alignItems:"center", justifyContent:"center", alignSelf:"flex-start" },

  // MoodCard
  mCard: {
    width:W * 0.72, height:165, borderRadius:16, overflow:"hidden", backgroundColor:"#111",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:6}, shadowOpacity:0.5, shadowRadius:12 },
      android: { elevation:8 },
    }),
  },
  mLabel:    { position:"absolute", top:12, left:12, borderWidth:1, borderRadius:8,
    paddingHorizontal:9, paddingVertical:4 },
  mLabelText:{ fontSize:9, fontWeight:"900", letterSpacing:1.2 },
  mBottom:   { position:"absolute", bottom:12, left:12, right:12, flexDirection:"row",
    alignItems:"flex-end", justifyContent:"space-between" },
  mTitle:    { color:"#fff", fontSize:15, fontWeight:"800", flex:1, letterSpacing:-0.3 },
  mPlay:     { width:32, height:32, borderRadius:16, alignItems:"center", justifyContent:"center" },

  // CompactListItem
  compactList: { paddingHorizontal:16 },
  cItem:  { flexDirection:"row", alignItems:"center", gap:12,
    paddingVertical:12, borderBottomWidth:1, borderBottomColor:"rgba(255,255,255,0.05)" },
  cRank:  { color:"rgba(255,255,255,0.2)", fontSize:18, fontWeight:"900", width:28, textAlign:"center" },
  cThumb: { width:56, height:56, borderRadius:10, overflow:"hidden", backgroundColor:"#111" },
  cInfo:  { flex:1, gap:2 },
  cTitle: { color:"#fff", fontSize:14, fontWeight:"700" },
  cMeta:  { color:"rgba(255,255,255,0.4)", fontSize:11 },
  cRatingRow:{ flexDirection:"row", alignItems:"center", gap:3, marginTop:1 },
  cRatingText:{ color:AMBER, fontSize:10, fontWeight:"700" },

  // CircleCard
  circle:     { width:88 },
  circleGrad: { borderRadius:16, padding:12, alignItems:"center", gap:8 },
  circleIcon: { width:48, height:48, borderRadius:24, alignItems:"center", justifyContent:"center", borderWidth:1 },
  circleLabel:{ fontSize:11, fontWeight:"700", letterSpacing:0.2, textAlign:"center" },

  // SpotlightBanner
  spotPad:     { paddingHorizontal:16, marginBottom:28 },
  spotCard:    { height:195, borderRadius:20, overflow:"hidden", backgroundColor:"#111",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:0.5, shadowRadius:18 },
      android: { elevation:12 },
    }),
  },
  spotGlowStrip:{ position:"absolute", top:0, left:0, right:0, height:3 },
  spotContent:  { position:"absolute", bottom:0, left:0, right:0, padding:20, gap:8 },
  spotLabel:    { alignSelf:"flex-start", borderWidth:1, borderRadius:8,
    paddingHorizontal:9, paddingVertical:4 },
  spotLabelText:{ fontSize:9, fontWeight:"900", letterSpacing:1.5 },
  spotTitle:    { color:"#fff", fontSize:20, fontWeight:"900", letterSpacing:-0.5, lineHeight:26 },
  spotMeta:     { flexDirection:"row", alignItems:"center", gap:8 },
  spotRate:     { flexDirection:"row", alignItems:"center", gap:4 },
  spotRateText: { color:AMBER, fontSize:12, fontWeight:"700" },
  spotYear:     { color:"rgba(255,255,255,0.5)", fontSize:12, fontWeight:"500" },
  spotType:     { color:"rgba(255,255,255,0.5)", fontSize:12, fontWeight:"500" },
  spotPlay:     { flexDirection:"row", alignItems:"center", gap:7, alignSelf:"flex-start",
    borderRadius:10, paddingHorizontal:14, paddingVertical:8, marginTop:2 },
  spotPlayText: { color:"#fff", fontSize:13, fontWeight:"800" },

  // CountdownBanner
  cdPad:    { paddingHorizontal:16, marginBottom:28 },
  cdCard:   { height:130, borderRadius:18, overflow:"hidden", backgroundColor:"#111" },
  cdContent:{ position:"absolute", top:0, left:0, right:0, bottom:0, flexDirection:"row",
    alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingVertical:16 },
  cdLeft:   { flex:1, gap:6 },
  cdChip:   { flexDirection:"row", alignItems:"center", gap:6, alignSelf:"flex-start",
    backgroundColor:"rgba(139,92,246,0.25)", borderWidth:1, borderColor:"rgba(139,92,246,0.5)",
    borderRadius:8, paddingHorizontal:9, paddingVertical:4 },
  cdDot:    { width:6, height:6, borderRadius:3, backgroundColor:PURPLE },
  cdChipText:{ color:PURPLE, fontSize:9, fontWeight:"900", letterSpacing:1.5 },
  cdTitle:  { color:"#fff", fontSize:16, fontWeight:"900", letterSpacing:-0.3 },
  cdSub:    { color:"rgba(255,255,255,0.5)", fontSize:11, fontWeight:"500" },
  cdCounterBox:{ width:72, height:72, borderRadius:16, backgroundColor:"rgba(139,92,246,0.2)",
    borderWidth:1, borderColor:"rgba(139,92,246,0.4)", alignItems:"center", justifyContent:"center" },
  cdNumber: { color:PURPLE, fontSize:30, fontWeight:"900", lineHeight:34 },
  cdUnit:   { color:"rgba(255,255,255,0.5)", fontSize:10, fontWeight:"600" },

  // PromoBanner
  promoPad:  { paddingHorizontal:16, marginBottom:28 },
  promoCard: { borderRadius:18, overflow:"hidden",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:6}, shadowOpacity:0.4, shadowRadius:14 },
      android: { elevation:8 },
    }),
  },
  promoContent:{ flexDirection:"row", alignItems:"center", gap:14, padding:18 },
  promoIcon:   { width:44, height:44, borderRadius:12, backgroundColor:"rgba(255,255,255,0.2)",
    alignItems:"center", justifyContent:"center" },
  promoTitle:  { color:"#fff", fontSize:15, fontWeight:"800", letterSpacing:-0.2 },
  promoSub:    { color:"rgba(255,255,255,0.7)", fontSize:11, fontWeight:"500", marginTop:2 },
  promoAction: { flexDirection:"row", alignItems:"center", gap:5,
    backgroundColor:"rgba(255,255,255,0.2)", borderRadius:10, paddingHorizontal:10, paddingVertical:6 },
  promoActionText:{ color:"#fff", fontSize:12, fontWeight:"700" },

  // StatsBanner
  stats:   { flexDirection:"row", paddingHorizontal:16, gap:8, marginBottom:28 },
  statPill:{ flex:1, flexDirection:"row", alignItems:"center", gap:8,
    paddingHorizontal:12, paddingVertical:12, borderRadius:14, borderWidth:1, overflow:"hidden" },
  statVal: { fontSize:15, fontWeight:"800", letterSpacing:-0.3 },
  statLbl: { fontSize:10, color:"rgba(255,255,255,0.45)", fontWeight:"500", marginTop:1 },

  // SectionHeader
  secHead:  { flexDirection:"row", alignItems:"center", justifyContent:"space-between",
    paddingHorizontal:20, marginBottom:14 },
  secLeft:  { flexDirection:"row", alignItems:"center", gap:8, flex:1 },
  accentBar:{ width:3, height:18, borderRadius:2 },
  iconWrap: { width:28, height:28, borderRadius:8, alignItems:"center", justifyContent:"center" },
  secTitle: { fontSize:17, fontWeight:"800", letterSpacing:-0.4, color:"#fff" },
  secSub:   { fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:1 },
  badge:    { borderWidth:1, borderRadius:6, paddingHorizontal:7, paddingVertical:3 },
  badgeText:{ fontSize:9, fontWeight:"800", letterSpacing:0.8 },
  seeAllBtn:{ flexDirection:"row", alignItems:"center", gap:3,
    paddingHorizontal:10, paddingVertical:5, borderRadius:20,
    borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  seeAllText:{ fontSize:11, fontWeight:"600", color:"rgba(255,255,255,0.4)" },

  // SectionDivider
  divRow:   { flexDirection:"row", alignItems:"center", paddingHorizontal:20, marginVertical:24, gap:12 },
  divLine:  { flex:1, height:1 },
  divLabel: { paddingHorizontal:12, paddingVertical:5, borderRadius:8, borderWidth:1 },
  divText:  { fontSize:9, fontWeight:"900", letterSpacing:2.5 },

  // VerMais Modal
  modal: {
    position:"absolute", bottom:0, left:0, right:0,
    height: H * 0.85, borderTopLeftRadius:28, borderTopRightRadius:28,
    overflow:"hidden",
    ...Platform.select({
      ios:     { shadowColor:"#000", shadowOffset:{width:0,height:-8}, shadowOpacity:0.6, shadowRadius:24 },
      android: { elevation:24 },
    }),
  },
  modalHandle: { width:44, height:5, borderRadius:3, alignSelf:"center", marginTop:12, marginBottom:4 },
  modalHeader: { flexDirection:"row", alignItems:"center", justifyContent:"space-between",
    paddingHorizontal:20, paddingVertical:16, borderBottomWidth:1, borderBottomColor:"rgba(255,255,255,0.06)" },
  modalAccent: { width:3, height:18, borderRadius:2 },
  modalTitle:  { fontSize:17, fontWeight:"800", color:"#fff", letterSpacing:-0.3 },
  modalClose:  { width:36, height:36, borderRadius:18, backgroundColor:"rgba(255,255,255,0.08)",
    alignItems:"center", justifyContent:"center" },
  loadMoreBtn: { marginHorizontal:16, marginTop:16, borderRadius:14, overflow:"hidden",
    flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8,
    paddingVertical:14, borderWidth:1, borderColor:"rgba(255,255,255,0.1)" },
  loadMoreText: { fontSize:13, fontWeight:"700" },
  searchWrap: { flexDirection:"row", alignItems:"center", marginHorizontal:16, marginBottom:12,
    backgroundColor:"rgba(255,255,255,0.07)", borderRadius:12, borderWidth:1,
    borderColor:"rgba(255,255,255,0.1)", paddingHorizontal:12, height:40 },
  searchInput: { flex:1, color:"rgba(255,255,255,0.55)", fontSize:13, paddingVertical:0 },

  // FAB
  fab:     { position:"absolute", right:20, bottom:110, zIndex:50 },
  fabGrad: { width:46, height:46, borderRadius:23, alignItems:"center", justifyContent:"center",
    ...Platform.select({
      ios:     { shadowColor:RED, shadowOffset:{width:0,height:4}, shadowOpacity:0.5, shadowRadius:10 },
      android: { elevation:10 },
    }),
  },
});
