import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { api, tmdbItemToContent } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";
import type { ContentItem } from "@/constants/content";
import { searchDriveByTitle, DriveMatch } from "@/lib/gdrive-search";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const { width: SW } = Dimensions.get("window");
const BG    = "#050508";
const RED   = "#e50914";
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_IMG = (path: string | null | undefined, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const RECENTS_KEY = "netplay_recent_searches";
const MAX_RECENTS = 12;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const iTitle  = (item: TmdbItem) => item.title ?? item.name ?? "Sem título";
const iYear   = (item: TmdbItem) => (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
const iIsMovie= (item: TmdbItem) => item.media_type === "movie" || (!!item.title && !item.name);
const iRating = (item: TmdbItem) => item.vote_average && item.vote_average > 0 ? item.vote_average.toFixed(1) : null;

async function tmdbGet<T = any>(path: string, extra = ""): Promise<T> {
  const url = `https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}&language=pt-BR${extra}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.json();
  } finally { clearTimeout(t); }
}

// ─── STATIC DATA ──────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "Em Alta",     icon: "trending-up" as const, color: RED,       route: "trending"  },
  { label: "Ao Vivo",     icon: "radio"       as const, color: "#22d3ee", route: "live"      },
  { label: "Novidades",   icon: "calendar"    as const, color: "#a78bfa", route: "novidades" },
  { label: "IA Picks",    icon: "cpu"         as const, color: "#34d399", route: "ia"        },
  { label: "Continue",    icon: "play-circle" as const, color: "#fbbf24", route: "continue"  },
  { label: "Downloads",   icon: "download"    as const, color: "#06b6d4", route: "downloads" },
];

const GENRE_FILTERS = [
  { id: "28",    label: "Ação",        color: "#ef4444" },
  { id: "35",    label: "Comédia",     color: "#f59e0b" },
  { id: "27",    label: "Terror",      color: "#7c3aed" },
  { id: "878",   label: "Sci-Fi",      color: "#06b6d4" },
  { id: "18",    label: "Drama",       color: "#3b82f6" },
  { id: "53",    label: "Thriller",    color: "#64748b" },
  { id: "16",    label: "Anime",       color: "#f97316" },
  { id: "10749", label: "Romance",     color: "#ec4899" },
  { id: "99",    label: "Doc",         color: "#a78bfa" },
  { id: "12",    label: "Aventura",    color: "#22c55e" },
];

const YEAR_FILTERS = [
  { label: "2024–25", from: 2024, to: 2025 },
  { label: "2020–23", from: 2020, to: 2023 },
  { label: "2010s",   from: 2010, to: 2019 },
  { label: "2000s",   from: 2000, to: 2009 },
  { label: "Clássicos",from: 1950, to: 1999 },
];

const RATING_FILTERS = [
  { label: "9+",   min: 9 },
  { label: "8+",   min: 8 },
  { label: "7+",   min: 7 },
  { label: "6+",   min: 6 },
];

const MOOD_SHORTCUTS = [
  { label: "💥 Algo épico",     genre: "12",    type: "movie", color: "#f59e0b" },
  { label: "😂 Quero rir",      genre: "35",    type: "movie", color: "#22c55e" },
  { label: "👻 Quero me assustar",genre:"27",   type: "movie", color: "#7c3aed" },
  { label: "❤️ Romance",        genre: "10749", type: "movie", color: "#ec4899" },
  { label: "🚀 Ficção Científica",genre:"878",  type: "movie", color: "#06b6d4" },
  { label: "🎭 Drama intenso",  genre: "18",    type: "tv",    color: "#3b82f6" },
  { label: "⛩️ Anime",          genre: "16",    type: "tv",    color: "#f97316" },
  { label: "📺 Série p/ maratonar",genre:"18",  type: "tv",    color: "#a78bfa" },
];

const CHANNELS_DATA = [
  { id: "espn",       name: "ESPN",         desc: "Esportes ao vivo",          color: "#ef4444", icon: "activity" as const },
  { id: "disney",     name: "Disney+",      desc: "Filmes e séries da Disney", color: "#a78bfa", icon: "star"     as const },
  { id: "amazon",     name: "Prime Video",  desc: "Amazon Prime Video",        color: "#22d3ee", icon: "shopping-bag" as const },
  { id: "max",        name: "Max",          desc: "HBO e Max originais",       color: "#1a56db", icon: "tv"       as const },
  { id: "globo",      name: "Globoplay",    desc: "Conteúdo Globo",           color: "#f97316", icon: "globe"    as const },
  { id: "telecine",   name: "Telecine",     desc: "Filmes em HD",             color: "#fbbf24", icon: "film"     as const },
  { id: "paramount",  name: "Paramount+",  desc: "Filmes e séries",           color: "#3b82f6", icon: "shield"   as const },
  { id: "apple",      name: "Apple TV+",   desc: "Originais Apple",           color: "#34d399", icon: "smartphone" as const },
];

const FRANCHISE_QUICK = [
  { label: "Marvel",      color: "#e50914", collId: 131292, emoji: "⚡" },
  { label: "DC",          color: "#1a56db", collId: 263,    emoji: "🦇" },
  { label: "Star Wars",   color: "#22d3ee", collId: 10,     emoji: "⭐" },
  { label: "Harry Potter",color: "#d97706", collId: 1241,   emoji: "⚗️" },
  { label: "Fast & Furious",color:"#f97316",collId: 9485,   emoji: "🏎️" },
  { label: "John Wick",   color: "#a78bfa", collId: 404609, emoji: "🐶" },
];

type ViewMode = "list" | "grid" | "cinematic";
type ResultTab = "media" | "collections" | "channels" | "people";

// ═══════════════════ COMPONENTS ═════════════════════════════════════════════

// ─── SKELETON ────────────────────────────────────────────────────────────────
function Skel({ w, h, r = 10 }: { w: number | string; h: number; r?: number }) {
  const op = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.7, duration: 750, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: "rgba(255,255,255,0.07)", opacity: op }} />;
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SH({
  title, icon, accent = RED, badge, sub, onSeeAll,
}: { title: string; icon?: keyof typeof Feather.glyphMap; accent?: string; badge?: string; sub?: string; onSeeAll?: () => void }) {
  return (
    <View style={shst.row}>
      <View style={shst.left}>
        {icon && (
          <View style={[shst.iconBox, { backgroundColor: accent + "22" }]}>
            <Feather name={icon} size={13} color={accent} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={shst.titleRow}>
            <Text style={shst.title}>{title}</Text>
            {badge && (
              <View style={[shst.badge, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
                <Text style={[shst.badgeTxt, { color: accent }]}>{badge}</Text>
              </View>
            )}
          </View>
          {sub && <Text style={shst.sub}>{sub}</Text>}
        </View>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} hitSlop={12}>
          <Text style={[shst.seeAll, { color: accent }]}>Ver tudo ›</Text>
        </Pressable>
      )}
    </View>
  );
}
const shst = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14, marginTop: 4 },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  sub: { fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 },
  seeAll: { fontSize: 12, fontWeight: "700" },
});

// ─── RESULT CARD 1: BIG CINEMATIC (backdrop full-width) ────────────────────
function BigResultCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const img = item.backdropPath ?? item.posterPath;
  const rating = item.rating?.toFixed(1);
  const isM = item.type === "movie";
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
    >
      <Animated.View style={[brc.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
        )}
        <LinearGradient
          colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.65)", "rgba(5,5,8,0.97)"]}
          locations={[0.3, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={brc.topRow}>
          <View style={[brc.typeBadge, { backgroundColor: isM ? RED : "#7c3aed" }]}>
            <Text style={brc.typeTxt}>{isM ? "FILME" : "SÉRIE"}</Text>
          </View>
          {rating && (
            <View style={brc.ratingPill}>
              <Text style={brc.ratingTxt}>⭐ {rating}</Text>
            </View>
          )}
        </View>
        <View style={brc.bottom}>
          <Text style={brc.title} numberOfLines={1}>{item.title}</Text>
          <View style={brc.metaRow}>
            {item.year ? <Text style={brc.meta}>{item.year}</Text> : null}
            {item.genres?.[0] ? <><Text style={brc.dot}>·</Text><Text style={brc.meta}>{item.genres[0]}</Text></> : null}
          </View>
          {item.description ? <Text style={brc.overview} numberOfLines={2}>{item.description}</Text> : null}
          <View style={brc.actions}>
            <Pressable onPress={onPress} style={brc.playBtn}>
              <Feather name="play" size={13} color="#fff" />
              <Text style={brc.playTxt}>Assistir</Text>
            </Pressable>
            <Pressable onPress={onPress} style={brc.infoBtn}>
              <Feather name="info" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={brc.infoTxt}>Detalhes</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const brc = StyleSheet.create({
  card: { marginHorizontal: 20, marginBottom: 12, height: 210, borderRadius: 18, overflow: "hidden", backgroundColor: "#111" },
  topRow: { position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 8, alignItems: "center" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  typeTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  ratingPill: { backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  ratingTxt: { fontSize: 11, color: "#fff", fontWeight: "700" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14 },
  title: { fontSize: 18, fontWeight: "900", color: "#fff", letterSpacing: -0.4, marginBottom: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 },
  meta: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "600" },
  dot: { fontSize: 11, color: "rgba(255,255,255,0.25)" },
  overview: { fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 15, marginBottom: 10 },
  actions: { flexDirection: "row", gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: RED, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  playTxt: { fontSize: 13, fontWeight: "800", color: "#fff" },
  infoBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  infoTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
});

// ─── RESULT CARD 2: COMPACT HORIZONTAL (list view) ────────────────────────
function CompactResultCard({ item, rank, onPress }: { item: ContentItem; rank?: number; onPress: () => void }) {
  const img = item.posterPath ?? item.backdropPath;
  const rating = item.rating?.toFixed(1);
  const isM = item.type === "movie";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [crc.row, { opacity: pressed ? 0.8 : 1, backgroundColor: pressed ? "rgba(255,255,255,0.03)" : "transparent" }]}>
      <View style={crc.posterWrap}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#0d0d16"]} style={StyleSheet.absoluteFill} />
        )}
        {rank !== undefined && (
          <View style={crc.rankBadge}>
            <Text style={crc.rankTxt}>#{rank}</Text>
          </View>
        )}
        <View style={crc.playOverlay}>
          <Feather name="play" size={14} color="#fff" />
        </View>
      </View>
      <View style={crc.info}>
        <Text style={crc.title} numberOfLines={2}>{item.title}</Text>
        <View style={crc.metaRow}>
          <View style={[crc.typePill, { backgroundColor: isM ? RED + "22" : "#7c3aed22" }]}>
            <Text style={[crc.typeTxt, { color: isM ? RED : "#a78bfa" }]}>{isM ? "Filme" : "Série"}</Text>
          </View>
          {item.year ? <Text style={crc.year}>{item.year}</Text> : null}
          {rating ? <Text style={crc.rating}>⭐ {rating}</Text> : null}
        </View>
        {item.description ? (
          <Text style={crc.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        {item.genres?.[0] ? <Text style={crc.genre}>{item.genres.slice(0, 2).join(" · ")}</Text> : null}
      </View>
      <Pressable onPress={onPress} style={crc.watchBtn}>
        <Feather name="play" size={12} color="#fff" />
        <Text style={crc.watchTxt}>Ver</Text>
      </Pressable>
    </Pressable>
  );
}
const crc = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.045)" },
  posterWrap: { width: 64, height: 90, borderRadius: 12, overflow: "hidden", backgroundColor: "#1a1a2e", flexShrink: 0 },
  rankBadge: { position: "absolute", top: 4, left: 4, backgroundColor: "rgba(0,0,0,0.72)", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 5 },
  rankTxt: { fontSize: 8, fontWeight: "900", color: "#fbbf24" },
  playOverlay: { position: "absolute", bottom: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  info: { flex: 1, gap: 4 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  typePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeTxt: { fontSize: 9, fontWeight: "800" },
  year: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  rating: { fontSize: 11, color: "#fbbf24", fontWeight: "700" },
  desc: { fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 15 },
  genre: { fontSize: 10, color: "rgba(255,255,255,0.3)" },
  watchBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RED, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, ...Platform.select({ ios: { shadowColor: RED, shadowRadius: 6, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 0 } } }) },
  watchTxt: { fontSize: 11, fontWeight: "800", color: "#fff" },
});

// ─── RESULT CARD 3: GRID CARD (square poster, 3 columns) ──────────────────
function GridResultCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const GRID_W = (SW - 50) / 3;
  const img = item.posterPath ?? item.backdropPath;
  const isM = item.type === "movie";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: GRID_W, opacity: pressed ? 0.8 : 1 }]}>
      <View style={[grc.card, { width: GRID_W, height: GRID_W * 1.5 }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={["#1a1a2e", "#0d0d16"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={[grc.typeDot, { backgroundColor: isM ? RED : "#7c3aed" }]} />
        {item.rating && item.rating > 0 && (
          <View style={grc.ratingWrap}>
            <Text style={grc.ratingTxt}>⭐ {item.rating.toFixed(1)}</Text>
          </View>
        )}
        <Text style={grc.title} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );
}
const grc = StyleSheet.create({
  card: { borderRadius: 12, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end" },
  typeDot: { position: "absolute", top: 6, left: 6, width: 8, height: 8, borderRadius: 4 },
  ratingWrap: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  ratingTxt: { fontSize: 8, fontWeight: "700", color: "#fbbf24" },
  title: { fontSize: 10, fontWeight: "800", color: "#fff", padding: 6, lineHeight: 13 },
});

// ─── RESULT CARD 4: TOP 10 RANK CARD (poster + big number) ────────────────
function RankResultCard({ item, rank, onPress }: { item: TmdbItem; rank: number; onPress: () => void }) {
  const img = TMDB_IMG(item.poster_path);
  const rating = iRating(item);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [rkc.wrap, { opacity: pressed ? 0.85 : 1 }]}>
      <Text style={rkc.bigNum}>{rank}</Text>
      <View style={rkc.card}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
        )}
        <LinearGradient colors={["transparent", "rgba(5,5,8,0.95)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
        <View style={rkc.info}>
          <Text style={rkc.title} numberOfLines={2}>{iTitle(item)}</Text>
          <View style={rkc.metaRow}>
            <Text style={rkc.type}>{iIsMovie(item) ? "Filme" : "Série"}</Text>
            <Text style={rkc.dot}>·</Text>
            <Text style={rkc.year}>{iYear(item)}</Text>
          </View>
          {rating ? (
            <Text style={rkc.rating}>⭐ {rating}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
const RKC_W = 130;
const rkc = StyleSheet.create({
  wrap: { width: RKC_W + 16, alignItems: "flex-end", marginRight: 4 },
  bigNum: { position: "absolute", bottom: -2, left: -6, fontSize: 72, fontWeight: "900", color: "rgba(255,255,255,0.1)", lineHeight: 72, zIndex: 0 },
  card: { width: RKC_W, height: 188, borderRadius: 14, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end", zIndex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", ...Platform.select({ ios: { shadowColor: "#000", shadowRadius: 8, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 6 } }) },
  info: { padding: 8, gap: 2 },
  title: { fontSize: 11, fontWeight: "800", color: "#fff", lineHeight: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  type: { fontSize: 9, color: "rgba(255,255,255,0.4)" },
  dot: { fontSize: 9, color: "rgba(255,255,255,0.2)" },
  year: { fontSize: 9, color: "rgba(255,255,255,0.4)" },
  rating: { fontSize: 10, color: "#fbbf24", fontWeight: "700" },
});

// ─── RESULT CARD 5: WIDE CARD (landscape, for trends section) ─────────────
function WideResultCard({ item, badge, onPress }: { item: TmdbItem; badge?: string; onPress: () => void }) {
  const img = TMDB_IMG(item.backdrop_path, "w780") ?? TMDB_IMG(item.poster_path);
  const rating = iRating(item);
  const isM = iIsMovie(item);
  const BADGE_COLORS: Record<string, string> = { "🔥 HOT": RED, "NOVO": "#7c3aed", "AO VIVO": "#22c55e", "TOP": "#f59e0b" };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [wrc.card, { opacity: pressed ? 0.85 : 1 }]}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,8,0.96)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      {badge && (
        <View style={[wrc.badge, { backgroundColor: BADGE_COLORS[badge] ?? RED }]}>
          {badge === "AO VIVO" && <View style={wrc.liveDot} />}
          <Text style={wrc.badgeTxt}>{badge}</Text>
        </View>
      )}
      <View style={wrc.info}>
        <Text style={wrc.title} numberOfLines={1}>{iTitle(item)}</Text>
        <View style={wrc.metaRow}>
          <Text style={wrc.meta}>{isM ? "Filme" : "Série"}</Text>
          <Text style={wrc.dot}>·</Text>
          <Text style={wrc.meta}>{iYear(item)}</Text>
          {rating ? <><Text style={wrc.dot}>·</Text><Text style={wrc.rating}>⭐ {rating}</Text></> : null}
        </View>
        <Pressable onPress={onPress} style={wrc.playCircle}>
          <Feather name="play" size={12} color="#fff" />
        </Pressable>
      </View>
    </Pressable>
  );
}
const WRC_W = 164;
const wrc = StyleSheet.create({
  card: { width: WRC_W, height: 228, borderRadius: 16, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", marginRight: 10 },
  badge: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#fff" },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },
  info: { padding: 10, gap: 3 },
  title: { fontSize: 13, fontWeight: "800", color: "#fff" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  dot: { fontSize: 10, color: "rgba(255,255,255,0.2)" },
  rating: { fontSize: 10, color: "#fbbf24", fontWeight: "700" },
  playCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: RED, alignItems: "center", justifyContent: "center", marginTop: 6, alignSelf: "flex-start", ...Platform.select({ ios: { shadowColor: RED, shadowRadius: 6, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } } }) },
});

// ─── RESULT CARD 6: COLLECTION CARD ──────────────────────────────────────
function CollectionCard({ col, onPress }: { col: any; onPress: () => void }) {
  const img = TMDB_IMG(col.backdrop_path ?? col.poster_path);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [colc.card, { opacity: pressed ? 0.85 : 1 }]}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient colors={["#1a56db22", "#0d0d16"]} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,8,0.92)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      <View style={colc.badge}>
        <Feather name="box" size={9} color="#1a56db" />
        <Text style={colc.badgeTxt}>COLEÇÃO</Text>
      </View>
      <View style={colc.bottom}>
        <Text style={colc.name} numberOfLines={2}>{col.name}</Text>
        {col.parts?.length ? <Text style={colc.parts}>{col.parts.length} títulos</Text> : null}
      </View>
      <Pressable onPress={onPress} style={colc.btn}>
        <Text style={colc.btnTxt}>Ver coleção</Text>
        <Feather name="arrow-right" size={11} color="#1a56db" />
      </Pressable>
    </Pressable>
  );
}
const colc = StyleSheet.create({
  card: { marginHorizontal: 20, marginBottom: 10, height: 140, borderRadius: 16, overflow: "hidden", backgroundColor: "#111", borderWidth: 1, borderColor: "rgba(26,86,219,0.3)" },
  badge: { position: "absolute", top: 10, left: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(26,86,219,0.2)", borderWidth: 1, borderColor: "rgba(26,86,219,0.4)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  badgeTxt: { fontSize: 9, fontWeight: "900", color: "#1a56db", letterSpacing: 0.8 },
  bottom: { position: "absolute", bottom: 40, left: 12, right: 12 },
  name: { fontSize: 15, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  parts: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 3 },
  btn: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(26,86,219,0.15)", borderTopWidth: 1, borderTopColor: "rgba(26,86,219,0.25)", paddingVertical: 9 },
  btnTxt: { fontSize: 12, fontWeight: "700", color: "#1a56db" },
});

// ─── CHANNEL RESULT CARD ─────────────────────────────────────────────────
function ChannelResultCard({ ch, onPress }: { ch: typeof CHANNELS_DATA[0]; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [chrc.card, { opacity: pressed ? 0.85 : 1, borderColor: ch.color + "44" }]}>
      <LinearGradient colors={[ch.color + "22", ch.color + "08"]} style={StyleSheet.absoluteFill} />
      <View style={[chrc.iconWrap, { backgroundColor: ch.color + "22" }]}>
        <Feather name={ch.icon} size={22} color={ch.color} />
      </View>
      <View style={chrc.info}>
        <Text style={chrc.name}>{ch.name}</Text>
        <Text style={chrc.desc}>{ch.desc}</Text>
      </View>
      <View style={[chrc.btn, { backgroundColor: ch.color }]}>
        <Feather name="play" size={11} color="#fff" />
        <Text style={chrc.btnTxt}>Abrir</Text>
      </View>
    </Pressable>
  );
}
const chrc = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 20, marginBottom: 8, borderRadius: 16, borderWidth: 1, padding: 12, overflow: "hidden" },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 14, fontWeight: "800", color: "#fff" },
  desc: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  btn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  btnTxt: { fontSize: 11, fontWeight: "800", color: "#fff" },
});

// ─── FRANCHISE QUICK CARD ────────────────────────────────────────────────
function FranchiseCard({ f, onPress }: { f: typeof FRANCHISE_QUICK[0]; onPress: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    tmdbGet(`/collection/${f.collId}`).then((d) => setImg(d.backdrop_path ?? d.poster_path)).catch(() => {});
  }, [f.collId]);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [frc.card, { borderColor: f.color + "55", opacity: pressed ? 0.85 : 1 }]}>
      {img ? (
        <Image source={{ uri: TMDB_IMG(img)! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: f.color + "1a" }]} />
      )}
      <LinearGradient colors={[f.color + "00", f.color + "bb", f.color + "ee"]} locations={[0.1, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <View style={frc.top}><Text style={frc.emoji}>{f.emoji}</Text></View>
      <Text style={frc.name}>{f.label}</Text>
    </Pressable>
  );
}
const FRC_W = (SW - 52) / 3;
const frc = StyleSheet.create({
  card: { width: FRC_W, height: FRC_W * 1.35, borderRadius: 16, overflow: "hidden", backgroundColor: "#111", borderWidth: 1.5, justifyContent: "flex-end", padding: 10 },
  top: { position: "absolute", top: 8, left: 8 },
  emoji: { fontSize: 22 },
  name: { fontSize: 11, fontWeight: "900", color: "#fff", lineHeight: 14 },
});

// ─── QUICK ACTION CARD ───────────────────────────────────────────────────
function QuickActionCard({ q, onPress }: { q: typeof QUICK_ACTIONS[0]; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 32 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
    >
      <Animated.View style={[qac.card, { backgroundColor: q.color + "18", borderColor: q.color + "35", transform: [{ scale }] }]}>
        <View style={[qac.iconWrap, { backgroundColor: q.color + "22" }]}>
          <Feather name={q.icon} size={18} color={q.color} />
        </View>
        <Text style={[qac.label, { color: q.color }]}>{q.label}</Text>
      </Animated.View>
    </Pressable>
  );
}
const qac = StyleSheet.create({
  card: { alignItems: "center", gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, minWidth: 80 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, fontWeight: "700", textAlign: "center" },
});

// ─── AI PICK CARD ─────────────────────────────────────────────────────────
function AIPickCard({ item, idx, onPress }: { item: TmdbItem; idx: number; onPress: () => void }) {
  const img = TMDB_IMG(item.backdrop_path, "w780") ?? TMDB_IMG(item.poster_path);
  const rating = iRating(item);
  const AI_REASONS = [
    "Baseado no seu histórico", "Altamente avaliado por usuários similares",
    "Você pode adorar este", "Match perfeito com seus gostos",
    "Tendência entre usuários premium", "Recomendado pela IA NETPLAY",
  ];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [aip.card, { opacity: pressed ? 0.85 : 1 }]}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0d2e1a" }]} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,8,0.95)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      <View style={aip.aiBadge}>
        <Feather name="cpu" size={9} color="#34d399" />
        <Text style={aip.aiBadgeTxt}>IA</Text>
      </View>
      <View style={aip.matchBadge}>
        <Text style={aip.matchTxt}>{85 + (idx * 3) % 14}% match</Text>
      </View>
      <View style={aip.info}>
        <Text style={aip.reason}>{AI_REASONS[idx % AI_REASONS.length]}</Text>
        <Text style={aip.title} numberOfLines={1}>{iTitle(item)}</Text>
        {rating ? <Text style={aip.rating}>⭐ {rating} · {iYear(item)}</Text> : null}
      </View>
    </Pressable>
  );
}
const AIP_W = SW * 0.7;
const aip = StyleSheet.create({
  card: { width: AIP_W, height: AIP_W * 0.58, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end", marginRight: 12, borderWidth: 1, borderColor: "rgba(52,211,153,0.25)" },
  aiBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(52,211,153,0.2)", borderWidth: 1, borderColor: "rgba(52,211,153,0.4)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  aiBadgeTxt: { fontSize: 9, fontWeight: "900", color: "#34d399", letterSpacing: 0.8 },
  matchBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  matchTxt: { fontSize: 10, fontWeight: "800", color: "#34d399" },
  info: { padding: 12, gap: 3 },
  reason: { fontSize: 10, color: "#34d399", fontWeight: "600" },
  title: { fontSize: 15, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  rating: { fontSize: 11, color: "#fbbf24", fontWeight: "700" },
});

// ─── MOOD SHORTCUT PILL ───────────────────────────────────────────────────
function MoodPill({ m, onPress }: { m: typeof MOOD_SHORTCUTS[0]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [msp.pill, { backgroundColor: m.color + "1a", borderColor: m.color + "44", opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[msp.label, { color: m.color }]}>{m.label}</Text>
    </Pressable>
  );
}
const msp = StyleSheet.create({
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 30, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: "700" },
});

// ─── FILTER PANEL ─────────────────────────────────────────────────────────
function FilterPanel({
  visible,
  genreFilter, yearFilter, ratingFilter, typeFilter,
  onGenre, onYear, onRating, onType, onClear,
}: {
  visible: boolean;
  genreFilter: string | null; yearFilter: typeof YEAR_FILTERS[0] | null;
  ratingFilter: typeof RATING_FILTERS[0] | null; typeFilter: "movie" | "tv" | null;
  onGenre: (g: string | null) => void; onYear: (y: typeof YEAR_FILTERS[0] | null) => void;
  onRating: (r: typeof RATING_FILTERS[0] | null) => void; onType: (t: "movie" | "tv" | null) => void;
  onClear: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: visible ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [visible]);

  const hasActive = !!(genreFilter || yearFilter || ratingFilter || typeFilter);

  if (!visible) return null;

  return (
    <Animated.View style={[fp.wrap, { opacity: anim, transform: [{ scaleY: anim }, { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      {/* Type */}
      <View style={fp.row}>
        <Text style={fp.rowLabel}>Tipo</Text>
        <View style={fp.chips}>
          {([null, "movie", "tv"] as const).map((t) => (
            <Pressable
              key={t ?? "all"}
              onPress={() => onType(t)}
              style={[fp.chip, typeFilter === t && { backgroundColor: RED, borderColor: RED }]}
            >
              <Text style={[fp.chipTxt, typeFilter === t && { color: "#fff" }]}>{t === null ? "Todos" : t === "movie" ? "Filmes" : "Séries"}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {/* Genre */}
      <View style={fp.row}>
        <Text style={fp.rowLabel}>Gênero</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={fp.chips}>
            {GENRE_FILTERS.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => onGenre(genreFilter === g.id ? null : g.id)}
                style={[fp.chip, genreFilter === g.id && { backgroundColor: g.color + "cc", borderColor: g.color }]}
              >
                <Text style={[fp.chipTxt, genreFilter === g.id && { color: "#fff" }]}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      {/* Year */}
      <View style={fp.row}>
        <Text style={fp.rowLabel}>Período</Text>
        <View style={fp.chips}>
          {YEAR_FILTERS.map((y) => (
            <Pressable
              key={y.label}
              onPress={() => onYear(yearFilter?.label === y.label ? null : y)}
              style={[fp.chip, yearFilter?.label === y.label && { backgroundColor: "#f59e0bcc", borderColor: "#f59e0b" }]}
            >
              <Text style={[fp.chipTxt, yearFilter?.label === y.label && { color: "#fff" }]}>{y.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {/* Rating */}
      <View style={fp.row}>
        <Text style={fp.rowLabel}>Nota</Text>
        <View style={fp.chips}>
          {RATING_FILTERS.map((r) => (
            <Pressable
              key={r.label}
              onPress={() => onRating(ratingFilter?.label === r.label ? null : r)}
              style={[fp.chip, ratingFilter?.label === r.label && { backgroundColor: "#fbbf24cc", borderColor: "#fbbf24" }]}
            >
              <Text style={[fp.chipTxt, ratingFilter?.label === r.label && { color: "#fff" }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {/* Clear */}
      {hasActive && (
        <Pressable onPress={onClear} style={fp.clearBtn}>
          <Feather name="x" size={12} color={RED} />
          <Text style={fp.clearTxt}>Limpar filtros</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
const fp = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginBottom: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.03)", padding: 16, gap: 14, overflow: "hidden" },
  row: { gap: 8 },
  rowLabel: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.4)", letterSpacing: 0.8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.05)" },
  chipTxt: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end" },
  clearTxt: { fontSize: 12, fontWeight: "700", color: RED },
});

// ─── AUTOCOMPLETE DROPDOWN ────────────────────────────────────────────────
function AutocompleteDropdown({
  suggestions, onSelect,
}: { suggestions: string[]; onSelect: (s: string) => void }) {
  if (!suggestions.length) return null;
  return (
    <View style={ac.wrap}>
      {suggestions.map((s, i) => (
        <Pressable
          key={s}
          onPress={() => onSelect(s)}
          style={[ac.row, i < suggestions.length - 1 && ac.border]}
        >
          <Feather name="search" size={13} color="rgba(255,255,255,0.3)" />
          <Text style={ac.txt}>{s}</Text>
          <Feather name="arrow-up-left" size={13} color="rgba(255,255,255,0.2)" />
        </Pressable>
      ))}
    </View>
  );
}
const ac = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginTop: -14, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#0d0d16", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  txt: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "600" },
});

// ─── EMPTY STATE ──────────────────────────────────────────────────────────
function EmptyState({ query }: { query: string }) {
  return (
    <View style={ems.wrap}>
      <Text style={ems.emoji}>🔍</Text>
      <Text style={ems.title}>Nenhum resultado</Text>
      <Text style={ems.sub}>Não encontramos nada para "{query}"</Text>
      <Text style={ems.hint}>Tente pesquisar por outro título, ator ou gênero</Text>
    </View>
  );
}
const ems = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emoji: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "900", color: "#fff" },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center" },
  hint: { fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", marginTop: 4 },
});

// ─── VIEW MODE TOGGLE ─────────────────────────────────────────────────────
function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const modes: { m: ViewMode; icon: keyof typeof Feather.glyphMap }[] = [
    { m: "list",     icon: "list"   },
    { m: "grid",     icon: "grid"   },
    { m: "cinematic",icon: "film"   },
  ];
  return (
    <View style={vt.row}>
      {modes.map(({ m, icon }) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          style={[vt.btn, mode === m && { backgroundColor: RED }]}
        >
          <Feather name={icon} size={13} color={mode === m ? "#fff" : "rgba(255,255,255,0.4)"} />
        </Pressable>
      ))}
    </View>
  );
}
const vt = StyleSheet.create({
  row: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 2, gap: 2 },
  btn: { width: 32, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
});

// ═══════════════════ MAIN SCREEN ════════════════════════════════════════════
export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 64 : insets.top;
  const inputRef = useRef<TextInput>(null);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [resultTab, setResultTab] = useState<ResultTab>("media");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<typeof YEAR_FILTERS[0] | null>(null);
  const [ratingFilter, setRatingFilter] = useState<typeof RATING_FILTERS[0] | null>(null);
  const [typeFilter, setTypeFilter] = useState<"movie" | "tv" | null>(null);

  // Results
  const [results, setResults] = useState<ContentItem[]>([]);
  const [collectionResults, setCollectionResults] = useState<any[]>([]);
  const [driveResults, setDriveResults] = useState<DriveMatch[]>([]);
  const [peopleResults, setPeopleResults] = useState<TmdbItem[]>([]);

  // Browse data
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [popular, setPopular] = useState<TmdbItem[]>([]);
  const [iaRecs, setIaRecs] = useState<TmdbItem[]>([]);
  const [showIA, setShowIA] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);

  // UX
  const [recents, setRecents] = useState<string[]>([]);
  const [autocomplete, setAutocomplete] = useState<string[]>([]);
  const [activeProfile, setActiveProfile] = useState<any>(null);

  // ── Load profile + recents ──────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem("netplay_active_profile_v2").then(r => { if (r) setActiveProfile(JSON.parse(r)); }).catch(() => {});
    AsyncStorage.getItem(RECENTS_KEY).then(r => { if (r) setRecents(JSON.parse(r)); }).catch(() => {});
  }, [user?.id]);

  // ── Load browse data ────────────────────────────────────────────────────
  useEffect(() => {
    Promise.allSettled([
      api.tmdb.trending(),
      api.tmdb.popularMovies(),
      api.tmdb.popularTv(),
    ]).then(([t, pm, ptv]) => {
      if (t.status === "fulfilled") setTrending((t.value.all ?? []).slice(0, 16));
      const movies = t.status === "fulfilled" ? [] : [];
      const pm2 = pm.status === "fulfilled" ? pm.value.slice(0, 8) : [];
      const ptv2 = ptv.status === "fulfilled" ? ptv.value.slice(0, 8) : [];
      setPopular([...pm2, ...ptv2].sort(() => Math.random() - 0.5));
    });
  }, []);

  // ── Autocomplete from recents ────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setAutocomplete([]); return; }
    const q = query.toLowerCase();
    const from = recents.filter(r => r.toLowerCase().startsWith(q)).slice(0, 4);
    setAutocomplete(from);
  }, [query, recents]);

  // ── Save recent ─────────────────────────────────────────────────────────
  const saveRecent = useCallback((term: string) => {
    if (!term.trim()) return;
    setRecents(prev => {
      const next = [term, ...prev.filter(r => r.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENTS);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(RECENTS_KEY).catch(() => {});
  }, []);

  // ── Search TMDB ──────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setCollectionResults([]); setDriveResults([]); setPeopleResults([]); return; }
    saveRecent(q.trim());
    setSearchLoading(true);
    try {
      const [multiData, colData, driveMatches, peopleData] = await Promise.allSettled([
        api.tmdb.search(q, "multi"),
        api.tmdb.searchCollections(q, 1),
        searchDriveByTitle(q),
        tmdbGet(`/search/person`, `&query=${encodeURIComponent(q)}`),
      ]);

      if (multiData.status === "fulfilled") {
        const items = (multiData.value.results ?? [])
          .filter((r: TmdbItem) => r.media_type === "movie" || r.media_type === "tv")
          .map(tmdbItemToContent);
        setResults(items);
        const colsFromMulti = (multiData.value.results ?? []).filter((r: any) => r.media_type === "collection");
        if (colData.status === "fulfilled") {
          const all = new Map<number, any>();
          [...(colData.value.results ?? []), ...colsFromMulti].forEach((c: any) => all.set(c.id, c));
          setCollectionResults(Array.from(all.values()));
        }
      }
      if (driveMatches.status === "fulfilled") setDriveResults(driveMatches.value);
      if (peopleData.status === "fulfilled") setPeopleResults((peopleData.value.results ?? []).slice(0, 8));
    } catch {}
    finally { setSearchLoading(false); }
  }, [saveRecent]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // ── IA Recs ──────────────────────────────────────────────────────────────
  const loadIA = useCallback(async () => {
    if (iaRecs.length > 0) { setShowIA(v => !v); return; }
    setShowIA(true);
    setIaLoading(true);
    try {
      const d = await tmdbGet("/movie/top_rated");
      setIaRecs((d.results ?? []).slice(0, 10));
    } catch {}
    finally { setIaLoading(false); }
  }, [iaRecs.length]);

  // ── Focus / glow ─────────────────────────────────────────────────────────
  const onFocus = () => {
    setFocused(true);
    Animated.timing(glowAnim, { toValue: 1, duration: 260, useNativeDriver: false }).start();
  };
  const onBlur = () => {
    if (!query) {
      setFocused(false);
      Animated.timing(glowAnim, { toValue: 0, duration: 260, useNativeDriver: false }).start();
    }
  };
  const glowShadow = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });

  // ── Navigate helpers ─────────────────────────────────────────────────────
  const navContent = (item: ContentItem) => {
    router.push({ pathname: "/detail", params: { type: item.type === "movie" ? "movie" : "tv", id: String((item as any).tmdbId ?? item.id), title: item.title } });
  };
  const navTmdb = (item: TmdbItem) => {
    router.push({ pathname: "/detail", params: { type: iIsMovie(item) ? "movie" : "tv", id: String(item.id), title: iTitle(item) } });
  };
  const handleQuick = (q: typeof QUICK_ACTIONS[0]) => {
    switch (q.route) {
      case "live":      router.push("/(tabs)/channels"); break;
      case "novidades": router.push("/(tabs)/novidades"); break;
      case "continue":  router.push("/(tabs)/list"); break;
      case "downloads": router.push("/(tabs)/downloads"); break;
      case "ia":        loadIA(); break;
      default: router.push({ pathname: "/genre-browse", params: { genre_id: "0", type: "movie", title: q.label } }); break;
    }
  };

  // ── Apply filters to results ─────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    let arr = [...results];
    if (typeFilter) arr = arr.filter(r => r.type === typeFilter);
    if (genreFilter) arr = arr.filter(r => (r.genres ?? []).some((g) => String(g).includes(GENRE_FILTERS.find(f => f.id === genreFilter)?.label ?? "")));
    if (ratingFilter) arr = arr.filter(r => (r.rating ?? 0) >= ratingFilter.min);
    if (yearFilter) arr = arr.filter(r => {
      const y = parseInt(String(r.year ?? "0"), 10);
      return y >= yearFilter.from && y <= yearFilter.to;
    });
    return arr;
  }, [results, typeFilter, genreFilter, ratingFilter, yearFilter]);

  const isSearching = query.trim().length > 0;
  const channelResults = useMemo(() =>
    CHANNELS_DATA.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.desc.toLowerCase().includes(query.toLowerCase())),
    [query]
  );
  const hasActiveFilters = !!(genreFilter || yearFilter || ratingFilter || typeFilter);
  const badges = ["🔥 HOT", "NOVO", "AO VIVO", "TOP", "🔥 HOT", "NOVO", "AO VIVO", "TOP"];

  const RESULT_TABS: { id: ResultTab; label: string; count: number }[] = [
    { id: "media",       label: "Filmes & Séries",  count: filteredResults.length + driveResults.length },
    { id: "collections", label: "Coleções",          count: collectionResults.length },
    { id: "channels",    label: "Canais",             count: channelResults.length },
    { id: "people",      label: "Pessoas",            count: peopleResults.length },
  ];

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HEADER ── */}
        <View style={[s.header, { paddingTop: topPad + 10 }]}>
          <View>
            <Text style={s.logo}><Text style={s.logoRed}>NET</Text>PLAY</Text>
            <Text style={s.logoSub}>Buscar conteúdo</Text>
          </View>
          <View style={s.headerRight}>
            <Pressable style={s.iconBtn}>
              <Feather name="bell" size={18} color="rgba(255,255,255,0.7)" />
              <View style={s.notifDot} />
            </Pressable>
            <Pressable style={[s.avatarBtn, { overflow: "hidden" }]} onPress={() => router.push("/(tabs)/profile")}>
              {activeProfile?.avatarUrl ? (
                <Image source={{ uri: activeProfile.avatarUrl }} style={{ width: 36, height: 36 }} contentFit="cover" />
              ) : (
                <Text style={s.avatarTxt}>{(activeProfile?.name ?? user?.name ?? "N")[0]?.toUpperCase()}</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── SEARCH BAR ── */}
        <View style={s.searchWrap}>
          <Animated.View style={[s.searchGlow, { shadowRadius: glowShadow }]} />
          <View style={[s.searchBar, focused && s.searchFocused]}>
            <Feather name="search" size={18} color={focused ? RED : "rgba(255,255,255,0.3)"} />
            <TextInput
              ref={inputRef}
              style={s.searchInput}
              placeholder="Buscar filmes, séries, atores, canais..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              value={query}
              onChangeText={setQuery}
              onFocus={onFocus}
              onBlur={onBlur}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchLoading ? (
              <ActivityIndicator size="small" color={RED} />
            ) : query.length > 0 ? (
              <Pressable onPress={() => { setQuery(""); setResults([]); setAutocomplete([]); }} hitSlop={8}>
                <Feather name="x-circle" size={17} color="rgba(255,255,255,0.4)" />
              </Pressable>
            ) : null}
            <Pressable
              style={s.micBtn}
              onPress={() => { /* voice search placeholder */ }}
            >
              <Feather name="mic" size={15} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* ── AUTOCOMPLETE DROPDOWN ── */}
        {focused && autocomplete.length > 0 && !searchLoading && (
          <AutocompleteDropdown
            suggestions={autocomplete}
            onSelect={(s) => { setQuery(s); setAutocomplete([]); inputRef.current?.blur(); }}
          />
        )}

        {/* ─────────────────── SEARCHING STATE ─────────────────────────── */}
        {isSearching ? (
          <View>
            {/* Tab row + view toggle + filter button */}
            <View style={s.tabRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabScroll}>
                {RESULT_TABS.map((tab) => (
                  <Pressable
                    key={tab.id}
                    onPress={() => setResultTab(tab.id)}
                    style={[s.tab, resultTab === tab.id && s.tabActive]}
                  >
                    <Text style={[s.tabTxt, resultTab === tab.id && s.tabTxtActive]}>
                      {tab.label}{tab.count > 0 ? ` (${tab.count})` : ""}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Filter row */}
            <View style={s.filterRow}>
              <Pressable
                onPress={() => setShowFilters(v => !v)}
                style={[s.filterBtn, (showFilters || hasActiveFilters) && s.filterBtnActive]}
              >
                <Feather name="sliders" size={13} color={showFilters || hasActiveFilters ? RED : "rgba(255,255,255,0.5)"} />
                <Text style={[s.filterTxt, (showFilters || hasActiveFilters) && { color: RED }]}>
                  Filtros{hasActiveFilters ? " ●" : ""}
                </Text>
              </Pressable>
              {resultTab === "media" && (
                <ViewToggle mode={viewMode} onChange={setViewMode} />
              )}
            </View>

            {/* Filter panel */}
            <FilterPanel
              visible={showFilters}
              genreFilter={genreFilter} yearFilter={yearFilter}
              ratingFilter={ratingFilter} typeFilter={typeFilter}
              onGenre={setGenreFilter} onYear={setYearFilter}
              onRating={setRatingFilter} onType={setTypeFilter}
              onClear={() => { setGenreFilter(null); setYearFilter(null); setRatingFilter(null); setTypeFilter(null); }}
            />

            {/* Loading */}
            {searchLoading && filteredResults.length === 0 && (
              <View style={s.loadingState}>
                <ActivityIndicator size="large" color={RED} />
                <Text style={s.loadingTxt}>Buscando "{query}"...</Text>
              </View>
            )}

            {/* ── Tab: Media ── */}
            {resultTab === "media" && !searchLoading && (
              <>
                {filteredResults.length === 0 && driveResults.length === 0 ? (
                  <EmptyState query={query} />
                ) : null}

                {/* Results */}
                {viewMode === "cinematic" && filteredResults.map((item) => (
                  <BigResultCard key={item.id} item={item} onPress={() => navContent(item)} />
                ))}
                {viewMode === "list" && filteredResults.map((item, i) => (
                  <CompactResultCard key={item.id} item={item} rank={i + 1} onPress={() => navContent(item)} />
                ))}
                {viewMode === "grid" && (
                  <View style={s.gridWrap}>
                    {filteredResults.map((item) => (
                      <GridResultCard key={item.id} item={item} onPress={() => navContent(item)} />
                    ))}
                  </View>
                )}

                {/* Drive results */}
                {driveResults.length > 0 && (
                  <View style={s.driveSection}>
                    <View style={s.driveHeader}>
                      <View style={s.driveAccent} />
                      <Text style={s.driveTitle}>NO ACERVO DRIVE ({driveResults.length})</Text>
                    </View>
                    {driveResults.map((match, i) => (
                      <Pressable
                        key={i}
                        style={({ pressed }) => [s.driveRow, { opacity: pressed ? 0.8 : 1 }]}
                        onPress={() => router.push({
                          pathname: match.isFolder ? "/(tabs)/channels" : "/gdrive-player",
                          params: match.isFolder ? {} : { fileName: match.name, fileLink: match.link ?? "", drive: String(match.drive), folderPath: match.path },
                        })}
                      >
                        <View style={s.driveIcon}>
                          <Feather name={match.isFolder ? "folder" : "play-circle"} size={24} color="#4ade80" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.driveName} numberOfLines={2}>{match.name}</Text>
                          <Text style={s.driveMeta}>Drive {match.drive} · {match.category}</Text>
                        </View>
                        <View style={s.drivePlayBtn}>
                          <Feather name="play" size={11} color="#fff" />
                          <Text style={s.drivePlayTxt}>Play</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── Tab: Collections ── */}
            {resultTab === "collections" && !searchLoading && (
              <>
                {collectionResults.length === 0 ? <EmptyState query={query} /> : null}
                {collectionResults.map((col) => (
                  <CollectionCard
                    key={col.id}
                    col={col}
                    onPress={() => router.push({ pathname: "/collection", params: { id: col.id, title: col.name } })}
                  />
                ))}
              </>
            )}

            {/* ── Tab: Channels ── */}
            {resultTab === "channels" && (
              <>
                {channelResults.length === 0 ? <EmptyState query={query} /> : null}
                {channelResults.map((ch) => (
                  <ChannelResultCard key={ch.id} ch={ch} onPress={() => router.push("/(tabs)/channels")} />
                ))}
              </>
            )}

            {/* ── Tab: People ── */}
            {resultTab === "people" && !searchLoading && (
              <>
                {peopleResults.length === 0 ? <EmptyState query={query} /> : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 10 }}>
                  {peopleResults.map((p) => {
                    const pa = p as any;
                    const img = TMDB_IMG(pa.profile_path, "w185");
                    return (
                      <Pressable key={p.id} style={s.personCard}
                        onPress={() => router.push({ pathname: "/(tabs)/search", params: { query: p.name } })}>
                        <View style={s.personCircle}>
                          {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Feather name="user" size={28} color="rgba(255,255,255,0.2)" />}
                        </View>
                        <Text style={s.personName} numberOfLines={2}>{p.name}</Text>
                        <Text style={s.personRole}>{pa.known_for_department}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>

        ) : (
          // ───────────────────── BROWSE STATE ──────────────────────────────
          <>
            {/* Quick Actions */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>
              {QUICK_ACTIONS.map((q) => (
                <QuickActionCard key={q.label} q={q} onPress={() => handleQuick(q)} />
              ))}
            </ScrollView>

            {/* IA Recommendations */}
            {showIA && (
              <View style={s.section}>
                <SH title="Recomendados por IA" icon="cpu" accent="#34d399" badge="AI PICKS" sub="Seleção personalizada para você" onSeeAll={() => setShowIA(false)} />
                {iaLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <ActivityIndicator size="large" color="#34d399" />
                    <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>Processando suas preferências...</Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 0 }}
                    decelerationRate="fast"
                    snapToInterval={AIP_W + 12}
                  >
                    {iaRecs.map((item, i) => (
                      <AIPickCard key={item.id} item={item} idx={i} onPress={() => navTmdb(item)} />
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Recent Searches */}
            {recents.length > 0 && (
              <View style={s.section}>
                <SH
                  title="Pesquisas Recentes"
                  icon="clock"
                  accent="rgba(255,255,255,0.35)"
                  onSeeAll={clearRecents}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, alignItems: "center" }}>
                  {recents.map((r) => (
                    <Pressable
                      key={r}
                      style={s.recentPill}
                      onPress={() => { setQuery(r); inputRef.current?.focus(); }}
                    >
                      <Feather name="clock" size={10} color="rgba(255,255,255,0.3)" />
                      <Text style={s.recentTxt}>{r}</Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => {
                          const next = recents.filter(x => x !== r);
                          setRecents(next);
                          AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
                        }}
                      >
                        <Feather name="x" size={10} color="rgba(255,255,255,0.3)" />
                      </Pressable>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Mood Shortcuts */}
            <View style={s.section}>
              <SH title="O que quer assistir hoje?" icon="zap" accent="#22d3ee" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                {MOOD_SHORTCUTS.map((m) => (
                  <MoodPill
                    key={m.label}
                    m={m}
                    onPress={() => router.push({ pathname: "/genre-browse", params: { genre_id: m.genre, type: m.type, title: m.label } })}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Em Alta Top 10 */}
            {trending.length > 0 && (
              <View style={s.section}>
                <SH title="Em Alta Agora" icon="trending-up" accent={RED} badge="TOP 10" onSeeAll={() => router.push("/(tabs)/descobrir")} />
                {trending.length === 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                    {[1,2,3,4,5].map(i => <Skel key={i} w={RKC_W + 16} h={188} r={14} />)}
                  </ScrollView>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, alignItems: "flex-end", gap: 0 }}>
                    {trending.slice(0, 10).map((item, i) => (
                      <RankResultCard key={item.id} item={item} rank={i + 1} onPress={() => navTmdb(item)} />
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Tendências wide cards */}
            {popular.length > 0 && (
              <View style={s.section}>
                <SH title="Tendências" icon="award" accent="#fbbf24" onSeeAll={() => router.push("/(tabs)/descobrir")} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 0 }}>
                  {popular.slice(0, 8).map((item, i) => (
                    <WideResultCard
                      key={item.id}
                      item={item}
                      badge={badges[i % badges.length]}
                      onPress={() => navTmdb(item)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Franquias */}
            <View style={s.section}>
              <SH title="Universos & Franquias" icon="globe" accent="#a78bfa" onSeeAll={() => router.push("/(tabs)/franquias")} />
              <View style={s.franchiseGrid}>
                {FRANCHISE_QUICK.map((f) => (
                  <FranchiseCard
                    key={f.label}
                    f={f}
                    onPress={() => router.push({ pathname: "/collection", params: { id: f.collId, title: f.label } })}
                  />
                ))}
              </View>
            </View>

            {/* Genre filter pills */}
            <View style={s.section}>
              <SH title="Explorar por Gênero" icon="tag" accent="#06b6d4" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                {GENRE_FILTERS.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push({ pathname: "/genre-browse", params: { genre_id: g.id, type: "movie", title: g.label } })}
                    style={[s.genrePill, { backgroundColor: g.color + "1a", borderColor: g.color + "44" }]}
                  >
                    <View style={[s.genreDot, { backgroundColor: g.color }]} />
                    <Text style={[s.genreTxt, { color: g.color }]}>{g.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Channels quick */}
            <View style={s.section}>
              <SH title="Canais ao Vivo" icon="radio" accent="#ef4444" badge="AO VIVO" onSeeAll={() => router.push("/(tabs)/channels")} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                {CHANNELS_DATA.slice(0, 5).map((ch) => (
                  <Pressable
                    key={ch.id}
                    onPress={() => router.push("/(tabs)/channels")}
                    style={[s.chCard, { borderColor: ch.color + "44" }]}
                  >
                    <LinearGradient colors={[ch.color + "33", "#0d0d16"]} style={StyleSheet.absoluteFill} />
                    <View style={[s.chIcon, { backgroundColor: ch.color + "22" }]}>
                      <Feather name={ch.icon} size={20} color={ch.color} />
                    </View>
                    <Text style={s.chName}>{ch.name}</Text>
                    <View style={[s.chLive, { backgroundColor: ch.color }]}>
                      <Text style={s.chLiveTxt}>AO VIVO</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  logoRed: { color: RED },
  logoSub: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", alignItems: "center", justifyContent: "center" },
  notifDot: { position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: 3.5, backgroundColor: RED, borderWidth: 1.5, borderColor: BG },
  avatarBtn: { width: 38, height: 38, borderRadius: 11, backgroundColor: RED, alignItems: "center", justifyContent: "center", ...Platform.select({ ios: { shadowColor: RED, shadowRadius: 8, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } } }) },
  avatarTxt: { fontSize: 15, fontWeight: "900", color: "#fff" },

  // Search
  searchWrap: { paddingHorizontal: 20, marginBottom: 16 },
  searchGlow: { position: "absolute", left: 20, right: 20, top: 0, bottom: 0, borderRadius: 16, shadowColor: RED, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.09)", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  searchFocused: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.06)" },
  searchInput: { flex: 1, fontSize: 14, color: "#fff", fontWeight: "500" },
  micBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: RED, alignItems: "center", justifyContent: "center", ...Platform.select({ ios: { shadowColor: RED, shadowRadius: 6, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } } }) },

  // Result tabs
  tabRow: { marginBottom: 10 },
  tabScroll: { paddingHorizontal: 20, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.09)", backgroundColor: "rgba(255,255,255,0.04)" },
  tabActive: { backgroundColor: RED, borderColor: RED },
  tabTxt: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.6)" },
  tabTxtActive: { color: "#fff" },

  // Filter row
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" },
  filterBtnActive: { borderColor: RED + "66", backgroundColor: RED + "0d" },
  filterTxt: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.5)" },

  // Loading / empty
  loadingState: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingTxt: { fontSize: 14, color: "rgba(255,255,255,0.4)" },

  // Grid
  gridWrap: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 8, marginBottom: 8 },

  // Drive results
  driveSection: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: "rgba(22,163,74,0.25)", overflow: "hidden", backgroundColor: "rgba(22,163,74,0.04)" },
  driveHeader: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(22,163,74,0.15)" },
  driveAccent: { width: 3, height: 14, backgroundColor: "#16a34a", borderRadius: 2 },
  driveTitle: { fontSize: 11, fontWeight: "900", color: "#4ade80", letterSpacing: 1.5 },
  driveRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(22,163,74,0.1)" },
  driveIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "rgba(22,163,74,0.15)", alignItems: "center", justifyContent: "center" },
  driveName: { fontSize: 13, fontWeight: "700", color: "#fff", lineHeight: 17 },
  driveMeta: { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 },
  drivePlayBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#16a34a", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  drivePlayTxt: { fontSize: 11, fontWeight: "800", color: "#fff" },

  // Browse sections
  section: { marginBottom: 28 },
  quickRow: { paddingHorizontal: 20, gap: 10, paddingBottom: 8, marginBottom: 8 },

  // Recent
  recentPill: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" },
  recentTxt: { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "600" },

  // Genre pill
  genrePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 30, borderWidth: 1 },
  genreDot: { width: 7, height: 7, borderRadius: 4 },
  genreTxt: { fontSize: 13, fontWeight: "700" },

  // Franchise grid
  franchiseGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 8 },

  // People
  personCard: { width: 80, alignItems: "center", gap: 6 },
  personCircle: { width: 76, height: 76, borderRadius: 38, overflow: "hidden", backgroundColor: "#1a1a2e", borderWidth: 2, borderColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  personName: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 14 },
  personRole: { fontSize: 9, color: "rgba(255,255,255,0.35)", textAlign: "center" },

  // Channel quick card
  chCard: { width: 110, height: 126, borderRadius: 18, overflow: "hidden", backgroundColor: "#0d0d16", borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12 },
  chIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  chName: { fontSize: 11, fontWeight: "900", color: "#fff", textAlign: "center" },
  chLive: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  chLiveTxt: { fontSize: 8, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
});
