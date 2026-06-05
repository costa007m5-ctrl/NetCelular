import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/useColors";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { api, getApiBase } from "@/lib/api";
import { useCatalog } from "@/lib/catalog-context";
import type { TmdbItem } from "@/lib/api";

const { width: SW, height: SH } = Dimensions.get("window");
const RED = "#e50914";
const BATCH = 16;

// ─── helpers ──────────────────────────────────────────────────────────────────
function itemTitle(it: TmdbItem) { return it.title ?? it.name ?? "Sem título"; }
function itemYear(it: TmdbItem)  { return (it.release_date ?? it.first_air_date ?? "").slice(0, 4); }
function itemIsMovie(it: TmdbItem) {
  return !!(it.title && !it.name) || it.media_type === "movie";
}
function tmdbImg(path: string | null | undefined, size = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
function itemRating(it: TmdbItem) {
  return it.vote_average ? Math.round(it.vote_average * 10) / 10 : null;
}
function relativeDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7)  return `${days} dias atrás`;
  if (days < 30) return `${Math.floor(days / 7)} sem. atrás`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
function daysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

async function fetchTmdbItem(id: number, preferType?: "movie" | "tv"): Promise<TmdbItem | null> {
  if (preferType === "movie") return api.tmdb.movie(id).catch(() => null);
  if (preferType === "tv")    return api.tmdb.tv(id).catch(() => null);
  const tv = await api.tmdb.tv(id).catch(() => null);
  return tv ?? api.tmdb.movie(id).catch(() => null);
}

interface R2RegItem {
  id: string; r2Key: string; tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null; addedAt: string;
}

type Filter = "Todos" | "Filmes" | "Séries" | "Animes" | "Doramas" | "Em Breve";
const FILTERS: { id: Filter; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { id: "Todos",    icon: "grid",    color: RED },
  { id: "Filmes",   icon: "film",    color: "#3b82f6" },
  { id: "Séries",   icon: "tv",      color: "#8b5cf6" },
  { id: "Animes",   icon: "zap",     color: "#f97316" },
  { id: "Doramas",  icon: "heart",   color: "#ec4899" },
  { id: "Em Breve", icon: "clock",   color: "#f59e0b" },
];

// ─── Shimmer animation hook ────────────────────────────────────────────────────
function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
}

// ─── Skeleton components ──────────────────────────────────────────────────────
function SkeletonPoster() {
  const opacity = useShimmer();
  return (
    <Animated.View
      style={[sk.poster, { opacity }]}
    />
  );
}
function SkeletonWide() {
  const opacity = useShimmer();
  return <Animated.View style={[sk.wide, { opacity }]} />;
}
function SkeletonFeatured() {
  const opacity = useShimmer();
  return <Animated.View style={[sk.featured, { opacity }]} />;
}
const sk = StyleSheet.create({
  poster: { width: 120, height: 178, borderRadius: 12, backgroundColor: "#1e1e28", marginRight: 10 },
  wide:   { width: 230, height: 130, borderRadius: 12, backgroundColor: "#1e1e28", marginRight: 10 },
  featured: { marginHorizontal: 20, height: 190, borderRadius: 18, backgroundColor: "#1e1e28", marginBottom: 20 },
});

// ─── 1. CINEMATIC HERO BANNER ─────────────────────────────────────────────────
function CinemaHero({
  items, topPad, onNavigate, onAddToList,
}: { items: TmdbItem[]; topPad: number; onNavigate: (it: TmdbItem) => void; onAddToList: (it: TmdbItem) => void }) {
  const [idx, setIdx] = useState(0);
  const slideRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<any>(null);

  const dotsProgress = useRef(items.slice(0, 6).map(() => new Animated.Value(0))).current;

  const animateIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 3, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 6500, useNativeDriver: true }),
    ]).start();
  };

  const advance = useCallback((nextIdx: number) => {
    const next = ((nextIdx % Math.min(items.length, 6)) + 6) % 6;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      scaleAnim.setValue(1.06);
      slideAnim.setValue(22);
      setIdx(next);
      dotsProgress.forEach((p, i) => {
        p.setValue(i < next ? 0 : 0);
      });
      animateIn();
    });
  }, [items.length]);

  useEffect(() => {
    animateIn();
    dotsProgress[0]?.setValue(0);
    if (items.length < 2) return;
    timerRef.current = setInterval(() => setIdx((i) => {
      const next = (i + 1) % Math.min(items.length, 6);
      advance(next);
      return i; // advance handles the state
    }), 6500);
    return () => clearInterval(timerRef.current);
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  const img = tmdbImg(item.backdrop_path, "w1280") ?? tmdbImg(item.poster_path, "w500");
  const rating = itemRating(item);
  const isMovie = itemIsMovie(item);
  const year = itemYear(item);
  const genres = (item.genres ?? []).slice(0, 2);

  return (
    <View style={hero.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: scaleAnim }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} cachePolicy="memory-disk" />
        ) : (
          <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        )}
      </Animated.View>

      <LinearGradient
        colors={["rgba(5,5,8,0.55)", "transparent", "rgba(0,0,0,0.35)", "rgba(5,5,8,0.92)", "#050508"]}
        locations={[0, 0.18, 0.5, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(5,5,8,0.4)", "transparent"]}
        style={[StyleSheet.absoluteFill, { height: 180 }]}
      />

      {/* Side nav */}
      {items.length > 1 && (
        <>
          <Pressable style={[hero.navArrow, { left: 10 }]} onPress={() => advance(idx - 1)} hitSlop={16}>
            <View style={hero.arrowCircle}><Feather name="chevron-left" size={17} color="rgba(255,255,255,0.75)" /></View>
          </Pressable>
          <Pressable style={[hero.navArrow, { right: 10 }]} onPress={() => advance(idx + 1)} hitSlop={16}>
            <View style={hero.arrowCircle}><Feather name="chevron-right" size={17} color="rgba(255,255,255,0.75)" /></View>
          </Pressable>
        </>
      )}

      {/* Top badges */}
      <View style={[hero.topRow, { paddingTop: topPad + 14 }]}>
        <View style={hero.liveBadge}>
          <View style={hero.liveDot} />
          <Text style={hero.liveTxt}>NOVIDADE</Text>
        </View>
        <View style={[hero.typeBadge, { backgroundColor: isMovie ? "rgba(59,130,246,0.18)" : "rgba(139,92,246,0.18)", borderColor: isMovie ? "rgba(59,130,246,0.4)" : "rgba(139,92,246,0.4)" }]}>
          <Feather name={isMovie ? "film" : "tv"} size={9} color={isMovie ? "#3b82f6" : "#8b5cf6"} />
          <Text style={[hero.typeTxt, { color: isMovie ? "#3b82f6" : "#8b5cf6" }]}>{isMovie ? "FILME" : "SÉRIE"}</Text>
        </View>
      </View>

      {/* Content */}
      <Animated.View style={[hero.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {genres.length > 0 && (
          <View style={hero.genreRow}>
            {genres.map((g: any) => (
              <View key={g.id ?? g} style={hero.genreTag}>
                <Text style={hero.genreTagTxt}>{g.name ?? String(g)}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={hero.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <View style={hero.meta}>
          {rating != null && (
            <View style={hero.ratingWrap}>
              <Feather name="star" size={11} color="#f59e0b" />
              <Text style={hero.ratingTxt}>{rating}</Text>
            </View>
          )}
          {year ? <Text style={hero.metaTxt}>{year}</Text> : null}
          {item.runtime && <Text style={hero.metaTxt}>{Math.floor(item.runtime / 60)}h {item.runtime % 60}min</Text>}
        </View>
        {!!item.overview && (
          <Text style={hero.overview} numberOfLines={2}>{item.overview}</Text>
        )}
        <View style={hero.btns}>
          <Pressable style={hero.playBtn} onPress={() => onNavigate(item)}>
            <View style={hero.playIconWrap}><Feather name="play" size={15} color="#fff" /></View>
            <Text style={hero.playTxt}>Assistir</Text>
          </Pressable>
          <Pressable style={hero.listBtn} onPress={() => onAddToList(item)}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={hero.listTxt}>Minha Lista</Text>
          </Pressable>
          <Pressable style={hero.infoBtn} onPress={() => onNavigate(item)}>
            <Feather name="info" size={16} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
      </Animated.View>

      {/* Dot indicators */}
      <View style={hero.dots}>
        {items.slice(0, 6).map((_, i) => (
          <Pressable key={i} onPress={() => advance(i)} hitSlop={8}>
            <View style={[hero.dot, i === idx && hero.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const HERO_H = Math.min(SH * 0.62, 520);
const hero = StyleSheet.create({
  wrap: { width: SW, height: HERO_H, justifyContent: "flex-end", overflow: "hidden" },
  topRow: { position: "absolute", top: 0, left: 20, right: 20, flexDirection: "row", alignItems: "center", gap: 8, zIndex: 5 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: RED, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1.5 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  typeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  navArrow: { position: "absolute", top: "45%", zIndex: 10 },
  arrowCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.48)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 22, paddingBottom: 10, gap: 8 },
  genreRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
  genreTag: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  genreTagTxt: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.75)" },
  title: { fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: -0.8, lineHeight: 36, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingTxt: { fontSize: 13, fontWeight: "700", color: "#f59e0b" },
  metaTxt: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "500" },
  overview: { fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 19 },
  btns: { flexDirection: "row", gap: 9, alignItems: "center", marginTop: 2 },
  playBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: RED, paddingVertical: 14, borderRadius: 14, ...Platform.select({ ios: { shadowColor: RED, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.55, shadowRadius: 14 }, android: { elevation: 8 } }) },
  playIconWrap: { backgroundColor: "rgba(255,255,255,0.18)", width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingLeft: 2 },
  playTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },
  listBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
  listTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
  infoBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, paddingBottom: 16, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "rgba(255,255,255,0.22)" },
  dotActive: { width: 20, backgroundColor: RED },
});

// ─── 2. STATS ANNOUNCEMENT BANNER ─────────────────────────────────────────────
function StatsBanner({ movieCount, tvCount, animeCount, doramaCount }: {
  movieCount: number; tvCount: number; animeCount: number; doramaCount: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const total = movieCount + tvCount + animeCount + doramaCount;

  return (
    <View style={sban.wrap}>
      <LinearGradient colors={["#0f0f18", "#0a0a12"]} style={sban.card}>
        <LinearGradient colors={[`${RED}12`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={sban.leftSection}>
          <View style={sban.iconCircle}>
            <Feather name="trending-up" size={18} color={RED} />
          </View>
          <View>
            <Text style={sban.headline}>Esta Semana</Text>
            <Text style={sban.sub}>{total > 0 ? `+${total} títulos adicionados` : "Carregando novidades..."}</Text>
          </View>
        </View>
        <View style={sban.statsRow}>
          {movieCount > 0 && (
            <View style={sban.stat}>
              <Text style={[sban.statNum, { color: "#3b82f6" }]}>{movieCount}</Text>
              <Text style={sban.statLabel}>Filmes</Text>
            </View>
          )}
          {tvCount > 0 && (
            <View style={sban.stat}>
              <Text style={[sban.statNum, { color: "#8b5cf6" }]}>{tvCount}</Text>
              <Text style={sban.statLabel}>Séries</Text>
            </View>
          )}
          {animeCount > 0 && (
            <View style={sban.stat}>
              <Text style={[sban.statNum, { color: "#f97316" }]}>{animeCount}</Text>
              <Text style={sban.statLabel}>Animes</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}
const sban = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 22 },
  card: { borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  leftSection: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 12, backgroundColor: `${RED}18`, borderWidth: 1, borderColor: `${RED}30`, alignItems: "center", justifyContent: "center" },
  headline: { fontSize: 14, fontWeight: "800", color: "#fff" },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, fontWeight: "500" },
  statsRow: { flexDirection: "row", gap: 16 },
  stat: { alignItems: "center" },
  statNum: { fontSize: 18, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: "600", marginTop: 1 },
});

// ─── 3. SECTION HEADER (enhanced) ────────────────────────────────────────────
function SectionHeader({ title, icon, accent, subtitle, badge, onSeeAll }: {
  title: string; icon: any; accent?: string; subtitle?: string; badge?: string; onSeeAll?: () => void;
}) {
  const c = accent ?? RED;
  return (
    <View style={sec.row}>
      <View style={[sec.iconBox, { backgroundColor: `${c}18`, borderColor: `${c}28`, borderWidth: 1 }]}>
        <Feather name={icon} size={13} color={c} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[sec.accentBar, { backgroundColor: c }]} />
          <Text style={sec.title}>{title}</Text>
          {badge && (
            <View style={[sec.badge, { backgroundColor: `${c}20`, borderColor: `${c}35` }]}>
              <Text style={[sec.badgeTxt, { color: c }]}>{badge}</Text>
            </View>
          )}
        </View>
        {subtitle && <Text style={sec.sub}>{subtitle}</Text>}
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} style={sec.seeAll} hitSlop={10}>
          <Text style={sec.seeAllTxt}>Ver todos</Text>
          <Feather name="chevron-right" size={13} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sec = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginBottom: 14 },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  title: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2, marginLeft: 11, fontWeight: "500" },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  seeAllTxt: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
});

// ─── 4. POSTER CARD (enhanced) ────────────────────────────────────────────────
function PosterCard({ item, badge, badgeColor, onPress, showRating = true }: {
  item: TmdbItem; badge?: string; badgeColor?: string; onPress: () => void; showRating?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.poster_path, "w342") : null;
  const rating = itemRating(item);
  const year = itemYear(item);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 26, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 5 }).start()}
    >
      <Animated.View style={[card.poster, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" onError={() => setImgErr(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, card.placeholder]}>
            <Feather name="film" size={22} color="rgba(255,255,255,0.1)" />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        {badge && (
          <View style={[card.badge, { backgroundColor: badgeColor ?? RED }]}>
            <Text style={card.badgeTxt}>{badge}</Text>
          </View>
        )}
        {showRating && rating != null && (
          <View style={card.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={card.ratingTxt}>{rating}</Text>
          </View>
        )}
        <View style={card.info}>
          <Text style={card.titleTxt} numberOfLines={2}>{itemTitle(item)}</Text>
          {year ? <Text style={card.yearTxt}>{year}</Text> : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 5. WIDE BACKDROP CARD ────────────────────────────────────────────────────
function BackdropCard({ item, badge, badgeColor, onPress, showEpisode }: {
  item: TmdbItem & { last_episode_to_air?: any }; badge?: string; badgeColor?: string; onPress: () => void; showEpisode?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const ep = item.last_episode_to_air;
  const img = !imgErr
    ? (ep?.still_path ? `https://image.tmdb.org/t/p/w780${ep.still_path}` : null)
      ?? tmdbImg(item.backdrop_path, "w780")
      ?? tmdbImg(item.poster_path, "w500")
    : null;
  const rating = itemRating(item);
  const airDate = ep?.air_date ? relativeDate(ep.air_date) : null;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
    >
      <Animated.View style={[card.wide, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" onError={() => setImgErr(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, card.placeholder]} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.28, 1]} style={StyleSheet.absoluteFill} />

        {badge && (
          <View style={[card.badge, { backgroundColor: badgeColor ?? RED }]}>
            <Text style={card.badgeTxt}>{badge}</Text>
          </View>
        )}
        {airDate && (
          <View style={card.dateBadge}>
            <Feather name="clock" size={8} color="#22c55e" />
            <Text style={card.dateTxt}>{airDate}</Text>
          </View>
        )}

        <View style={card.wideInfo}>
          {showEpisode && ep && (
            <View style={card.epLabel}>
              <Text style={card.epTxt}>T{ep.season_number} · E{ep.episode_number}</Text>
              {ep.name && <Text style={card.epName} numberOfLines={1}>{ep.name}</Text>}
            </View>
          )}
          <Text style={card.wideTitleTxt} numberOfLines={2}>{itemTitle(item)}</Text>
          {rating != null && (
            <View style={card.wideRating}>
              <Feather name="star" size={9} color="#f59e0b" />
              <Text style={card.ratingTxt}>{rating}</Text>
              <Text style={card.yearTxt}> · {itemYear(item)}</Text>
            </View>
          )}
          <View style={card.widePlayBtn}>
            <Feather name="play" size={11} color="#fff" />
            <Text style={card.widePlayTxt}>Assistir</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── 6. MEGA FEATURED CARD ────────────────────────────────────────────────────
function MegaFeaturedCard({ item, accent, label, onPress }: {
  item: TmdbItem; accent: string; label: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.backdrop_path, "w1280") ?? tmdbImg(item.poster_path, "w500") : null;
  const rating = itemRating(item);
  const isMovie = itemIsMovie(item);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
      style={mega.wrap}
    >
      <Animated.View style={[mega.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1525", "#0d0d18"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={[`${accent}33`, "transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.96)"]}
          locations={[0, 0.25, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={mega.topRow}>
          <View style={[mega.labelBadge, { backgroundColor: `${accent}22`, borderColor: `${accent}45` }]}>
            <Text style={[mega.labelTxt, { color: accent }]}>{label}</Text>
          </View>
          <View style={[mega.typeBadge, { backgroundColor: isMovie ? "rgba(59,130,246,0.2)" : "rgba(139,92,246,0.2)" }]}>
            <Feather name={isMovie ? "film" : "tv"} size={9} color={isMovie ? "#3b82f6" : "#8b5cf6"} />
            <Text style={[mega.typeTxt, { color: isMovie ? "#3b82f6" : "#8b5cf6" }]}>{isMovie ? "FILME" : "SÉRIE"}</Text>
          </View>
        </View>

        <View style={mega.bottom}>
          <Text style={mega.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <View style={mega.meta}>
            {rating != null && (
              <View style={mega.ratingWrap}>
                <Feather name="star" size={10} color="#f59e0b" />
                <Text style={mega.ratingTxt}>{rating}</Text>
              </View>
            )}
            <Text style={mega.yearTxt}>{itemYear(item)}</Text>
          </View>
          {item.overview && <Text style={mega.desc} numberOfLines={2}>{item.overview}</Text>}
          <View style={[mega.playBtn, { backgroundColor: accent }]}>
            <Feather name="play" size={12} color="#fff" />
            <Text style={mega.playTxt}>Assistir agora</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const mega = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 26 },
  card: { height: 200, borderRadius: 20, overflow: "hidden", ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.55, shadowRadius: 20 }, android: { elevation: 14 } }) },
  topRow: { position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  labelBadge: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 4 },
  labelTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  typeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  bottom: { position: "absolute", bottom: 14, left: 16, right: 14, gap: 6 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingTxt: { fontSize: 12, fontWeight: "700", color: "#f59e0b" },
  yearTxt: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: "500" },
  desc: { fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 17 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, marginTop: 2 },
  playTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
});

// ─── 7. COMPACT GRID CARD ────────────────────────────────────────────────────
const GRID_COLS = 3;
const GRID_W = (SW - 40 - 12) / GRID_COLS;

function CompactGridCard({ item, badge, badgeColor, onPress }: {
  item: TmdbItem; badge?: string; badgeColor?: string; onPress: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.poster_path, "w342") : null;
  return (
    <Pressable onPress={onPress} style={grid.card}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} onError={() => setImgErr(true)} />
      ) : (
        <View style={[StyleSheet.absoluteFill, card.placeholder]} />
      )}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
      {badge && (
        <View style={[card.badge, { backgroundColor: badgeColor ?? RED, paddingHorizontal: 4, paddingVertical: 1 }]}>
          <Text style={[card.badgeTxt, { fontSize: 7 }]}>{badge}</Text>
        </View>
      )}
      <Text style={grid.title} numberOfLines={2}>{itemTitle(item)}</Text>
    </Pressable>
  );
}
const grid = StyleSheet.create({
  card: { width: GRID_W, height: GRID_W * 1.5, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a24" },
  title: { position: "absolute", bottom: 5, left: 5, right: 5, fontSize: 9, fontWeight: "700", color: "#fff", lineHeight: 12 },
});

// ─── 8. HORIZONTAL INFO CARD ─────────────────────────────────────────────────
function HorizontalCard({ item, badge, badgeColor, onPress, subtitle }: {
  item: TmdbItem; badge?: string; badgeColor?: string; onPress: () => void; subtitle?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.poster_path, "w185") : null;
  const rating = itemRating(item);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
    >
      <Animated.View style={[hc.card, { transform: [{ scale }] }]}>
        <View style={hc.posterWrap}>
          {img ? (
            <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setImgErr(true)} />
          ) : (
            <View style={[StyleSheet.absoluteFill, card.placeholder]} />
          )}
          {badge && (
            <View style={[card.badge, { backgroundColor: badgeColor ?? RED }]}>
              <Text style={card.badgeTxt}>{badge}</Text>
            </View>
          )}
        </View>
        <View style={hc.info}>
          <Text style={hc.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <View style={hc.metaRow}>
            {rating != null && (
              <View style={hc.ratingWrap}>
                <Feather name="star" size={9} color="#f59e0b" />
                <Text style={hc.ratingTxt}>{rating}</Text>
              </View>
            )}
            <Text style={hc.year}>{itemYear(item)}</Text>
            <View style={[hc.typePill, { backgroundColor: itemIsMovie(item) ? "rgba(59,130,246,0.15)" : "rgba(139,92,246,0.15)" }]}>
              <Text style={[hc.typeTxt, { color: itemIsMovie(item) ? "#3b82f6" : "#8b5cf6" }]}>{itemIsMovie(item) ? "Filme" : "Série"}</Text>
            </View>
          </View>
          {subtitle && <Text style={hc.sub} numberOfLines={1}>{subtitle}</Text>}
          {item.overview && <Text style={hc.desc} numberOfLines={2}>{item.overview}</Text>}
          <View style={hc.playBtn}>
            <Feather name="play" size={10} color={RED} />
            <Text style={hc.playTxt}>Assistir</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const hc = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  posterWrap: { width: 85, height: 120, backgroundColor: "#1a1a24", position: "relative" },
  info: { flex: 1, padding: 12, gap: 5, justifyContent: "center" },
  title: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingTxt: { fontSize: 10, fontWeight: "700", color: "#f59e0b" },
  year: { fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  typePill: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  typeTxt: { fontSize: 9, fontWeight: "700" },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: "500" },
  desc: { fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 15 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  playTxt: { fontSize: 11, fontWeight: "700", color: RED },
});

// ─── 9. ANIME SPECIAL CARD ───────────────────────────────────────────────────
function AnimeCard({ item, rank, onPress }: { item: TmdbItem; rank?: number; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.poster_path, "w342") : null;
  const rating = itemRating(item);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 26 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22 }).start()}
    >
      <Animated.View style={[an.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a24", "#0d0818"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />

        {/* Neon border */}
        <View style={[StyleSheet.absoluteFill, { borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(249,115,22,0.35)" }]} pointerEvents="none" />

        {rank && rank <= 3 ? (
          <LinearGradient colors={["#f97316", "#dc2626"]} style={an.rankBadge}>
            <Text style={an.rankTxt}>#{rank}</Text>
          </LinearGradient>
        ) : rank ? (
          <View style={[an.rankBadge, { backgroundColor: "rgba(249,115,22,0.25)" }]}>
            <Text style={[an.rankTxt, { color: "#f97316" }]}>#{rank}</Text>
          </View>
        ) : (
          <View style={[an.animeBadge]}>
            <Text style={an.animeBadgeTxt}>ANIME</Text>
          </View>
        )}

        {rating != null && (
          <View style={an.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={an.ratingTxt}>{rating}</Text>
          </View>
        )}
        <View style={an.info}>
          <Text style={an.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <Text style={an.year}>{itemYear(item)}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const an = StyleSheet.create({
  card: { width: 126, height: 186, borderRadius: 14, overflow: "hidden", backgroundColor: "#0d0d18", marginRight: 10, ...Platform.select({ ios: { shadowColor: "#f97316", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 6 } }) },
  rankBadge: { position: "absolute", top: 8, left: 8, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  rankTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.3 },
  animeBadge: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(249,115,22,0.22)", borderWidth: 1, borderColor: "rgba(249,115,22,0.45)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  animeBadgeTxt: { fontSize: 8, fontWeight: "900", color: "#f97316", letterSpacing: 0.8 },
  ratingBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.18)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  ratingTxt: { fontSize: 9, fontWeight: "700", color: "#f59e0b" },
  info: { position: "absolute", bottom: 8, left: 8, right: 8, gap: 2 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  year: { fontSize: 9, color: "rgba(255,255,255,0.4)" },
});

// ─── 10. DORAMA SPECIAL CARD ──────────────────────────────────────────────────
function DoramaCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.poster_path, "w342") : null;
  const rating = itemRating(item);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 26 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22 }).start()}
    >
      <Animated.View style={[dr.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0818", "#0d0812"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.42, 1]} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(236,72,153,0.3)" }]} pointerEvents="none" />

        <View style={dr.badge}>
          <Text style={dr.badgeTxt}>K·DRAMA</Text>
        </View>

        {rating != null && (
          <View style={dr.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={dr.ratingTxt}>{rating}</Text>
          </View>
        )}
        <View style={dr.info}>
          <Text style={dr.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <Text style={dr.year}>{itemYear(item)}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const dr = StyleSheet.create({
  card: { width: 126, height: 186, borderRadius: 14, overflow: "hidden", backgroundColor: "#0d0d18", marginRight: 10, ...Platform.select({ ios: { shadowColor: "#ec4899", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 6 } }) },
  badge: { position: "absolute", top: 8, left: 8, backgroundColor: "rgba(236,72,153,0.22)", borderWidth: 1, borderColor: "rgba(236,72,153,0.45)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { fontSize: 8, fontWeight: "900", color: "#ec4899", letterSpacing: 0.8 },
  ratingBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.18)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  ratingTxt: { fontSize: 9, fontWeight: "700", color: "#f59e0b" },
  info: { position: "absolute", bottom: 8, left: 8, right: 8, gap: 2 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  year: { fontSize: 9, color: "rgba(255,255,255,0.4)" },
});

// ─── Shared card styles ───────────────────────────────────────────────────────
const CARD_W = 120;
const CARD_H = 178;
const WIDE_W = 236;
const WIDE_H = 134;

const card = StyleSheet.create({
  poster: { width: CARD_W, height: CARD_H, borderRadius: 12, overflow: "hidden", marginRight: 10, backgroundColor: "#1a1a24", ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 }, android: { elevation: 7 } }) },
  wide: { width: WIDE_W, height: WIDE_H, borderRadius: 14, overflow: "hidden", marginRight: 10, backgroundColor: "#1a1a24", ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 }, android: { elevation: 7 } }) },
  placeholder: { backgroundColor: "#1a1a24", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 7, left: 7, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  badgeTxt: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.6 },
  ratingBadge: { position: "absolute", top: 7, right: 7, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.18)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3 },
  ratingTxt: { fontSize: 9, fontWeight: "700", color: "#f59e0b" },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 9, gap: 2 },
  titleTxt: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  yearTxt: { fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: "500" },
  wideInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, gap: 4 },
  epLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  epTxt: { fontSize: 10, fontWeight: "800", color: "#22c55e" },
  epName: { fontSize: 10, color: "rgba(255,255,255,0.5)", flex: 1 },
  wideTitleTxt: { fontSize: 14, fontWeight: "800", color: "#fff", lineHeight: 18 },
  wideRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  widePlayBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: RED, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, marginTop: 2 },
  widePlayTxt: { fontSize: 10, fontWeight: "800", color: "#fff" },
  dateBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(34,197,94,0.18)", borderWidth: 1, borderColor: "rgba(34,197,94,0.3)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  dateTxt: { fontSize: 9, fontWeight: "700", color: "#22c55e" },
});

// ─── 11. CATEGORY HEADER BANNER ──────────────────────────────────────────────
function CategoryHeaderBanner({ emoji, title, sub, accent, count }: {
  emoji: string; title: string; sub: string; accent: string; count?: number;
}) {
  return (
    <View style={chb.wrap}>
      <LinearGradient colors={[`${accent}14`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={chb.gradient} />
      <View style={[chb.leftBorder, { backgroundColor: accent }]} />
      <Text style={chb.emoji}>{emoji}</Text>
      <View style={chb.textWrap}>
        <Text style={chb.title}>{title}</Text>
        <Text style={chb.sub}>{sub}</Text>
      </View>
      {count != null && (
        <View style={[chb.countBadge, { backgroundColor: `${accent}20`, borderColor: `${accent}35` }]}>
          <Text style={[chb.countTxt, { color: accent }]}>{count}</Text>
          <Text style={chb.countLabel}>títulos</Text>
        </View>
      )}
    </View>
  );
}
const chb = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 16, padding: 14, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", gap: 12 },
  gradient: { ...StyleSheet.absoluteFillObject },
  leftBorder: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3.5, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  emoji: { fontSize: 26 },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, fontWeight: "500" },
  countBadge: { alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  countTxt: { fontSize: 17, fontWeight: "900", letterSpacing: -0.5 },
  countLabel: { fontSize: 8, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
});

// ─── 12. WEEKLY PICK BANNER ───────────────────────────────────────────────────
function WeeklyPickBanner({ item, onPress }: { item: TmdbItem | null; onPress: () => void }) {
  if (!item) return null;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.backdrop_path, "w780") ?? tmdbImg(item.poster_path, "w500") : null;
  const rating = itemRating(item);
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
      style={wp.wrap}
    >
      <Animated.View style={[wp.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.94)"]} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />

        <View style={wp.topLabel}>
          <Feather name="award" size={11} color="#f59e0b" />
          <Text style={wp.topLabelTxt}>ESCOLHA DA SEMANA</Text>
        </View>

        <View style={wp.bottom}>
          <Text style={wp.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <View style={wp.meta}>
            {rating != null && (
              <View style={wp.ratingWrap}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Feather key={s} name="star" size={10} color={s <= Math.round(rating / 2) ? "#f59e0b" : "rgba(255,255,255,0.2)"} />
                ))}
                <Text style={wp.ratingNum}>{rating}</Text>
              </View>
            )}
            <Text style={wp.year}>{itemYear(item)}</Text>
          </View>
          {item.overview && <Text style={wp.desc} numberOfLines={2}>{item.overview}</Text>}
          <View style={wp.playBtn}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={wp.playTxt}>Assistir agora</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const wp = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 28 },
  card: { height: 185, borderRadius: 20, overflow: "hidden", ...Platform.select({ ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 22 }, android: { elevation: 16 } }) },
  topLabel: { position: "absolute", top: 14, left: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.2)", borderWidth: 1, borderColor: "rgba(245,158,11,0.45)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  topLabelTxt: { fontSize: 9, fontWeight: "900", color: "#f59e0b", letterSpacing: 1.4 },
  bottom: { position: "absolute", bottom: 16, left: 16, right: 16, gap: 6 },
  title: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 10 },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingNum: { fontSize: 12, fontWeight: "700", color: "#f59e0b", marginLeft: 4 },
  year: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: "500" },
  desc: { fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 17 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", backgroundColor: RED, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, marginTop: 2 },
  playTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
});

// ─── 13. SCROLL TO TOP FAB ────────────────────────────────────────────────────
function ScrollTopFab({ scrollRef, visible }: { scrollRef: any; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [visible]);
  return (
    <Animated.View style={[fab.wrap, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      <TouchableOpacity activeOpacity={0.82} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
        <LinearGradient colors={[RED, "#b5060f"]} style={fab.btn}>
          <Feather name="chevron-up" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}
const fab = StyleSheet.create({
  wrap: { position: "absolute", bottom: 120, right: 20, zIndex: 50 },
  btn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", ...Platform.select({ ios: { shadowColor: RED, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.6, shadowRadius: 14 }, android: { elevation: 10 } }) },
});

// ─── 14. PROMO INLINE BANNER ─────────────────────────────────────────────────
function InlineBanner({ icon, title, sub, accent, onPress }: {
  icon: keyof typeof Feather.glyphMap; title: string; sub?: string; accent: string; onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={ib.wrap}>
      <LinearGradient colors={[accent, `${accent}88`]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={[ib.shimmer]} />
      <View style={[ib.iconWrap, { backgroundColor: "rgba(255,255,255,0.18)" }]}>
        <Feather name={icon} size={20} color="#fff" />
      </View>
      <View style={ib.text}>
        <Text style={ib.title}>{title}</Text>
        {sub && <Text style={ib.sub}>{sub}</Text>}
      </View>
      <View style={ib.arrow}>
        <Feather name="arrow-right" size={15} color="#fff" />
      </View>
    </Pressable>
  );
}
const ib = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginBottom: 26, borderRadius: 16, overflow: "hidden", flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  shimmer: { position: "absolute", top: -20, right: -20, width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(255,255,255,0.08)" },
  iconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff" },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 16 },
  arrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
});

// ─── 15. SECTION DIVIDER ─────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <View style={div.wrap}>
      <LinearGradient colors={["transparent", "rgba(255,255,255,0.1)", "transparent"]} style={div.line} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={div.labelWrap}>
        <Text style={div.label}>{label}</Text>
      </View>
      <LinearGradient colors={["transparent", "rgba(255,255,255,0.1)", "transparent"]} style={div.line} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
    </View>
  );
}
const div = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginVertical: 20, gap: 12 },
  line: { flex: 1, height: 1 },
  labelWrap: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  label: { fontSize: 9, fontWeight: "800", color: "rgba(255,255,255,0.3)", letterSpacing: 1.8 },
});

// ─── 16. COUNTDOWN BADGE ─────────────────────────────────────────────────────
function CountdownBadge({ days, size = "md" }: { days: number; size?: "sm" | "md" | "lg" }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (days <= 7) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [days]);

  const isUrgent = days <= 7;
  const accent = days === 0 ? "#22c55e" : isUrgent ? "#f59e0b" : "#64748b";
  const label = days === 0 ? "HOJE" : days === 1 ? "AMANHÃ" : `${days} DIAS`;

  if (size === "lg") {
    return (
      <Animated.View style={[cdb.lgWrap, { transform: [{ scale: pulse }] }]}>
        <LinearGradient
          colors={days === 0 ? ["#22c55e", "#16a34a"] : isUrgent ? ["#f59e0b", "#d97706"] : ["#334155", "#1e293b"]}
          style={cdb.lgGradient}
        >
          {days > 1 && <Text style={cdb.lgNum}>{days}</Text>}
          <Text style={cdb.lgLabel}>{days <= 1 ? label : "DIAS"}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[cdb.badge, { backgroundColor: `${accent}22`, borderColor: `${accent}55`, transform: [{ scale: pulse }] }]}>
      <Feather name="clock" size={size === "sm" ? 8 : 9} color={accent} />
      <Text style={[cdb.badgeTxt, { color: accent, fontSize: size === "sm" ? 8 : 9 }]}>{label}</Text>
    </Animated.View>
  );
}
const cdb = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { fontWeight: "900", letterSpacing: 0.6 },
  lgWrap: { alignItems: "center" },
  lgGradient: { width: 70, height: 70, borderRadius: 20, alignItems: "center", justifyContent: "center", ...Platform.select({ ios: { shadowColor: "#f59e0b", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16 }, android: { elevation: 12 } }) },
  lgNum: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -1.5, lineHeight: 30 },
  lgLabel: { fontSize: 9, fontWeight: "900", color: "rgba(255,255,255,0.85)", letterSpacing: 1.5 },
});

// ─── 17. UPCOMING CARD ────────────────────────────────────────────────────────
function UpcomingCard({ item, onPress, onRemind }: {
  item: TmdbItem; onPress: () => void; onRemind?: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const [reminded, setReminded] = useState(false);
  const img = !imgErr
    ? tmdbImg(item.backdrop_path, "w780") ?? tmdbImg(item.poster_path, "w500")
    : null;
  const releaseDate = item.release_date ?? item.first_air_date;
  const days = daysUntil(releaseDate);
  const formattedDate = releaseDate
    ? new Date(releaseDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : null;
  const isMovie = itemIsMovie(item);
  const rating = itemRating(item);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
    >
      <Animated.View style={[upc.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1020", "#0d0a14"]} style={StyleSheet.absoluteFill} />
        )}

        {/* Amber top gradient for "future" feel */}
        <LinearGradient
          colors={["rgba(245,158,11,0.14)", "transparent", "rgba(0,0,0,0.82)", "rgba(0,0,0,0.97)"]}
          locations={[0, 0.22, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* EM BREVE badge */}
        <View style={upc.topRow}>
          <View style={upc.emBreve}>
            <Feather name="clock" size={9} color="#f59e0b" />
            <Text style={upc.emBreveTxt}>EM BREVE</Text>
          </View>
          <View style={[upc.typePill, { backgroundColor: isMovie ? "rgba(59,130,246,0.18)" : "rgba(139,92,246,0.18)" }]}>
            <Feather name={isMovie ? "film" : "tv"} size={9} color={isMovie ? "#3b82f6" : "#8b5cf6"} />
            <Text style={[upc.typeTxt, { color: isMovie ? "#3b82f6" : "#8b5cf6" }]}>{isMovie ? "FILME" : "SÉRIE"}</Text>
          </View>
        </View>

        {/* Countdown circle (top-right) */}
        {days != null && (
          <View style={upc.countdownWrap}>
            <View style={[upc.countdownCircle, days <= 7 && { borderColor: "#f59e0b" }]}>
              <Text style={[upc.countdownNum, days <= 7 && { color: "#f59e0b" }]}>
                {days === 0 ? "🎬" : days}
              </Text>
              {days > 0 && <Text style={upc.countdownLabel}>dias</Text>}
            </View>
          </View>
        )}

        {/* Bottom info */}
        <View style={upc.bottom}>
          <Text style={upc.title} numberOfLines={2}>{itemTitle(item)}</Text>

          <View style={upc.meta}>
            {formattedDate && (
              <View style={upc.dateRow}>
                <Feather name="calendar" size={10} color="#f59e0b" />
                <Text style={upc.dateTxt}>{formattedDate}</Text>
              </View>
            )}
            {rating != null && (
              <View style={upc.ratingRow}>
                <Feather name="star" size={10} color="#f59e0b" />
                <Text style={upc.ratingTxt}>{rating}</Text>
              </View>
            )}
          </View>

          {item.overview ? (
            <Text style={upc.overview} numberOfLines={2}>{item.overview}</Text>
          ) : null}

          <View style={upc.actions}>
            <Pressable
              style={[upc.remindBtn, reminded && upc.remindBtnActive]}
              onPress={() => { setReminded((r) => !r); onRemind?.(); }}
            >
              <Feather name={reminded ? "bell" : "bell-off"} size={12} color={reminded ? "#f59e0b" : "rgba(255,255,255,0.5)"} />
              <Text style={[upc.remindTxt, reminded && { color: "#f59e0b" }]}>
                {reminded ? "Lembrete ativo" : "Lembrar"}
              </Text>
            </Pressable>

            <Pressable style={upc.detailBtn} onPress={onPress}>
              <Feather name="info" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={upc.detailTxt}>Detalhes</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const upc = StyleSheet.create({
  card: { width: SW - 40, marginHorizontal: 20, height: 210, borderRadius: 20, overflow: "hidden", backgroundColor: "#0d0d18", marginBottom: 14, ...Platform.select({ ios: { shadowColor: "#f59e0b", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 }, android: { elevation: 10 } }) },
  topRow: { position: "absolute", top: 12, left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  emBreve: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(245,158,11,0.18)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)", borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  emBreveTxt: { fontSize: 9, fontWeight: "900", color: "#f59e0b", letterSpacing: 1.4 },
  typePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  typeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  countdownWrap: { position: "absolute", top: 10, right: 14 },
  countdownCircle: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  countdownNum: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  countdownLabel: { fontSize: 7, color: "rgba(255,255,255,0.5)", fontWeight: "700", letterSpacing: 0.5, marginTop: -2 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, gap: 6 },
  title: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 12 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dateTxt: { fontSize: 11, color: "#f59e0b", fontWeight: "700" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingTxt: { fontSize: 11, fontWeight: "700", color: "#f59e0b" },
  overview: { fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 16 },
  actions: { flexDirection: "row", gap: 10, marginTop: 2 },
  remindBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  remindBtnActive: { backgroundColor: "rgba(245,158,11,0.18)", borderColor: "rgba(245,158,11,0.45)" },
  remindTxt: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.55)" },
  detailBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  detailTxt: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.5)" },
});

// ─── 18. COUNTDOWN HERO BANNER ────────────────────────────────────────────────
function CountdownHeroBanner({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr
    ? tmdbImg(item.backdrop_path, "w1280") ?? tmdbImg(item.poster_path, "w500")
    : null;
  const releaseDate = item.release_date ?? item.first_air_date;
  const days = daysUntil(releaseDate);
  const formattedDate = releaseDate
    ? new Date(releaseDate).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
    : null;
  const scale = useRef(new Animated.Value(1)).current;

  // Animated ring pulse
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale,   { toValue: 1.3, duration: 1400, useNativeDriver: true }),
          Animated.timing(ringScale,   { toValue: 1,   duration: 1400, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0,   duration: 1400, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.6, duration: 1400, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 24 }).start()}
      style={chero.wrap}
    >
      <Animated.View style={[chero.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0e06", "#0d0a04"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(245,158,11,0.16)", "transparent", "rgba(0,0,0,0.65)", "rgba(0,0,0,0.98)"]}
          locations={[0, 0.2, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* MAIS AGUARDADO badge */}
        <View style={chero.topBadge}>
          <Feather name="award" size={11} color="#f59e0b" />
          <Text style={chero.topBadgeTxt}>MAIS AGUARDADO</Text>
        </View>

        {/* Countdown circle center-right */}
        <View style={chero.countdownArea}>
          {/* Pulsing ring */}
          <Animated.View style={[chero.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
          <View style={chero.countdownInner}>
            {days != null && days > 0 ? (
              <>
                <Text style={chero.countdownNum}>{days}</Text>
                <Text style={chero.countdownLabel}>dias</Text>
              </>
            ) : (
              <Text style={chero.countdownToday}>HOJE</Text>
            )}
          </View>
        </View>

        {/* Bottom content */}
        <View style={chero.bottom}>
          <Text style={chero.title} numberOfLines={2}>{itemTitle(item)}</Text>
          {formattedDate && (
            <View style={chero.dateRow}>
              <Feather name="calendar" size={12} color="#f59e0b" />
              <Text style={chero.dateTxt}>{formattedDate}</Text>
            </View>
          )}
          {item.overview ? (
            <Text style={chero.overview} numberOfLines={2}>{item.overview}</Text>
          ) : null}
          <View style={chero.playBtn}>
            <Feather name="info" size={13} color="#fff" />
            <Text style={chero.playTxt}>Ver detalhes</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const chero = StyleSheet.create({
  wrap: { paddingHorizontal: 20, marginBottom: 28 },
  card: { height: 230, borderRadius: 22, overflow: "hidden", ...Platform.select({ ios: { shadowColor: "#f59e0b", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 24 }, android: { elevation: 18 } }) },
  topBadge: { position: "absolute", top: 14, left: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(245,158,11,0.2)", borderWidth: 1, borderColor: "rgba(245,158,11,0.5)", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  topBadgeTxt: { fontSize: 9, fontWeight: "900", color: "#f59e0b", letterSpacing: 1.6 },
  countdownArea: { position: "absolute", top: 42, right: 20, width: 76, height: 76, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 76, height: 76, borderRadius: 38, borderWidth: 2.5, borderColor: "#f59e0b" },
  countdownInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: "rgba(0,0,0,0.72)", borderWidth: 2, borderColor: "rgba(245,158,11,0.55)", alignItems: "center", justifyContent: "center" },
  countdownNum: { fontSize: 24, fontWeight: "900", color: "#f59e0b", letterSpacing: -1.5, lineHeight: 26 },
  countdownLabel: { fontSize: 8, color: "#f59e0b", fontWeight: "800", letterSpacing: 1 },
  countdownToday: { fontSize: 11, fontWeight: "900", color: "#22c55e", letterSpacing: 0.5 },
  bottom: { position: "absolute", bottom: 16, left: 16, right: 16, gap: 7 },
  title: { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.7, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dateTxt: { fontSize: 12, color: "#f59e0b", fontWeight: "700" },
  overview: { fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 17 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: "rgba(245,158,11,0.22)", borderWidth: 1, borderColor: "rgba(245,158,11,0.45)", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 11, marginTop: 2 },
  playTxt: { fontSize: 13, fontWeight: "800", color: "#f59e0b" },
});

// ─── 19. ON-AIR CARD (currently airing series) ───────────────────────────────
function OnAirCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.backdrop_path, "w780") ?? tmdbImg(item.poster_path, "w500") : null;
  const rating = itemRating(item);
  const airDate = item.first_air_date
    ? new Date(item.first_air_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : null;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
    >
      <Animated.View style={[oac.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#0a1218", "#06090e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.95)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />

        {/* AO VIVO badge with pulse dot */}
        <View style={oac.aovivoBadge}>
          <View style={oac.pulseDot} />
          <Text style={oac.aovivaTxt}>AO VIVO</Text>
        </View>

        {rating != null && (
          <View style={oac.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={oac.ratingTxt}>{rating}</Text>
          </View>
        )}

        <View style={oac.bottom}>
          <Text style={oac.title} numberOfLines={2}>{itemTitle(item)}</Text>
          {airDate && (
            <View style={oac.dateRow}>
              <Feather name="calendar" size={9} color="#22c55e" />
              <Text style={oac.dateTxt}>{airDate}</Text>
            </View>
          )}
          <View style={oac.playBtn}>
            <Feather name="play" size={10} color="#fff" />
            <Text style={oac.playTxt}>Assistir</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const oac = StyleSheet.create({
  card: { width: 190, height: 120, borderRadius: 14, overflow: "hidden", backgroundColor: "#0d0d18", marginRight: 10, borderWidth: 1, borderColor: "rgba(34,197,94,0.2)" },
  aovivoBadge: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(229,9,20,0.22)", borderWidth: 1, borderColor: "rgba(229,9,20,0.5)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  pulseDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: RED },
  aovivaTxt: { fontSize: 8, fontWeight: "900", color: RED, letterSpacing: 1 },
  ratingBadge: { position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.18)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  ratingTxt: { fontSize: 9, fontWeight: "700", color: "#f59e0b" },
  bottom: { position: "absolute", bottom: 8, left: 10, right: 10, gap: 4 },
  title: { fontSize: 12, fontWeight: "800", color: "#fff", lineHeight: 15 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dateTxt: { fontSize: 9, color: "#22c55e", fontWeight: "700" },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: RED, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 2 },
  playTxt: { fontSize: 9, fontWeight: "800", color: "#fff" },
});

// ─── 20. UPCOMING MINI CARD (compact horizontal strip) ───────────────────────
function UpcomingMiniCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const img = !imgErr ? tmdbImg(item.poster_path, "w185") : null;
  const days = daysUntil(item.release_date ?? item.first_air_date);

  return (
    <Pressable onPress={onPress} style={umc.card}>
      <View style={umc.posterWrap}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setImgErr(true)} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a24", alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={16} color="rgba(255,255,255,0.1)" />
          </View>
        )}
      </View>
      <View style={umc.info}>
        <Text style={umc.title} numberOfLines={2}>{itemTitle(item)}</Text>
        {days != null && <CountdownBadge days={days} size="sm" />}
        {item.overview ? (
          <Text style={umc.overview} numberOfLines={2}>{item.overview}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
const umc = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: "rgba(245,158,11,0.04)", borderWidth: 1, borderColor: "rgba(245,158,11,0.12)", borderRadius: 12, overflow: "hidden", marginBottom: 10 },
  posterWrap: { width: 72, height: 102, backgroundColor: "#1a1a24" },
  info: { flex: 1, padding: 10, gap: 6, justifyContent: "center" },
  title: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 17 },
  overview: { fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 14 },
});

// ══════════════════ MAIN SCREEN ══════════════════════════════════════════════
export default function NovidadesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const colors = useColors();
  const { byType, loading: catalogLoading } = useCatalog();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [filter, setFilter] = useState<Filter>("Todos");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollRef = useRef<any>(null);

  const [movies, setMovies] = useState<TmdbItem[]>([]);
  const [series, setSeries] = useState<(TmdbItem & { last_episode_to_air?: any })[]>([]);
  const [animes, setAnimes] = useState<TmdbItem[]>([]);
  const [doramas, setDoramas] = useState<TmdbItem[]>([]);
  const [r2Movies, setR2Movies] = useState<TmdbItem[]>([]);
  const [r2SeriesList, setR2SeriesList] = useState<TmdbItem[]>([]);
  const [r2EpSeries, setR2EpSeries] = useState<(TmdbItem & { last_episode_to_air: any })[]>([]);
  const [r2MovieSet, setR2MovieSet] = useState<Set<number>>(new Set());
  const [r2TvSet, setR2TvSet] = useState<Set<number>>(new Set());

  // Em Breve
  const [upcomingMovies, setUpcomingMovies] = useState<TmdbItem[]>([]);
  const [onTheAirSeries, setOnTheAirSeries] = useState<TmdbItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const movieIds  = byType.movie  ?? [];
      const tvIds     = byType.tv     ?? [];
      const animeIds  = byType.anime  ?? [];
      const doramaIds = byType.dorama ?? [];

      if (movieIds.length > 0) {
        const mSlice = movieIds.slice(0, BATCH);
        const tSlice = tvIds.slice(0, BATCH);
        const aSlice = animeIds.slice(0, BATCH);
        const dSlice = doramaIds.slice(0, BATCH);
        const tvIdSet    = new Set(tvIds.slice(0, 200).map(String));
        const movieIdSet = new Set(movieIds.slice(0, 200).map(String));
        const inferType = (id: number, fallback: "tv" | "movie"): "movie" | "tv" => {
          if (tvIdSet.has(String(id))) return "tv";
          if (movieIdSet.has(String(id))) return "movie";
          return fallback;
        };
        const [mR, tR, aR, dR] = await Promise.all([
          Promise.all(mSlice.map((id) => api.tmdb.movie(id).catch(() => null))),
          Promise.all(tSlice.map((id) => api.tmdb.tv(id).catch(() => null))),
          Promise.all(aSlice.map((id) => (inferType(id, "tv") === "tv" ? api.tmdb.tv(id) : api.tmdb.movie(id)).catch(() => null))),
          Promise.all(dSlice.map((id) => (inferType(id, "tv") === "tv" ? api.tmdb.tv(id) : api.tmdb.movie(id)).catch(() => null))),
        ]);
        setMovies(mR.filter(Boolean) as TmdbItem[]);
        setSeries(tR.filter(Boolean) as any[]);
        setAnimes(aR.filter(Boolean) as TmdbItem[]);
        setDoramas(dR.filter(Boolean) as TmdbItem[]);
      } else {
        const [pm, ptv, tr] = await Promise.all([
          api.tmdb.popularMovies().catch(() => [] as TmdbItem[]),
          api.tmdb.popularTv().catch(() => [] as TmdbItem[]),
          api.tmdb.trending().catch(() => ({ all: [] as TmdbItem[], movies: [] as TmdbItem[], tv: [] as TmdbItem[] })),
        ]);
        setMovies((pm.length > 0 ? pm : tr.movies).slice(0, BATCH));
        setSeries((ptv.length > 0 ? ptv : tr.tv).slice(0, BATCH) as any[]);
        setAnimes(tr.all.filter((i) => i.original_language === "ja").slice(0, BATCH));
        setDoramas(tr.all.filter((i) => i.original_language === "ko").slice(0, BATCH));
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [byType]);

  useEffect(() => { if (!catalogLoading) load(); }, [load, catalogLoading]);

  // Load Em Breve data non-blocking
  useEffect(() => {
    const loadEmBreve = async () => {
      try {
        const [upcoming, onAir] = await Promise.all([
          api.tmdb.upcoming().catch(() => [] as TmdbItem[]),
          api.tmdb.onTheAir().catch(() => [] as TmdbItem[]),
        ]);
        // Sort by release date ascending (soonest first)
        const sorted = [...upcoming].sort((a, b) => {
          const da = new Date(a.release_date ?? "9999").getTime();
          const db2 = new Date(b.release_date ?? "9999").getTime();
          return da - db2;
        });
        setUpcomingMovies(sorted.slice(0, 12));
        setOnTheAirSeries(onAir.slice(0, 12));
      } catch {}
    };
    loadEmBreve();
  }, []);

  useEffect(() => {
    const loadR2 = async () => {
      try {
        const apiBase = getApiBase();
        if (!apiBase) return;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(`${apiBase}/r2/registry`, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return;
        const data = await res.json();
        const items: R2RegItem[] = (data.items ?? []).reverse();
        if (!items.length) return;

        const movieItems = items.filter((i) => i.tmdbType === "movie");
        const uniqueMovieIds = [...new Set(movieItems.map((i) => i.tmdbId))];
        const movieRes = (await Promise.all(uniqueMovieIds.map((id) => api.tmdb.movie(id).catch(() => null)))).filter(Boolean) as TmdbItem[];
        setR2Movies(movieRes);
        setR2MovieSet(new Set(uniqueMovieIds));

        const allTvItems = items.filter((i) => i.tmdbType === "tv");
        const uniqueTvIds = [...new Set(allTvItems.map((i) => i.tmdbId))];
        const tvRes = (await Promise.all(uniqueTvIds.map((id) => api.tmdb.tv(id).catch(() => null)))).filter(Boolean) as TmdbItem[];
        setR2SeriesList(tvRes);
        setR2TvSet(new Set(uniqueTvIds));

        const tvEpItems = items.filter((i) => i.tmdbType === "tv" && i.episode != null);
        const uniqueEpIds = [...new Set(tvEpItems.map((i) => i.tmdbId))];
        const epSeries = tvRes.filter((s) => uniqueEpIds.includes(s.id)).map((tmdbItem) => {
          const epReg = tvEpItems.find((i) => i.tmdbId === tmdbItem.id);
          return {
            ...tmdbItem,
            last_episode_to_air: {
              season_number: epReg!.season, episode_number: epReg!.episode,
              name: epReg!.label, air_date: epReg!.addedAt, still_path: null,
            },
          };
        });
        setR2EpSeries(epSeries);
      } catch {}
    };
    loadR2();
  }, []);

  const navigate = useCallback((it: TmdbItem) => {
    router.push({ pathname: "/detail", params: { type: itemIsMovie(it) ? "movie" : "tv", id: String(it.id), title: itemTitle(it) } });
  }, [router]);

  const addToList = useCallback(async (it: TmdbItem) => {
    if (!user?.id || !isSupabaseConfigured) {
      Alert.alert("Login necessário", "Faça login para adicionar à sua lista."); return;
    }
    try {
      await db.watchlist.add({ user_id: user.id, tmdb_id: it.id, type: itemIsMovie(it) ? "movie" : "tv", title: itemTitle(it), poster_path: it.poster_path ?? "" });
      Alert.alert("Adicionado!", `"${itemTitle(it)}" foi adicionado à sua lista.`);
    } catch { Alert.alert("Erro", "Não foi possível adicionar."); }
  }, [user]);

  const allMovies = useMemo(() => [...r2Movies, ...movies.filter((m) => !r2MovieSet.has(m.id))], [r2Movies, movies, r2MovieSet]);
  const allSeries = useMemo(() => [...r2SeriesList, ...series.filter((s: any) => !r2TvSet.has(s.id))], [r2SeriesList, series, r2TvSet]);
  const r2EpSeriesIds = useMemo(() => new Set(r2EpSeries.map((s) => s.id)), [r2EpSeries]);
  const allEpisodes = useMemo(() => [
    ...r2EpSeries,
    ...r2SeriesList.filter((s: any) => s?.last_episode_to_air?.episode_number && !r2EpSeriesIds.has(s.id)),
    ...series.filter((s: any) => s?.last_episode_to_air?.episode_number && !r2TvSet.has(s.id)),
  ], [r2EpSeries, r2SeriesList, series, r2TvSet, r2EpSeriesIds]);

  const heroItems = useMemo(() => [...allMovies.slice(0, 4), ...allSeries.slice(0, 2)], [allMovies, allSeries]);
  const weeklyPick = useMemo(() => {
    const pool = [...allMovies, ...allSeries].filter((i) => (i.vote_average ?? 0) > 7.5);
    pool.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
    return pool[0] ?? null;
  }, [allMovies, allSeries]);
  const featuredMovie = useMemo(() => allMovies[0] ?? null, [allMovies]);
  const featuredSeries = useMemo(() => allSeries[0] ?? null, [allSeries]);

  const showMovies   = filter === "Todos" || filter === "Filmes";
  const showSeries   = filter === "Todos" || filter === "Séries";
  const showEpisodes = filter === "Todos" || filter === "Séries";
  const showAnimes   = filter === "Todos" || filter === "Animes";
  const showDoramas  = filter === "Todos" || filter === "Doramas";
  const showEmBreve  = filter === "Todos" || filter === "Em Breve";

  // Most anticipated = soonest release with highest vote_count
  const mostAnticipated = useMemo(() => {
    const pool = upcomingMovies.filter((i) => daysUntil(i.release_date) != null);
    if (!pool.length) return null;
    return pool.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0] ?? null;
  }, [upcomingMovies]);

  if (loading && !refreshing) {
    return (
      <View style={[st.container, { backgroundColor: "#050508" }]}>
        <StatusBar style="light" />
        <View style={{ height: HERO_H, backgroundColor: "#0a0a14" }}>
          <LinearGradient colors={["rgba(229,9,20,0.08)", "transparent"]} style={StyleSheet.absoluteFill} />
          <View style={[st.loadLogo, { paddingTop: topPad + 16 }]}>
            <Text style={st.loadLogoTxt}><Text style={{ color: RED }}>NET</Text>PLAY</Text>
            <Text style={st.loadSubTxt}>Carregando novidades...</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 16 }}>
          <SkeletonFeatured />
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[0, 1, 2].map((i) => <SkeletonPoster key={i} />)}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {[0, 1].map((i) => <SkeletonWide key={i} />)}
          </View>
        </View>
      </View>
    );
  }

  const isEmpty = !loading && allMovies.length === 0 && allSeries.length === 0 && animes.length === 0 && doramas.length === 0;

  return (
    <View style={[st.container, { backgroundColor: "#050508" }]}>
      <StatusBar style="light" />

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 115 }}
        scrollEventThrottle={16}
        onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 500)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={RED} colors={[RED]} />
        }
      >
        {/* ── 1. CINEMATIC HERO ── */}
        {heroItems.length > 0 && (
          <CinemaHero items={heroItems} topPad={topPad} onNavigate={navigate} onAddToList={addToList} />
        )}

        {/* ── FILTER PILLS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow} style={st.filterWrap}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[st.pill, filter === f.id && { backgroundColor: `${f.color}22`, borderColor: `${f.color}55` }]}
            >
              <Feather name={f.icon} size={12} color={filter === f.id ? f.color : "rgba(255,255,255,0.35)"} />
              <Text style={[st.pillTxt, filter === f.id && { color: "#fff", fontWeight: "800" }]}>{f.id}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── 2. STATS BANNER ── */}
        <StatsBanner
          movieCount={allMovies.length}
          tvCount={allSeries.length}
          animeCount={animes.length}
          doramaCount={doramas.length}
        />

        {/* ── 3. WEEKLY PICK BANNER ── */}
        {filter === "Todos" && weeklyPick && (
          <WeeklyPickBanner item={weeklyPick} onPress={() => navigate(weeklyPick)} />
        )}

        {isEmpty && (
          <View style={st.empty}>
            <View style={st.emptyIcon}><Feather name="wifi-off" size={32} color="rgba(255,255,255,0.15)" /></View>
            <Text style={st.emptyTitle}>Sem novidades disponíveis</Text>
            <Text style={st.emptyTxt}>Verifique sua conexão e tente novamente</Text>
            <TouchableOpacity onPress={() => load()} style={[st.retryBtn, { backgroundColor: RED }]}>
              <Feather name="refresh-cw" size={14} color="#fff" />
              <Text style={st.retryTxt}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── FILMES ── */}
        {showMovies && allMovies.length > 0 && (
          <>
            <CategoryHeaderBanner
              emoji="🎬"
              title="Novos Filmes"
              sub="Adicionados recentemente ao catálogo"
              accent="#3b82f6"
              count={allMovies.length}
            />

            {/* Featured movie as MegaCard */}
            {featuredMovie && (
              <MegaFeaturedCard
                item={featuredMovie}
                accent="#3b82f6"
                label="✦ EM DESTAQUE"
                onPress={() => navigate(featuredMovie)}
              />
            )}

            {/* Poster row */}
            <View style={st.section}>
              <SectionHeader
                title="Novos Filmes"
                icon="film"
                accent="#3b82f6"
                subtitle={`${allMovies.length} filmes disponíveis`}
                badge="NOVO"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "movie", title: "Novos Filmes" } } as any)}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hscroll} decelerationRate="fast" snapToInterval={CARD_W + 10} snapToAlignment="start">
                {allMovies.map((it) => (
                  <PosterCard key={`m-${it.id}`} item={it} badge="NOVO" badgeColor="#3b82f6" onPress={() => navigate(it)} />
                ))}
              </ScrollView>
            </View>

            {/* Horizontal info cards for top 3 */}
            <View style={[st.section, { paddingHorizontal: 20 }]}>
              <SectionHeader title="Destaques" icon="trending-up" accent="#3b82f6" />
              {allMovies.slice(0, 3).map((it) => (
                <HorizontalCard
                  key={`hc-m-${it.id}`}
                  item={it}
                  badge="NOVO"
                  badgeColor="#3b82f6"
                  onPress={() => navigate(it)}
                  subtitle={`Adicionado ${relativeDate(it.release_date) ?? "recentemente"}`}
                />
              ))}
            </View>
          </>
        )}

        {/* ── SÉRIES ── */}
        {showSeries && allSeries.length > 0 && (
          <>
            <SectionDivider label="SÉRIES" />

            <CategoryHeaderBanner
              emoji="📺"
              title="Novas Séries"
              sub="Séries e episódios recentes"
              accent="#8b5cf6"
              count={allSeries.length}
            />

            {featuredSeries && (
              <MegaFeaturedCard
                item={featuredSeries}
                accent="#8b5cf6"
                label="✦ SÉRIE EM DESTAQUE"
                onPress={() => navigate(featuredSeries)}
              />
            )}

            <View style={st.section}>
              <SectionHeader
                title="Novas Séries"
                icon="tv"
                accent="#8b5cf6"
                subtitle={`${allSeries.length} séries no catálogo`}
                badge="NOVO"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "tv", title: "Novas Séries" } } as any)}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hscroll} decelerationRate="fast" snapToInterval={CARD_W + 10} snapToAlignment="start">
                {allSeries.map((it) => (
                  <PosterCard key={`t-${it.id}`} item={it} badge="SÉRIE" badgeColor="#8b5cf6" onPress={() => navigate(it)} />
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {/* ── NOVOS EPISÓDIOS ── */}
        {showEpisodes && allEpisodes.length > 0 && (
          <View style={st.section}>
            <SectionHeader
              title="Novos Episódios"
              icon="radio"
              accent="#22c55e"
              subtitle="Episódios adicionados recentemente"
              badge="AO VIVO"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hscroll} decelerationRate="fast" snapToInterval={WIDE_W + 10} snapToAlignment="start">
              {allEpisodes.map((it) => (
                <BackdropCard key={`ep-${it.id}`} item={it as any} showEpisode onPress={() => navigate(it)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── GRID (mix recent) ── */}
        {filter === "Todos" && (allMovies.length > 3 || allSeries.length > 3) && (
          <View style={st.section}>
            <SectionDivider label="ADICIONADOS RECENTEMENTE" />
            <SectionHeader title="Todos os Novos" icon="grid" accent={RED} subtitle="Vista em grade compacta" />
            <View style={[st.gridWrap]}>
              {[...allMovies.slice(0, 6), ...allSeries.slice(0, 6)].slice(0, 9).map((it, i) => (
                <CompactGridCard
                  key={`grid-${it.id}-${i}`}
                  item={it}
                  badge={itemIsMovie(it) ? "FILME" : "SÉRIE"}
                  badgeColor={itemIsMovie(it) ? "#3b82f6" : "#8b5cf6"}
                  onPress={() => navigate(it)}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── INLINE PROMO BANNER ── */}
        {filter === "Todos" && (
          <InlineBanner
            icon="bookmark"
            title="Salve para assistir depois"
            sub="Adicione títulos à sua lista pessoal"
            accent="#0891b2"
            onPress={() => router.push("/(tabs)/list")}
          />
        )}

        {/* ── ANIMES ── */}
        {showAnimes && animes.length > 0 && (
          <>
            <SectionDivider label="ANIME" />

            <CategoryHeaderBanner
              emoji="🎌"
              title="Animes da Semana"
              sub="Novos animes adicionados ao catálogo"
              accent="#f97316"
              count={animes.length}
            />

            <View style={st.section}>
              <SectionHeader
                title="Animes em Destaque"
                icon="zap"
                accent="#f97316"
                subtitle="Os animes mais populares"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "anime", title: "Animes" } } as any)}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hscroll} decelerationRate="fast">
                {animes.map((it, i) => (
                  <AnimeCard key={`a-${it.id}`} item={it} rank={i + 1} onPress={() => navigate(it)} />
                ))}
              </ScrollView>
            </View>

            {/* Anime featured */}
            {animes[0] && (
              <MegaFeaturedCard
                item={animes[0]}
                accent="#f97316"
                label="🎌 ANIME DO MÊS"
                onPress={() => navigate(animes[0])}
              />
            )}
          </>
        )}

        {/* ── DORAMAS ── */}
        {showDoramas && doramas.length > 0 && (
          <>
            <SectionDivider label="K-DRAMA" />

            <CategoryHeaderBanner
              emoji="🌸"
              title="K-Drama & Doramas"
              sub="As melhores séries coreanas"
              accent="#ec4899"
              count={doramas.length}
            />

            <View style={st.section}>
              <SectionHeader
                title="Doramas Populares"
                icon="heart"
                accent="#ec4899"
                subtitle="Drama coreano em alta"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "dorama", title: "Doramas" } } as any)}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.hscroll} decelerationRate="fast">
                {doramas.map((it) => (
                  <DoramaCard key={`d-${it.id}`} item={it} onPress={() => navigate(it)} />
                ))}
              </ScrollView>
            </View>

            {/* Dorama + Anime side-by-side wide cards */}
            {doramas.length > 1 && (
              <View style={[st.section, { paddingHorizontal: 20 }]}>
                <SectionHeader title="Novos Episódios Doramas" icon="calendar" accent="#ec4899" />
                {doramas.slice(1, 4).map((it) => (
                  <HorizontalCard
                    key={`hc-d-${it.id}`}
                    item={it}
                    badge="DORAMA"
                    badgeColor="#ec4899"
                    onPress={() => navigate(it)}
                    subtitle={`Coreano · ${itemYear(it)}`}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* ── EM BREVE ── */}
        {showEmBreve && (upcomingMovies.length > 0 || onTheAirSeries.length > 0) && (
          <>
            <SectionDivider label="EM BREVE" />

            <CategoryHeaderBanner
              emoji="⏳"
              title="Em Breve no NETPLAY"
              sub="Próximas estreias e séries em cartaz"
              accent="#f59e0b"
              count={upcomingMovies.length + onTheAirSeries.length}
            />

            {/* Most anticipated hero */}
            {mostAnticipated && (
              <CountdownHeroBanner
                item={mostAnticipated}
                onPress={() => navigate(mostAnticipated)}
              />
            )}

            {/* Upcoming movies — full-width cards with countdown */}
            {upcomingMovies.length > 0 && (
              <View style={st.section}>
                <SectionHeader
                  title="Próximas Estreias"
                  icon="film"
                  accent="#f59e0b"
                  subtitle="Filmes em breve nos cinemas"
                  badge="EM BREVE"
                />
                {upcomingMovies
                  .filter((it) => it.id !== mostAnticipated?.id)
                  .slice(0, 5)
                  .map((it) => (
                    <UpcomingCard
                      key={`upc-${it.id}`}
                      item={it}
                      onPress={() => navigate(it)}
                    />
                  ))}
              </View>
            )}

            {/* Compact mini-list for remaining upcoming */}
            {upcomingMovies.length > 6 && (
              <View style={[st.section, { paddingHorizontal: 20 }]}>
                <SectionHeader
                  title="Mais em Breve"
                  icon="list"
                  accent="#f59e0b"
                  subtitle="Outros lançamentos aguardados"
                />
                {upcomingMovies.slice(5, 10).map((it) => (
                  <UpcomingMiniCard
                    key={`umini-${it.id}`}
                    item={it}
                    onPress={() => navigate(it)}
                  />
                ))}
              </View>
            )}

            {/* On the air series */}
            {onTheAirSeries.length > 0 && (
              <View style={st.section}>
                <SectionHeader
                  title="Séries em Exibição"
                  icon="radio"
                  accent="#22c55e"
                  subtitle="Séries atualmente no ar"
                  badge="AO VIVO"
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={st.hscroll}
                  decelerationRate="fast"
                  snapToInterval={200}
                  snapToAlignment="start"
                >
                  {onTheAirSeries.map((it) => (
                    <OnAirCard key={`oac-${it.id}`} item={it} onPress={() => navigate(it)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Countdown grid — top 6 upcoming with large badge */}
            {upcomingMovies.length >= 3 && (
              <View style={[st.section, { marginBottom: 10 }]}>
                <SectionHeader title="Contagem Regressiva" icon="clock" accent="#f59e0b" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.hscroll, { alignItems: "center", gap: 14 }]} decelerationRate="fast">
                  {upcomingMovies.slice(0, 6).map((it) => {
                    const d = daysUntil(it.release_date);
                    return (
                      <Pressable key={`cdg-${it.id}`} onPress={() => navigate(it)} style={cdgrid.item}>
                        <CountdownBadge days={d ?? 99} size="lg" />
                        <Text style={cdgrid.title} numberOfLines={2}>{itemTitle(it)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </>
        )}

        {/* ── FINAL PROMO BANNER ── */}
        {filter === "Todos" && (
          <InlineBanner
            icon="search"
            title="Explore o catálogo completo"
            sub="Mais de 20.000 títulos disponíveis"
            accent="#7c3aed"
            onPress={() => router.push("/(tabs)/search")}
          />
        )}
      </Animated.ScrollView>

      <ScrollTopFab scrollRef={scrollRef} visible={showScrollTop} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  filterWrap: { marginTop: 18, marginBottom: 20 },
  filterRow: { paddingHorizontal: 20, gap: 8, alignItems: "center" },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 50,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pillTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.38)" },
  section: { marginBottom: 28 },
  hscroll: { paddingHorizontal: 20, gap: 0 },
  gridWrap: { paddingHorizontal: 20, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  loadLogo: { alignItems: "center", justifyContent: "center", flex: 1 },
  loadLogoTxt: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  loadSubTxt: { fontSize: 13, color: "rgba(255,255,255,0.3)", marginTop: 8 },
  empty: { marginTop: 40, alignItems: "center", gap: 14, paddingHorizontal: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: "rgba(255,255,255,0.55)", textAlign: "center" },
  emptyTxt: { fontSize: 13, color: "rgba(255,255,255,0.28)", textAlign: "center", lineHeight: 19 },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12, marginTop: 4 },
  retryTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

const cdgrid = StyleSheet.create({
  item: { width: 90, alignItems: "center", gap: 8 },
  title: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.65)", textAlign: "center", lineHeight: 13 },
});
