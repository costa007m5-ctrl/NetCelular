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
  Modal,
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
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { HeroBanner } from "@/components/HeroBanner";
import { TopTenCard } from "@/components/TopTenCard";
import { SearchTriggerBar } from "@/components/SearchTriggerBar";
import type { ContentItem } from "@/constants/content";

// ─── Dimensions ────────────────────────────────────────────────────────────────
const { width: W, height: H } = Dimensions.get("window");

// ─── Palette ───────────────────────────────────────────────────────────────────
const RED    = "#e50914";
const AMBER  = "#f59e0b";
const GOLD   = "#d4a017";
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const PURPLE = "#8b5cf6";
const PINK   = "#ec4899";
const TEAL   = "#0891b2";
const ORANGE = "#f97316";
const INDIGO = "#6366f1";
const DARK   = "#dc2626";
const CYAN   = "#06b6d4";
const LIME   = "#84cc16";

// ─── TMDB ──────────────────────────────────────────────────────────────────────
const TMDB_KEY  = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const LANG      = "pt-BR";
const IMG_W500  = "https://image.tmdb.org/t/p/w500";
const IMG_ORIG  = "https://image.tmdb.org/t/p/w1280";

async function tfetch(path: string, params: Record<string, string> = {}): Promise<any> {
  try {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("language", LANG);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url.toString());
    if (!r.ok) return { results: [] };
    return r.json();
  } catch { return { results: [] }; }
}

function toItem(raw: any, forcedType?: "movie" | "tv"): ContentItem {
  const isMovie = forcedType
    ? forcedType === "movie"
    : !!(raw.title || raw.media_type === "movie");
  const year = parseInt(((raw.release_date ?? raw.first_air_date) || "2024").slice(0, 4));
  return {
    id: String(raw.id),
    tmdbId: raw.id,
    title: raw.title ?? raw.name ?? "",
    year,
    rating: raw.vote_average ?? 0,
    posterPath:   raw.poster_path   ? `${IMG_W500}${raw.poster_path}`  : "",
    backdropPath: raw.backdrop_path ? `${IMG_ORIG}${raw.backdrop_path}` : "",
    description:  raw.overview ?? "",
    genres:       raw.genre_ids ?? [],
    type:      isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
}

// ─── Animation helpers ─────────────────────────────────────────────────────────
function makeAnims(n: number) {
  return Array.from({ length: n }, () => new Animated.Value(0));
}
function stagger(anims: Animated.Value[], delay = 55) {
  return Animated.stagger(delay, anims.map((a) =>
    Animated.timing(a, { toValue: 1, duration: 440, useNativeDriver: true })
  ));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── SkeletonRow ───────────────────────────────────────────────────────────────
function SkeletonRow({ shimmer, wide }: { shimmer: Animated.Value; wide?: boolean }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.04)", "rgba(255,255,255,0.11)"],
  });
  const CW = wide ? 190 : 118;
  const CH = wide ? 112 : 172;
  return (
    <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 10, marginBottom: 28 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Animated.View key={i} style={{ width: CW, height: CH, borderRadius: 12, backgroundColor: bg as any }} />
      ))}
    </View>
  );
}

// ─── PosterCard ────────────────────────────────────────────────────────────────
function PosterCard({ item, onPress, w = 118, h = 172, showTitle = false, badge = "" }: {
  item: ContentItem; onPress: () => void; w?: number; h?: number; showTitle?: boolean; badge?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: w, marginRight: 10, transform: [{ scale: sc }] }}>
        <View style={[s.pCard, { width: w, height: h }]}>
          {!err && item.posterPath
            ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={280} onError={() => setErr(true)} />
            : <LinearGradient colors={["#1a0a20", "#080610"]} style={StyleSheet.absoluteFill}><View style={s.pFall}><Feather name="film" size={22} color="rgba(255,255,255,0.07)" /></View></LinearGradient>
          }
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
          {badge ? <View style={s.pBadge}><Text style={s.pBadgeT}>{badge}</Text></View> : null}
          {item.rating > 0 && <View style={s.pRating}><Feather name="star" size={8} color={AMBER} /><Text style={s.pRatingT}>{item.rating.toFixed(1)}</Text></View>}
        </View>
        {showTitle && <Text style={s.pTitle} numberOfLines={1}>{item.title}</Text>}
      </Animated.View>
    </Pressable>
  );
}

// ─── WideCard ──────────────────────────────────────────────────────────────────
function WideCard({ item, onPress, badge = "", accentColor = RED }: {
  item: ContentItem; onPress: () => void; badge?: string; accentColor?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.94, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[s.wCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={280} onError={() => setErr(true)} />
          : <LinearGradient colors={["#0d0a1a", "#060408"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
        {badge ? <View style={[s.wBadge, { backgroundColor: accentColor }]}><Text style={s.wBadgeT}>{badge}</Text></View> : null}
        <View style={s.wInfo}>
          <Text style={s.wTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={s.wMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        {item.rating > 0 && <View style={s.wRating}><Feather name="star" size={8} color={AMBER} /><Text style={s.wRatingT}>{item.rating.toFixed(1)}</Text></View>}
      </Animated.View>
    </Pressable>
  );
}

// ─── FeaturedCard ──────────────────────────────────────────────────────────────
function FeaturedCard({ item, onPress, accentColor = RED }: {
  item: ContentItem; onPress: () => void; accentColor?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[s.fCard, { transform: [{ scale: sc }] }]}>
        {!err && item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={280} onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a0a20", "#080610"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["transparent", `${accentColor}18`, "rgba(0,0,0,0.96)"]} locations={[0.38, 0.68, 1]} style={StyleSheet.absoluteFill} />
        <View style={s.fInfo}>
          {item.rating > 0 && (
            <View style={[s.fRate, { backgroundColor: `${AMBER}20`, borderColor: `${AMBER}50` }]}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={[s.fRateT, { color: AMBER }]}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <Text style={s.fTitle} numberOfLines={2}>{item.title}</Text>
          <View style={[s.fPlay, { backgroundColor: accentColor }]}><Feather name="play" size={10} color="#fff" /></View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── CinemaCard (extra-wide, franchise focused) ────────────────────────────────
function CinemaCard({ item, onPress, accentColor = AMBER, label = "" }: {
  item: ContentItem; onPress: () => void; accentColor?: string; label?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.96, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[s.ccCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={280} onError={() => setErr(true)} />
          : <LinearGradient colors={["#0d0a1a", "#060408"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={[`${accentColor}28`, "transparent", "rgba(0,0,0,0.95)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        <View style={[s.ccBorderTop, { backgroundColor: accentColor }]} />
        {label ? <View style={[s.ccLabel, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}50` }]}><Text style={[s.ccLabelT, { color: accentColor }]}>{label}</Text></View> : null}
        <View style={s.ccBottom}>
          <Text style={s.ccTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={s.ccMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
        </View>
        {item.rating > 0 && <View style={s.ccRating}><Feather name="star" size={8} color={AMBER} /><Text style={s.ccRatingT}>{item.rating.toFixed(1)}</Text></View>}
      </Animated.View>
    </Pressable>
  );
}

// ─── MoodCard ──────────────────────────────────────────────────────────────────
function MoodCard({ item, onPress, label = "", accentColor = RED }: {
  item: ContentItem; onPress: () => void; label?: string; accentColor?: string;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.96, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[s.mCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={280} onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={[`${accentColor}22`, "transparent", "rgba(0,0,0,0.90)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
        {label ? <View style={[s.mLabel, { borderColor: `${accentColor}55`, backgroundColor: `${accentColor}18` }]}><Text style={[s.mLabelT, { color: accentColor }]}>{label}</Text></View> : null}
        <View style={s.mBottom}>
          <Text style={s.mTitle} numberOfLines={1}>{item.title}</Text>
          <View style={[s.mPlay, { backgroundColor: accentColor }]}><Feather name="play" size={11} color="#fff" /></View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── CompactListItem ───────────────────────────────────────────────────────────
function CompactListItem({ item, rank, onPress }: { item: ContentItem; rank: number; onPress: () => void }) {
  const sc = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={[s.cItem, { transform: [{ scale: sc }] }]}>
        <Text style={s.cRank}>{String(rank).padStart(2, "0")}</Text>
        <View style={s.cThumb}>
          {!err && item.posterPath
            ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
            : <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
          }
        </View>
        <View style={s.cInfo}>
          <Text style={s.cTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={s.cMeta}>{item.year} · {item.type === "movie" ? "Filme" : "Série"}</Text>
          {item.rating > 0 && <View style={s.cRate}><Feather name="star" size={9} color={AMBER} /><Text style={s.cRateT}>{item.rating.toFixed(1)}</Text></View>}
        </View>
        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.2)" />
      </Animated.View>
    </Pressable>
  );
}

// ─── SpotlightBanner ───────────────────────────────────────────────────────────
function SpotlightBanner({ item, label, onPress, accentColor = AMBER }: {
  item: ContentItem; label: string; onPress: () => void; accentColor?: string;
}) {
  const sc   = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 2200, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 2200, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const glowOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={s.spotPad}>
      <Animated.View style={[s.spotCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={280} onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.96)"]} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />
        <View style={[s.spotGlow, { backgroundColor: accentColor }]} />
        <View style={s.spotContent}>
          <Animated.View style={[s.spotLabel, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}55`, opacity: glowOp }]}>
            <Text style={[s.spotLabelT, { color: accentColor }]}>{label}</Text>
          </Animated.View>
          <Text style={s.spotTitle} numberOfLines={2}>{item.title}</Text>
          <View style={s.spotMeta}>
            {item.rating > 0 && <View style={s.spotRate}><Feather name="star" size={10} color={AMBER} /><Text style={s.spotRateT}>{item.rating.toFixed(1)}</Text></View>}
            <Text style={s.spotYear}>{item.year}</Text>
            <Text style={s.spotType}>{item.type === "movie" ? "Filme" : "Série"}</Text>
          </View>
          <View style={[s.spotPlay, { backgroundColor: accentColor }]}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={s.spotPlayT}>Assistir agora</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── FranchiseBanner ───────────────────────────────────────────────────────────
function FranchiseBanner({ item, title, subtitle, onPress, accentColor = AMBER }: {
  item: ContentItem; title: string; subtitle: string; onPress: () => void; accentColor?: string;
}) {
  const sc     = useRef(new Animated.Value(1)).current;
  const border = useRef(new Animated.Value(0)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.98, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(border, { toValue: 1, duration: 2500, useNativeDriver: true }),
      Animated.timing(border, { toValue: 0, duration: 2500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const borderOp = border.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={s.fbPad}>
      <Animated.View style={[s.fbCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={300} onError={() => setErr(true)} />
          : <LinearGradient colors={["#1a0a20", "#080610"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={[`${accentColor}30`, "transparent", "rgba(0,0,0,0.97)"]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 20, borderWidth: 1.5, borderColor: accentColor, opacity: borderOp }]} />
        <View style={[s.fbTag, { backgroundColor: accentColor }]}>
          <Feather name="layers" size={10} color="#000" />
          <Text style={s.fbTagT}>UNIVERSO</Text>
        </View>
        <View style={s.fbContent}>
          <Text style={s.fbTitle}>{title}</Text>
          <Text style={s.fbSub}>{subtitle}</Text>
          <View style={s.fbActions}>
            <View style={[s.fbPlayBtn, { backgroundColor: accentColor }]}>
              <Feather name="play" size={13} color="#000" />
              <Text style={[s.fbPlayT, { color: "#000" }]}>Explorar</Text>
            </View>
            <View style={s.fbInfoBtn}>
              <Feather name="info" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={s.fbInfoT}>Detalhes</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── CountdownBanner ───────────────────────────────────────────────────────────
function CountdownBanner({ item, daysLeft, onPress }: { item: ContentItem; daysLeft: number; onPress: () => void }) {
  const sc    = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1,    duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={s.cdPad}>
      <Animated.View style={[s.cdCard, { transform: [{ scale: sc }] }]}>
        {!err && item.backdropPath
          ? <Image source={{ uri: item.backdropPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
          : <LinearGradient colors={["#1e0a3c", "#0a0820"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["rgba(99,102,241,0.6)", "rgba(0,0,0,0.96)"]} locations={[0, 0.75]} style={StyleSheet.absoluteFill} />
        <View style={s.cdContent}>
          <View style={s.cdLeft}>
            <View style={s.cdChip}>
              <Animated.View style={[s.cdDot, { opacity: blink }]} />
              <Text style={s.cdChipT}>EM BREVE</Text>
            </View>
            <Text style={s.cdTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={s.cdSub}>Estreia em {daysLeft} dias</Text>
          </View>
          <View style={s.cdBox}>
            <Text style={s.cdNum}>{daysLeft}</Text>
            <Text style={s.cdUnit}>dias</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── PromoBanner ───────────────────────────────────────────────────────────────
function PromoBanner({ title, subtitle, action, onPress, gradient, icon }: {
  title: string; subtitle: string; action: string;
  onPress: () => void; gradient: string[]; icon: keyof typeof Feather.glyphMap;
}) {
  const sc = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(sc, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(sc, { toValue: 1,    useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={s.prPad}>
      <Animated.View style={[s.prCard, { transform: [{ scale: sc }] }]}>
        <LinearGradient colors={gradient as any} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={s.prContent}>
          <View style={s.prIcon}><Feather name={icon} size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.prTitle}>{title}</Text>
            <Text style={s.prSub}>{subtitle}</Text>
          </View>
          <View style={s.prAction}>
            <Text style={s.prActionT}>{action}</Text>
            <Feather name="arrow-right" size={13} color="#fff" />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── StatsBanner ───────────────────────────────────────────────────────────────
function StatsBanner({ stats }: {
  stats: { label: string; value: string; color: string; icon: keyof typeof Feather.glyphMap }[];
}) {
  return (
    <View style={s.statsRow}>
      {stats.map((st, i) => (
        <View key={i} style={[s.statPill, { borderColor: `${st.color}30` }]}>
          <LinearGradient colors={[`${st.color}18`, `${st.color}08`]} style={StyleSheet.absoluteFill} />
          <Feather name={st.icon} size={13} color={st.color} />
          <View>
            <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLbl}>{st.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── RankBanner ────────────────────────────────────────────────────────────────
function RankBanner({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  const MEDALS = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const SIZES  = [{ w: 150, h: 220, mt: 0 }, { w: 130, h: 195, mt: 16 }, { w: 130, h: 195, mt: 16 }];
  if (items.length < 3) return null;
  return (
    <View style={s.rankRow}>
      {([1, 0, 2] as const).map((idx, pos) => {
        const item = items[idx];
        const sz   = SIZES[pos];
        const sc   = useRef(new Animated.Value(1)).current;
        const [err, setErr] = useState(false);
        return (
          <Pressable key={idx} onPress={() => onPress(item)}
            onPressIn={() => Animated.spring(sc, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start()}
            onPressOut={() => Animated.spring(sc, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}>
            <Animated.View style={{ width: sz.w, marginTop: sz.mt, transform: [{ scale: sc }] }}>
              <View style={[s.rbCard, { height: sz.h, borderColor: `${MEDALS[idx]}30` }]}>
                {!err && item.posterPath
                  ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
                  : <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
                }
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
                <View style={[s.rbMedal, { backgroundColor: MEDALS[idx] }]}>
                  <Feather name="award" size={9} color="#000" />
                  <Text style={s.rbMedalT}>#{idx + 1}</Text>
                </View>
                {item.rating > 0 && (
                  <View style={s.rbRating}><Feather name="star" size={8} color={AMBER} /><Text style={s.rbRatingT}>{item.rating.toFixed(1)}</Text></View>
                )}
              </View>
              <Text style={s.rbTitle} numberOfLines={2}>{item.title}</Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ title, icon, onSeeAll, badge, accentColor = AMBER, subtitle }: {
  title: string; icon?: keyof typeof Feather.glyphMap; onSeeAll?: () => void;
  badge?: string; accentColor?: string; subtitle?: string;
}) {
  return (
    <View style={s.secHead}>
      <View style={s.secLeft}>
        <View style={[s.acBar, { backgroundColor: accentColor }]} />
        {icon && <View style={[s.iconWrap, { backgroundColor: `${accentColor}18` }]}><Feather name={icon} size={13} color={accentColor} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={s.secTitle}>{title}</Text>
          {subtitle && <Text style={s.secSub}>{subtitle}</Text>}
        </View>
        {badge && <View style={[s.badge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}><Text style={[s.badgeT, { color: accentColor }]}>{badge}</Text></View>}
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={s.seeAllBtn}>
          <Text style={s.seeAllT}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── SectionDivider ────────────────────────────────────────────────────────────
function SectionDivider({ label, accentColor = AMBER }: { label: string; accentColor?: string }) {
  return (
    <View style={s.divRow}>
      <LinearGradient colors={["transparent", `${accentColor}44`, "transparent"]} style={s.divLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={[s.divLabel, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` }]}>
        <Text style={[s.divT, { color: accentColor }]}>{label}</Text>
      </View>
      <LinearGradient colors={["transparent", `${accentColor}44`, "transparent"]} style={s.divLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
    </View>
  );
}

// ─── AnimatedSection ───────────────────────────────────────────────────────────
function AnimatedSection({ anim, children }: { anim: Animated.Value; children: React.ReactNode }) {
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] });
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: ty }] }}>
      {children}
    </Animated.View>
  );
}

// ─── VerMaisModal ──────────────────────────────────────────────────────────────
function VerMaisModal({ visible, title, items, accentColor = AMBER, onClose, onItemPress }: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (i: ContentItem) => void;
}) {
  const slideY   = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState(1);
  const PAGE  = 20;
  const shown = useMemo(() => items.slice(0, page * PAGE), [items, page]);

  useEffect(() => {
    if (visible) {
      setPage(1);
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

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  const renderItem = ({ item }: { item: ContentItem }) => (
    <Pressable onPress={() => { onItemPress(item); onClose(); }} style={{ width: CARD_W, marginBottom: 8 }}>
      <View style={{ width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" }}>
        {item.posterPath
          ? <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          : <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        }
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 14 }} numberOfLines={2}>{item.title}</Text>
          {item.rating > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
              <Feather name="star" size={7} color={AMBER} />
              <Text style={{ color: AMBER, fontSize: 8, fontWeight: "700" }}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.7)", opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.modal, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0a0810", "#060408"]} style={StyleSheet.absoluteFill} />
        <View style={[s.modalHandle, { backgroundColor: `${accentColor}60` }]} />
        <View style={s.modalHead}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[s.acBar, { backgroundColor: accentColor }]} />
            <Text style={s.modalTitle}>{title}</Text>
            <View style={[s.badge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
              <Text style={[s.badgeT, { color: accentColor }]}>{items.length}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.modalClose}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={shown}
          keyExtractor={(i) => i.id}
          numColumns={3}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          ListFooterComponent={shown.length < items.length ? (
            <TouchableOpacity onPress={() => setPage((p) => p + 1)} style={s.loadMoreBtn} activeOpacity={0.8}>
              <LinearGradient colors={[`${accentColor}22`, `${accentColor}10`]} style={StyleSheet.absoluteFill} />
              <Feather name="chevrons-down" size={14} color={accentColor} />
              <Text style={[s.loadMoreT, { color: accentColor }]}>Carregar mais ({items.length - shown.length} restantes)</Text>
            </TouchableOpacity>
          ) : null}
        />
      </Animated.View>
    </Modal>
  );
}

// ─── ScrollTopFab ──────────────────────────────────────────────────────────────
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
    <Animated.View style={[s.fab, { opacity: op, transform: [{ scale: sc }] }]} pointerEvents={visible ? "auto" : "none"}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
        <LinearGradient colors={[AMBER, "#b45309"]} style={s.fabGrad}>
          <Feather name="chevron-up" size={18} color="#000" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Row wrappers ──────────────────────────────────────────────────────────────
function PosterRow({ items, onPress, showTitle = false }: {
  items: ContentItem[]; onPress: (i: ContentItem) => void; showTitle?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }} decelerationRate="fast">
      {items.slice(0, 6).map((item) => (
        <PosterCard key={item.id} item={item} onPress={() => onPress(item)} showTitle={showTitle} />
      ))}
    </ScrollView>
  );
}
function WideRow({ items, onPress, badgeFn, accentColor }: {
  items: ContentItem[]; onPress: (i: ContentItem) => void;
  badgeFn?: (i: ContentItem) => string; accentColor?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 6).map((item) => (
        <WideCard key={item.id} item={item} onPress={() => onPress(item)} badge={badgeFn?.(item) ?? ""} accentColor={accentColor} />
      ))}
    </ScrollView>
  );
}
function FeaturedRow({ items, onPress, accentColor = AMBER }: {
  items: ContentItem[]; onPress: (i: ContentItem) => void; accentColor?: string;
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
function CinemaRow({ items, onPress, accentColor = AMBER, labelFn }: {
  items: ContentItem[]; onPress: (i: ContentItem) => void; accentColor?: string;
  labelFn?: (i: ContentItem, idx: number) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 6).map((item, idx) => (
        <CinemaCard key={item.id} item={item} onPress={() => onPress(item)} accentColor={accentColor} label={labelFn?.(item, idx) ?? ""} />
      ))}
    </ScrollView>
  );
}
function MoodRow({ items, onPress, labels, accentColor }: {
  items: ContentItem[]; onPress: (i: ContentItem) => void; labels?: string[]; accentColor?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }} decelerationRate="fast">
      {items.slice(0, 6).map((item, i) => (
        <MoodCard key={item.id} item={item} onPress={() => onPress(item)} label={labels?.[i] ?? ""} accentColor={accentColor} />
      ))}
    </ScrollView>
  );
}
function CompactRow({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <View style={s.compactList}>
      {items.slice(0, 6).map((item, i) => (
        <CompactListItem key={item.id} item={item} rank={i + 1} onPress={() => onPress(item)} />
      ))}
    </View>
  );
}
function Top10Row({ items, onPress }: { items: ContentItem[]; onPress: (i: ContentItem) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 4 }} decelerationRate="fast">
      {items.slice(0, 10).map((item, i) => (
        <TopTenCard key={item.id} item={item} rank={i + 1} onPress={() => onPress(item)} />
      ))}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
export default function FranquiasScreen() {
  const colors    = useColors();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const isWeb     = Platform.OS === "web";
  const topPad    = isWeb ? 0 : insets.top;
  const scrollRef = useRef<any>(null);

  // ── 42 section entrance + shimmer + FAB = 44 top-level Animated.Values
  // ++ dozens of per-card scale refs inside each component + 3 glow loops + 2 border loops + 1 blink
  // = well over 100 total Animated.Values
  const headerOp = useRef(new Animated.Value(0)).current;
  const shimmer  = useRef(new Animated.Value(0)).current;
  const s_anims  = useRef(makeAnims(42)).current;
  const [showFab, setShowFab] = useState(false);

  // ── Modal ───────────────────────────────────────────────────────────────────
  const [modal, setModal] = useState<{
    visible: boolean; title: string; items: ContentItem[]; accent: string;
  }>({ visible: false, title: "", items: [], accent: AMBER });
  const openModal = (title: string, items: ContentItem[], accent = AMBER) =>
    setModal({ visible: true, title, items, accent });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  // ── Data ────────────────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [heroItems,    setHeroItems]    = useState<ContentItem[]>([]);
  const [trendMovies,  setTrendMovies]  = useState<ContentItem[]>([]);
  const [trendSeries,  setTrendSeries]  = useState<ContentItem[]>([]);
  const [top10Movies,  setTop10Movies]  = useState<ContentItem[]>([]);
  const [top10Series,  setTop10Series]  = useState<ContentItem[]>([]);
  const [nowPlaying,   setNowPlaying]   = useState<ContentItem[]>([]);
  const [onAir,        setOnAir]        = useState<ContentItem[]>([]);
  const [popularMov,   setPopularMov]   = useState<ContentItem[]>([]);
  const [popularSer,   setPopularSer]   = useState<ContentItem[]>([]);
  const [marvelItems,  setMarvelItems]  = useState<ContentItem[]>([]);
  const [dcItems,      setDcItems]      = useState<ContentItem[]>([]);
  const [disneyItems,  setDisneyItems]  = useState<ContentItem[]>([]);
  const [pixarItems,   setPixarItems]   = useState<ContentItem[]>([]);
  const [actionItems,  setActionItems]  = useState<ContentItem[]>([]);
  const [horrorItems,  setHorrorItems]  = useState<ContentItem[]>([]);
  const [scifiItems,   setScifiItems]   = useState<ContentItem[]>([]);
  const [animItems,    setAnimItems]    = useState<ContentItem[]>([]);
  const [comedyItems,  setComedyItems]  = useState<ContentItem[]>([]);
  const [dramaItems,   setDramaItems]   = useState<ContentItem[]>([]);
  const [thrillerItems,setThrillerItems]= useState<ContentItem[]>([]);
  const [romanceItems, setRomanceItems] = useState<ContentItem[]>([]);
  const [familyItems,  setFamilyItems]  = useState<ContentItem[]>([]);
  const [docItems,     setDocItems]     = useState<ContentItem[]>([]);
  const [animeItems,   setAnimeItems]   = useState<ContentItem[]>([]);
  const [kDramaItems,  setKDramaItems]  = useState<ContentItem[]>([]);
  const [classicItems, setClassicItems] = useState<ContentItem[]>([]);
  const [dramaSeries,  setDramaSeries]  = useState<ContentItem[]>([]);
  const [crimeItems,   setCrimeItems]   = useState<ContentItem[]>([]);

  // ── Load (hero first, rest in background) ──────────────────────────────────
  const loadAll = useCallback(async () => {
    // Phase 1: load hero banner immediately (4 franchise calls)
    const [marvelRes, dcRes, disneyRes, pixarRes] = await Promise.allSettled([
      tfetch("/discover/movie", { with_companies: "420",  sort_by: "popularity.desc" }),
      tfetch("/discover/movie", { with_companies: "9993", sort_by: "popularity.desc" }),
      tfetch("/discover/movie", { with_companies: "2",    sort_by: "popularity.desc" }),
      tfetch("/discover/movie", { with_companies: "3",    sort_by: "vote_average.desc", "vote_count.gte": "50" }),
    ]);
    const getHero = (r: PromiseSettledResult<any>): any[] =>
      r.status === "fulfilled" ? (r.value?.results ?? []) : [];
    const franchiseHero = [
      ...getHero(marvelRes).slice(0, 2),
      ...getHero(dcRes).slice(0, 2),
      ...getHero(disneyRes).slice(0, 2),
      ...getHero(pixarRes).slice(0, 2),
    ].slice(0, 8).map((x) => toItem(x, "movie"));
    if (franchiseHero.length > 0) setHeroItems(franchiseHero);

    // Phase 2: load the rest in the background
    const results = await Promise.allSettled([
      tfetch("/trending/all/week"),                                                                          // 0
      tfetch("/trending/movie/week"),                                                                        // 1
      tfetch("/trending/tv/week"),                                                                           // 2
      tfetch("/movie/top_rated"),                                                                            // 3
      tfetch("/tv/top_rated"),                                                                               // 4
      tfetch("/movie/now_playing"),                                                                          // 5
      tfetch("/tv/on_the_air"),                                                                              // 6
      tfetch("/movie/popular"),                                                                              // 7
      tfetch("/tv/popular"),                                                                                 // 8
      Promise.resolve(marvelRes.status === "fulfilled" ? marvelRes.value : { results: [] }),                // 9  Marvel (reuse)
      Promise.resolve(dcRes.status === "fulfilled" ? dcRes.value : { results: [] }),                        // 10 DC (reuse)
      Promise.resolve(disneyRes.status === "fulfilled" ? disneyRes.value : { results: [] }),                // 11 Disney (reuse)
      Promise.resolve(pixarRes.status === "fulfilled" ? pixarRes.value : { results: [] }),                  // 12 Pixar (reuse)
      tfetch("/discover/movie", { with_genres: "28,12",   sort_by: "popularity.desc" }),                   // 13 Action
      tfetch("/discover/movie", { with_genres: "27",      sort_by: "popularity.desc" }),                   // 14 Horror
      tfetch("/discover/movie", { with_genres: "878",     sort_by: "popularity.desc" }),                   // 15 SciFi
      tfetch("/discover/movie", { with_genres: "16",      sort_by: "vote_average.desc", "vote_count.gte": "80" }), // 16 Anim
      tfetch("/discover/movie", { with_genres: "35",      sort_by: "popularity.desc" }),                   // 17 Comedy
      tfetch("/discover/movie", { with_genres: "18",      sort_by: "vote_average.desc", "vote_count.gte": "200" }), // 18 Drama
      tfetch("/discover/movie", { with_genres: "53",      sort_by: "popularity.desc" }),                   // 19 Thriller
      tfetch("/discover/movie", { with_genres: "10749",   sort_by: "popularity.desc" }),                   // 20 Romance
      tfetch("/discover/movie", { with_genres: "10751",   sort_by: "popularity.desc" }),                   // 21 Family
      tfetch("/discover/movie", { with_genres: "99",      sort_by: "vote_average.desc", "vote_count.gte": "100" }), // 22 Doc
      tfetch("/discover/tv",    { with_genres: "16",      with_origin_country: "JP" }),                    // 23 Anime
      tfetch("/discover/tv",    { with_origin_country: "KR", sort_by: "popularity.desc" }),                // 24 K-Drama
      tfetch("/movie/top_rated", { page: "2" }),                                                            // 25 Classics
      tfetch("/discover/tv",    { with_genres: "18",      sort_by: "vote_average.desc", "vote_count.gte": "200" }), // 26 Drama TV
      tfetch("/discover/tv",    { with_genres: "80",      sort_by: "popularity.desc" }),                   // 27 Crime
    ]);

    const get = (i: number): any[] => {
      const r = results[i];
      return r.status === "fulfilled" ? (r.value?.results ?? []) : [];
    };
    setTrendMovies(get(1).map((x) => toItem(x, "movie")));
    setTrendSeries(get(2).map((x) => toItem(x, "tv")));
    setTop10Movies(get(3).map((x) => toItem(x, "movie")));
    setTop10Series(get(4).map((x) => toItem(x, "tv")));
    setNowPlaying(get(5).map((x) => toItem(x, "movie")));
    setOnAir(get(6).map((x) => toItem(x, "tv")));
    setPopularMov(get(7).map((x) => toItem(x, "movie")));
    setPopularSer(get(8).map((x) => toItem(x, "tv")));
    setMarvelItems(get(9).map((x) => toItem(x, "movie")));
    setDcItems(get(10).map((x) => toItem(x, "movie")));
    setDisneyItems(get(11).map((x) => toItem(x, "movie")));
    setPixarItems(get(12).map((x) => toItem(x, "movie")));
    setActionItems(get(13).map((x) => toItem(x, "movie")));
    setHorrorItems(get(14).map((x) => toItem(x, "movie")));
    setScifiItems(get(15).map((x) => toItem(x, "movie")));
    setAnimItems(get(16).map((x) => toItem(x, "movie")));
    setComedyItems(get(17).map((x) => toItem(x, "movie")));
    setDramaItems(get(18).map((x) => toItem(x, "movie")));
    setThrillerItems(get(19).map((x) => toItem(x, "movie")));
    setRomanceItems(get(20).map((x) => toItem(x, "movie")));
    setFamilyItems(get(21).map((x) => toItem(x, "movie")));
    setDocItems(get(22).map((x) => toItem(x, "movie")));
    setAnimeItems(get(23).map((x) => toItem(x, "tv")));
    setKDramaItems(get(24).map((x) => toItem(x, "tv")));
    setClassicItems(get(25).map((x) => toItem(x, "movie")));
    setDramaSeries(get(26).map((x) => toItem(x, "tv")));
    setCrimeItems(get(27).map((x) => toItem(x, "tv")));
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    loadAll().then(() => {
      loop.stop();
      setLoading(false);
      setRefreshing(false);
      stagger(s_anims, 52).start();
    });
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    s_anims.forEach((a) => a.setValue(0));
    loadAll().then(() => {
      setRefreshing(false);
      stagger(s_anims, 52).start();
    });
  }, [loadAll, s_anims]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const franquiasEmAlta = useMemo(() =>
    [...trendMovies.slice(0, 10), ...trendSeries.slice(0, 6)].filter((x) => x.rating >= 6),
  [trendMovies, trendSeries]);

  const maisAvaliados = useMemo(() =>
    [...top10Movies.slice(0, 10), ...top10Series.slice(0, 10)].sort((a, b) => b.rating - a.rating),
  [top10Movies, top10Series]);

  const aventuraItems = useMemo(() =>
    [...actionItems.slice(0, 8), ...scifiItems.slice(0, 8)].filter((x) => x.rating >= 6.5),
  [actionItems, scifiItems]);

  const seriesOriginais = useMemo(() =>
    [...popularSer.slice(0, 10), ...onAir.slice(0, 6)],
  [popularSer, onAir]);

  const spotlight1   = marvelItems[0]  ?? trendMovies[0];
  const spotlight2   = trendSeries[0]  ?? popularSer[0];
  const spotlight3   = top10Movies[0]  ?? actionItems[0];
  const franchise1   = marvelItems[1]  ?? popularMov[0];
  const franchise2   = dcItems[0]      ?? popularMov[2];
  const cdownItem    = nowPlaying[7]   ?? popularMov[10];

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <View style={[q.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* HEADER */}
      <Animated.View style={[q.header, { paddingTop: topPad + 8 }]}>
        <LinearGradient colors={["rgba(0,0,0,0.94)", "rgba(0,0,0,0.65)", "transparent"]} style={StyleSheet.absoluteFill} />
        <View style={q.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={q.logoAccent} />
            <Text style={q.logoGold}>FRAN</Text>
            <Text style={q.logoWhite}>QUIAS</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <TouchableOpacity style={q.iconBtn} onPress={() => router.push("/(tabs)/list" as any)} activeOpacity={0.75}>
              <Feather name="bookmark" size={20} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* SCROLL */}
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: headerOp } } }],
          { useNativeDriver: true, listener: (e: any) => setShowFab(e.nativeEvent.contentOffset.y > 400) }
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={AMBER} colors={[AMBER]} progressViewOffset={topPad + 50} />
        }
      >
        <View style={{ paddingBottom: 140 }}>

          {/* ── 1. HERO ──────────────────────────────────────────────────── */}
          {heroItems.length > 0
            ? <HeroBanner items={heroItems} onItemPress={goTo} onDetailsPress={goTo} onAddToList={goTo} />
            : <View style={{ height: 520, backgroundColor: "#0a0810", alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={AMBER} size="large" />
              </View>
          }

          {/* ── SEARCH BAR ───────────────────────────────────────────────── */}
          <SearchTriggerBar placeholder="Buscar franquias, universos, filmes..." />

          {loading ? (
            <View style={{ marginTop: 24 }}>
              <SkeletonRow shimmer={shimmer} />
              <SkeletonRow shimmer={shimmer} wide />
              <SkeletonRow shimmer={shimmer} />
            </View>
          ) : (
            <>
              {/* ── 2. FRANQUIAS EM ALTA ─────────────────────────────────── */}
              {franquiasEmAlta.length > 0 && (
                <AnimatedSection anim={s_anims[0]}>
                  <View style={q.sec}>
                    <SectionHeader title="Franquias em Alta" icon="trending-up" badge="AO VIVO"
                      accentColor={AMBER} subtitle="O que o mundo está assistindo"
                      onSeeAll={() => openModal("Franquias em Alta", franquiasEmAlta, AMBER)} />
                    <CinemaRow items={franquiasEmAlta} onPress={goTo} accentColor={AMBER}
                      labelFn={(_, i) => ["#1", "#2", "#3", "#4", "#5", "#6"][i] ?? ""} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 3. SPOTLIGHT 1 ───────────────────────────────────────── */}
              {spotlight1 && (
                <AnimatedSection anim={s_anims[1]}>
                  <SpotlightBanner item={spotlight1} label="UNIVERSO EM DESTAQUE"
                    onPress={() => goTo(spotlight1)} accentColor={AMBER} />
                </AnimatedSection>
              )}

              {/* ── 4. TOP 10 FILMES ─────────────────────────────────────── */}
              {top10Movies.length > 0 && (
                <AnimatedSection anim={s_anims[2]}>
                  <View style={q.sec}>
                    <SectionHeader title="Top 10 Filmes" icon="award" badge="TOP 10"
                      accentColor={GOLD} onSeeAll={() => openModal("Top 10 Filmes", top10Movies, GOLD)} />
                    <Top10Row items={top10Movies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 5. PÓDIO DA SEMANA ───────────────────────────────────── */}
              {top10Movies.length >= 3 && (
                <AnimatedSection anim={s_anims[3]}>
                  <View style={q.sec}>
                    <SectionHeader title="Pódio da Semana" icon="award" accentColor={GOLD}
                      subtitle="Os 3 mais bem avaliados do momento" />
                    <RankBanner items={top10Movies} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="UNIVERSOS" accentColor={AMBER} />

              {/* ── 6. FRANCHISE BANNER 1 — HEROICO ─────────────────────── */}
              {franchise1 && (
                <AnimatedSection anim={s_anims[4]}>
                  <FranchiseBanner item={franchise1}
                    title="Universo Heroico" subtitle="Sagas épicas de super-heróis e vilões"
                    onPress={() => goTo(franchise1)} accentColor={RED} />
                </AnimatedSection>
              )}

              {/* ── 7. SUPER-HERÓIS ──────────────────────────────────────── */}
              {marvelItems.length > 0 && (
                <AnimatedSection anim={s_anims[5]}>
                  <View style={q.sec}>
                    <SectionHeader title="Universo dos Super-Heróis" icon="zap"
                      accentColor={RED} onSeeAll={() => openModal("Super-Heróis", marvelItems, RED)} />
                    <WideRow items={marvelItems} onPress={goTo} accentColor={RED}
                      badgeFn={(i) => (i.rating >= 7.5 ? "ÉPICO" : "")} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 8. DC UNIVERSE ───────────────────────────────────────── */}
              {dcItems.length > 0 && (
                <AnimatedSection anim={s_anims[6]}>
                  <View style={q.sec}>
                    <SectionHeader title="Universo DC" icon="shield"
                      accentColor={BLUE} onSeeAll={() => openModal("Universo DC", dcItems, BLUE)} />
                    <FeaturedRow items={dcItems} onPress={goTo} accentColor={BLUE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 9. FRANCHISE BANNER 2 — GRANDES ESTÚDIOS ────────────── */}
              {franchise2 && (
                <AnimatedSection anim={s_anims[7]}>
                  <FranchiseBanner item={franchise2}
                    title="Grandes Estúdios" subtitle="Produções que definiram gerações"
                    onPress={() => goTo(franchise2)} accentColor={PURPLE} />
                </AnimatedSection>
              )}

              {/* ── 10. MUNDO DISNEY ─────────────────────────────────────── */}
              {disneyItems.length > 0 && (
                <AnimatedSection anim={s_anims[8]}>
                  <View style={q.sec}>
                    <SectionHeader title="Mundo Disney" icon="star"
                      accentColor={CYAN} onSeeAll={() => openModal("Mundo Disney", disneyItems, CYAN)} />
                    <MoodRow items={disneyItems} onPress={goTo} accentColor={CYAN} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 11. ANIMAÇÕES PREMIUM (PIXAR) ────────────────────────── */}
              {pixarItems.length > 0 && (
                <AnimatedSection anim={s_anims[9]}>
                  <View style={q.sec}>
                    <SectionHeader title="Animações Premium" icon="film"
                      accentColor={ORANGE} onSeeAll={() => openModal("Animações Premium", pixarItems, ORANGE)} />
                    <PosterRow items={pixarItems} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 12. STATS BANNER ─────────────────────────────────────── */}
              <AnimatedSection anim={s_anims[10]}>
                <StatsBanner stats={[
                  { label: "Filmes",    value: `${popularMov.length + nowPlaying.length}+`, color: AMBER,  icon: "film"   },
                  { label: "Séries",   value: `${popularSer.length + onAir.length}+`,       color: PURPLE, icon: "tv"     },
                  { label: "Universos", value: "10+",                                        color: CYAN,   icon: "layers" },
                ]} />
              </AnimatedSection>

              <SectionDivider label="LANÇAMENTOS" accentColor={BLUE} />

              {/* ── 13. ESTREANDO AGORA ──────────────────────────────────── */}
              {nowPlaying.length > 0 && (
                <AnimatedSection anim={s_anims[11]}>
                  <View style={q.sec}>
                    <SectionHeader title="Estreando Agora" icon="zap" badge="NOVO"
                      accentColor={BLUE} subtitle="Filmes chegando esta semana"
                      onSeeAll={() => openModal("Estreando Agora", nowPlaying, BLUE)} />
                    <CinemaRow items={nowPlaying} onPress={goTo} accentColor={BLUE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 14. SÉRIES NO AR ─────────────────────────────────────── */}
              {onAir.length > 0 && (
                <AnimatedSection anim={s_anims[12]}>
                  <View style={q.sec}>
                    <SectionHeader title="Séries no Ar" icon="tv" badge="AO AR"
                      accentColor={GREEN} subtitle="Novos episódios toda semana"
                      onSeeAll={() => openModal("Séries no Ar", onAir, GREEN)} />
                    <WideRow items={onAir} onPress={goTo} accentColor={GREEN} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 15. PROMO — MINHA LISTA ──────────────────────────────── */}
              <AnimatedSection anim={s_anims[13]}>
                <PromoBanner icon="bookmark"
                  title="Salve suas Franquias" subtitle="Monte sua lista de universos favoritos"
                  action="Minha lista" onPress={() => router.push("/(tabs)/list" as any)}
                  gradient={[TEAL, "#0e7490"]} />
              </AnimatedSection>

              {/* ── 16. COUNTDOWN ────────────────────────────────────────── */}
              {cdownItem && (
                <AnimatedSection anim={s_anims[14]}>
                  <CountdownBanner item={cdownItem} daysLeft={9} onPress={() => goTo(cdownItem)} />
                </AnimatedSection>
              )}

              {/* ── 17. TOP 10 SÉRIES ────────────────────────────────────── */}
              {top10Series.length > 0 && (
                <AnimatedSection anim={s_anims[15]}>
                  <View style={q.sec}>
                    <SectionHeader title="Top 10 Séries" icon="award" badge="TOP 10"
                      accentColor={PURPLE} onSeeAll={() => openModal("Top 10 Séries", top10Series, PURPLE)} />
                    <Top10Row items={top10Series} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="GÊNEROS" accentColor={PURPLE} />

              {/* ── 18. AÇÃO & AVENTURA ──────────────────────────────────── */}
              {actionItems.length > 0 && (
                <AnimatedSection anim={s_anims[16]}>
                  <View style={q.sec}>
                    <SectionHeader title="Ação & Aventura" icon="zap"
                      accentColor={RED} onSeeAll={() => openModal("Ação & Aventura", actionItems, RED)} />
                    <WideRow items={actionItems} onPress={goTo} accentColor={RED}
                      badgeFn={(i) => (i.rating >= 7.5 ? "ÉPICO" : "")} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 19. SPOTLIGHT 2 — SÉRIE ──────────────────────────────── */}
              {spotlight2 && (
                <AnimatedSection anim={s_anims[17]}>
                  <SpotlightBanner item={spotlight2} label="SÉRIE DO MOMENTO"
                    onPress={() => goTo(spotlight2)} accentColor={PURPLE} />
                </AnimatedSection>
              )}

              {/* ── 20. TERROR & PESADELO ────────────────────────────────── */}
              {horrorItems.length > 0 && (
                <AnimatedSection anim={s_anims[18]}>
                  <View style={q.sec}>
                    <SectionHeader title="Terror & Pesadelo" icon="eye"
                      accentColor={DARK} onSeeAll={() => openModal("Terror & Pesadelo", horrorItems, DARK)} />
                    <MoodRow items={horrorItems} onPress={goTo} accentColor={DARK} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 21. FICÇÃO CIENTÍFICA ────────────────────────────────── */}
              {scifiItems.length > 0 && (
                <AnimatedSection anim={s_anims[19]}>
                  <View style={q.sec}>
                    <SectionHeader title="Ficção Científica" icon="cpu"
                      accentColor={TEAL} onSeeAll={() => openModal("Ficção Científica", scifiItems, TEAL)} />
                    <CinemaRow items={scifiItems} onPress={goTo} accentColor={TEAL} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 22. ANIMAÇÃO PARA TODOS ──────────────────────────────── */}
              {animItems.length > 0 && (
                <AnimatedSection anim={s_anims[20]}>
                  <View style={q.sec}>
                    <SectionHeader title="Animação para Todos" icon="film"
                      accentColor={ORANGE} onSeeAll={() => openModal("Animação", animItems, ORANGE)} />
                    <PosterRow items={animItems} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 24. COMÉDIA ──────────────────────────────────────────── */}
              {comedyItems.length > 0 && (
                <AnimatedSection anim={s_anims[22]}>
                  <View style={q.sec}>
                    <SectionHeader title="Comédia" icon="smile"
                      accentColor={LIME} onSeeAll={() => openModal("Comédia", comedyItems, LIME)} />
                    <FeaturedRow items={comedyItems} onPress={goTo} accentColor={LIME} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="SÉRIES" accentColor={GREEN} />

              {/* ── 25. DRAMA INTENSO ────────────────────────────────────── */}
              {dramaItems.length > 0 && (
                <AnimatedSection anim={s_anims[23]}>
                  <View style={q.sec}>
                    <SectionHeader title="Drama Intenso" icon="heart"
                      accentColor={BLUE} onSeeAll={() => openModal("Drama Intenso", dramaItems, BLUE)} />
                    <FeaturedRow items={dramaItems} onPress={goTo} accentColor={BLUE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 26. DRAMAS ENVOLVENTES (TV) ──────────────────────────── */}
              {dramaSeries.length > 0 && (
                <AnimatedSection anim={s_anims[24]}>
                  <View style={q.sec}>
                    <SectionHeader title="Dramas Envolventes" icon="heart"
                      accentColor={BLUE} onSeeAll={() => openModal("Dramas Envolventes", dramaSeries, BLUE)} />
                    <WideRow items={dramaSeries} onPress={goTo} accentColor={BLUE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 27. THRILLER & SUSPENSE ──────────────────────────────── */}
              {thrillerItems.length > 0 && (
                <AnimatedSection anim={s_anims[25]}>
                  <View style={q.sec}>
                    <SectionHeader title="Thriller & Suspense" icon="shield"
                      accentColor={INDIGO} onSeeAll={() => openModal("Thriller & Suspense", thrillerItems, INDIGO)} />
                    <CinemaRow items={thrillerItems} onPress={goTo} accentColor={INDIGO} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 28. CRIME & INVESTIGAÇÃO ─────────────────────────────── */}
              {crimeItems.length > 0 && (
                <AnimatedSection anim={s_anims[26]}>
                  <View style={q.sec}>
                    <SectionHeader title="Crime & Investigação" icon="search"
                      accentColor={INDIGO} onSeeAll={() => openModal("Crime & Investigação", crimeItems, INDIGO)} />
                    <CompactRow items={crimeItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 29. SPOTLIGHT 3 ──────────────────────────────────────── */}
              {spotlight3 && (
                <AnimatedSection anim={s_anims[27]}>
                  <SpotlightBanner item={spotlight3} label="ESCOLHA DO EDITOR"
                    onPress={() => goTo(spotlight3)} accentColor={ORANGE} />
                </AnimatedSection>
              )}

              {/* ── 30. SÉRIES EM DESTAQUE ───────────────────────────────── */}
              {seriesOriginais.length > 0 && (
                <AnimatedSection anim={s_anims[28]}>
                  <View style={q.sec}>
                    <SectionHeader title="Séries em Destaque" icon="star"
                      accentColor={AMBER} onSeeAll={() => openModal("Séries em Destaque", seriesOriginais, AMBER)} />
                    <PosterRow items={seriesOriginais} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="ESPECIAIS" accentColor={AMBER} />

              {/* ── 31. ROMANCE & EMOÇÃO ─────────────────────────────────── */}
              {romanceItems.length > 0 && (
                <AnimatedSection anim={s_anims[29]}>
                  <View style={q.sec}>
                    <SectionHeader title="Romance & Emoção" icon="heart"
                      accentColor={PINK} onSeeAll={() => openModal("Romance & Emoção", romanceItems, PINK)} />
                    <PosterRow items={romanceItems} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 32. PARA TODA A FAMÍLIA ──────────────────────────────── */}
              {familyItems.length > 0 && (
                <AnimatedSection anim={s_anims[30]}>
                  <View style={q.sec}>
                    <SectionHeader title="Para Toda a Família" icon="users"
                      accentColor={CYAN} onSeeAll={() => openModal("Para Toda a Família", familyItems, CYAN)} />
                    <FeaturedRow items={familyItems} onPress={goTo} accentColor={CYAN} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 33. PROMO — DOWNLOADS ────────────────────────────────── */}
              <AnimatedSection anim={s_anims[31]}>
                <PromoBanner icon="download"
                  title="Baixe e Assista Offline" subtitle="Suas franquias favoritas sem internet"
                  action="Downloads" onPress={() => router.push("/(tabs)/downloads" as any)}
                  gradient={["#134e4a", "#0f766e"]} />
              </AnimatedSection>

              <SectionDivider label="MUNDO" accentColor={TEAL} />

              {/* ── 34. ANIMES ───────────────────────────────────────────── */}
              {animeItems.length > 0 && (
                <AnimatedSection anim={s_anims[32]}>
                  <View style={q.sec}>
                    <SectionHeader title="Animes" icon="star"
                      accentColor={AMBER} onSeeAll={() => openModal("Animes", animeItems, AMBER)} />
                    <PosterRow items={animeItems} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 35. K-DRAMA ──────────────────────────────────────────── */}
              {kDramaItems.length > 0 && (
                <AnimatedSection anim={s_anims[33]}>
                  <View style={q.sec}>
                    <SectionHeader title="K-Drama" icon="globe"
                      accentColor={PINK} onSeeAll={() => openModal("K-Drama", kDramaItems, PINK)} />
                    <CinemaRow items={kDramaItems} onPress={goTo} accentColor={PINK} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 36. DOCUMENTÁRIOS ────────────────────────────────────── */}
              {docItems.length > 0 && (
                <AnimatedSection anim={s_anims[34]}>
                  <View style={q.sec}>
                    <SectionHeader title="Documentários Impactantes" icon="book-open"
                      accentColor={GREEN} onSeeAll={() => openModal("Documentários", docItems, GREEN)} />
                    <MoodRow items={docItems} onPress={goTo} accentColor={GREEN} />
                  </View>
                </AnimatedSection>
              )}

              <SectionDivider label="DESCOBRIR" accentColor={INDIGO} />

              {/* ── 37. AVENTURA ÉPICA ───────────────────────────────────── */}
              {aventuraItems.length > 0 && (
                <AnimatedSection anim={s_anims[35]}>
                  <View style={q.sec}>
                    <SectionHeader title="Aventura Épica" icon="compass"
                      accentColor={ORANGE} onSeeAll={() => openModal("Aventura Épica", aventuraItems, ORANGE)} />
                    <WideRow items={aventuraItems} onPress={goTo} accentColor={ORANGE} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 38. CLÁSSICOS DO CINEMA ──────────────────────────────── */}
              {classicItems.length > 0 && (
                <AnimatedSection anim={s_anims[36]}>
                  <View style={q.sec}>
                    <SectionHeader title="Clássicos do Cinema" icon="video"
                      accentColor={GOLD} onSeeAll={() => openModal("Clássicos do Cinema", classicItems, GOLD)} />
                    <CinemaRow items={classicItems} onPress={goTo} accentColor={GOLD} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 39. MAIS BEM AVALIADOS ───────────────────────────────── */}
              {maisAvaliados.length > 0 && (
                <AnimatedSection anim={s_anims[37]}>
                  <View style={q.sec}>
                    <SectionHeader title="Mais Bem Avaliados" icon="award" badge="NOTA ALTA"
                      accentColor={AMBER} onSeeAll={() => openModal("Mais Bem Avaliados", maisAvaliados, AMBER)} />
                    <CompactRow items={maisAvaliados} onPress={goTo} />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 40. POPULARES ESTA SEMANA ────────────────────────────── */}
              {popularMov.length > 0 && (
                <AnimatedSection anim={s_anims[38]}>
                  <View style={q.sec}>
                    <SectionHeader title="Populares Esta Semana" icon="activity"
                      accentColor={ORANGE} onSeeAll={() => openModal("Populares", popularMov, ORANGE)} />
                    <PosterRow items={popularMov} onPress={goTo} showTitle />
                  </View>
                </AnimatedSection>
              )}

              {/* ── 41. PROMO FINAL ──────────────────────────────────────── */}
              <AnimatedSection anim={s_anims[39]}>
                <PromoBanner icon="archive"
                  title="Acervo Completo" subtitle="Explore o catálogo inteiro do NETPLAY"
                  action="Explorar" onPress={() => router.push("/(tabs)/descobrir")}
                  gradient={["#1e1b4b", INDIGO]} />
              </AnimatedSection>
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* VER MAIS MODAL */}
      <VerMaisModal
        visible={modal.visible} title={modal.title} items={modal.items}
        accentColor={modal.accent} onClose={closeModal} onItemPress={goTo} />

      {/* FAB */}
      <ScrollTopFab scrollRef={scrollRef} visible={showFab} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLESHEETS
// ═══════════════════════════════════════════════════════════════════════════════

// s = sub-component styles
const s = StyleSheet.create({
  // PosterCard
  pCard:    { borderRadius: 12, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 }, android: { elevation: 6 } }) },
  pFall:    { flex: 1, alignItems: "center", justifyContent: "center" },
  pTitle:   { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600", marginTop: 6, textAlign: "center" },
  pBadge:   { position: "absolute", top: 7, left: 7, backgroundColor: RED, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  pBadgeT:  { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  pRating:  { position: "absolute", bottom: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(245,158,11,0.2)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  pRatingT: { color: AMBER, fontSize: 8, fontWeight: "700" },

  // WideCard
  wCard:    { width: 190, height: 112, borderRadius: 14, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 10 }, android: { elevation: 7 } }) },
  wBadge:   { position: "absolute", top: 9, left: 9, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  wBadgeT:  { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  wInfo:    { position: "absolute", bottom: 9, left: 11, right: 11 },
  wTitle:   { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.2 },
  wMeta:    { color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 2 },
  wRating:  { position: "absolute", top: 9, right: 9, flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(245,158,11,0.2)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  wRatingT: { color: AMBER, fontSize: 8, fontWeight: "700" },

  // FeaturedCard
  fCard:    { width: 148, height: 220, borderRadius: 14, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 }, android: { elevation: 8 } }) },
  fInfo:    { position: "absolute", bottom: 12, left: 10, right: 10, gap: 6 },
  fRate:    { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  fRateT:   { fontSize: 9, fontWeight: "700" },
  fTitle:   { color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: -0.2, lineHeight: 17 },
  fPlay:    { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },

  // CinemaCard
  ccCard:   { width: W * 0.68, height: 165, borderRadius: 16, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 }, android: { elevation: 8 } }) },
  ccBorderTop: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  ccLabel:  { position: "absolute", top: 12, left: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  ccLabelT: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  ccBottom: { position: "absolute", bottom: 12, left: 12, right: 12 },
  ccTitle:  { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  ccMeta:   { color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 3 },
  ccRating: { position: "absolute", top: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(245,158,11,0.2)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  ccRatingT:{ color: AMBER, fontSize: 8, fontWeight: "700" },

  // MoodCard
  mCard:    { width: W * 0.72, height: 165, borderRadius: 16, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12 }, android: { elevation: 8 } }) },
  mLabel:   { position: "absolute", top: 12, left: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  mLabelT:  { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  mBottom:  { position: "absolute", bottom: 12, left: 12, right: 12, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  mTitle:   { color: "#fff", fontSize: 15, fontWeight: "800", flex: 1, letterSpacing: -0.3 },
  mPlay:    { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },

  // CompactListItem
  compactList: { paddingHorizontal: 16 },
  cItem:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  cRank:    { color: "rgba(255,255,255,0.2)", fontSize: 18, fontWeight: "900", width: 28, textAlign: "center" },
  cThumb:   { width: 56, height: 56, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" },
  cInfo:    { flex: 1, gap: 2 },
  cTitle:   { color: "#fff", fontSize: 14, fontWeight: "700" },
  cMeta:    { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  cRate:    { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  cRateT:   { color: AMBER, fontSize: 10, fontWeight: "700" },

  // SpotlightBanner
  spotPad:    { paddingHorizontal: 16, marginBottom: 28 },
  spotCard:   { height: 200, borderRadius: 20, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18 }, android: { elevation: 12 } }) },
  spotGlow:   { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  spotContent:{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 8 },
  spotLabel:  { alignSelf: "flex-start", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  spotLabelT: { fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  spotTitle:  { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: -0.5, lineHeight: 26 },
  spotMeta:   { flexDirection: "row", alignItems: "center", gap: 8 },
  spotRate:   { flexDirection: "row", alignItems: "center", gap: 4 },
  spotRateT:  { color: AMBER, fontSize: 12, fontWeight: "700" },
  spotYear:   { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  spotType:   { color: "rgba(255,255,255,0.5)", fontSize: 12 },
  spotPlay:   { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  spotPlayT:  { color: "#fff", fontSize: 13, fontWeight: "800" },

  // FranchiseBanner
  fbPad:    { paddingHorizontal: 16, marginBottom: 28 },
  fbCard:   { height: 210, borderRadius: 20, overflow: "hidden", backgroundColor: "#111",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 18 }, android: { elevation: 12 } }) },
  fbTag:    { position: "absolute", top: 16, left: 16, flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  fbTagT:   { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  fbContent:{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, gap: 8 },
  fbTitle:  { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: -0.5 },
  fbSub:    { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500" },
  fbActions:{ flexDirection: "row", gap: 10, marginTop: 4 },
  fbPlayBtn:{ flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  fbPlayT:  { fontSize: 13, fontWeight: "800" },
  fbInfoBtn:{ flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  fbInfoT:  { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },

  // CountdownBanner
  cdPad:    { paddingHorizontal: 16, marginBottom: 28 },
  cdCard:   { height: 130, borderRadius: 18, overflow: "hidden", backgroundColor: "#111" },
  cdContent:{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  cdLeft:   { flex: 1, gap: 6 },
  cdChip:   { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: "rgba(139,92,246,0.25)", borderWidth: 1, borderColor: "rgba(139,92,246,0.5)",
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  cdDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: PURPLE },
  cdChipT:  { color: PURPLE, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  cdTitle:  { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  cdSub:    { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "500" },
  cdBox:    { width: 72, height: 72, borderRadius: 16, backgroundColor: "rgba(139,92,246,0.2)",
    borderWidth: 1, borderColor: "rgba(139,92,246,0.4)", alignItems: "center", justifyContent: "center" },
  cdNum:    { color: PURPLE, fontSize: 30, fontWeight: "900", lineHeight: 34 },
  cdUnit:   { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "600" },

  // PromoBanner
  prPad:    { paddingHorizontal: 16, marginBottom: 28 },
  prCard:   { borderRadius: 18, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14 }, android: { elevation: 8 } }) },
  prContent:{ flexDirection: "row", alignItems: "center", gap: 14, padding: 18 },
  prIcon:   { width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  prTitle:  { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  prSub:    { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "500", marginTop: 2 },
  prAction: { flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  prActionT:{ color: "#fff", fontSize: 12, fontWeight: "700" },

  // StatsBanner
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 28 },
  statPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  statVal:  { fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  statLbl:  { fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: "500", marginTop: 1 },

  // RankBanner
  rankRow:  { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, paddingHorizontal: 16, marginBottom: 28 },
  rbCard:   { borderRadius: 14, overflow: "hidden", borderWidth: 1, backgroundColor: "#111" },
  rbMedal:  { position: "absolute", top: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 3,
    borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  rbMedalT: { color: "#000", fontSize: 9, fontWeight: "900", letterSpacing: 0.3 },
  rbRating: { position: "absolute", bottom: 7, left: 6, flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(245,158,11,0.2)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  rbRatingT:{ color: AMBER, fontSize: 9, fontWeight: "700" },
  rbTitle:  { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 8, lineHeight: 15, textAlign: "center" },

  // SectionHeader
  secHead:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14 },
  secLeft:  { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  acBar:    { width: 3, height: 18, borderRadius: 2 },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  secTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.4, color: "#fff" },
  secSub:   { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  badge:    { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeT:   { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  seeAllBtn:{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  seeAllT:  { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.4)" },

  // SectionDivider
  divRow:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginVertical: 24, gap: 12 },
  divLine:  { flex: 1, height: 1 },
  divLabel: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  divT:     { fontSize: 9, fontWeight: "900", letterSpacing: 2.5 },

  // Modal
  modal:    { position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.85,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden",
    ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.6, shadowRadius: 24 }, android: { elevation: 24 } }) },
  modalHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  modalHead:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  modalTitle:{ fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  modalClose:{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center" },
  loadMoreBtn:{ marginHorizontal: 16, marginTop: 16, borderRadius: 14, overflow: "hidden",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  loadMoreT:{ fontSize: 13, fontWeight: "700" },

  // FAB
  fab:      { position: "absolute", right: 20, bottom: 110, zIndex: 50 },
  fabGrad:  { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center",
    ...Platform.select({ ios: { shadowColor: AMBER, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10 }, android: { elevation: 10 } }) },
});

// q = main screen styles (separate namespace)
const q = StyleSheet.create({
  root:       { flex: 1 },
  header:     { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 },
  headerInner:{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 10 },
  logoAccent: { width: 4, height: 20, borderRadius: 2, backgroundColor: AMBER, marginRight: 2 },
  logoGold:   { fontSize: 20, fontWeight: "900", color: AMBER, letterSpacing: 1.5 },
  logoWhite:  { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 1.5 },
  iconBtn:    { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19 },
  sec:        { marginBottom: 32 },
});
