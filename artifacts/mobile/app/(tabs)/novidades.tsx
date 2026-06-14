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
import { r2Route } from "@/lib/r2-direct";
import { api, TMDB_IMG, tmdbItemToContent, type TmdbItem } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: W, height: H } = Dimensions.get("window");

const RED    = "#e50914";
const AMBER  = "#f59e0b";
const GREEN  = "#22c55e";
const BLUE   = "#3b82f6";
const PURPLE = "#8b5cf6";
const TEAL   = "#0891b2";
const PINK   = "#ec4899";
const ORANGE = "#f97316";

const HERO_H = Math.round(H * 0.52);
const BANNER_INTERVAL = 6000;

// ─── Types ────────────────────────────────────────────────────────────────────
interface WhatsNewItem {
  id: string;
  title: string;
  tmdb_id: number;
  type: string;
  year: number;
  poster: string;
  backdrop?: string;
  added_at: number;
  added_date: string;
  rating?: number;
  overview?: string;
}
interface WhatsNewResp {
  ok: boolean;
  warming?: boolean;
  fallback?: boolean;
  since: string;
  days: number;
  total: number;
  movies: WhatsNewItem[];
  series: WhatsNewItem[];
  animes: WhatsNewItem[];
}

interface RawEp { season: number; episode: number; stream_url: string; title: string; }
interface EpGroup {
  seriesId: string; seriesTitle: string; seriesPoster: string; seriesTmdbId: number;
  totalEps: number; latestEp: RawEp; allEps: RawEp[]; seriesOverview?: string;
  backdropPath?: string; logoPath?: string;
  latestEpStill?: string; latestEpOverview?: string;
}

let EpVideoComp: any = null;
let EpResizeMode: any = {};
try { const av = require("expo-av"); EpVideoComp = av.Video; EpResizeMode = av.ResizeMode; } catch {}

interface AllData {
  trending: TmdbItem[];
  trendingMovies: TmdbItem[];
  trendingTv: TmdbItem[];
  nowPlaying: TmdbItem[];
  upcoming: TmdbItem[];
  onTheAir: TmdbItem[];
  airingToday: TmdbItem[];
  whatsNew: WhatsNewResp | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function wn2Content(item: WhatsNewItem): ContentItem {
  const isMovie = item.type === "filme" || item.type === "movie";
  return {
    id: String(item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title: item.title ?? "",
    year: item.year || 0,
    rating: item.rating ?? 0,
    posterPath: item.poster ?? "",
    backdropPath: item.backdrop ?? item.poster ?? "",
    description: item.overview ?? "",
    genres: [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

async function fetchWhatsNew(attempt = 0): Promise<WhatsNewResp | null> {
  try {
    const res = await r2Route<WhatsNewResp>("/flix2/whats-new?days=90&limit=150");
    // If cache is warming and content is still empty, retry with backoff (up to 10 attempts)
    if (res.warming && res.total === 0 && attempt < 10) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
      return fetchWhatsNew(attempt + 1);
    }
    return res;
  } catch {
    return null;
  }
}

async function loadAll(): Promise<AllData> {
  const [trendingRes, nowPlayingRes, upcomingRes, onTheAirRes, airingRes, wnRes] =
    await Promise.allSettled([
      api.tmdb.trending(),
      api.tmdb.nowPlaying(),
      api.tmdb.upcoming(),
      api.tmdb.onTheAir(),
      api.tmdb.airingToday(),
      fetchWhatsNew(),
    ]);

  const trending = trendingRes.status === "fulfilled" ? trendingRes.value : { all: [], movies: [], tv: [] };
  return {
    trending: (trending as any).all ?? [],
    trendingMovies: (trending as any).movies ?? [],
    trendingTv: (trending as any).tv ?? [],
    nowPlaying: nowPlayingRes.status === "fulfilled" ? (nowPlayingRes.value as TmdbItem[]) : [],
    upcoming: upcomingRes.status === "fulfilled" ? (upcomingRes.value as TmdbItem[]) : [],
    onTheAir: onTheAirRes.status === "fulfilled" ? (onTheAirRes.value as TmdbItem[]) : [],
    airingToday: airingRes.status === "fulfilled" ? (airingRes.value as TmdbItem[]) : [],
    whatsNew: wnRes.status === "fulfilled" ? (wnRes.value as WhatsNewResp | null) : null,
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonRow({ count = 4, width = 120, height = 180 }: { count?: number; width?: number; height?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 850, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.12] });
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={{ width, height, borderRadius: 12, backgroundColor: "white", opacity }} />
      ))}
    </View>
  );
}

function SkeletonHero() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 950, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 950, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.14] });
  return (
    <Animated.View style={{ width: W, height: HERO_H, backgroundColor: "white", opacity }} />
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({
  title, subtitle, icon, badge, accentColor = RED, onSeeAll,
}: {
  title: string; subtitle?: string; icon?: keyof typeof Feather.glyphMap;
  badge?: string | number; accentColor?: string; onSeeAll?: () => void;
}) {
  const parts = title.split(" ");
  const first = parts[0];
  const rest = parts.slice(1).join(" ");
  return (
    <View style={[sh.wrap, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[`${accentColor}22`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={sh.left}>
        <View style={[sh.bar, { backgroundColor: accentColor }]} />
        {icon && (
          <View style={[sh.iconBox, { backgroundColor: `${accentColor}1a` }]}>
            <Feather name={icon} size={13} color={accentColor} />
          </View>
        )}
        <View>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={[sh.title, { color: accentColor }]}>{first}</Text>
            {rest ? <Text style={sh.title}> {rest}</Text> : null}
            {badge != null && (
              <View style={[sh.badge, { backgroundColor: `${accentColor}22`, borderColor: `${accentColor}44` }]}>
                <Text style={[sh.badgeText, { color: accentColor }]}>{badge}</Text>
              </View>
            )}
          </View>
          {subtitle ? <Text style={sh.sub}>{subtitle}</Text> : null}
        </View>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={sh.seeAll}>
          <Text style={sh.seeAllText}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const sh = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, marginBottom: 4 },
  left: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  bar: { width: 3, height: 20, borderRadius: 2 },
  iconBox: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 },
  badge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 3, paddingLeft: 12 },
  seeAllText: { fontSize: 12, color: "rgba(255,255,255,0.38)", fontWeight: "600" },
});

// ─── PosterCard ───────────────────────────────────────────────────────────────
function PosterCard({
  item, onPress, isNew, badge, badgeColor = GREEN,
}: {
  item: ContentItem; onPress: () => void; isNew?: boolean; badge?: string; badgeColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 118, marginRight: 10, transform: [{ scale }] }}>
        <View style={pc.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14", "#0a060e"]} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="film" size={22} color="rgba(255,255,255,0.07)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.78)"]} locations={[0.5, 1]}
            style={StyleSheet.absoluteFill} />
          {(badge || isNew) && (
            <View style={[pc.badge, { backgroundColor: badge ? `${badgeColor}ee` : `${GREEN}ee` }]}>
              <Text style={pc.badgeText}>{badge ?? "NOVO"}</Text>
            </View>
          )}
          {item.rating > 0 && (
            <View style={pc.rating}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={pc.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={pc.title} numberOfLines={2}>{item.title}</Text>
        <Text style={pc.meta}>
          {item.type === "movie" ? "Filme" : "Série"}{item.year > 0 ? ` · ${item.year}` : ""}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const pc = StyleSheet.create({
  card: { width: 118, height: 172, borderRadius: 12, overflow: "hidden", backgroundColor: "#111", marginBottom: 6 },
  badge: { position: "absolute", top: 7, left: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  rating: { position: "absolute", bottom: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  ratingText: { fontSize: 9, fontWeight: "700", color: AMBER },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  meta: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 },
});

// ─── LandscapeCard (wider, for now-playing) ───────────────────────────────────
function LandscapeCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const imgUri = item.backdropPath || item.posterPath;
  const pi = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginRight: 12 }}>
      <Animated.View style={{ width: 220, transform: [{ scale }] }}>
        <View style={lc.card}>
          {!err && imgUri ? (
            <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0814", "#08060e"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "transparent", "rgba(0,0,0,0.95)"]}
            locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          <View style={lc.inner}>
            <View style={lc.cinemaTag}>
              <Feather name="film" size={9} color={RED} />
              <Text style={lc.cinemaTagText}>EM CARTAZ</Text>
            </View>
            <Text style={lc.title} numberOfLines={2}>{item.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {item.year > 0 && <Text style={lc.year}>{item.year}</Text>}
              {item.rating > 0 && (
                <View style={lc.ratingRow}>
                  <Feather name="star" size={9} color={AMBER} />
                  <Text style={lc.ratingText}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const lc = StyleSheet.create({
  card: { width: 220, height: 130, borderRadius: 14, overflow: "hidden", backgroundColor: "#111" },
  inner: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 },
  cinemaTag: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  cinemaTagText: { fontSize: 8, fontWeight: "900", color: RED, letterSpacing: 1 },
  title: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 17, marginBottom: 3 },
  year: { fontSize: 10, color: "rgba(255,255,255,0.45)" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontSize: 10, fontWeight: "700", color: AMBER },
});

// ─── UpcomingCard ─────────────────────────────────────────────────────────────
function UpcomingCard({ item, releaseDate, onPress }: { item: ContentItem; releaseDate: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const days = daysUntil(releaseDate);
  const pi = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  const countdownColor = days <= 7 ? RED : days <= 30 ? AMBER : BLUE;
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 120, marginRight: 10, transform: [{ scale }] }}>
        <View style={uc.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#0e0a1a", "#060410"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.4, 1]}
            style={StyleSheet.absoluteFill} />
          <View style={[uc.countdown, { backgroundColor: `${countdownColor}ee` }]}>
            {days > 0 ? (
              <>
                <Text style={uc.countdownNum}>{days}</Text>
                <Text style={uc.countdownLabel}>{days === 1 ? "dia" : "dias"}</Text>
              </>
            ) : (
              <Text style={uc.countdownToday}>HOJE</Text>
            )}
          </View>
          <View style={uc.dateBadge}>
            <Text style={uc.dateText}>{formatDate(releaseDate)}</Text>
          </View>
        </View>
        <Text style={uc.title} numberOfLines={2}>{item.title}</Text>
        <Text style={uc.sub}>{days > 0 ? `Em ${days} dias` : "Estreia hoje!"}</Text>
      </Animated.View>
    </Pressable>
  );
}

const uc = StyleSheet.create({
  card: { width: 120, height: 172, borderRadius: 12, overflow: "hidden", backgroundColor: "#111", marginBottom: 6 },
  countdown: { position: "absolute", top: 7, right: 7, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, alignItems: "center" },
  countdownNum: { fontSize: 13, fontWeight: "900", color: "#fff", lineHeight: 14 },
  countdownLabel: { fontSize: 7, fontWeight: "700", color: "rgba(255,255,255,0.8)", lineHeight: 10 },
  countdownToday: { fontSize: 8, fontWeight: "900", color: "#fff" },
  dateBadge: { position: "absolute", bottom: 7, left: 7, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  dateText: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 },
});

// ─── HeroRotatingBanner ───────────────────────────────────────────────────────
function HeroRotatingBanner({
  items, onPress, topPad,
}: {
  items: ContentItem[];
  onPress: (item: ContentItem) => void;
  topPad: number;
}) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [imgErrs, setImgErrs] = useState<Record<number, boolean>>({});

  const advanceTo = useCallback((next: number) => {
    Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
      setIndex(next);
      Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
      flatRef.current?.scrollToIndex({ index: next, animated: false });
    });
  }, [fade]);

  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      setIndex((cur) => {
        const next = (cur + 1) % items.length;
        Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
          setIndex(next);
          Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
          flatRef.current?.scrollToIndex({ index: next, animated: false });
        });
        return cur;
      });
    }, BANNER_INTERVAL);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (!items.length) return <SkeletonHero />;
  const item = items[Math.min(index, items.length - 1)];
  const imgUri = item.backdropPath || item.posterPath;
  const hasErr = imgErrs[index];

  return (
    <View style={{ width: W, height: HERO_H + topPad }}>
      {/* background image */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {!hasErr && imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={300}
            onError={() => setImgErrs((e) => ({ ...e, [index]: true }))} />
        ) : (
          <LinearGradient colors={["#1a0814", "#0e060c", "#050508"]} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>

      {/* Gradient overlays */}
      <LinearGradient
        colors={["rgba(5,5,8,0.82)", "transparent", "transparent"]}
        locations={[0, 0.25, 1]}
        style={[StyleSheet.absoluteFill, { height: topPad + 70 }]}
      />
      <LinearGradient
        colors={["transparent", "rgba(5,5,8,0.1)", "rgba(5,5,8,0.98)"]}
        locations={[0.38, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Content */}
      <Animated.View style={[hb.content, { paddingTop: topPad + 60, opacity: fade }]}>
        <View style={hb.tagRow}>
          <View style={hb.trendTag}>
            <Feather name="trending-up" size={9} color={RED} />
            <Text style={hb.trendText}>EM ALTA</Text>
          </View>
          <View style={hb.typePill}>
            <Text style={hb.typeText}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
          </View>
        </View>
        <Text style={hb.title} numberOfLines={2}>{item.title}</Text>
        {item.description?.length > 10 && (
          <Text style={hb.desc} numberOfLines={2}>{item.description}</Text>
        )}
        <View style={hb.metaRow}>
          {item.year > 0 && <Text style={hb.meta}>{item.year}</Text>}
          {item.rating > 0 && (
            <View style={hb.ratingWrap}>
              <Feather name="star" size={10} color={AMBER} />
              <Text style={hb.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <View style={hb.btnRow}>
          <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.82} style={hb.playBtn}>
            <Feather name="play" size={14} color="#fff" />
            <Text style={hb.playText}>Assistir</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.82} style={hb.infoBtn}>
            <Feather name="info" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={hb.infoText}>Detalhes</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Dots */}
      {items.length > 1 && (
        <View style={hb.dots}>
          {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
            <TouchableOpacity key={i} onPress={() => advanceTo(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <View style={[hb.dot, i === index && hb.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Hidden FlatList just for index sync tracking */}
      <FlatList
        ref={flatRef}
        data={items}
        horizontal
        keyExtractor={(_, i) => String(i)}
        renderItem={() => null}
        scrollEnabled={false}
        style={{ position: "absolute", opacity: 0, height: 0 }}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
      />
    </View>
  );
}

const hb = StyleSheet.create({
  content: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  trendTag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: `${RED}22`, borderWidth: 1, borderColor: `${RED}44`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  trendText: { fontSize: 9, fontWeight: "900", color: RED, letterSpacing: 0.8 },
  typePill: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  typeText: { fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.7)", letterSpacing: 0.8 },
  title: { fontSize: 26, fontWeight: "900", color: "#fff", lineHeight: 30, marginBottom: 6, letterSpacing: -0.3 },
  desc: { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 17, marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  meta: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12, fontWeight: "700", color: AMBER },
  btnRow: { flexDirection: "row", gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: RED, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  playText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  infoBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24 },
  infoText: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.8)" },
  dots: { position: "absolute", bottom: 100, right: 20, flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  dotActive: { width: 18, backgroundColor: RED },
});

// ─── StatsStrip ───────────────────────────────────────────────────────────────
function StatsStrip({ movies, series, animes }: { movies: number; series: number; animes: number }) {
  const items = [
    { label: "filmes", count: movies, icon: "film" as const, color: RED },
    { label: "séries", count: series, icon: "tv" as const, color: BLUE },
    { label: "animes", count: animes, icon: "star" as const, color: PURPLE },
  ];
  return (
    <View style={ss.row}>
      {items.map((s, i) => (
        <View key={i} style={[ss.pill, { borderColor: `${s.color}30` }]}>
          <View style={[ss.iconWrap, { backgroundColor: `${s.color}18` }]}>
            <Feather name={s.icon} size={11} color={s.color} />
          </View>
          <Text style={[ss.count, { color: s.color }]}>{s.count}</Text>
          <Text style={ss.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
const ss = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 24, marginTop: -8 },
  pill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  iconWrap: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 15, fontWeight: "900" },
  label: { fontSize: 10, color: "rgba(255,255,255,0.42)", fontWeight: "600" },
});

// ─── ExclusiveBanner ──────────────────────────────────────────────────────────
function ExclusiveBanner({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ paddingHorizontal: 16, marginBottom: 28 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={["#1a0520", "#0e0318", "#060110"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={eb.card}
        >
          {/* Background pattern */}
          <View style={eb.glowLeft} />
          <View style={eb.glowRight} />
          <View style={eb.content}>
            <View style={eb.iconCircle}>
              <Feather name="zap" size={20} color={PURPLE} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={eb.badgeRow}>
                <View style={eb.exclusiveBadge}>
                  <Text style={eb.exclusiveText}>SÓ NO NETPLAY</Text>
                </View>
              </View>
              <Text style={eb.title}>Conteúdos Exclusivos</Text>
              <Text style={eb.subtitle}>Títulos que você só encontra aqui — animes, doramas e séries raras</Text>
            </View>
            <Feather name="chevron-right" size={20} color="rgba(167,139,250,0.6)" />
          </View>
          <View style={eb.bottom}>
            {[["🎌", "Animes"], ["🎭", "Doramas"], ["🌟", "Raridades"]].map(([emoji, label]) => (
              <View key={label} style={eb.tag}>
                <Text style={eb.tagEmoji}>{emoji}</Text>
                <Text style={eb.tagLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}
const eb = StyleSheet.create({
  card: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(167,139,250,0.18)" },
  glowLeft: { position: "absolute", top: -30, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: `${PURPLE}22` },
  glowRight: { position: "absolute", bottom: -20, right: 40, width: 80, height: 80, borderRadius: 40, backgroundColor: `${PINK}1a` },
  content: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, paddingBottom: 12 },
  iconCircle: { width: 48, height: 48, borderRadius: 16, backgroundColor: `${PURPLE}22`, borderWidth: 1, borderColor: `${PURPLE}40`, alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", marginBottom: 4 },
  exclusiveBadge: { backgroundColor: `${PURPLE}30`, borderWidth: 1, borderColor: `${PURPLE}55`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  exclusiveText: { fontSize: 8, fontWeight: "900", color: PURPLE, letterSpacing: 0.8 },
  title: { fontSize: 15, fontWeight: "800", color: "#fff", lineHeight: 19 },
  subtitle: { fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 15, marginTop: 2 },
  bottom: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tagEmoji: { fontSize: 12 },
  tagLabel: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.55)" },
});

// ─── BreakingBanner (Estreias Hoje) ───────────────────────────────────────────
function BreakingBanner({ items, onPress }: { items: ContentItem[]; onPress: (item: ContentItem) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeader title="Estreando Hoje" icon="sunrise" badge={items.length} accentColor={ORANGE} subtitle="Séries com novos episódios hoje" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}>
        {items.map((item, i) => (
          <PosterCard key={`at_${item.id}_${i}`} item={item} onPress={() => onPress(item)} badge="HOJE" badgeColor={ORANGE} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── TvOnAirCard ──────────────────────────────────────────────────────────────
function TvOnAirCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={{ marginRight: 10 }}>
      <Animated.View style={{ width: 150, transform: [{ scale }] }}>
        <View style={tv.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#0a1020", "#060810"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.45, 1]}
            style={StyleSheet.absoluteFill} />
          <View style={tv.liveTag}>
            <View style={tv.liveDot} />
            <Text style={tv.liveText}>NO AR</Text>
          </View>
          {item.rating > 0 && (
            <View style={tv.rating}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={tv.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={tv.title} numberOfLines={2}>{item.title}</Text>
        <Text style={tv.meta}>Série · Temporada atual</Text>
      </Animated.View>
    </Pressable>
  );
}
const tv = StyleSheet.create({
  card: { width: 150, height: 218, borderRadius: 12, overflow: "hidden", backgroundColor: "#111", marginBottom: 6 },
  liveTag: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${TEAL}dd`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  rating: { position: "absolute", bottom: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  ratingText: { fontSize: 9, fontWeight: "700", color: AMBER },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  meta: { fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 1 },
});

// ─── AnimeCard ────────────────────────────────────────────────────────────────
function AnimeCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 32 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 100, marginRight: 10, transform: [{ scale }] }}>
        <View style={ac.card}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={250}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#10051a", "#06030e"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]}
            style={StyleSheet.absoluteFill} />
          <View style={ac.badge}>
            <Text style={ac.badgeText}>🎌</Text>
          </View>
        </View>
        <Text style={ac.title} numberOfLines={2}>{item.title}</Text>
      </Animated.View>
    </Pressable>
  );
}
const ac = StyleSheet.create({
  card: { width: 100, height: 145, borderRadius: 10, overflow: "hidden", backgroundColor: "#111", marginBottom: 5 },
  badge: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6, padding: 3 },
  badgeText: { fontSize: 10 },
  title: { fontSize: 10, fontWeight: "700", color: "#fff", lineHeight: 14 },
});

// URL resolver — handles both full URLs (Xtream CDN) and TMDB relative paths
function resolveImgUrl(pathOrUrl: string | null | undefined, size: "w185" | "w300" | "w342" | "w500" | "w780" | "w1280" | "original" = "w780"): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `https://image.tmdb.org/t/p/${size}${pathOrUrl}`;
}

// ─── EpisodeCard ──────────────────────────────────────────────────────────────
function EpisodeCard({
  group, onPress, onSynopsis,
}: { group: EpGroup; onPress: (g: EpGroup) => void; onSynopsis: (g: EpGroup) => void; }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [stillErr,   setStillErr]   = useState(false);
  const [backdropErr, setBackdropErr] = useState(false);
  const [posterErr,  setPosterErr]  = useState(false);
  const [logoErr,    setLogoErr]    = useState(false);
  const ep = group.latestEp;
  const isSingle = group.totalEps === 1;
  const epLabel = `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`;
  const pi = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();

  // Banner priority: episode still → series backdrop → poster → gradient
  const stillUrl    = (!stillErr && group.latestEpStill) ? resolveImgUrl(group.latestEpStill, "w780") : null;
  const backdropUrl = (!stillUrl && !backdropErr && group.backdropPath) ? resolveImgUrl(group.backdropPath, "w780") : null;
  const posterUrl   = (!stillUrl && !backdropUrl && !posterErr && group.seriesPoster) ? group.seriesPoster : null;

  // Logo image instead of text title
  const logoUrl = (!logoErr && group.logoPath) ? resolveImgUrl(group.logoPath, "w300") : null;

  // Episode synopsis
  const synopsis = group.latestEpOverview || group.seriesOverview || "";

  return (
    <Pressable onPressIn={pi} onPressOut={po} onPress={() => onPress(group)} style={{ marginRight: 14 }}>
      <Animated.View style={{ width: 240, transform: [{ scale }] }}>
        <View style={epc.card}>
          {/* Banner image */}
          {stillUrl ? (
            <Image source={{ uri: stillUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setStillErr(true)} />
          ) : backdropUrl ? (
            <Image source={{ uri: backdropUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setBackdropErr(true)} />
          ) : posterUrl ? (
            <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" onError={() => setPosterErr(true)} />
          ) : (
            <LinearGradient colors={["#0a1020", "#050810"]} style={StyleSheet.absoluteFill} />
          )}

          {/* Gradient overlay — stronger at bottom for text legibility */}
          <LinearGradient colors={["rgba(0,0,0,0.3)", "transparent", "rgba(0,0,0,0.88)"]}
            locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />

          {/* Top badges */}
          <View style={epc.topRow}>
            <View style={epc.epBadge}><Text style={epc.epBadgeText}>{epLabel}</Text></View>
            <View style={epc.newBadge}><Text style={epc.newBadgeText}>EP NOVO</Text></View>
          </View>

          {/* Small play button — only for single-episode items */}
          {isSingle && (
            <View style={epc.playCircle}>
              <Feather name="play" size={13} color="#fff" />
            </View>
          )}

          {/* Bottom row: logo or title + episode info */}
          <View style={epc.bottomRow}>
            <View style={{ flex: 1 }}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={epc.logoImg}
                  contentFit="contain" cachePolicy="memory-disk" onError={() => setLogoErr(true)} />
              ) : (
                <Text style={epc.seriesTitle} numberOfLines={1}>{group.seriesTitle}</Text>
              )}
              {ep.title && !/S\d+\s*E\d+/i.test(ep.title)
                ? <Text style={epc.epName} numberOfLines={1}>{ep.title}</Text>
                : !isSingle && <Text style={epc.epCount}>{group.totalEps} episódios</Text>
              }
            </View>
            {!isSingle && (
              <View style={epc.verEps}>
                <Text style={epc.verEpsText}>eps</Text>
                <Feather name="chevron-right" size={12} color={TEAL} />
              </View>
            )}
          </View>
        </View>

        {/* Synopsis below thumbnail */}
        {!!synopsis && (
          <Text style={epc.synopsis} numberOfLines={2}>{synopsis}</Text>
        )}

        {isSingle && (
          <View style={epc.actRow}>
            <TouchableOpacity onPress={() => onPress(group)} activeOpacity={0.8}
              style={[epc.actBtn, { backgroundColor: RED }]}>
              <Feather name="play" size={12} color="#fff" />
              <Text style={epc.actBtnTxt}>Assistir</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSynopsis(group)} activeOpacity={0.8} style={epc.actBtnOut}>
              <Feather name="info" size={12} color="rgba(255,255,255,0.65)" />
              <Text style={epc.actBtnOutTxt}>Sinopse</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}
const epc = StyleSheet.create({
  card:        { width: 240, height: 136, borderRadius: 12, overflow: "hidden", backgroundColor: "#0a0a12", marginBottom: 6 },
  topRow:      { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", padding: 7 },
  epBadge:     { backgroundColor: `${TEAL}dd`, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  epBadgeText: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
  newBadge:    { backgroundColor: "rgba(34,197,94,0.85)", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText:{ fontSize: 8, fontWeight: "800", color: "#fff" },
  playCircle:  { position: "absolute", top: "50%", left: "50%", width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(229,9,20,0.82)", alignItems: "center", justifyContent: "center", marginTop: -15, marginLeft: -15, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)" },
  bottomRow:   { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "flex-end", padding: 8 },
  logoImg:     { width: 90, height: 28, marginBottom: 2 },
  seriesTitle: { fontSize: 11, fontWeight: "800", color: "#fff", lineHeight: 14 },
  epName:      { fontSize: 9, color: "rgba(255,255,255,0.60)", fontWeight: "600", marginTop: 1 },
  epCount:     { fontSize: 9, color: `${TEAL}cc`, fontWeight: "600", marginTop: 1 },
  synopsis:    { fontSize: 10, color: "rgba(255,255,255,0.48)", lineHeight: 14, marginBottom: 6, marginTop: 0 },
  verEps:      { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 2 },
  verEpsText:  { fontSize: 9, color: TEAL, fontWeight: "700" },
  actRow:      { flexDirection: "row", gap: 8 },
  actBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8 },
  actBtnTxt:   { fontSize: 12, fontWeight: "800", color: "#fff" },
  actBtnOut:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  actBtnOutTxt:{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.65)" },
});

// ─── EpPreviewRow ─────────────────────────────────────────────────────────────
interface EpModalItem { group: EpGroup; ep: RawEp; key: string; }

function EpPreviewRow({
  item, isPlaying, muted, onPlay, onViewSeries,
}: { item: EpModalItem; isPlaying: boolean; muted: boolean; onPlay: () => void; onViewSeries: () => void; }) {
  const [vidLoading, setVidLoading] = useState(false);
  const [vidReady, setVidReady] = useState(false);
  const [stillErr, setStillErr] = useState(false);
  const [backdropErr, setBackdropErr] = useState(false);
  const [posterErr, setPosterErr] = useState(false);
  const ep = item.ep;
  const g = item.group;
  const epLabel = `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`;
  const canPreview = EpVideoComp !== null;

  // Episode still is the primary banner (landscape 16:9); falls back to series backdrop then poster
  const stillUrl = (!stillErr && g.latestEpStill) ? resolveImgUrl(g.latestEpStill, "w780") : null;
  const backdropUrl = (!stillUrl && !backdropErr && g.backdropPath) ? resolveImgUrl(g.backdropPath, "w780") : null;
  const hasPoster = !posterErr && !!g.seriesPoster && !stillUrl && !backdropUrl;
  // Synopsis: prefer episode-specific overview, fall back to series overview
  const synopsis = g.latestEpOverview || g.seriesOverview || "";

  // TMDB logo image URL (PNG with transparency)
  const logoUrl = g.logoPath ? resolveImgUrl(g.logoPath, "w300") : null;

  // Reset video state when play starts/stops
  useEffect(() => {
    setVidLoading(isPlaying);
    if (!isPlaying) setVidReady(false);
  }, [isPlaying]);

  return (
    <View style={epr.card}>
      {/* ── Thumbnail 16:9 ─────────────────────────────────────────── */}
      <View style={epr.thumb}>

        {/* Layer 1 — base image: episode still (preferred) > series backdrop > poster > gradient */}
        {stillUrl ? (
          <Image
            source={{ uri: stillUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setStillErr(true)}
          />
        ) : backdropUrl ? (
          <Image
            source={{ uri: backdropUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setBackdropErr(true)}
          />
        ) : hasPoster ? (
          <Image
            source={{ uri: g.seriesPoster }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            onError={() => setPosterErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1a0c24", "#0c0818", "#080510"]} style={StyleSheet.absoluteFill} />
        )}

        {/* Video preview — fills container with contain so nothing is cropped */}
        {isPlaying && canPreview && (
          <EpVideoComp
            source={{ uri: ep.stream_url }}
            style={[StyleSheet.absoluteFill, {
              opacity: vidReady ? 1 : 0,
              backgroundColor: "#000",
            }]}
            resizeMode={EpResizeMode.CONTAIN ?? "contain"}
            isMuted={muted}
            shouldPlay
            isLooping
            useNativeControls={false}
            onLoadStart={() => { setVidLoading(true); setVidReady(false); }}
            onReadyForDisplay={() => { setVidLoading(false); setVidReady(true); }}
            onLoad={() => { setVidLoading(false); setVidReady(true); }}
            onError={() => { setVidLoading(false); setVidReady(false); }}
          />
        )}

        {/* Gradient — only when video is NOT playing */}
        {!isPlaying && (
          <LinearGradient
            colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.82)"]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Loading spinner */}
        {isPlaying && vidLoading && (
          <View style={epr.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={epr.loadingText}>Carregando prévia…</Text>
          </View>
        )}

        {/* PRÉVIA badge */}
        {isPlaying && vidReady && (
          <View style={epr.liveBadge}>
            <View style={epr.liveDot} />
            <Text style={epr.liveTxt}>PRÉVIA</Text>
          </View>
        )}

        {/* S/E badge */}
        <View style={epr.epTag}><Text style={epr.epTagTxt}>{epLabel}</Text></View>
      </View>

      {/* ── Info below thumbnail ──────────────────────────────────── */}
      <View style={epr.info}>
        {/* Season / Episode badges */}
        <View style={epr.metaRow}>
          <View style={epr.metaBadge}>
            <Feather name="layers" size={9} color={TEAL} />
            <Text style={epr.metaBadgeTxt}>{`Temporada ${ep.season}`}</Text>
          </View>
          <View style={[epr.metaBadge, { backgroundColor: `${RED}18`, borderColor: `${RED}30` }]}>
            <Feather name="play-circle" size={9} color={RED} />
            <Text style={[epr.metaBadgeTxt, { color: RED }]}>{`Episódio ${ep.episode}`}</Text>
          </View>
        </View>

        {/* Episode title */}
        {ep.title && !/S\d+\s*E\d+/i.test(ep.title) && (
          <Text style={epr.epName} numberOfLines={1}>{ep.title}</Text>
        )}

        {/* Synopsis */}
        {!!synopsis && (
          <Text style={epr.synopsis} numberOfLines={3}>{synopsis}</Text>
        )}

        {/* Series logo — below synopsis, left-aligned */}
        {logoUrl && (
          <Image
            source={{ uri: logoUrl }}
            style={epr.logoImg}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        )}

        {/* Action buttons */}
        <View style={epr.btnRow}>
          <TouchableOpacity onPress={onPlay} activeOpacity={0.85} style={epr.playBtn}>
            <Feather name="play" size={14} color="#fff" />
            <Text style={epr.playBtnTxt}>Assistir Episódio</Text>
          </TouchableOpacity>
          {g.totalEps > 1 && (
            <TouchableOpacity onPress={onViewSeries} activeOpacity={0.75} style={epr.seriesBtn}>
              <Text style={epr.seriesBtnTxt}>{g.totalEps}</Text>
              <Feather name="list" size={12} color={TEAL} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
const epr = StyleSheet.create({
  card:          { marginBottom: 16, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, overflow: "hidden" },
  thumb:         { width: "100%", aspectRatio: 16 / 9, maxHeight: 195, backgroundColor: "#000", overflow: "hidden" },
  loadingOverlay:{ ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.38)" },
  loadingText:   { fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  liveBadge:     { position: "absolute", top: 8, left: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(229,9,20,0.92)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  liveDot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveTxt:       { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  epTag:         { position: "absolute", bottom: 6, left: 10, backgroundColor: `${TEAL}ee`, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  epTagTxt:      { fontSize: 9, fontWeight: "900", color: "#fff" },
  info:          { padding: 14, gap: 7 },
  metaRow:       { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaBadge:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${TEAL}18`, borderWidth: 1, borderColor: `${TEAL}30`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  metaBadgeTxt:  { fontSize: 10, fontWeight: "700", color: TEAL },
  epName:        { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.6)", lineHeight: 16 },
  synopsis:      { fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 18 },
  logoImg:       { width: 110, height: 36, alignSelf: "flex-start", marginTop: -2 },
  btnRow:        { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: RED, paddingVertical: 12, borderRadius: 10 },
  playBtnTxt:    { fontSize: 13, fontWeight: "800", color: "#fff" },
  seriesBtn:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: `${TEAL}15`, borderWidth: 1, borderColor: `${TEAL}35` },
  seriesBtnTxt:  { fontSize: 13, fontWeight: "700", color: TEAL },
});

// ─── SingleEpSheet ────────────────────────────────────────────────────────────
function SingleEpSheet({
  visible, group, onClose, onPlay, onSynopsis,
}: { visible: boolean; group: EpGroup | null; onClose: () => void; onPlay: (g: EpGroup) => void; onSynopsis: (g: EpGroup) => void; }) {
  const slideY = useRef(new Animated.Value(H)).current;
  const bdrop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 270, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!group) return null;
  const ep = group.latestEp;
  const epLabel = `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)", opacity: bdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[ses.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0c0814", "#060410"]} style={StyleSheet.absoluteFill} />
        <View style={[ses.handle, { backgroundColor: `${TEAL}55` }]} />
        <View style={ses.infoRow}>
          <View style={ses.posterWrap}>
            {group.seriesPoster ? (
              <Image source={{ uri: group.seriesPoster }} style={StyleSheet.absoluteFill}
                contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <LinearGradient colors={["#12061a", "#06030e"]} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} locations={[0.5, 1]}
              style={StyleSheet.absoluteFill} />
          </View>
          <View style={ses.metaCol}>
            <View style={ses.epBadge}><Text style={ses.epBadgeText}>{epLabel}</Text></View>
            <Text style={ses.title} numberOfLines={2}>{group.seriesTitle}</Text>
            <Text style={ses.epTitle} numberOfLines={2}>{ep.title || epLabel}</Text>
          </View>
        </View>
        <View style={ses.actions}>
          <TouchableOpacity onPress={() => { onClose(); onPlay(group); }} activeOpacity={0.85} style={ses.playBtn}>
            <Feather name="play" size={16} color="#fff" />
            <Text style={ses.playTxt}>Assistir Episódio</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onClose(); onSynopsis(group); }} activeOpacity={0.8} style={ses.synBtn}>
            <Feather name="info" size={16} color={TEAL} />
            <Text style={ses.synTxt}>Ver Sinopse da Série</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}
const ses = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden", paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 16 },
  infoRow: { flexDirection: "row", paddingHorizontal: 18, gap: 14, marginBottom: 22 },
  posterWrap: { width: 90, height: 126, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" },
  metaCol: { flex: 1, justifyContent: "center", gap: 7 },
  epBadge: { alignSelf: "flex-start", backgroundColor: `${TEAL}dd`, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  epBadgeText: { fontSize: 10, fontWeight: "900", color: "#fff" },
  title: { fontSize: 16, fontWeight: "900", color: "#fff", lineHeight: 21 },
  epTitle: { fontSize: 12, color: "rgba(255,255,255,0.48)", lineHeight: 16 },
  actions: { paddingHorizontal: 18, gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: RED, paddingVertical: 14, borderRadius: 14 },
  playTxt: { fontSize: 15, fontWeight: "900", color: "#fff" },
  synBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: `${TEAL}18`, borderWidth: 1, borderColor: `${TEAL}40`, paddingVertical: 14, borderRadius: 14 },
  synTxt: { fontSize: 15, fontWeight: "700", color: TEAL },
});

// ─── EpisodesModal ────────────────────────────────────────────────────────────
function EpisodesModal({
  visible, groups, onClose, onPlayEp, onViewSeries,
}: {
  visible: boolean; groups: EpGroup[];
  onClose: () => void;
  onPlayEp: (g: EpGroup, ep: RawEp) => void;
  onViewSeries: (g: EpGroup) => void;
}) {
  const PAGE_SIZE = 15;

  const slideY = useRef(new Animated.Value(H)).current;
  const bdrop = useRef(new Animated.Value(0)).current;
  const [previewMuted, setPreviewMuted] = useState(true);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (visible) {
      setPlayingKey(null);
      setVisibleCount(PAGE_SIZE);
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 330, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 1, duration: 270, useNativeDriver: true }),
      ]).start();
    } else {
      setPlayingKey(null);
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 290, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 0, duration: 230, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const allItems = useMemo<EpModalItem[]>(() => groups.map(g => ({
    group: g, ep: g.latestEp, key: `ep_${g.seriesId}_${g.latestEp.season}_${g.latestEp.episode}`,
  })), [groups]);

  const pageItems = useMemo(() => allItems.slice(0, visibleCount), [allItems, visibleCount]);
  const hasMore = visibleCount < allItems.length;

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount(c => Math.min(c + PAGE_SIZE, allItems.length));
      setLoadingMore(false);
    }, 250);
  }, [loadingMore, hasMore, allItems.length]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 55 });
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setPlayingKey(viewableItems[0].item.key);
    else setPlayingKey(null);
  });

  const ListFooter = useCallback(() => {
    if (!hasMore) return (
      <View style={{ alignItems: "center", paddingVertical: 24 }}>
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
          {allItems.length} série{allItems.length !== 1 ? "s" : ""} exibidas
        </Text>
      </View>
    );
    return (
      <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
        {loadingMore ? (
          <ActivityIndicator size="small" color={TEAL} />
        ) : (
          <TouchableOpacity onPress={loadMore} activeOpacity={0.75}
            style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: `${TEAL}18`, borderWidth: 1, borderColor: `${TEAL}35`, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Feather name="chevron-down" size={14} color={TEAL} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: TEAL }}>
              Carregar mais ({Math.min(PAGE_SIZE, allItems.length - visibleCount)} de {allItems.length - visibleCount})
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [hasMore, loadingMore, loadMore, allItems.length, visibleCount]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.78)", opacity: bdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[epm.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#080610", "#040308"]} style={StyleSheet.absoluteFill} />
        <View style={[epm.handle, { backgroundColor: `${TEAL}55` }]} />
        <View style={epm.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[epm.accent, { backgroundColor: TEAL }]} />
            <Text style={epm.title}>Novos Episódios</Text>
            <View style={epm.cnt}>
              <Text style={epm.cntText}>{visibleCount < allItems.length ? `${visibleCount}/` : ""}{allItems.length} séries</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => setPreviewMuted(m => !m)} activeOpacity={0.75}
              style={[epm.iconBtn, { backgroundColor: previewMuted ? "rgba(255,255,255,0.07)" : `${TEAL}28` }]}>
              <Feather name={previewMuted ? "volume-x" : "volume-2"} size={15}
                color={previewMuted ? "rgba(255,255,255,0.4)" : TEAL} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.75} style={epm.iconBtn}>
              <Feather name="x" size={16} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={epm.hint}>
          {previewMuted ? "Prévia no mudo — toque 🔊 para ativar áudio" : "Prévia com áudio ativo"}
        </Text>
        <FlatList
          data={pageItems}
          keyExtractor={item => item.key}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40, paddingTop: 4 }}
          viewabilityConfig={viewabilityConfig.current}
          onViewableItemsChanged={onViewableItemsChanged.current}
          initialNumToRender={4}
          maxToRenderPerBatch={3}
          windowSize={6}
          removeClippedSubviews
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooter}
          renderItem={({ item }) => (
            <EpPreviewRow
              item={item}
              isPlaying={playingKey === item.key}
              muted={previewMuted}
              onPlay={() => { onClose(); onPlayEp(item.group, item.ep); }}
              onViewSeries={() => { onClose(); onViewSeries(item.group); }}
            />
          )}
        />
      </Animated.View>
    </Modal>
  );
}
const epm = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.9, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  accent: { width: 3, height: 18, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: "800", color: "#fff" },
  cnt: { backgroundColor: `${TEAL}20`, borderWidth: 1, borderColor: `${TEAL}44`, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  cntText: { fontSize: 11, fontWeight: "800", color: TEAL },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 11, color: "rgba(255,255,255,0.28)", paddingHorizontal: 18, marginBottom: 10 },
});

// ─── VerMaisModal ─────────────────────────────────────────────────────────────
function VerMaisModal({ visible, title, items, accentColor = RED, onClose, onItemPress }: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (item: ContentItem) => void;
}) {
  const slideY = useRef(new Animated.Value(H)).current;
  const bdrop = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) {
      setQuery("");
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 330, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 1, duration: 270, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 290, useNativeDriver: true }),
        Animated.timing(bdrop, { toValue: 0, duration: 230, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [query, items]);

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.72)", opacity: bdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[vm.sheet, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0a0810", "#060408"]} style={StyleSheet.absoluteFill} />
        <View style={[vm.handle, { backgroundColor: `${accentColor}55` }]} />
        <View style={vm.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[vm.accent, { backgroundColor: accentColor }]} />
            <Text style={vm.title}>{title}</Text>
            <View style={[vm.cnt, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}44` }]}>
              <Text style={[vm.cntText, { color: accentColor }]}>
                {query.trim() ? `${filtered.length}/${items.length}` : items.length}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={vm.close}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.65)" />
          </TouchableOpacity>
        </View>
        <View style={vm.searchBar}>
          <Feather name="search" size={14} color={query ? accentColor : "rgba(255,255,255,0.3)"} style={{ marginRight: 8 }} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Buscar…" placeholderTextColor="rgba(255,255,255,0.25)"
            style={[vm.searchInput, query && { color: "#fff" }]}
            returnKeyType="search" autoCorrect={false}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={14} color={accentColor} />
            </TouchableOpacity>
          )}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `vm_${item.id}_${idx}`}
          numColumns={3}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={9}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onItemPress(item); onClose(); }}
              style={{ width: CARD_W, marginBottom: 8 }}>
              <View style={{ width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" }}>
                {item.posterPath ? (
                  <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
                    contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]}
                  style={StyleSheet.absoluteFill} />
                <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 14 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      </Animated.View>
    </Modal>
  );
}
const vm = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.88, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 10 },
  accent: { width: 3, height: 18, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: "800", color: "#fff" },
  cnt: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  cntText: { fontSize: 11, fontWeight: "800" },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.5)", padding: 0 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NovidadesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<AllData | null>(null);
  const [modal, setModal] = useState<{ visible: boolean; title: string; items: ContentItem[]; accent: string }>({
    visible: false, title: "", items: [], accent: RED,
  });

  const openModal = (title: string, items: ContentItem[], accent = RED) =>
    setModal({ visible: true, title, items, accent });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId || 0),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  }, [router]);

  const load = useCallback(async () => {
    const result = await loadAll();
    setData(result);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  // ── Episode groups ───────────────────────────────────────────────────────
  const [epGroups, setEpGroups] = useState<EpGroup[]>([]);
  const [epLoading, setEpLoading] = useState(false);
  const [showEpsModal, setShowEpsModal] = useState(false);
  const [singleSheet, setSingleSheet] = useState<{ visible: boolean; group: EpGroup | null }>({
    visible: false, group: null,
  });

  useEffect(() => {
    const series = data?.whatsNew?.series?.filter(i => i.poster) ?? [];
    if (!series.length) { setEpGroups([]); return; }
    setEpLoading(true);
    // Fetch ALL series from the last 30 days — no arbitrary cap
    Promise.allSettled(
      series.map(s =>
        r2Route<{ found: boolean; episodes: RawEp[] }>(`/flix2/series-episodes?seriesId=${s.id}`)
          .then(r => ({ s, r }))
      )
    ).then(results => {
      const groups: EpGroup[] = [];
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        const { s, r } = res.value;
        if (!r.found || !r.episodes?.length) continue;
        const allEps = r.episodes;
        const latestEp = [...allEps].sort((a, b) => {
          if (a.season !== b.season) return b.season - a.season;
          return b.episode - a.episode;
        })[0];
        groups.push({
          seriesId: String(s.id),
          seriesTitle: s.title,
          seriesPoster: s.poster,
          seriesTmdbId: Number(s.tmdb_id) || 0,
          totalEps: allEps.length,
          latestEp,
          allEps,
          seriesOverview: s.overview || "",
          backdropPath: s.backdrop || "",
        });
      }
      setEpGroups(groups);

      // ── TMDB enrichment: backdrop + logo + overview + episode still/synopsis ─
      // Pass 1: groups WITH tmdbId — fetch series details, logo, AND episode details
      const withTmdb = groups.filter(g => g.seriesTmdbId > 0).slice(0, 30);
      if (withTmdb.length) {
        Promise.allSettled(
          withTmdb.map(g =>
            Promise.all([
              r2Route<{ overview?: string; backdrop_path?: string }>(`/tmdb/tv/${g.seriesTmdbId}`),
              r2Route<{ logo_path: string | null }>(`/tmdb/franchise-logo?type=tv&id=${g.seriesTmdbId}`),
              r2Route<{ still_path: string | null; overview?: string }>(
                `/tmdb/tv/${g.seriesTmdbId}/season/${g.latestEp.season}/episode/${g.latestEp.episode}`
              ).catch(() => ({ still_path: null, overview: "" })),
            ]).then(([det, logo, ep]) => ({
              seriesId: g.seriesId,
              overview: det.overview || "",
              backdropPath: det.backdrop_path || "",
              logoPath: logo.logo_path || "",
              latestEpStill: ep.still_path || "",
              latestEpOverview: ep.overview || "",
            }))
          )
        ).then(enrichResults => {
          const map: Record<string, { overview: string; backdropPath: string; logoPath: string; latestEpStill: string; latestEpOverview: string }> = {};
          for (const r2 of enrichResults) {
            if (r2.status !== "fulfilled") continue;
            map[r2.value.seriesId] = r2.value;
          }
          setEpGroups(prev =>
            prev.map(g => {
              const e = map[g.seriesId];
              if (!e) return g;
              return {
                ...g,
                seriesOverview: g.seriesOverview || e.overview,
                backdropPath: e.backdropPath || g.backdropPath,
                logoPath: e.logoPath || g.logoPath,
                latestEpStill: e.latestEpStill || g.latestEpStill,
                latestEpOverview: e.latestEpOverview || g.latestEpOverview,
              };
            })
          );
        });
      }

      // Pass 2: groups WITHOUT tmdbId — try TMDB title search for overview
      const withoutTmdb = groups.filter(g => !g.seriesTmdbId && !g.seriesOverview).slice(0, 15);
      if (withoutTmdb.length) {
        Promise.allSettled(
          withoutTmdb.map(g =>
            r2Route<{ results: Array<{ overview: string }> }>(
              `/tmdb-search?q=${encodeURIComponent(g.seriesTitle)}&type=tv`
            ).then(d => ({
              seriesId: g.seriesId,
              overview: d.results?.[0]?.overview || "",
            }))
          )
        ).then(searchResults => {
          const overMap: Record<string, string> = {};
          for (const r2 of searchResults) {
            if (r2.status !== "fulfilled") continue;
            overMap[r2.value.seriesId] = r2.value.overview;
          }
          setEpGroups(prev =>
            prev.map(g => {
              const ov = overMap[g.seriesId];
              if (!ov) return g;
              return { ...g, seriesOverview: ov };
            })
          );
        });
      }
    }).finally(() => setEpLoading(false));
  }, [data?.whatsNew]);

  const epDetailParams = useCallback((group: EpGroup) => ({
    type: "tv" as const,
    id: group.seriesTmdbId > 0 ? String(group.seriesTmdbId) : "0",
    flix2Id: group.seriesId,
    title: group.seriesTitle,
    poster: group.seriesPoster,
  }), []);

  const handleEpCardPress = useCallback((group: EpGroup) => {
    if (group.totalEps === 1) {
      setSingleSheet({ visible: true, group });
    } else {
      router.push({ pathname: "/detail", params: epDetailParams(group) });
    }
  }, [router, epDetailParams]);

  const handlePlayEpisode = useCallback((group: EpGroup, ep: RawEp) => {
    const flix2Items = group.allEps.map(e => ({
      id: `ep-${e.season}-${e.episode}`,
      flix2Url: e.stream_url,
      title: group.seriesTitle,
      label: e.title,
      season: e.season,
      episode: e.episode,
    }));
    router.push({
      pathname: "/flix2-player",
      params: {
        flix2Url: ep.stream_url,
        title: group.seriesTitle,
        episodeName: ep.title || `S${String(ep.season).padStart(2, "0")} E${String(ep.episode).padStart(2, "0")}`,
        tmdbId: String(group.seriesTmdbId || 0),
        type: "tv",
        season: String(ep.season),
        episode: String(ep.episode),
        flix2ItemsJson: JSON.stringify(flix2Items),
      },
    });
  }, [router]);

  const handleEpSynopsis = useCallback((group: EpGroup) => {
    router.push({ pathname: "/detail", params: epDetailParams(group) });
  }, [router, epDetailParams]);

  // ── Computed sections ───────────────────────────────────────────────────────
  const heroBannerItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.trending.slice(0, 8).map(tmdbItemToContent);
  }, [data]);

  const nowPlayingItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.nowPlaying.map(tmdbItemToContent);
  }, [data]);

  const upcomingItems = useMemo<Array<{ item: ContentItem; releaseDate: string }>>(() => {
    if (!data) return [];
    return data.upcoming
      .filter((i) => i.release_date && daysUntil(i.release_date) >= 0)
      .map((i) => ({ item: tmdbItemToContent(i), releaseDate: i.release_date! }));
  }, [data]);

  const onTheAirItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.onTheAir.map(tmdbItemToContent);
  }, [data]);

  const airingTodayItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.airingToday.map(tmdbItemToContent);
  }, [data]);

  const trendingMovieItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.trendingMovies.map(tmdbItemToContent);
  }, [data]);

  const trendingTvItems = useMemo<ContentItem[]>(() => {
    if (!data) return [];
    return data.trendingTv.map(tmdbItemToContent);
  }, [data]);

  const newMovies = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    return data.whatsNew.movies.filter((i) => i.poster).map(wn2Content);
  }, [data]);

  const newSeries = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    return data.whatsNew.series.filter((i) => i.poster).map(wn2Content);
  }, [data]);

  // "Novos Episódios" — séries do whats-new onde novos eps foram adicionados
  // Ordenadas pelo mais recente, priorizando séries de hoje e ontem
  const newEpisodes = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sorted = [...data.whatsNew.series]
      .filter((i) => i.poster)
      .sort((a, b) => {
        // Hoje primeiro, ontem segundo, resto por added_at desc
        const pa = a.added_date === today ? 2 : a.added_date === yest ? 1 : 0;
        const pb = b.added_date === today ? 2 : b.added_date === yest ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return b.added_at - a.added_at;
      });
    return sorted.map(wn2Content);
  }, [data]);

  // "Recém Adicionados" — mix de todos os tipos, ordenados por added_at desc (aleatorio visual)
  const recentlyAdded = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    const all = [
      ...(data.whatsNew.movies ?? []),
      ...(data.whatsNew.series ?? []),
      ...(data.whatsNew.animes ?? []),
    ]
      .filter((i) => i.poster)
      .sort((a, b) => b.added_at - a.added_at);

    // Embaralha ligeiramente: pega os 30 mais recentes e shuffla
    const pool = all.slice(0, 40);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.map(wn2Content);
  }, [data]);

  const newAnimes = useMemo<ContentItem[]>(() => {
    if (!data?.whatsNew) return [];
    return data.whatsNew.animes.filter((i) => i.poster).map(wn2Content);
  }, [data]);

  const totalNew = (data?.whatsNew?.total ?? 0);

  // ── Week stats ──────────────────────────────────────────────────────────────
  const weekMovies = useMemo(() => data?.whatsNew?.movies.length ?? 0, [data]);
  const weekSeries = useMemo(() => data?.whatsNew?.series.length ?? 0, [data]);
  const weekAnimes = useMemo(() => data?.whatsNew?.animes.length ?? 0, [data]);

  return (
    <View style={[root.bg, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <View style={[root.header, { paddingTop: topPad + 10 }]}>
        <LinearGradient
          colors={["rgba(5,5,8,0.98)", "rgba(5,5,8,0.7)", "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={root.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <LinearGradient colors={[RED, "#ff4d5a"]} style={root.sparkleBox}>
              <Feather name="zap" size={12} color="#fff" />
            </LinearGradient>
            <Text style={root.logoA}>NOVI</Text>
            <Text style={root.logoB}>DADES</Text>
            {totalNew > 0 && (
              <View style={root.countBadge}>
                <Text style={root.countText}>{totalNew}+</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity style={root.iconBtn}
              onPress={() => router.push("/(tabs)/list")} activeOpacity={0.75}>
              <Feather name="bookmark" size={19} color="rgba(255,255,255,0.75)" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ═══ SCROLL ══════════════════════════════════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={RED} colors={[RED]} progressViewOffset={topPad + 52} />
        }
        contentContainerStyle={{ paddingBottom: 160 }}
      >
        {/* ── HERO BANNER ──────────────────────────────────────────────── */}
        {loading ? (
          <View style={{ marginBottom: 0 }}>
            <SkeletonHero />
            <View style={{ height: topPad + 60 }} />
          </View>
        ) : (
          <HeroRotatingBanner items={heroBannerItems} onPress={goTo} topPad={topPad} />
        )}

        {/* ── STATS STRIP ──────────────────────────────────────────────── */}
        <View style={{ height: 16 }} />
        {loading ? null : <StatsStrip movies={weekMovies} series={weekSeries} animes={weekAnimes} />}

        {/* ── RECÉM ADICIONADOS NA PLATAFORMA ──────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Recém Adicionados" icon="plus-circle" badge={recentlyAdded.length}
            accentColor={GREEN} subtitle="Últimas adições à plataforma"
            onSeeAll={recentlyAdded.length > 6 ? () => openModal("Recém Adicionados", recentlyAdded, GREEN) : undefined} />
          {loading ? <SkeletonRow count={4} width={118} height={172} /> : (
            recentlyAdded.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {recentlyAdded.slice(0, 6).map((item, i) => (
                  <PosterCard key={`ra_${item.id}_${i}`} item={item}
                    onPress={() => goTo(item)} isNew />
                ))}
              </ScrollView>
            ) : (
              <Text style={root.emptyText}>Em breve por aqui</Text>
            )
          )}
        </View>

        {/* ── NOVOS EPISÓDIOS ───────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Novos Episódios" icon="play-circle" badge={epGroups.length}
            accentColor={TEAL} subtitle="Assista direto ou explore a temporada"
            onSeeAll={epGroups.length > 0 ? () => setShowEpsModal(true) : undefined} />
          {(loading || epLoading) ? <SkeletonRow count={3} width={240} height={135} /> : (
            epGroups.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {epGroups.slice(0, 6).map((g, i) => (
                  <EpisodeCard
                    key={`epg_${g.seriesId}_${i}`}
                    group={g}
                    onPress={handleEpCardPress}
                    onSynopsis={handleEpSynopsis}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={root.emptyText}>Em breve por aqui</Text>
            )
          )}
        </View>

        {/* ── FILMES DA SEMANA ─────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Filmes da Semana" icon="film" badge={newMovies.length}
            accentColor={RED} subtitle="Adicionados nos últimos 30 dias"
            onSeeAll={newMovies.length > 6 ? () => openModal("Filmes da Semana", newMovies, RED) : undefined} />
          {loading ? <SkeletonRow count={4} width={118} height={172} /> : (
            newMovies.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {newMovies.slice(0, 6).map((item, i) => (
                  <PosterCard key={`nm_${item.id}_${i}`} item={item}
                    onPress={() => goTo(item)} isNew />
                ))}
              </ScrollView>
            ) : (
              <Text style={root.emptyText}>Em breve por aqui</Text>
            )
          )}
        </View>

        {/* ── EM ALTA ESTA SEMANA (FILMES) ─────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Em Alta Esta Semana" icon="trending-up" badge={trendingMovieItems.length}
            accentColor={AMBER} subtitle="Filmes mais assistidos no mundo"
            onSeeAll={trendingMovieItems.length > 6 ? () => openModal("Em Alta — Filmes", trendingMovieItems, AMBER) : undefined} />
          {loading ? <SkeletonRow count={4} width={118} height={172} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              {trendingMovieItems.slice(0, 6).map((item, i) => (
                <PosterCard key={`tf_${item.id}_${i}`} item={item}
                  onPress={() => goTo(item)} badge={i < 3 ? `#${i + 1}` : undefined} badgeColor={AMBER} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── EM CARTAZ AGORA ──────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Em Cartaz Agora" icon="film" badge={nowPlayingItems.length}
            accentColor={ORANGE} subtitle="Nos cinemas esta semana"
            onSeeAll={nowPlayingItems.length > 6 ? () => openModal("Em Cartaz Agora", nowPlayingItems, ORANGE) : undefined} />
          {loading ? <SkeletonRow count={3} width={220} height={130} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              {nowPlayingItems.slice(0, 6).map((item, i) => (
                <LandscapeCard key={`np_${item.id}_${i}`} item={item} onPress={() => goTo(item)} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── SÉRIES DA SEMANA ─────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Séries da Semana" icon="tv" badge={newSeries.length}
            accentColor={BLUE} subtitle="Novas séries adicionadas"
            onSeeAll={newSeries.length > 6 ? () => openModal("Séries da Semana", newSeries, BLUE) : undefined} />
          {loading ? <SkeletonRow count={4} width={118} height={172} /> : (
            newSeries.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                {newSeries.slice(0, 6).map((item, i) => (
                  <PosterCard key={`ns_${item.id}_${i}`} item={item}
                    onPress={() => goTo(item)} badge="NOVA" badgeColor={BLUE} />
                ))}
              </ScrollView>
            ) : (
              <Text style={root.emptyText}>Em breve por aqui</Text>
            )
          )}
        </View>

        {/* ── EXCLUSIVE BANNER ─────────────────────────────────────────── */}
        <ExclusiveBanner onPress={() => router.push("/search")} />

        {/* ── ESTREANDO HOJE ───────────────────────────────────────────── */}
        {!loading && airingTodayItems.length > 0 && (
          <BreakingBanner items={airingTodayItems.slice(0, 6)} onPress={goTo} />
        )}

        {/* ── SÉRIES NO AR ─────────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Séries no Ar" icon="radio" badge={onTheAirItems.length}
            accentColor={PURPLE} subtitle="Temporadas em andamento"
            onSeeAll={onTheAirItems.length > 6 ? () => openModal("Séries no Ar", onTheAirItems, PURPLE) : undefined} />
          {loading ? <SkeletonRow count={3} width={150} height={218} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              {onTheAirItems.slice(0, 6).map((item, i) => (
                <TvOnAirCard key={`oa_${item.id}_${i}`} item={item} onPress={() => goTo(item)} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── EM ALTA — SÉRIES ─────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Séries em Alta" icon="award" badge={trendingTvItems.length}
            accentColor={PINK} subtitle="As mais comentadas da semana"
            onSeeAll={trendingTvItems.length > 6 ? () => openModal("Séries em Alta", trendingTvItems, PINK) : undefined} />
          {loading ? <SkeletonRow count={4} width={118} height={172} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              {trendingTvItems.slice(0, 6).map((item, i) => (
                <PosterCard key={`tv_${item.id}_${i}`} item={item}
                  onPress={() => goTo(item)} badge={i < 3 ? `#${i + 1}` : undefined} badgeColor={PINK} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── CHEGANDO EM BREVE ────────────────────────────────────────── */}
        <View style={root.section}>
          <SectionHeader title="Chegando em Breve" icon="calendar" badge={upcomingItems.length}
            accentColor={AMBER} subtitle="Prepare sua lista com antecedência"
            onSeeAll={upcomingItems.length > 6 ? () => openModal("Chegando em Breve", upcomingItems.map(u => u.item), AMBER) : undefined} />
          {loading ? <SkeletonRow count={4} width={120} height={172} /> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              {upcomingItems.slice(0, 6).map(({ item, releaseDate }, i) => (
                <UpcomingCard key={`up_${item.id}_${i}`} item={item}
                  releaseDate={releaseDate} onPress={() => goTo(item)} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── ANIMES DA SEMANA ─────────────────────────────────────────── */}
        {newAnimes.length > 0 && (
          <View style={root.section}>
            <SectionHeader title="Animes da Semana" icon="star" badge={newAnimes.length}
              accentColor={PURPLE} subtitle="Novos animes adicionados"
              onSeeAll={newAnimes.length > 6 ? () => openModal("Animes da Semana", newAnimes, PURPLE) : undefined} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              {newAnimes.slice(0, 6).map((item, i) => (
                <AnimeCard key={`an_${item.id}_${i}`} item={item} onPress={() => goTo(item)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── RODAPÉ ───────────────────────────────────────────────────── */}
        <View style={root.footer}>
          <LinearGradient colors={[`${RED}33`, "transparent"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={root.footerLine} />
          <Text style={root.footerText}>NETPLAY · Atualizado diariamente</Text>
          <LinearGradient colors={["transparent", `${RED}33`]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={root.footerLine} />
        </View>
      </ScrollView>

      {/* ═══ VER MAIS MODAL ══════════════════════════════════════════════════ */}
      <VerMaisModal
        visible={modal.visible}
        title={modal.title}
        items={modal.items}
        accentColor={modal.accent}
        onClose={closeModal}
        onItemPress={goTo}
      />

      {/* ═══ SINGLE EP SHEET ═════════════════════════════════════════════════ */}
      <SingleEpSheet
        visible={singleSheet.visible}
        group={singleSheet.group}
        onClose={() => setSingleSheet({ visible: false, group: null })}
        onPlay={(g) => handlePlayEpisode(g, g.latestEp)}
        onSynopsis={handleEpSynopsis}
      />

      {/* ═══ EPISODES VER MAIS MODAL ═════════════════════════════════════════ */}
      <EpisodesModal
        visible={showEpsModal}
        groups={epGroups}
        onClose={() => setShowEpsModal(false)}
        onPlayEp={handlePlayEpisode}
        onViewSeries={(g) => {
          setShowEpsModal(false);
          router.push({ pathname: "/detail", params: epDetailParams(g) });
        }}
      />
    </View>
  );
}

const root = StyleSheet.create({
  bg: { flex: 1 },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 100 },
  headerInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  sparkleBox: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  logoA: { fontSize: 20, fontWeight: "900", color: RED, letterSpacing: 1 },
  logoB: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  countBadge: { backgroundColor: `${RED}25`, borderWidth: 1, borderColor: `${RED}50`, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  countText: { fontSize: 10, fontWeight: "900", color: RED },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  section: { marginBottom: 28 },
  emptyText: { color: "rgba(255,255,255,0.25)", fontSize: 13, paddingHorizontal: 20, fontStyle: "italic" },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, marginTop: 12 },
  footerLine: { flex: 1, height: 1 },
  footerText: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.2)", letterSpacing: 0.5 },
});
