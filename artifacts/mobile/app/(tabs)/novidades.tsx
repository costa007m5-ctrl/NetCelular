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
import { getModalHistory, addToModalHistory, clearModalHistory, removeFromModalHistory } from "@/lib/modal-search-history";

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

// Same permissive filter used in Home: accept tmdb_id=0 if there's an id + title
const hasId = (i: any) => i.tmdb_id > 0 || (i.id != null && String(i.id).length > 0);

async function fetchFromApi(type: "movies" | "series" | "animes"): Promise<any[]> {
  try {
    // Use catalog-full (same as Home) — returns all items, not just tmdb_id > 0
    const res = await r2Route<{ success: boolean; data: any[] }>(
      `/flix2/catalog-full?type=${type}`
    );
    if (!res.success) return [];
    return (res.data ?? []).filter((i: any) => hasId(i) && i.title);
  } catch {
    return [];
  }
}

async function fetchCatalog(
  type: "movies" | "series" | "animes",
  onRefresh?: (items: ContentItem[]) => void
): Promise<ContentItem[]> {
  // 1. Try cache first — instant display
  const cached = await getCached(type);
  if (cached) {
    const items = cached
      .filter((i: any) => hasId(i) && i.title)
      .map(flix2ToContent);
    // Background revalidation — silent refresh
    fetchFromApi(type).then((raw) => {
      if (raw.length) {
        setCached(type, raw);
        onRefresh?.(raw.map(flix2ToContent));
      }
    }).catch(() => {});
    return items;
  }
  // 2. Cache miss — fetch and store
  const raw = await fetchFromApi(type);
  if (raw.length) setCached(type, raw);
  return raw.map(flix2ToContent);
}

async function fetchOnePage(
  type: "movies" | "series" | "animes",
  page: number,
): Promise<ContentItem[]> {
  try {
    const res = await r2Route<{ success: boolean; data: any[] }>(
      `/flix2/catalog?type=${type}&page=${page}`
    );
    if (!res.success) return [];
    return (res.data ?? [])
      .filter((i: any) => i.tmdb_id > 0 && i.poster)
      .map(flix2ToContent);
  } catch {
    return [];
  }
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
  item, onPress, badge, accentColor = RED, isNew = false,
}: {
  item: ContentItem; onPress: () => void; badge?: string; accentColor?: string; isNew?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const imgUri = item.backdropPath || item.posterPath;
  const pi = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.wCard, { transform: [{ scale }] }]}>
        {!err && imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={280}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#0d0a1a","#060408"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent","rgba(0,0,0,0.92)"]} locations={[0.25,1]}
          style={StyleSheet.absoluteFill} />
        {isNew && (
          <View style={[sty.wBadge, { backgroundColor: RED, left: 8, top: 8 }]}>
            <Text style={sty.wBadgeText}>NOVO</Text>
          </View>
        )}
        {badge && !isNew && (
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
  item, onPress, accentColor = RED, isNew = false,
}: {
  item: ContentItem; onPress: () => void; accentColor?: string; isNew?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const imgUri = item.posterPath || item.backdropPath;
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[sty.fCard, { transform: [{ scale }] }]}>
        {!err && imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={280}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14","#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["transparent", `${accentColor}18`, "rgba(0,0,0,0.96)"]}
          locations={[0.38, 0.68, 1]} style={StyleSheet.absoluteFill} />
        {isNew && (
          <View style={sty.newBadge}>
            <Text style={sty.newBadgeText}>NOVO</Text>
          </View>
        )}
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
  fetchMoreFn, genres, initTmdbPage = 1,
}: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (item: ContentItem) => void;
  fetchMoreFn?: (page: number) => Promise<ContentItem[]>;
  genres?: { id: number; label: string }[];
  initTmdbPage?: number;
}) {
  const slideY   = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [page,          setPage]          = useState(1);
  const [extraItems,    setExtraItems]    = useState<ContentItem[]>([]);
  const [tmdbPage,      setTmdbPage]      = useState(initTmdbPage);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [noMoreTmdb,    setNoMoreTmdb]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const PAGE = 20;

  const allItems     = useMemo(() => [...items, ...extraItems], [items, extraItems]);
  const shown        = useMemo(() => allItems.slice(0, page * PAGE), [allItems, page]);
  const q            = searchQuery.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    let base = q ? allItems.filter((i) => i.title.toLowerCase().includes(q)) : shown;
    if (selectedGenre !== null) base = base.filter((i) => (i.genres ?? []).includes(selectedGenre));
    return base;
  }, [q, allItems, shown, selectedGenre]);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 1) return [];
    const lq = searchQuery.trim().toLowerCase();
    return allItems
      .filter((i) => i.title.toLowerCase().includes(lq))
      .slice(0, 6);
  }, [searchQuery, allItems]);

  useEffect(() => {
    if (visible) {
      setPage(1);
      setExtraItems([]);
      setTmdbPage(initTmdbPage ?? 1);
      setNoMoreTmdb(false);
      setSearchQuery("");
      setSearchFocused(false);
      setSelectedGenre(null);
      getModalHistory(title).then(setSearchHistory).catch(() => {});
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

  const loadAllPages = useCallback(async () => {
    if (!fetchMoreFn || loadingMore || noMoreTmdb) return;
    setLoadingMore(true);
    try {
      const startPage = tmdbPage + 1;
      const pages = Array.from({ length: 10 }, (_, i) => startPage + i);
      const results = await Promise.allSettled(pages.map((pg) => fetchMoreFn(pg)));
      const newItems: ContentItem[] = [];
      let lastPage = tmdbPage;
      let hitEmpty = false;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled" && r.value.length > 0) {
          newItems.push(...r.value);
          lastPage = pages[i];
        } else { hitEmpty = true; break; }
      }
      if (newItems.length > 0) {
        setExtraItems((prev) => [...prev, ...newItems]);
        setTmdbPage(lastPage);
        setPage((p) => p + Math.ceil(newItems.length / PAGE));
      }
      if (hitEmpty || newItems.length === 0) setNoMoreTmdb(true);
    } catch {
      setNoMoreTmdb(true);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchMoreFn, loadingMore, noMoreTmdb, tmdbPage, PAGE]);

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
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Feather name="x-circle" size={14} color={accentColor} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Search history (shown when focused + no query) ──────────── */}
        {searchFocused && !q && searchHistory.length > 0 && (
          <View style={{ marginBottom: 4 }}>
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

        {/* ── Autocomplete suggestions ────────────────────────────────── */}
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

        {/* ── Genre filter pills (only for animes) ───────────────────── */}
        {genres && genres.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}
            style={{ flexGrow: 0 }}>
            <TouchableOpacity
              onPress={() => setSelectedGenre(null)}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                backgroundColor: selectedGenre === null ? accentColor : "rgba(255,255,255,0.08)",
                borderWidth: 1, borderColor: selectedGenre === null ? accentColor : "rgba(255,255,255,0.12)" }}>
              <Text style={{ color: selectedGenre === null ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "700" }}>
                Todos
              </Text>
            </TouchableOpacity>
            {genres.map((g) => (
              <TouchableOpacity key={g.id}
                onPress={() => setSelectedGenre(selectedGenre === g.id ? null : g.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                  backgroundColor: selectedGenre === g.id ? accentColor : "rgba(255,255,255,0.08)",
                  borderWidth: 1, borderColor: selectedGenre === g.id ? accentColor : "rgba(255,255,255,0.12)" }}>
                <Text style={{ color: selectedGenre === g.id ? "#fff" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "700" }}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

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
          keyExtractor={(i, idx) => `${i.id}_${idx}`}
          numColumns={3}
          style={{ flex: 1 }}
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
              <View style={{ paddingVertical: 20, alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={accentColor} />
                <Text style={{ color: `${accentColor}99`, fontSize: 11, fontWeight: "600" }}>
                  Carregando mais títulos...
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 120, paddingTop: 4 }}>
                {!q && shown.length < allItems.length && (
                  <TouchableOpacity onPress={() => setPage((p) => p + 1)} style={sty.loadMoreBtn} activeOpacity={0.8}>
                    <LinearGradient colors={[`${accentColor}22`, `${accentColor}10`]} style={StyleSheet.absoluteFill} />
                    <Feather name="chevrons-down" size={14} color={accentColor} />
                    <Text style={[sty.loadMoreText, { color: accentColor }]}>
                      Ver mais ({allItems.length - shown.length} restantes)
                    </Text>
                  </TouchableOpacity>
                )}
                {!q && fetchMoreFn && !noMoreTmdb && (
                  <TouchableOpacity onPress={loadAllPages} activeOpacity={0.8}
                    style={[sty.loadMoreBtn, { borderColor: `${accentColor}60`, backgroundColor: "transparent" }]}>
                    <LinearGradient colors={[`${accentColor}30`, `${accentColor}15`]} style={StyleSheet.absoluteFill} />
                    <Feather name="zap" size={14} color={accentColor} />
                    <Text style={[sty.loadMoreText, { color: accentColor, fontWeight: "800" }]}>
                      Carregar tudo · próximas ~200 páginas
                    </Text>
                  </TouchableOpacity>
                )}
                {noMoreTmdb && allItems.length > 0 && (
                  <View style={{ alignItems: "center", paddingVertical: 12 }}>
                    <Text style={{ color: "#ffffff30", fontSize: 11 }}>
                      {allItems.length} títulos carregados · fim do catálogo
                    </Text>
                  </View>
                )}
              </View>
            )
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
      {items.slice(0,4).map((item) => (
        <PosterCard key={item.id} item={item} onPress={()=>onPress(item)}
          showTitle={showTitle} isNew={isNew} />
      ))}
    </ScrollView>
  );
}

function WideRow({ items, onPress, badgeFn, accentColor, isNewFn }: {
  items:ContentItem[]; onPress:(i:ContentItem)=>void;
  badgeFn?:(i:ContentItem)=>string|undefined; accentColor?:string;
  isNewFn?:(i:ContentItem)=>boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {items.slice(0,6).map((item) => (
        <WideCard key={item.id} item={item} onPress={()=>onPress(item)}
          badge={badgeFn?.(item)} accentColor={accentColor}
          isNew={isNewFn?.(item) ?? false} />
      ))}
    </ScrollView>
  );
}

function FeaturedRow({ items, onPress, accentColor=RED, isNewFn }: {
  items:ContentItem[]; onPress:(i:ContentItem)=>void; accentColor?:string;
  isNewFn?:(i:ContentItem)=>boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal:16, gap:10 }} decelerationRate="fast">
      {items.slice(0,6).map((item) => (
        <FeaturedCard key={item.id} item={item} onPress={()=>onPress(item)}
          accentColor={accentColor} isNew={isNewFn?.(item) ?? false} />
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
      {items.slice(0,4).map((item,i) => (
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

function _Top10Row_unused({ items, onPress }: { items:ContentItem[]; onPress:(i:ContentItem)=>void }) {
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
  const s         = useRef(makeAnims(11)).current;
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

  // derived slices — each row skips items already shown in earlier rows
  // Hero takes the first ~6 movies with backdrops (roughly allMovies[0-5])
  // nonHeroMovies filters them out so no carousel repeats the hero items
  const heroIds = useMemo(
    () => new Set(heroItems.map((i) => i.id)),
    [heroItems]
  );
  const nonHeroMovies = useMemo(
    () => allMovies.filter((i) => !heroIds.has(i.id)),
    [allMovies, heroIds]
  );
  const CURRENT_YEAR = new Date().getFullYear();

  // trendMovies: prefer items with backdrop (WideRow uses backdrop image)
  const trendMovies = useMemo(() => {
    const withBg = nonHeroMovies.filter((i) => !!(i.backdropPath || i.posterPath));
    return withBg.slice(0, 6);
  }, [nonHeroMovies]);

  // nowPlaying: items with poster, not already in trendMovies
  const trendIds = useMemo(() => new Set(trendMovies.map((i) => i.id)), [trendMovies]);
  const nowPlaying  = useMemo(() => {
    return nonHeroMovies.filter((i) => !trendIds.has(i.id) && !!(i.posterPath || i.backdropPath)).slice(0, 6);
  }, [nonHeroMovies, trendIds]);

  const onAir       = useMemo(() => allSeries.slice(0, 4),  [allSeries]);
  const trendAnimes = useMemo(() => allAnimes.slice(0, 6),  [allAnimes]);

  // lancamentos: recently released content (last 2 years) with images — mixed films + series
  const lancamentos = useMemo(() => {
    const pool = [...allMovies, ...allSeries].filter(
      (i) => i.year >= CURRENT_YEAR - 1 && !!(i.posterPath || i.backdropPath)
    );
    const seen = new Set<string>();
    return pool.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).slice(0, 8);
  }, [allMovies, allSeries, CURRENT_YEAR]);

  // ── R2 / Drive catalog ────────────────────────────────────────────────────
  const { r2Movies, r2Series, r2All } = useR2Catalog();

  // Drive series merged into "Séries no Ar" — Drive comes first so freshly-added shows appear at front
  const mergedOnAir = useMemo(() => {
    if (!r2Series.length) return onAir;
    const all = [...r2Series, ...onAir];
    const seen = new Set<string>();
    return all.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
  }, [r2Series, onAir]);

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
    genres?: { id: number; label: string }[];
    initTmdbPage?: number;
  }>({ visible: false, title: "", items: [], accent: RED });

  const openModal = (
    title: string, items: ContentItem[], accent = RED,
    fetchMoreFn?: (page: number) => Promise<ContentItem[]>,
    genres?: { id: number; label: string }[],
    initTmdbPage = 1,
  ) => setModal({ visible: true, title, items, accent, fetchMoreFn, genres, initTmdbPage });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  // ── apply fetched items to state ─────────────────────────────────────────
  const applyData = useCallback((movies: ContentItem[], series: ContentItem[], animes: ContentItem[]) => {
    // Deduplicate animes: remove items already present in movies or series
    const movAndSerIds = new Set([...movies, ...series].map((i) => i.id));
    const animesDeduped = animes.filter((i) => !movAndSerIds.has(i.id));

    if (movies.length > 0) {
      setAllMovies(movies);
      setHeroItems(movies.filter((x) => x.backdropPath || x.posterPath).slice(0, 6));
    }
    if (series.length > 0) setAllSeries(series);
    if (animesDeduped.length > 0) setAllAnimes(animesDeduped);
  }, []);

  // ── Fetch all data — cache-first + background revalidation ────────────────
  const loadAll = useCallback(async () => {
    const [movRes, serRes, aniRes] = await Promise.allSettled([
      fetchCatalog("movies", (fresh) => setAllMovies(fresh)),
      fetchCatalog("series", (fresh) => setAllSeries(fresh)),
      fetchCatalog("animes", (fresh) => setAllAnimes(fresh)),
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
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId), flix2Id: String(item.id ?? ""), title: item.title, poster: item.posterPath ?? "" },
    });
  }, [router]);

  // Derived spotlights — pulled from nonHeroMovies so they never repeat the hero banner
  // trendMovies=[0-3], gap[4-5], nowPlaying=[6-9] → spotlights start at index 10+
  const spotlight1    = nonHeroMovies[10] ?? nonHeroMovies[0] ?? null;
  const countdownItem = nonHeroMovies[14] ?? nonHeroMovies[5] ?? null;

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
                  <GenreRow onPress={(g) => {
                    const GENRE_ID: Record<string, number> = {
                      "Ação": 28, "Drama": 18, "Comédia": 35, "Terror": 27,
                      "Sci-Fi": 878, "Romance": 10749, "Animação": 16,
                      "Crime": 80, "Doc": 99, "Família": 10751,
                    };
                    router.push({
                      pathname:"/genre-browse",
                      params:{ genre_id: String(GENRE_ID[g] ?? 0), type:"movie", title: g }
                    });
                  }} />
                </View>
              </AnimatedSection>

              {/* ── 2.5. EXCLUSIVOS DRIVE ───────────────────────────────── */}
              {(r2Movies.length > 0 || r2Series.length > 0) && (
                <AnimatedSection anim={s[3]}>
                  <View style={sty.sec}>
                    <SectionHeader
                      title="Exclusivos Drive"
                      icon="hard-drive"
                      badge={String(r2Movies.length + r2Series.length)}
                      accentColor={PURPLE}
                      subtitle={`${r2Movies.length + r2Series.length} títulos no catálogo`}
                      onSeeAll={() => openModal("Exclusivos Drive", [...r2Movies, ...r2Series], PURPLE)}
                    />
                    <PosterRow
                      items={[...r2Movies, ...r2Series].slice(0, 4)}
                      onPress={goTo}
                      showTitle
                      isNew
                    />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 3. TRENDING HOJE ────────────────────────────────────── */}
              {trendMovies.length > 0 && (
                <AnimatedSection anim={s[1]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Tendência Hoje" icon="trending-up"
                      badge={allMovies.length > 0 ? String(allMovies.length) : "AO VIVO"} accentColor={RED}
                      subtitle="O que o mundo está assistindo agora"
                      onSeeAll={() => openModal("Tendência Hoje", allMovies, RED,
                          (pg) => fetchOnePage("movies", pg),
                          [
                            { id: 28,    label: "Ação" },
                            { id: 12,    label: "Aventura" },
                            { id: 16,    label: "Animação" },
                            { id: 35,    label: "Comédia" },
                            { id: 80,    label: "Crime" },
                            { id: 18,    label: "Drama" },
                            { id: 14,    label: "Fantasia" },
                            { id: 878,   label: "Ficção Científica" },
                            { id: 27,    label: "Terror" },
                            { id: 53,    label: "Suspense" },
                            { id: 10749, label: "Romance" },
                          ],
                          3,
                        )} />
                    <WideRow items={trendMovies} onPress={goTo}
                      isNewFn={(i) => i.year >= CURRENT_YEAR - 1}
                      badgeFn={(i) => i.rating >= 8 && i.year < CURRENT_YEAR - 1 ? "DESTAQUE" : undefined} />
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

              <SectionDivider label="LANÇAMENTOS" accentColor={BLUE} />

              {/* ── 5b. LANÇAMENTOS NA PLATAFORMA ───────────────────────── */}
              {lancamentos.length > 0 && (
                <AnimatedSection anim={s[9]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Lançamentos" icon="star"
                      badge="NOVO" accentColor={RED}
                      subtitle="Estreando agora na plataforma"
                      onSeeAll={() => openModal("Lançamentos na Plataforma", lancamentos, RED)} />
                    <PosterRow items={lancamentos.slice(0, 6)} onPress={goTo} isNew showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 6. SÉRIES EM EXIBIÇÃO (ESTREANDO AGORA) ─────────────── */}
              {nowPlaying.length > 0 && (
                <AnimatedSection anim={s[4]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Estreando Agora" icon="zap"
                      badge={allSeries.length > 0 ? String(allSeries.length) : "NOVO"} accentColor={BLUE}
                      subtitle="Novos filmes chegando ao catálogo"
                      onSeeAll={() => openModal("Estreando Agora", allSeries, BLUE,
                          (pg) => fetchOnePage("series", pg),
                          [
                            { id: 10759, label: "Ação" },
                            { id: 16,    label: "Animação" },
                            { id: 35,    label: "Comédia" },
                            { id: 80,    label: "Crime" },
                            { id: 18,    label: "Drama" },
                            { id: 10751, label: "Família" },
                            { id: 14,    label: "Fantasia" },
                            { id: 9648,  label: "Mistério" },
                            { id: 10765, label: "Sci-Fi" },
                            { id: 53,    label: "Suspense" },
                          ],
                          3,
                        )} />
                    <FeaturedRow items={nowPlaying} onPress={goTo} accentColor={BLUE}
                      isNewFn={(i) => i.year >= CURRENT_YEAR - 1} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 7. SÉRIES EM EXIBIÇÃO ───────────────────────────────── */}
              {mergedOnAir.length > 0 && (
                <AnimatedSection anim={s[5]}>
                  <View style={sty.sec}>
                    <SectionHeader title="Séries no Ar" icon="tv"
                      badge={allSeries.length + r2Series.length > 0 ? String(allSeries.length + r2Series.length) : "AO AR"} accentColor={GREEN}
                      subtitle="Episódios novos toda semana"
                      onSeeAll={() => openModal("Séries no Ar", [...r2Series, ...allSeries], GREEN,
                          (pg) => fetchOnePage("series", pg),
                          [
                            { id: 10759, label: "Ação" },
                            { id: 16,    label: "Animação" },
                            { id: 35,    label: "Comédia" },
                            { id: 80,    label: "Crime" },
                            { id: 18,    label: "Drama" },
                            { id: 10751, label: "Família" },
                            { id: 14,    label: "Fantasia" },
                            { id: 9648,  label: "Mistério" },
                            { id: 10765, label: "Sci-Fi" },
                            { id: 53,    label: "Suspense" },
                          ],
                          3,
                        )} />
                    <MoodRow items={mergedOnAir} onPress={goTo}
                      labels={["NOVO EP.","HOJE","NOVO EP.","AMANHÃ","NOVO EP.","HOJE"]}
                      accentColor={GREEN} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 8. ANIMES ───────────────────────────────────────────── */}
              {trendAnimes.length > 0 && (
                <>
                  <SectionDivider label="ANIMES" accentColor={ORANGE} />
                  <AnimatedSection anim={s[6]}>
                    <View style={sty.sec}>
                      <SectionHeader title="Animes em Alta" icon="star"
                        badge={allAnimes.length > 0 ? String(allAnimes.length) : "ANIME"} accentColor={ORANGE}
                        subtitle="Os mais assistidos agora"
                        onSeeAll={() => openModal("Animes em Alta", allAnimes, ORANGE,
                          (pg) => fetchOnePage("animes", pg),
                          [
                            { id: 28,    label: "Ação" },
                            { id: 12,    label: "Aventura" },
                            { id: 35,    label: "Comédia" },
                            { id: 18,    label: "Drama" },
                            { id: 14,    label: "Fantasia" },
                            { id: 878,   label: "Ficção Científica" },
                            { id: 10749, label: "Romance" },
                            { id: 27,    label: "Terror" },
                            { id: 53,    label: "Thriller" },
                            { id: 16,    label: "Animação" },
                          ],
                          3,
                        )} />
                      <MoodRow items={trendAnimes.slice(0, 6)} onPress={goTo}
                        labels={["NOVO","EM ALTA","NOVO","POPULAR","NOVO","EM ALTA"]}
                        accentColor={ORANGE} />
                    </View>
                  </AnimatedSection>
                </>
              )}

              {/* ── 10. EM BREVE / COUNTDOWN ────────────────────────────── */}
              {countdownItem && (
                <AnimatedSection anim={s[8]}>
                  <CountdownBanner item={countdownItem} daysLeft={7}
                    onPress={() => goTo(countdownItem)} />
                </AnimatedSection>
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
        genres={modal.genres}
        initTmdbPage={modal.initTmdbPage ?? 1}
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
