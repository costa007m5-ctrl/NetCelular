import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCatalog } from "@/lib/catalog-context";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get("window");
const BG      = "#050508";
const RED     = "#e50914";
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = (p: string | null | undefined, s = "w500") =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : null;

// ─── STATIC DATA ──────────────────────────────────────────────────────────────
const MOODS = [
  { label: "Quero Ação",      emoji: "💥", color: "#ef4444", genre: "28",    type: "movie", tmdbId: 299534 },
  { label: "Quero Rir",       emoji: "😂", color: "#f59e0b", genre: "35",    type: "movie", tmdbId: 585083 },
  { label: "Quero Chorar",    emoji: "😢", color: "#3b82f6", genre: "18",    type: "movie", tmdbId: 597 },
  { label: "Quero Me Assustar", emoji: "👻", color: "#7c3aed", genre: "27", type: "movie", tmdbId: 539 },
  { label: "Algo Épico",      emoji: "⚔️", color: "#d97706", genre: "12",    type: "movie", tmdbId: 299536 },
  { label: "Ficção Científica", emoji: "🚀", color: "#06b6d4", genre: "878", type: "movie", tmdbId: 438631 },
  { label: "Romance",         emoji: "❤️", color: "#ec4899", genre: "10749", type: "movie", tmdbId: 567 },
  { label: "Suspense",        emoji: "🔍", color: "#64748b", genre: "53",    type: "movie", tmdbId: 680 },
  { label: "Anime",           emoji: "⛩️", color: "#f97316", genre: "16",    type: "tv",    tmdbId: 85937 },
  { label: "Família",         emoji: "🏠", color: "#34d399", genre: "10751", type: "movie", tmdbId: 568124 },
  { label: "Documentário",    emoji: "🎥", color: "#a78bfa", genre: "99",    type: "movie", tmdbId: 459300 },
  { label: "Musical",         emoji: "🎵", color: "#f472b6", genre: "10402", type: "movie", tmdbId: 420818 },
];

const GENRES = [
  { label: "Ação",        color: "#ef4444", icon: "zap",      genreId: "28",    type: "movie" },
  { label: "Terror",      color: "#7c3aed", icon: "eye",      genreId: "27",    type: "movie" },
  { label: "Comédia",     color: "#f59e0b", icon: "smile",    genreId: "35",    type: "movie" },
  { label: "Sci-Fi",      color: "#06b6d4", icon: "cpu",      genreId: "878",   type: "movie" },
  { label: "Drama",       color: "#3b82f6", icon: "heart",    genreId: "18",    type: "tv"    },
  { label: "Thriller",    color: "#64748b", icon: "alert-triangle", genreId: "53", type: "movie" },
  { label: "Animação",    color: "#f97316", icon: "feather",  genreId: "16",    type: "movie" },
  { label: "Documentário",color: "#a78bfa", icon: "camera",   genreId: "99",    type: "movie" },
  { label: "Romance",     color: "#ec4899", icon: "gift",     genreId: "10749", type: "movie" },
  { label: "Faroeste",    color: "#92400e", icon: "sun",      genreId: "37",    type: "movie" },
  { label: "Musical",     color: "#f472b6", icon: "music",    genreId: "10402", type: "movie" },
  { label: "Guerra",      color: "#6b7280", icon: "shield",   genreId: "10752", type: "movie" },
];

const UNIVERSES = [
  { label: "Marvel",       color: "#e50914", collectionId: 131292, badge: "24 filmes", emoji: "⚡" },
  { label: "DC",           color: "#1a56db", collectionId: 263,    badge: "20 filmes", emoji: "🦇" },
  { label: "Star Wars",    color: "#22d3ee", collectionId: 10,     badge: "12 filmes", emoji: "⭐" },
  { label: "Harry Potter", color: "#d97706", collectionId: 1241,   badge: "8 filmes",  emoji: "⚗️" },
  { label: "Fast & Furious",color: "#f97316",collectionId: 9485,   badge: "10 filmes", emoji: "🏎️" },
  { label: "James Bond",   color: "#64748b", collectionId: 645,    badge: "25 filmes", emoji: "🔫" },
  { label: "Jurassic Park",color: "#22c55e", collectionId: 328,    badge: "6 filmes",  emoji: "🦕" },
  { label: "John Wick",    color: "#a78bfa", collectionId: 404609, badge: "4 filmes",  emoji: "🐶" },
  { label: "Matrix",       color: "#84cc16", collectionId: 2344,   badge: "4 filmes",  emoji: "💊" },
  { label: "Missão: Impossível",color: "#ec4899",collectionId: 87359,badge: "8 filmes",emoji: "🕵️" },
];

const DECADES = [
  { label: "Anos 50", year: "1950-1959", color: "#92400e", emoji: "📺" },
  { label: "Anos 60", year: "1960-1969", color: "#b45309", emoji: "🎸" },
  { label: "Anos 70", year: "1970-1979", color: "#a16207", emoji: "🕺" },
  { label: "Anos 80", year: "1980-1989", color: "#ef4444", emoji: "📼" },
  { label: "Anos 90", year: "1990-1999", color: "#7c3aed", emoji: "💾" },
  { label: "Anos 00", year: "2000-2009", color: "#06b6d4", emoji: "💿" },
  { label: "Anos 10", year: "2010-2019", color: "#22c55e", emoji: "📱" },
  { label: "Anos 20", year: "2020-2029", color: "#e50914", emoji: "🚀" },
];

const COUNTRIES = [
  { label: "EUA",      flag: "🇺🇸", code: "US", color: "#3b82f6" },
  { label: "Coreia",   flag: "🇰🇷", code: "KR", color: "#ec4899" },
  { label: "Japão",    flag: "🇯🇵", code: "JP", color: "#ef4444" },
  { label: "Brasil",   flag: "🇧🇷", code: "BR", color: "#22c55e" },
  { label: "França",   flag: "🇫🇷", code: "FR", color: "#6366f1" },
  { label: "Reino Unido", flag: "🇬🇧", code: "GB", color: "#a78bfa" },
  { label: "Espanha",  flag: "🇪🇸", code: "ES", color: "#f59e0b" },
  { label: "Índia",    flag: "🇮🇳", code: "IN", color: "#f97316" },
];

const STREAMERS = [
  { name: "Netflix",    color: "#e50914", icon: "play-circle",   tmdbId: 8,    badge: "Originais" },
  { name: "Disney+",    color: "#a78bfa", icon: "star",          tmdbId: 337,  badge: "Clássicos" },
  { name: "HBO Max",    color: "#1a56db", icon: "tv",            tmdbId: 384,  badge: "Series" },
  { name: "Prime Video",color: "#22d3ee", icon: "shopping-bag",  tmdbId: 119,  badge: "Amazon" },
  { name: "Apple TV+",  color: "#34d399", icon: "smartphone",    tmdbId: 350,  badge: "Originais" },
  { name: "Paramount+", color: "#3b82f6", icon: "shield",        tmdbId: 531,  badge: "Series" },
  { name: "Peacock",    color: "#fbbf24", icon: "feather",       tmdbId: 386,  badge: "USA" },
  { name: "Globoplay",  color: "#f97316", icon: "globe",         tmdbId: 307,  badge: "Brasil" },
];

const AWARDS = [
  { label: "Oscar 2025",    color: "#f59e0b", badge: "Premiado",   tmdbId: 278,    type: "movie" as const, emoji: "🏆" },
  { label: "Emmy 2024",     color: "#a78bfa", badge: "Emmy",       tmdbId: 1396,   type: "tv"    as const, emoji: "📺" },
  { label: "Cannes 2024",   color: "#ec4899", badge: "Palme d'Or", tmdbId: 496243, type: "movie" as const, emoji: "🌴" },
  { label: "Globo de Ouro", color: "#fbbf24", badge: "Vencedor",   tmdbId: 550,    type: "movie" as const, emoji: "🌐" },
  { label: "BAFTA 2024",    color: "#22d3ee", badge: "BAFTA",      tmdbId: 389,    type: "movie" as const, emoji: "🎭" },
  { label: "Crítica Top",   color: "#22c55e", badge: "98% RT",     tmdbId: 238,    type: "movie" as const, emoji: "🎯" },
];

const LIVE_CHANNELS = [
  { name: "ESPN",         sub: "NBA · Ao Vivo",      color: "#ef4444", icon: "radio"   as const },
  { name: "Fox Sports",   sub: "Futebol · Premier",  color: "#f59e0b", icon: "radio"   as const },
  { name: "Combate",      sub: "UFC · Em breve",      color: "#7c3aed", icon: "tv"      as const },
  { name: "Globo News",   sub: "Notícias · 24h",     color: "#06b6d4", icon: "tv"      as const },
  { name: "CNN Brasil",   sub: "Jornalismo",          color: "#e50914", icon: "globe"   as const },
  { name: "SporTV",       sub: "Esportes",            color: "#22c55e", icon: "activity"as const },
  { name: "Discovery",    sub: "Documentários",       color: "#f97316", icon: "compass" as const },
  { name: "National Geo", sub: "Natureza · Ciência", color: "#84cc16", icon: "map"     as const },
];

const EDITORS_PICKS = [
  { label: "Série do Ano",   tmdbId: 1396,   type: "tv"    as const, color: "#7c3aed", badge: "#1 Global" },
  { label: "Fenômeno",       tmdbId: 550,    type: "movie" as const, color: "#e50914", badge: "Cult" },
  { label: "Imperdível",     tmdbId: 278,    type: "movie" as const, color: "#f59e0b", badge: "Clássico" },
  { label: "Nova Revelação", tmdbId: 299536, type: "movie" as const, color: "#22c55e", badge: "Trending" },
  { label: "Maratona Certa", tmdbId: 60735,  type: "tv"    as const, color: "#06b6d4", badge: "10 Temp." },
  { label: "Indicação da IA",tmdbId: 238,    type: "movie" as const, color: "#a78bfa", badge: "IA Pick" },
];

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
const itemTitle = (item: any) => item.title ?? item.name ?? "Sem título";
const itemIsMovie = (item: any) => item.media_type === "movie" || (!!item.title && !item.name);
const itemRating = (item: any): string | null => {
  const v = item.vote_average;
  if (!v || v === 0) return null;
  return v.toFixed(1);
};

async function tmdbFetch<T = any>(path: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${TMDB_BASE}${path}${sep}api_key=${TMDB_KEY}&language=pt-BR`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════ COMPONENTS ══════════════════════════════════════════════

// ─── 1. SECTION HEADER ────────────────────────────────────────────────────────
function SectionHeader({
  title, subtitle, icon, accent = RED, badge, onSeeAll,
}: {
  title: string; subtitle?: string; icon?: keyof typeof Feather.glyphMap;
  accent?: string; badge?: string; onSeeAll?: () => void;
}) {
  return (
    <View style={sh.row}>
      <View style={sh.left}>
        {icon && (
          <View style={[sh.iconWrap, { backgroundColor: accent + "22" }]}>
            <Feather name={icon} size={14} color={accent} />
          </View>
        )}
        <View>
          <View style={sh.titleRow}>
            <Text style={sh.title}>{title}</Text>
            {badge && (
              <View style={[sh.badge, { backgroundColor: accent + "28", borderColor: accent + "55" }]}>
                <Text style={[sh.badgeTxt, { color: accent }]}>{badge}</Text>
              </View>
            )}
          </View>
          {subtitle && <Text style={sh.sub}>{subtitle}</Text>}
        </View>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} style={sh.seeAll} hitSlop={12}>
          <Text style={[sh.seeAllTxt, { color: accent }]}>Ver tudo</Text>
          <Feather name="chevron-right" size={13} color={accent} />
        </Pressable>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 14, marginTop: 6 },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  badgeTxt: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  sub: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllTxt: { fontSize: 12, fontWeight: "700" },
});

// ─── 2. SECTION DIVIDER ───────────────────────────────────────────────────────
function SectionDivider({ label, accent = RED }: { label: string; accent?: string }) {
  return (
    <View style={[sdiv.row, { marginBottom: 20 }]}>
      <View style={[sdiv.line, { backgroundColor: accent + "33" }]} />
      <View style={[sdiv.pill, { borderColor: accent + "55", backgroundColor: accent + "14" }]}>
        <Text style={[sdiv.txt, { color: accent }]}>{label}</Text>
      </View>
      <View style={[sdiv.line, { backgroundColor: accent + "33" }]} />
    </View>
  );
}
const sdiv = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginTop: 4 },
  line: { flex: 1, height: 1 },
  pill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, marginHorizontal: 12 },
  txt: { fontSize: 9, fontWeight: "900", letterSpacing: 2 },
});

// ─── 3. CINEMATIC HERO BANNER (full-bleed, auto-scroll, 21:9) ─────────────────
function CinematicHero({ items }: { items: any[] }) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(0);
  const prog = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (items.length < 2) return;
    const iv = setInterval(() => {
      setIdx((p) => {
        const n = (p + 1) % items.length;
        scrollRef.current?.scrollTo({ x: n * SW, animated: true });
        return n;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, [items.length]);

  useEffect(() => {
    Animated.timing(prog, { toValue: 1, duration: 4800, useNativeDriver: false }).start(() => prog.setValue(0));
  }, [idx]);

  if (!items.length) return null;

  return (
    <View style={hero.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}
      >
        {items.map((item) => {
          const title = itemTitle(item);
          const img = IMG(item.backdrop_path, "w1280") ?? IMG(item.poster_path, "w780");
          const rating = itemRating(item);
          const isM = itemIsMovie(item);
          const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);

          return (
            <Pressable
              key={item.id}
              style={{ width: SW }}
              onPress={() => router.push({ pathname: "/detail", params: { type: isM ? "movie" : "tv", id: String(item.id), title } })}
            >
              {img ? (
                <Image source={{ uri: img }} style={hero.image} contentFit="cover" transition={300} />
              ) : (
                <View style={[hero.image, { backgroundColor: "#1a1a2e" }]} />
              )}
              <LinearGradient
                colors={["rgba(5,5,8,0)", "rgba(5,5,8,0.25)", "rgba(5,5,8,0.7)", "rgba(5,5,8,0.97)", BG]}
                locations={[0, 0.28, 0.55, 0.82, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* Side gradient */}
              <LinearGradient
                colors={[BG, "transparent", "transparent", BG]}
                start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={hero.content}>
                <View style={hero.metaRow}>
                  <View style={[hero.typeBadge, { backgroundColor: isM ? RED : "#7c3aed" }]}>
                    <Text style={hero.typeTxt}>{isM ? "FILME" : "SÉRIE"}</Text>
                  </View>
                  {rating && (
                    <View style={hero.ratingPill}>
                      <Text style={hero.ratingTxt}>⭐ {rating}</Text>
                    </View>
                  )}
                  {year ? <Text style={hero.year}>{year}</Text> : null}
                </View>
                <Text style={hero.title} numberOfLines={2}>{title}</Text>
                {item.overview ? (
                  <Text style={hero.overview} numberOfLines={2}>{item.overview}</Text>
                ) : null}
                <View style={hero.actions}>
                  <Pressable
                    style={hero.playBtn}
                    onPress={() => router.push({ pathname: "/detail", params: { type: isM ? "movie" : "tv", id: String(item.id), title } })}
                  >
                    <Feather name="play" size={14} color="#fff" />
                    <Text style={hero.playTxt}>Assistir</Text>
                  </Pressable>
                  <Pressable
                    style={hero.infoBtn}
                    onPress={() => router.push({ pathname: "/detail", params: { type: isM ? "movie" : "tv", id: String(item.id), title } })}
                  >
                    <Feather name="plus" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={hero.infoTxt}>Minha Lista</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Dots */}
      <View style={hero.dotsRow}>
        {items.map((_, i) => (
          <Animated.View
            key={i}
            style={[
              hero.dot,
              i === idx && { width: 22, backgroundColor: RED },
              i !== idx && { width: 5, backgroundColor: "rgba(255,255,255,0.3)" },
            ]}
          />
        ))}
      </View>

      {/* Progress bar */}
      <View style={hero.progressBg}>
        <Animated.View
          style={[hero.progressFg, { width: prog.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
        />
      </View>
    </View>
  );
}
const HERO_H = SW * 0.62;
const hero = StyleSheet.create({
  wrap: { marginBottom: 24, position: "relative" },
  image: { width: SW, height: HERO_H },
  content: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, paddingBottom: 38 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1.2 },
  ratingPill: { backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  ratingTxt: { fontSize: 11, color: "#fff", fontWeight: "700" },
  year: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: -0.6, lineHeight: 28, marginBottom: 6 },
  overview: { fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 17, marginBottom: 14 },
  actions: { flexDirection: "row", gap: 10 },
  playBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: RED, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, ...Platform.select({ ios: { shadowColor: RED, shadowRadius: 10, shadowOpacity: 0.55, shadowOffset: { width: 0, height: 0 } } }) },
  playTxt: { fontSize: 14, fontWeight: "800", color: "#fff" },
  infoBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12 },
  infoTxt: { fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  dotsRow: { position: "absolute", bottom: 14, left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5 },
  dot: { height: 4, borderRadius: 2 },
  progressBg: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: "rgba(255,255,255,0.08)" },
  progressFg: { height: 2, backgroundColor: RED },
});

// ─── 4. SPLIT BANNER (two items side by side, full width) ─────────────────────
function SplitBanner({ left, right }: { left: any; right: any }) {
  const router = useRouter();
  const navigate = (item: any) => router.push({ pathname: "/detail", params: { type: itemIsMovie(item) ? "movie" : "tv", id: String(item.id), title: itemTitle(item) } });
  const half = (SW - 48) / 2;

  const renderHalf = (item: any, accent: string) => {
    const img = IMG(item.poster_path, "w342") ?? IMG(item.backdrop_path, "w500");
    const title = itemTitle(item);
    const rating = itemRating(item);
    return (
      <Pressable
        onPress={() => navigate(item)}
        style={[splt.card, { width: half, borderColor: accent + "44" }]}
      >
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <LinearGradient colors={[accent + "33", "#111"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.93)"]}
          locations={[0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[splt.accentLine, { backgroundColor: accent }]} />
        <View style={splt.info}>
          {rating && <Text style={[splt.rating, { color: accent }]}>⭐ {rating}</Text>}
          <Text style={splt.title} numberOfLines={2}>{title}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={splt.row}>
      {renderHalf(left, RED)}
      {renderHalf(right, "#a78bfa")}
    </View>
  );
}
const splt = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 14 },
  card: { height: 200, borderRadius: 18, overflow: "hidden", borderWidth: 1, backgroundColor: "#111", justifyContent: "flex-end" },
  accentLine: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  info: { padding: 12 },
  rating: { fontSize: 11, fontWeight: "700", marginBottom: 4 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff", lineHeight: 18 },
});

// ─── 5. MAGAZINE BANNER (editorial: big left + 2 small right) ─────────────────
function MagazineBanner({ items }: { items: any[] }) {
  const router = useRouter();
  const navigate = (item: any) => router.push({ pathname: "/detail", params: { type: itemIsMovie(item) ? "movie" : "tv", id: String(item.id), title: itemTitle(item) } });
  if (items.length < 3) return null;
  const [big, ...smalls] = items;
  const bigImg = IMG(big.backdrop_path, "w780") ?? IMG(big.poster_path, "w500");

  return (
    <View style={mag.row}>
      {/* Big left card */}
      <Pressable onPress={() => navigate(big)} style={mag.bigCard}>
        {bigImg ? (
          <Image source={{ uri: bigImg }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.9)"]}
          locations={[0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[mag.editorialTag, { backgroundColor: RED }]}>
          <Text style={mag.editorialTxt}>DESTAQUE</Text>
        </View>
        <View style={mag.bigInfo}>
          <Text style={mag.bigTitle} numberOfLines={2}>{itemTitle(big)}</Text>
          {itemRating(big) && <Text style={mag.bigRating}>⭐ {itemRating(big)}</Text>}
        </View>
      </Pressable>

      {/* Right column */}
      <View style={mag.rightCol}>
        {smalls.slice(0, 2).map((item, i) => {
          const img = IMG(item.poster_path, "w185") ?? IMG(item.backdrop_path, "w500");
          return (
            <Pressable key={item.id} onPress={() => navigate(item)} style={mag.smallCard}>
              {img ? (
                <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
              )}
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
              <View style={[mag.smallAccent, { backgroundColor: i === 0 ? "#7c3aed" : "#f59e0b" }]} />
              <Text style={mag.smallTitle} numberOfLines={2}>{itemTitle(item)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
const MAG_H = 200;
const mag = StyleSheet.create({
  row: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 14 },
  bigCard: { flex: 1.4, height: MAG_H, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end" },
  editorialTag: { position: "absolute", top: 12, left: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  editorialTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1.5 },
  bigInfo: { padding: 12, gap: 4 },
  bigTitle: { fontSize: 15, fontWeight: "900", color: "#fff", lineHeight: 19 },
  bigRating: { fontSize: 11, color: "#fbbf24", fontWeight: "700" },
  rightCol: { flex: 1, gap: 8 },
  smallCard: { flex: 1, borderRadius: 14, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end" },
  smallAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2 },
  smallTitle: { fontSize: 11, fontWeight: "800", color: "#fff", padding: 8, lineHeight: 14 },
});

// ─── 6. STATS BANNER ──────────────────────────────────────────────────────────
function StatsBanner() {
  const stats = [
    { value: "20K+", label: "Títulos",    icon: "film",    color: RED },
    { value: "4K",   label: "Ultra HD",   icon: "monitor", color: "#06b6d4" },
    { value: "200+", label: "Canais",     icon: "radio",   color: "#22c55e" },
    { value: "5",    label: "Telas",      icon: "tablet",  color: "#f59e0b" },
  ];
  return (
    <View style={stb.card}>
      <LinearGradient
        colors={["rgba(229,9,20,0.12)", "rgba(0,0,0,0)", "rgba(6,182,212,0.08)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {stats.map((s) => (
        <View key={s.label} style={stb.item}>
          <Feather name={s.icon as any} size={16} color={s.color} />
          <Text style={[stb.value, { color: s.color }]}>{s.value}</Text>
          <Text style={stb.label}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}
const stb = StyleSheet.create({
  card: { flexDirection: "row", marginHorizontal: 20, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", backgroundColor: "rgba(255,255,255,0.03)", padding: 18, justifyContent: "space-around", marginBottom: 24 },
  item: { alignItems: "center", gap: 4 },
  value: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5 },
  label: { fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
});

// ─── 7. MOOD CARD (large, immersive, image-backed) ────────────────────────────
function MoodCard({ mood, onPress }: { mood: typeof MOODS[0]; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [imgPath, setImgPath] = useState<string | null>(null);

  useEffect(() => {
    const ep = mood.type === "tv" ? "tv" : "movie";
    tmdbFetch(`/${ep}/${mood.tmdbId}`).then((d) => setImgPath(d.backdrop_path ?? d.poster_path)).catch(() => {});
  }, [mood.tmdbId]);

  const img = imgPath ? IMG(imgPath, "w500") : null;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 30 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
    >
      <Animated.View style={[mc.card, { borderColor: mood.color + "55", transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: mood.color + "1a" }]} />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.42)", `${mood.color}cc`]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[mc.accentBar, { backgroundColor: mood.color }]} />
        <View style={mc.bottom}>
          <Text style={mc.emoji}>{mood.emoji}</Text>
          <Text style={mc.label}>{mood.label}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const MOOD_W = (SW - 52) / 2.2;
const MOOD_H = MOOD_W * 0.7;
const mc = StyleSheet.create({
  card: { width: MOOD_W, height: MOOD_H, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", borderWidth: 1.5, justifyContent: "flex-end" },
  accentBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  bottom: { padding: 10, gap: 3 },
  emoji: { fontSize: 22 },
  label: { fontSize: 13, fontWeight: "800", color: "#fff", lineHeight: 16 },
});

// ─── 8. GENRE PILL (compact pill with icon) ───────────────────────────────────
function GenrePill({ genre, onPress }: { genre: typeof GENRES[0]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[gp.pill, { backgroundColor: genre.color + "1a", borderColor: genre.color + "44" }]}
    >
      <View style={[gp.dot, { backgroundColor: genre.color }]} />
      <Text style={[gp.label, { color: genre.color }]}>{genre.label}</Text>
    </Pressable>
  );
}
const gp = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 30, borderWidth: 1, marginRight: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: "700" },
});

// ─── 9. GENRE SQUARE CARD (image-backed grid card) ────────────────────────────
function GenreSquareCard({ genre, onPress }: { genre: typeof GENRES[0]; onPress: () => void }) {
  const W = (SW - 52) / 3;
  return (
    <Pressable
      onPress={onPress}
      style={[gsq.card, { width: W, borderColor: genre.color + "44" }]}
    >
      <LinearGradient
        colors={[genre.color + "44", genre.color + "22", "#111"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Feather name={genre.icon as any} size={22} color={genre.color} />
      <Text style={[gsq.label, { color: "#fff" }]}>{genre.label}</Text>
    </Pressable>
  );
}
const gsq = StyleSheet.create({
  card: { aspectRatio: 1, borderRadius: 16, borderWidth: 1, overflow: "hidden", backgroundColor: "#111", alignItems: "center", justifyContent: "center", gap: 8 },
  label: { fontSize: 11, fontWeight: "800", textAlign: "center" },
});

// ─── 10. UNIVERSE CARD (franchise, with real TMDB image) ─────────────────────
function UniverseCard({ u, onPress }: { u: typeof UNIVERSES[0]; onPress: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    tmdbFetch(`/collection/${u.collectionId}`).then((d) => setImg(d.backdrop_path ?? d.poster_path)).catch(() => {});
  }, [u.collectionId]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 32 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
    >
      <Animated.View style={[uc.card, { borderColor: u.color + "55", transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: IMG(img, "w500")! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: u.color + "1a" }]} />
        )}
        <LinearGradient
          colors={[`${u.color}00`, `${u.color}55`, `${u.color}ee`]}
          locations={[0.1, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={uc.top}>
          <Text style={uc.emoji}>{u.emoji}</Text>
        </View>
        <View style={uc.bottom}>
          <Text style={uc.name}>{u.label}</Text>
          <View style={[uc.badgePill, { backgroundColor: "rgba(0,0,0,0.4)" }]}>
            <Text style={uc.badgeTxt}>{u.badge}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const UNI_W = SW * 0.42;
const uc = StyleSheet.create({
  card: { width: UNI_W, height: UNI_W * 1.3, borderRadius: 20, overflow: "hidden", backgroundColor: "#111", borderWidth: 1.5, justifyContent: "space-between" },
  top: { padding: 14 },
  emoji: { fontSize: 28 },
  bottom: { padding: 14, gap: 6 },
  name: { fontSize: 15, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
  badgePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeTxt: { fontSize: 9, color: "rgba(255,255,255,0.7)", fontWeight: "700" },
});

// ─── 11. DECADE CARD ─────────────────────────────────────────────────────────
function DecadeCard({ d, onPress }: { d: typeof DECADES[0]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [dec.card, { borderColor: d.color + "55", opacity: pressed ? 0.8 : 1 }]}
    >
      <LinearGradient
        colors={[d.color + "33", d.color + "11", "#0d0d16"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={dec.emoji}>{d.emoji}</Text>
      <Text style={[dec.decade, { color: d.color }]}>{d.label}</Text>
      <Text style={dec.range}>{d.year.slice(0, 4)}s</Text>
    </Pressable>
  );
}
const dec = StyleSheet.create({
  card: { width: 88, height: 88, borderRadius: 18, overflow: "hidden", backgroundColor: "#0d0d16", borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 3 },
  emoji: { fontSize: 22 },
  decade: { fontSize: 12, fontWeight: "900", letterSpacing: -0.5 },
  range: { fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: "700" },
});

// ─── 12. COUNTRY FLAG CARD ────────────────────────────────────────────────────
function CountryCard({ c, onPress }: { c: typeof COUNTRIES[0]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [cty.card, { borderColor: c.color + "44", opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={cty.flag}>{c.flag}</Text>
      <Text style={[cty.name, { color: c.color }]}>{c.label}</Text>
    </Pressable>
  );
}
const cty = StyleSheet.create({
  card: { width: 72, height: 80, borderRadius: 14, borderWidth: 1, backgroundColor: "rgba(255,255,255,0.03)", alignItems: "center", justifyContent: "center", gap: 6 },
  flag: { fontSize: 28 },
  name: { fontSize: 10, fontWeight: "800" },
});

// ─── 13. STREAMER CARD (streaming service) ────────────────────────────────────
function StreamerCard({ s, onPress }: { s: typeof STREAMERS[0]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[strc.card, { borderColor: s.color + "55" }]}
    >
      <LinearGradient colors={[s.color + "33", s.color + "0d"]} style={StyleSheet.absoluteFill} />
      <View style={[strc.iconWrap, { backgroundColor: s.color + "22" }]}>
        <Feather name={s.icon as any} size={20} color={s.color} />
      </View>
      <Text style={strc.name}>{s.name}</Text>
      <View style={[strc.badge, { backgroundColor: s.color + "22", borderColor: s.color + "44" }]}>
        <Text style={[strc.badgeTxt, { color: s.color }]}>{s.badge}</Text>
      </View>
    </Pressable>
  );
}
const strc = StyleSheet.create({
  card: { width: 108, height: 120, borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 7 },
  iconWrap: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 11, fontWeight: "900", color: "#fff", textAlign: "center" },
  badge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
});

// ─── 14. AWARD CARD (image-backed awards card) ────────────────────────────────
function AwardCard({ a, onPress }: { a: typeof AWARDS[0]; onPress: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    tmdbFetch(`/${a.type}/${a.tmdbId}`).then((d) => setImg(d.backdrop_path ?? d.poster_path)).catch(() => {});
  }, [a.tmdbId]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [aw.card, { borderColor: a.color + "55", opacity: pressed ? 0.85 : 1 }]}
    >
      {img ? (
        <Image source={{ uri: IMG(img, "w500")! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: a.color + "18" }]} />
      )}
      <LinearGradient colors={["transparent", a.color + "bb", a.color + "ee"]} locations={[0.2, 0.6, 1]} style={StyleSheet.absoluteFill} />
      <View style={[aw.badgePill, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <Text style={aw.emoji}>{a.emoji}</Text>
        <Text style={[aw.badgeTxt, { color: a.color }]}>{a.badge}</Text>
      </View>
      <Text style={aw.label}>{a.label}</Text>
    </Pressable>
  );
}
const AW_W = (SW - 52) / 2.3;
const aw = StyleSheet.create({
  card: { width: AW_W, height: AW_W * 1.35, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", borderWidth: 1.5, justifyContent: "flex-end", padding: 12, gap: 5 },
  badgePill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 2 },
  emoji: { fontSize: 12 },
  badgeTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  label: { fontSize: 13, fontWeight: "900", color: "#fff", lineHeight: 17 },
});

// ─── 15. LIVE CHANNEL CARD ────────────────────────────────────────────────────
function LiveChannelCard({ ch, onPress }: { ch: typeof LIVE_CHANNELS[0]; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [lch.card, { borderColor: ch.color + "55", opacity: pressed ? 0.8 : 1 }]}>
      <LinearGradient colors={[ch.color + "22", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />
      <View style={lch.pulseWrap}>
        <Animated.View style={[lch.pulseBg, { backgroundColor: ch.color + "33", transform: [{ scale: pulse }] }]} />
        <View style={[lch.liveDot, { backgroundColor: ch.color }]} />
      </View>
      <View style={[lch.iconWrap, { backgroundColor: ch.color + "22" }]}>
        <Feather name={ch.icon} size={22} color={ch.color} />
      </View>
      <Text style={lch.name}>{ch.name}</Text>
      <Text style={lch.sub}>{ch.sub}</Text>
      <View style={[lch.liveBtn, { backgroundColor: ch.color }]}>
        <Feather name="play" size={9} color="#fff" />
        <Text style={lch.liveTxt}>AO VIVO</Text>
      </View>
    </Pressable>
  );
}
const lch = StyleSheet.create({
  card: { width: 124, height: 156, borderRadius: 18, overflow: "hidden", backgroundColor: "#0d0d16", borderWidth: 1.5, alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12 },
  pulseWrap: { position: "absolute", top: 10, right: 10, alignItems: "center", justifyContent: "center" },
  pulseBg: { position: "absolute", width: 16, height: 16, borderRadius: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  iconWrap: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 12, fontWeight: "900", color: "#fff", textAlign: "center" },
  sub: { fontSize: 9, color: "rgba(255,255,255,0.45)", textAlign: "center", fontWeight: "600" },
  liveBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  liveTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
});

// ─── 16. WIDE LANDSCAPE CARD ─────────────────────────────────────────────────
function WideCard({ item, onPress }: { item: any; onPress: () => void }) {
  const img = IMG(item.backdrop_path, "w780") ?? IMG(item.poster_path, "w500");
  const rating = itemRating(item);
  const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
  const isM = itemIsMovie(item);
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 32 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start()}
    >
      <Animated.View style={[wc.card, { transform: [{ scale }] }]}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.92)"]}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[wc.badge, { backgroundColor: isM ? RED + "cc" : "#7c3aedcc" }]}>
          <Text style={wc.badgeTxt}>{isM ? "FILME" : "SÉRIE"}</Text>
        </View>
        <View style={wc.info}>
          <Text style={wc.title} numberOfLines={1}>{itemTitle(item)}</Text>
          <View style={wc.metaRow}>
            {year ? <Text style={wc.meta}>{year}</Text> : null}
            {year && rating ? <Text style={wc.dot}>·</Text> : null}
            {rating ? <Text style={wc.rating}>⭐ {rating}</Text> : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
const WC_W = SW * 0.72;
const wc = StyleSheet.create({
  card: { width: WC_W, height: WC_W * 0.56, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", marginRight: 12, ...Platform.select({ ios: { shadowColor: "#000", shadowRadius: 10, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 6 } }, android: { elevation: 8 } }) },
  badge: { position: "absolute", top: 10, left: 10, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  badgeTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  info: { position: "absolute", bottom: 10, left: 12, right: 12 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  meta: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "600" },
  dot: { fontSize: 11, color: "rgba(255,255,255,0.3)" },
  rating: { fontSize: 11, color: "#fbbf24", fontWeight: "700" },
});

// ─── 17. TALL POSTER CARD ─────────────────────────────────────────────────────
function TallPosterCard({ item, rank, onPress }: { item: any; rank?: number; onPress: () => void }) {
  const img = IMG(item.poster_path, "w342");
  const rating = itemRating(item);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [tp.wrap, { opacity: pressed ? 0.85 : 1 }]}>
      {rank !== undefined && (
        <Text style={tp.rank}>{rank}</Text>
      )}
      <View style={tp.card}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.88)"]}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        {rating && (
          <View style={tp.ratingWrap}>
            <Text style={tp.rating}>⭐ {rating}</Text>
          </View>
        )}
        <Text style={tp.title} numberOfLines={2}>{itemTitle(item)}</Text>
      </View>
    </Pressable>
  );
}
const TP_W = SW * 0.28;
const tp = StyleSheet.create({
  wrap: { width: TP_W + 16, alignItems: "flex-end", marginRight: 4 },
  rank: { position: "absolute", bottom: -2, left: -4, fontSize: 72, fontWeight: "900", color: "rgba(255,255,255,0.1)", lineHeight: 72, zIndex: 0 },
  card: { width: TP_W, height: TP_W * 1.5, borderRadius: 14, overflow: "hidden", backgroundColor: "#111", justifyContent: "flex-end", zIndex: 1, ...Platform.select({ ios: { shadowColor: "#000", shadowRadius: 8, shadowOpacity: 0.4, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 6 } }) },
  ratingWrap: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  rating: { fontSize: 9, fontWeight: "700", color: "#fbbf24" },
  title: { fontSize: 10, fontWeight: "800", color: "#fff", padding: 6, lineHeight: 13 },
});

// ─── 18. NEON GLOW CARD ───────────────────────────────────────────────────────
function NeonCard({ item, accentColor = RED, onPress }: { item: any; accentColor?: string; onPress: () => void }) {
  const img = IMG(item.backdrop_path, "w780") ?? IMG(item.poster_path, "w500");
  const rating = itemRating(item);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [nc.card, { borderColor: accentColor, opacity: pressed ? 0.85 : 1 }, Platform.OS === "ios" && { shadowColor: accentColor, shadowRadius: 12, shadowOpacity: 0.6, shadowOffset: { width: 0, height: 0 } }]}
    >
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: accentColor + "1a" }]} />
      )}
      <LinearGradient
        colors={["transparent", `${accentColor}44`, `${accentColor}cc`]}
        locations={[0.2, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[nc.glowLine, { backgroundColor: accentColor }]} />
      <View style={nc.info}>
        {rating && <Text style={[nc.rating, { color: accentColor }]}>⭐ {rating}</Text>}
        <Text style={nc.title} numberOfLines={2}>{itemTitle(item)}</Text>
      </View>
    </Pressable>
  );
}
const NC_W = SW * 0.52;
const nc = StyleSheet.create({
  card: { width: NC_W, height: NC_W * 0.8, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", borderWidth: 1.5, justifyContent: "flex-end" },
  glowLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, opacity: 0.7 },
  info: { padding: 12, gap: 3 },
  rating: { fontSize: 11, fontWeight: "700" },
  title: { fontSize: 14, fontWeight: "900", color: "#fff", letterSpacing: -0.3 },
});

// ─── 19. GLASS CARD ───────────────────────────────────────────────────────────
function GlassCard({ item, onPress }: { item: any; onPress: () => void }) {
  const img = IMG(item.backdrop_path, "w780") ?? IMG(item.poster_path, "w500");
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [gc.outer, { opacity: pressed ? 0.85 : 1 }]}>
      {img ? (
        <Image source={{ uri: img }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e", borderRadius: 18 }]} />
      )}
      <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.75)"]} locations={[0.3, 1]} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
      <BlurView intensity={18} tint="dark" style={gc.blur}>
        <Text style={gc.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <Text style={gc.meta}>{itemIsMovie(item) ? "Filme" : "Série"}</Text>
      </BlurView>
    </Pressable>
  );
}
const GC_W = SW * 0.62;
const gc = StyleSheet.create({
  outer: { width: GC_W, height: GC_W * 0.6, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", marginRight: 12, justifyContent: "flex-end" },
  blur: { padding: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" },
  title: { fontSize: 14, fontWeight: "800", color: "#fff" },
  meta: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "600", marginTop: 2 },
});

// ─── 20. HORIZONTAL ITEM CARD (search result style) ───────────────────────────
function HorizontalCard({ item, onPress, rank }: { item: any; onPress: () => void; rank?: number }) {
  const img = IMG(item.poster_path, "w185") ?? IMG(item.backdrop_path, "w500");
  const rating = itemRating(item);
  const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
  const isM = itemIsMovie(item);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [hc.row, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={hc.posterWrap}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e" }]} />
        )}
        {rank !== undefined && (
          <View style={hc.rankBadge}>
            <Text style={hc.rankTxt}>#{rank}</Text>
          </View>
        )}
      </View>
      <View style={hc.info}>
        <Text style={hc.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <View style={hc.metaRow}>
          <View style={[hc.typePill, { backgroundColor: isM ? RED + "22" : "#7c3aed22" }]}>
            <Text style={[hc.typeTxt, { color: isM ? RED : "#a78bfa" }]}>{isM ? "Filme" : "Série"}</Text>
          </View>
          {year ? <Text style={hc.year}>{year}</Text> : null}
          {rating ? <Text style={hc.rating}>⭐ {rating}</Text> : null}
        </View>
        {item.overview ? (
          <Text style={hc.overview} numberOfLines={2}>{item.overview}</Text>
        ) : null}
      </View>
      <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.2)" />
    </Pressable>
  );
}
const hc = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  posterWrap: { width: 62, height: 88, borderRadius: 12, overflow: "hidden", backgroundColor: "#1a1a2e" },
  rankBadge: { position: "absolute", top: 4, left: 4, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 5 },
  rankTxt: { fontSize: 8, fontWeight: "900", color: "#fbbf24" },
  info: { flex: 1, gap: 5 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff", lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typeTxt: { fontSize: 9, fontWeight: "800" },
  year: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "600" },
  rating: { fontSize: 11, color: "#fbbf24", fontWeight: "700" },
  overview: { fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 16 },
});

// ─── 21. EDITOR'S PICK CARD ───────────────────────────────────────────────────
function EditorsPickCard({ ep, onPress }: { ep: typeof EDITORS_PICKS[0]; onPress: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    tmdbFetch(`/${ep.type}/${ep.tmdbId}`).then((d) => setImg(d.backdrop_path ?? d.poster_path)).catch(() => {});
  }, [ep.tmdbId]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [epc.card, { borderColor: ep.color + "55", opacity: pressed ? 0.85 : 1 }]}
    >
      {img ? (
        <Image source={{ uri: IMG(img, "w780")! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ep.color + "1a" }]} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.93)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[epc.topAccent, { backgroundColor: ep.color }]} />
      <View style={[epc.badgePill, { backgroundColor: ep.color + "cc" }]}>
        <Text style={epc.badgeTxt}>{ep.badge}</Text>
      </View>
      <View style={epc.bottom}>
        <Text style={epc.label}>{ep.label}</Text>
        <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
      </View>
    </Pressable>
  );
}
const EPC_W = (SW - 52) / 2.1;
const epc = StyleSheet.create({
  card: { width: EPC_W, height: EPC_W * 1.1, borderRadius: 18, overflow: "hidden", backgroundColor: "#111", borderWidth: 1.5, justifyContent: "flex-end" },
  topAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  badgePill: { position: "absolute", top: 12, right: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.8 },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 },
  label: { fontSize: 13, fontWeight: "900", color: "#fff", flex: 1, lineHeight: 17 },
});

// ─── 22. INLINE PROMO BANNER ──────────────────────────────────────────────────
function InlineBanner({
  icon, title, sub, accent, onPress,
}: { icon: keyof typeof Feather.glyphMap; title: string; sub: string; accent: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [ib.card, { borderColor: accent + "44", opacity: pressed ? 0.85 : 1 }]}
    >
      <LinearGradient
        colors={[accent + "1a", accent + "08", "#050508"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[ib.iconWrap, { backgroundColor: accent + "22" }]}>
        <Feather name={icon} size={22} color={accent} />
      </View>
      <View style={ib.texts}>
        <Text style={ib.title}>{title}</Text>
        <Text style={ib.sub}>{sub}</Text>
      </View>
      <View style={[ib.btn, { backgroundColor: accent }]}>
        <Text style={ib.btnTxt}>Ver</Text>
        <Feather name="arrow-right" size={12} color="#fff" />
      </View>
    </Pressable>
  );
}
const ib = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 20, borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14, overflow: "hidden" },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff" },
  sub: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
  btn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  btnTxt: { fontSize: 12, fontWeight: "700", color: "#fff" },
});

// ─── 23. SCROLL TOP FAB ───────────────────────────────────────────────────────
function ScrollTopFab({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(opacity, { toValue: visible ? 1 : 0, useNativeDriver: true, speed: 20 }).start();
  }, [visible]);
  return (
    <Animated.View style={[fab.wrap, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      <Pressable onPress={onPress} style={fab.btn}>
        <LinearGradient colors={[RED, "#c0070f"]} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />
        <Feather name="arrow-up" size={18} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}
const fab = StyleSheet.create({
  wrap: { position: "absolute", bottom: 110, right: 20, zIndex: 99 },
  btn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", overflow: "hidden", ...Platform.select({ ios: { shadowColor: RED, shadowRadius: 12, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 12 } }) },
});

// ─── 24. SKELETON LOADER ─────────────────────────────────────────────────────
function Skeleton({ width, height, borderRadius = 12 }: { width: number | string; height: number; borderRadius?: number }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={{ width: width as any, height, borderRadius, backgroundColor: "rgba(255,255,255,0.07)", opacity }} />
  );
}

// ─── 25. PEOPLE CIRCLE CARD ──────────────────────────────────────────────────
function PersonCircle({ item, role, onPress }: { item: any; role?: string; onPress: () => void }) {
  const img = IMG(item.profile_path, "w185");
  return (
    <Pressable onPress={onPress} style={pc.wrap}>
      <View style={pc.circle}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }]}>
            <Feather name="user" size={26} color="rgba(255,255,255,0.2)" />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <Text style={pc.name} numberOfLines={2}>{item.name ?? "—"}</Text>
      {role && <Text style={pc.role} numberOfLines={1}>{role}</Text>}
    </Pressable>
  );
}
const pc = StyleSheet.create({
  wrap: { width: 80, alignItems: "center", gap: 6 },
  circle: { width: 76, height: 76, borderRadius: 38, overflow: "hidden", backgroundColor: "#1a1a2e", borderWidth: 2, borderColor: "rgba(255,255,255,0.1)" },
  name: { fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 14 },
  role: { fontSize: 9, color: "rgba(255,255,255,0.35)", textAlign: "center" },
});

// ═══════════════════ MAIN SCREEN ═════════════════════════════════════════════
export default function DescobrirScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAvailable, byType } = useCatalog();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const scrollRef = useRef<ScrollView>(null);
  const [showFab, setShowFab] = useState(false);

  // Data state
  const [heroBanners, setHeroBanners] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<any[]>([]);
  const [topRatedSeries, setTopRatedSeries] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any[]>([]);
  const [popularSeries, setPopularSeries] = useState<any[]>([]);
  const [animeSeries, setAnimeSeries] = useState<any[]>([]);
  const [popularPeople, setPopularPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [
        trendData,
        nowData,
        topMoviesData,
        topSeriesData,
        popSeriesData,
        animeData,
        peopleData,
      ] = await Promise.allSettled([
        tmdbFetch("/trending/all/week"),
        tmdbFetch("/movie/now_playing"),
        tmdbFetch("/movie/top_rated"),
        tmdbFetch("/tv/top_rated"),
        tmdbFetch("/tv/popular"),
        tmdbFetch("/discover/tv?with_genres=16&with_original_language=ja"),
        tmdbFetch("/person/popular"),
      ]);

      if (trendData.status === "fulfilled") {
        const items = trendData.value.results ?? [];
        setTrending(items.slice(0, 15));
      }
      if (nowData.status === "fulfilled") {
        const items = (nowData.value.results ?? []).filter((m: any) => m.backdrop_path);
        const available = items.filter((m: any) => isAvailable(m.id));
        setHeroBanners((available.length >= 3 ? available : items).slice(0, 8));
        setNowPlaying(items.slice(0, 12));
      }
      if (topMoviesData.status === "fulfilled") setTopRatedMovies(topMoviesData.value.results?.slice(0, 12) ?? []);
      if (topSeriesData.status === "fulfilled") setTopRatedSeries(topSeriesData.value.results?.slice(0, 12) ?? []);
      if (popSeriesData.status === "fulfilled") setPopularSeries(popSeriesData.value.results?.slice(0, 12) ?? []);
      if (animeData.status === "fulfilled") setAnimeSeries(animeData.value.results?.slice(0, 10) ?? []);
      if (peopleData.status === "fulfilled") setPopularPeople(peopleData.value.results?.slice(0, 12) ?? []);
    } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAvailable]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const navigate = useCallback((item: any) => {
    router.push({ pathname: "/detail", params: { type: itemIsMovie(item) ? "movie" : "tv", id: String(item.id), title: itemTitle(item) } });
  }, [router]);

  const handleMood = useCallback((m: typeof MOODS[0]) => {
    router.push({ pathname: "/genre-browse", params: { genre_id: m.genre, type: m.type, title: m.label } });
  }, [router]);

  const handleGenre = useCallback((g: typeof GENRES[0]) => {
    router.push({ pathname: "/genre-browse", params: { genre_id: g.genreId, type: g.type, title: g.label } });
  }, [router]);

  // Pre-compute splits & magazines for stable rendering
  const splitPair = useMemo(() => trending.length >= 2 ? [trending[0], trending[1]] as [any, any] : null, [trending]);
  const magazineTriple = useMemo(() => trending.slice(2, 5), [trending]);
  const neonItems = useMemo(() => topRatedMovies.slice(0, 8), [topRatedMovies]);
  const glassItems = useMemo(() => popularSeries.slice(0, 6), [popularSeries]);
  const wideItems = useMemo(() => topRatedSeries.slice(0, 8), [topRatedSeries]);

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* ── HEADER ── */}
      <View style={[s.header, { paddingTop: topPad + 10 }]}>
        <LinearGradient colors={[BG, BG, "transparent"]} locations={[0, 0.7, 1]} style={StyleSheet.absoluteFill} />
        <View style={{ zIndex: 1 }}>
          <Text style={s.headerTitle}>Descobrir</Text>
          <Text style={s.headerSub}>Explore por humor, gênero, universo e mais</Text>
        </View>
        <Pressable style={[s.headerSearchBtn, { zIndex: 1 }]} onPress={() => router.push("/(tabs)/search")}>
          <Feather name="search" size={18} color="rgba(255,255,255,0.75)" />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        scrollEventThrottle={16}
        onScroll={(e) => setShowFab(e.nativeEvent.contentOffset.y > 400)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RED} colors={[RED]} />
        }
      >
        {/* ── 1. CINEMATIC HERO ── */}
        {loading ? (
          <Skeleton width={SW} height={HERO_H} borderRadius={0} />
        ) : (
          <CinematicHero items={heroBanners} />
        )}

        {/* ── 2. STATS ── */}
        <StatsBanner />

        {/* ── 3. POR HUMOR ── */}
        <SectionDivider label="EXPLORE" accent={RED} />
        <SectionHeader
          title="Por Humor"
          subtitle="Como você está se sentindo?"
          icon="smile"
          accent={RED}
        />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.hpad}
          decelerationRate="fast"
          snapToInterval={MOOD_W + 12}
          snapToAlignment="start"
        >
          {MOODS.map((m) => (
            <View key={m.label} style={{ marginRight: 12 }}>
              <MoodCard mood={m} onPress={() => handleMood(m)} />
            </View>
          ))}
        </ScrollView>

        {/* ── 4. SPLIT BANNER ── */}
        {!loading && splitPair && (
          <View style={{ marginVertical: 14 }}>
            <SectionHeader title="Em Alta Agora" icon="trending-up" accent="#f59e0b" badge="SEMANA" />
            <SplitBanner left={splitPair[0]} right={splitPair[1]} />
          </View>
        )}

        {/* ── 5. MAGAZINE BANNER ── */}
        {!loading && magazineTriple.length >= 3 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title="Editorial da Semana" icon="book-open" accent="#a78bfa" subtitle="Seleção especial dos editores" />
            <MagazineBanner items={magazineTriple} />
          </View>
        )}

        {/* ── 6. GÊNEROS (grid 3×4) ── */}
        <SectionDivider label="GÊNEROS" accent="#06b6d4" />
        <SectionHeader title="Gêneros" subtitle="Filtre pelo que você ama" icon="tag" accent="#06b6d4" />
        <View style={s.genreGrid}>
          {GENRES.map((g) => (
            <GenreSquareCard key={g.label} genre={g} onPress={() => handleGenre(g)} />
          ))}
        </View>

        {/* ── 7. GÊNERO PILLS ── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 8, paddingBottom: 16 }]}
        >
          {GENRES.map((g) => (
            <GenrePill key={g.label + "pill"} genre={g} onPress={() => handleGenre(g)} />
          ))}
        </ScrollView>

        {/* ── 8. TOP 10 POSTER CARDS ── */}
        <SectionDivider label="TOP 10" accent={RED} />
        <SectionHeader
          title="Top 10 Global"
          subtitle="Os mais assistidos do planeta"
          icon="award"
          accent={RED}
          badge="GLOBAL"
          onSeeAll={() => router.push("/(tabs)/search")}
        />
        {loading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.hpad, { gap: 12 }]}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} width={TP_W + 16} height={TP_W * 1.5} />)}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.hpad, { gap: 10, alignItems: "flex-end" }]}
            decelerationRate="fast"
          >
            {trending.slice(0, 10).map((item, i) => (
              <TallPosterCard key={item.id} item={item} rank={i + 1} onPress={() => navigate(item)} />
            ))}
          </ScrollView>
        )}

        {/* ── 9. UNIVERSOS & FRANQUIAS ── */}
        <SectionDivider label="UNIVERSOS" accent="#a78bfa" />
        <SectionHeader
          title="Universos & Franquias"
          subtitle="Mergulhe nos universos épicos"
          icon="globe"
          accent="#a78bfa"
          onSeeAll={() => router.push("/(tabs)/franquias")}
        />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 12 }]}
          decelerationRate="fast"
          snapToInterval={UNI_W + 12}
          snapToAlignment="start"
        >
          {UNIVERSES.map((u) => (
            <UniverseCard
              key={u.label}
              u={u}
              onPress={() => router.push({ pathname: "/collection", params: { id: u.collectionId, title: u.label } })}
            />
          ))}
        </ScrollView>

        {/* ── 10. NEON GLOW CARDS (top rated movies) ── */}
        <SectionDivider label="ACLAMADOS" accent="#22c55e" />
        <SectionHeader
          title="Os Melhores de Todos os Tempos"
          subtitle="Filmes com nota acima de 8.0"
          icon="star"
          accent="#22c55e"
          badge="IMDB TOP"
        />
        {loading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.hpad, { gap: 12 }]}>
            {[1, 2, 3].map((i) => <Skeleton key={i} width={NC_W} height={NC_W * 0.8} />)}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.hpad, { gap: 12 }]}
            decelerationRate="fast"
            snapToInterval={NC_W + 12}
          >
            {neonItems.map((item, i) => (
              <NeonCard
                key={item.id}
                item={item}
                accentColor={["#22c55e", "#06b6d4", "#f59e0b", "#a78bfa", "#ec4899", "#ef4444", "#22d3ee", "#34d399"][i % 8]}
                onPress={() => navigate(item)}
              />
            ))}
          </ScrollView>
        )}

        {/* ── 11. WIDE LANDSCAPE — séries populares ── */}
        <SectionDivider label="SÉRIES" accent="#7c3aed" />
        <SectionHeader
          title="Séries para Maratonar"
          subtitle="Episódios esperando por você"
          icon="tv"
          accent="#7c3aed"
          onSeeAll={() => router.push("/(tabs)/search")}
        />
        {loading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.hpad, { gap: 12 }]}>
            {[1, 2, 3].map((i) => <Skeleton key={i} width={WC_W} height={WC_W * 0.56} />)}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.hpad, { gap: 0 }]}
            decelerationRate="fast"
            snapToInterval={WC_W + 12}
          >
            {wideItems.map((item) => (
              <WideCard key={item.id} item={item} onPress={() => navigate(item)} />
            ))}
          </ScrollView>
        )}

        {/* ── 12. PREMIAÇÕES ── */}
        <SectionDivider label="PREMIAÇÕES" accent="#f59e0b" />
        <SectionHeader
          title="Vencedores & Indicados"
          subtitle="O melhor do cinema e TV premiados"
          icon="award"
          accent="#f59e0b"
          badge="AWARDS"
        />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 12 }]}
          decelerationRate="fast"
          snapToInterval={AW_W + 12}
        >
          {AWARDS.map((a) => (
            <AwardCard
              key={a.label}
              a={a}
              onPress={() => router.push({ pathname: "/detail", params: { type: a.type, id: String(a.tmdbId), title: a.label } })}
            />
          ))}
        </ScrollView>

        {/* ── 13. POR PAÍS ── */}
        <SectionDivider label="POR PAÍS" accent="#34d399" />
        <SectionHeader title="Cinema Mundial" subtitle="Descubra produções de todo o planeta" icon="map-pin" accent="#34d399" />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 10 }]}
        >
          {COUNTRIES.map((c) => (
            <CountryCard
              key={c.code}
              c={c}
              onPress={() => router.push({ pathname: "/genre-browse", params: { region: c.code, type: "movie", title: `Cinema ${c.label}` } })}
            />
          ))}
        </ScrollView>

        {/* ── 14. GLASS CARDS (popular series) ── */}
        <SectionDivider label="POPULARES" accent="#06b6d4" />
        <SectionHeader
          title="Populares no Mundo Todo"
          subtitle="O que a galera está assistindo"
          icon="trending-up"
          accent="#06b6d4"
        />
        {loading ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.hpad, { gap: 12 }]}>
            {[1, 2, 3].map((i) => <Skeleton key={i} width={GC_W} height={GC_W * 0.6} />)}
          </ScrollView>
        ) : (
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.hpad, { gap: 0 }]}
            decelerationRate="fast"
            snapToInterval={GC_W + 12}
          >
            {glassItems.map((item) => (
              <GlassCard key={item.id} item={item} onPress={() => navigate(item)} />
            ))}
          </ScrollView>
        )}

        {/* ── 15. POR DÉCADA ── */}
        <SectionDivider label="DÉCADAS" accent="#d97706" />
        <SectionHeader title="Viagem no Tempo" subtitle="Explore o cinema por década" icon="clock" accent="#d97706" />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 10 }]}
        >
          {DECADES.map((d) => (
            <DecadeCard
              key={d.label}
              d={d}
              onPress={() => router.push({ pathname: "/genre-browse", params: { decade: d.year, type: "movie", title: d.label } })}
            />
          ))}
        </ScrollView>

        {/* ── 16. SERVIÇOS DE STREAMING ── */}
        <SectionDivider label="PLATAFORMAS" accent="#a78bfa" />
        <SectionHeader title="Por Plataforma" subtitle="Onde assistir cada conteúdo" icon="play-circle" accent="#a78bfa" />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 10 }]}
          decelerationRate="fast"
        >
          {STREAMERS.map((sv) => (
            <StreamerCard
              key={sv.name}
              s={sv}
              onPress={() => router.push("/(tabs)/search")}
            />
          ))}
        </ScrollView>

        {/* ── 17. EDITOR'S PICKS ── */}
        <SectionDivider label="CURADORIA" accent="#ec4899" />
        <SectionHeader
          title="Escolha do Editor"
          subtitle="Seleções exclusivas para você"
          icon="bookmark"
          accent="#ec4899"
          badge="EXCLUSIVO"
        />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 12 }]}
          decelerationRate="fast"
          snapToInterval={EPC_W + 12}
        >
          {EDITORS_PICKS.map((ep) => (
            <EditorsPickCard
              key={ep.label}
              ep={ep}
              onPress={() => router.push({ pathname: "/detail", params: { type: ep.type, id: String(ep.tmdbId), title: ep.label } })}
            />
          ))}
        </ScrollView>

        {/* ── 18. ANIME ── */}
        {animeSeries.length > 0 && (
          <>
            <SectionDivider label="ANIME" accent="#f97316" />
            <SectionHeader
              title="Anime em Destaque"
              subtitle="Os melhores animes do momento"
              icon="feather"
              accent="#f97316"
              badge="⛩️ JAPÃO"
            />
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.hpad, { gap: 12 }]}
              decelerationRate="fast"
            >
              {animeSeries.map((item) => (
                <NeonCard
                  key={item.id}
                  item={item}
                  accentColor="#f97316"
                  onPress={() => navigate(item)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── 19. HORIZONTAL LIST — top rated (list format) ── */}
        <SectionDivider label="MELHORES FILMES" accent={RED} />
        <SectionHeader
          title="Filmes Indispensáveis"
          subtitle="Avaliados com 8.5+ no TMDB"
          icon="film"
          accent={RED}
          onSeeAll={() => router.push("/(tabs)/search")}
        />
        {loading ? (
          <View style={{ gap: 1 }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} width={SW} height={88} borderRadius={0} />)}
          </View>
        ) : (
          topRatedMovies.slice(0, 6).map((item, i) => (
            <HorizontalCard
              key={item.id}
              item={item}
              rank={i + 1}
              onPress={() => navigate(item)}
            />
          ))
        )}

        {/* ── 20. INLINE PROMO — busca ── */}
        <View style={{ marginTop: 20 }}>
          <InlineBanner
            icon="search"
            title="Busca inteligente"
            sub="Encontre qualquer filme, série ou canal"
            accent="#06b6d4"
            onPress={() => router.push("/(tabs)/search")}
          />
        </View>

        {/* ── 21. PESSOAS POPULARES ── */}
        {popularPeople.length > 0 && (
          <>
            <SectionDivider label="PESSOAS" accent="#fbbf24" />
            <SectionHeader title="Em Destaque" subtitle="Atores e diretores do momento" icon="users" accent="#fbbf24" />
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.hpad, { gap: 14 }]}
            >
              {popularPeople.slice(0, 12).map((p) => (
                <PersonCircle
                  key={p.id}
                  item={p}
                  role={p.known_for_department}
                  onPress={() => router.push({ pathname: "/search", params: { query: p.name } })}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── 22. CANAIS AO VIVO ── */}
        <SectionDivider label="AO VIVO" accent="#ef4444" />
        <SectionHeader
          title="Canais ao Vivo"
          subtitle="Transmissões em tempo real"
          icon="radio"
          accent="#ef4444"
          badge="LIVE"
          onSeeAll={() => router.push("/(tabs)/channels")}
        />
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.hpad, { gap: 10 }]}
          decelerationRate="fast"
        >
          {LIVE_CHANNELS.map((ch) => (
            <LiveChannelCard
              key={ch.name}
              ch={ch}
              onPress={() => router.push("/(tabs)/channels")}
            />
          ))}
        </ScrollView>

        {/* ── 23. NOW PLAYING WIDE (horizontal) ── */}
        {nowPlaying.length > 0 && (
          <>
            <SectionDivider label="NOS CINEMAS" accent="#22d3ee" />
            <SectionHeader title="Nos Cinemas Agora" subtitle="Lançamentos em cartaz" icon="film" accent="#22d3ee" badge="NOVO" />
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.hpad, { gap: 12 }]}
              decelerationRate="fast"
              snapToInterval={WC_W + 12}
            >
              {nowPlaying.slice(0, 8).map((item) => (
                <WideCard key={item.id} item={item} onPress={() => navigate(item)} />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── 24. INLINE PROMO — novidades ── */}
        <View style={{ marginTop: 10 }}>
          <InlineBanner
            icon="bell"
            title="Novidades & Em Breve"
            sub="Fique por dentro dos próximos lançamentos"
            accent="#f59e0b"
            onPress={() => router.push("/(tabs)/novidades")}
          />
          <InlineBanner
            icon="download"
            title="Downloads para assistir offline"
            sub="Baixe e assista sem internet"
            accent="#22c55e"
            onPress={() => router.push("/(tabs)/downloads")}
          />
        </View>

        {/* ── 25. BEST SERIES HORIZONTAL LIST ── */}
        <SectionDivider label="MELHORES SÉRIES" accent="#7c3aed" />
        <SectionHeader
          title="Séries Aclamadas pela Crítica"
          subtitle="Avaliadas com 8.5+ no TMDB"
          icon="tv"
          accent="#7c3aed"
          onSeeAll={() => router.push("/(tabs)/search")}
        />
        {topRatedSeries.slice(0, 6).map((item, i) => (
          <HorizontalCard key={item.id} item={item} rank={i + 1} onPress={() => navigate(item)} />
        ))}

        {/* ── FOOTER PROMO ── */}
        <View style={s.footer}>
          <LinearGradient
            colors={[RED + "22", "#7c3aed22"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={s.footerEmoji}>🎬</Text>
          <Text style={s.footerTitle}>NETPLAY Premium</Text>
          <Text style={s.footerSub}>20.000+ títulos · 4K · Sem anúncios</Text>
        </View>

      </ScrollView>

      {/* ── SCROLL TOP FAB ── */}
      <ScrollTopFab visible={showFab} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: BG,
    zIndex: 10,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  headerSub: { color: "rgba(255,255,255,0.38)", fontSize: 12, marginTop: 2 },
  headerSearchBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },

  hpad: { paddingHorizontal: 20, paddingBottom: 8 },

  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 12,
  },

  footer: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(229,9,20,0.3)",
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  footerEmoji: { fontSize: 36, marginBottom: 4 },
  footerTitle: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  footerSub: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center" },
});
