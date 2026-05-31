import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCatalog } from "@/lib/catalog-context";

const { width: SW } = Dimensions.get("window");
const BG = "#050505";
const RED = "#e50914";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_B = "rgba(255,255,255,0.09)";
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const IMG = (p: string | null, s = "w500") =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : null;

const MOODS = [
  { label: "Ação", color: "#ef4444", genre: "28", type: "movie", tmdbId: 361743 },
  { label: "Comédia", color: "#f59e0b", genre: "35", type: "movie", tmdbId: 585083 },
  { label: "Terror", color: "#7c3aed", genre: "27", type: "movie", tmdbId: 346364 },
  { label: "Romance", color: "#ec4899", genre: "10749", type: "movie", tmdbId: 597 },
  { label: "Sci-Fi", color: "#06b6d4", genre: "878", type: "movie", tmdbId: 438631 },
  { label: "Drama", color: "#64748b", genre: "18", type: "movie", tmdbId: 238 },
  { label: "Anime", color: "#f97316", genre: "16", type: "tv", tmdbId: 85937 },
  { label: "Documentários", color: "#a78bfa", genre: "99", type: "movie", tmdbId: 459300 },
  { label: "Família", color: "#34d399", genre: "10751", type: "movie", tmdbId: 568124 },
];

const UNIVERSES = [
  { label: "Marvel", color: "#e50914", collectionId: 131292, tmdbType: "collection" as const },
  { label: "DC", color: "#1a56db", collectionId: 263, tmdbType: "collection" as const },
  { label: "Star Wars", color: "#22d3ee", collectionId: 10, tmdbType: "collection" as const },
  { label: "Harry Potter", color: "#d97706", collectionId: 1241, tmdbType: "collection" as const },
  { label: "Fast & Furious", color: "#f97316", collectionId: 9485, tmdbType: "collection" as const },
  { label: "James Bond", color: "#64748b", collectionId: 645, tmdbType: "collection" as const },
  { label: "Jurassic Park", color: "#22c55e", collectionId: 328, tmdbType: "collection" as const },
  { label: "Batman", color: "#a78bfa", collectionId: 263, tmdbType: "collection" as const },
];

const CURATED = [
  { label: "Oscar 2025", color: "#f59e0b", tmdbId: 278, type: "movie" as const, badge: "Premiado" },
  { label: "Netflix Originais", color: "#e50914", tmdbId: 496243, type: "movie" as const, badge: "Original" },
  { label: "Série do Momento", color: "#7c3aed", tmdbId: 1396, type: "tv" as const, badge: "Top 1" },
  { label: "Clássicos Eternos", color: "#06b6d4", tmdbId: 238, type: "movie" as const, badge: "Clássico" },
  { label: "Mais Populares", color: "#22c55e", tmdbId: 550, type: "movie" as const, badge: "Popular" },
  { label: "Crítica Premiada", color: "#ec4899", tmdbId: 389, type: "movie" as const, badge: "Aclamado" },
];

const LIVE_CHANNELS = [
  { name: "ESPN", sub: "NBA · Ao Vivo", color: "#ef4444", icon: "radio" as const },
  { name: "Fox Sports", sub: "Futebol · Ao Vivo", color: "#f59e0b", icon: "radio" as const },
  { name: "Combate", sub: "UFC · Em breve", color: "#7c3aed", icon: "tv" as const },
  { name: "Globo News", sub: "Notícias · 24h", color: "#06b6d4", icon: "tv" as const },
  { name: "Record", sub: "Variedades", color: "#22c55e", icon: "tv" as const },
  { name: "SBT", sub: "Entretenimento", color: "#ec4899", icon: "tv" as const },
];

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
    </View>
  );
}

function MoodBannerCard({ label, color, genre, type, tmdbId, onPress }: typeof MOODS[0] & { onPress: () => void }) {
  const [backdrop, setBackdrop] = useState<string | null>(null);

  useEffect(() => {
    const endpoint = type === "tv"
      ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_KEY}`
      : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_KEY}`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => setBackdrop(d.backdrop_path || d.poster_path))
      .catch(() => {});
  }, [tmdbId, type]);

  const imgUrl = backdrop ? IMG(backdrop, "w780") : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.moodCard, { borderColor: color + "55", opacity: pressed ? 0.82 : 1 }]}
    >
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color + "18" }]} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.88)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[s.moodAccent, { backgroundColor: color }]} />
      <Text style={[s.moodCardLabel, { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function UniverseCard({ label, color, collectionId, tmdbType }: typeof UNIVERSES[0]) {
  const router = useRouter();
  const [backdrop, setBackdrop] = useState<string | null>(null);

  useEffect(() => {
    const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_KEY}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setBackdrop(d.backdrop_path || d.poster_path))
      .catch(() => {});
  }, [collectionId]);

  const imgUrl = backdrop ? IMG(backdrop, "w500") : null;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/collection", params: { id: collectionId, title: label } })}
      style={({ pressed }) => [s.universeCard, { borderColor: color + "55", opacity: pressed ? 0.82 : 1 }]}
    >
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color + "18" }]} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.85)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[s.universeAccent, { backgroundColor: color }]} />
      <Text style={[s.universeLabel, { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

function CuratedCard({ item }: { item: typeof CURATED[0] }) {
  const router = useRouter();
  const [backdrop, setBackdrop] = useState<string | null>(null);

  useEffect(() => {
    const url = `https://api.themoviedb.org/3/${item.type}/${item.tmdbId}?api_key=${TMDB_KEY}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setBackdrop(d.backdrop_path || d.poster_path))
      .catch(() => {});
  }, [item.tmdbId, item.type]);

  const imgUrl = backdrop ? IMG(backdrop, "w780") : null;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/detail", params: { type: item.type, id: String(item.tmdbId), title: item.label } })}
      style={({ pressed }) => [s.curatedCard, { borderColor: item.color + "40", opacity: pressed ? 0.8 : 1 }]}
    >
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: item.color + "18" }]} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.6)", "rgba(0,0,0,0.93)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.curatedBadge}>
        <Text style={[s.curatedBadgeTxt, { color: item.color }]}>{item.badge}</Text>
      </View>
      <Text style={s.curatedLabel}>{item.label}</Text>
      <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.5)" style={{ position: "absolute", right: 12, bottom: 14 }} />
    </Pressable>
  );
}

function TrendingCard({ item }: { item: any }) {
  const router = useRouter();
  const isMovie = item.media_type === "movie" || !!item.title;
  const title = item.title ?? item.name ?? "";
  const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
  const poster = IMG(item.poster_path);
  const rating = item.vote_average?.toFixed(1) ?? "";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/detail", params: { type: isMovie ? "movie" : "tv", id: String(item.id), title } })}
      style={({ pressed }) => [s.trendingCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Image source={{ uri: poster ?? "" }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={s.trendingBadge}>
        <Text style={s.trendingBadgeTxt}>{isMovie ? "FILME" : "SÉRIE"}</Text>
      </View>
      <View style={s.trendingInfo}>
        <Text style={s.trendingTitle} numberOfLines={2}>{title}</Text>
        <View style={s.trendingMeta}>
          <Text style={s.trendingYear}>{year}</Text>
          {rating ? (
            <>
              <Text style={s.trendingDot}>·</Text>
              <Text style={s.trendingRating}>⭐ {rating}</Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function HeroBanner({ items }: { items: any[] }) {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % items.length;
        scrollRef.current?.scrollTo({ x: next * SW, animated: true });
        return next;
      });
    }, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <View style={s.heroContainer}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
          setActiveIdx(idx);
        }}
      >
        {items.map((item) => {
          const isMovie = item.media_type === "movie" || !!item.title;
          const title = item.title ?? item.name ?? "";
          const backdrop = IMG(item.backdrop_path, "w1280") ?? IMG(item.poster_path, "w780");
          const overview = item.overview ?? "";
          const rating = item.vote_average?.toFixed(1);

          return (
            <Pressable
              key={item.id}
              style={{ width: SW }}
              onPress={() => router.push({ pathname: "/detail", params: { type: isMovie ? "movie" : "tv", id: String(item.id), title } })}
            >
              {backdrop ? (
                <Image source={{ uri: backdrop }} style={s.heroImage} contentFit="cover" />
              ) : (
                <View style={[s.heroImage, { backgroundColor: "#1a1a1a" }]} />
              )}
              <LinearGradient
                colors={["transparent", "rgba(5,5,5,0.4)", "rgba(5,5,5,0.92)", BG]}
                locations={[0.2, 0.5, 0.8, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.heroContent}>
                <View style={s.heroMeta}>
                  <View style={[s.heroBadge, { backgroundColor: RED }]}>
                    <Text style={s.heroBadgeTxt}>{isMovie ? "FILME" : "SÉRIE"}</Text>
                  </View>
                  {rating && (
                    <View style={s.heroRating}>
                      <Text style={s.heroRatingTxt}>⭐ {rating}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.heroTitle} numberOfLines={2}>{title}</Text>
                {overview ? (
                  <Text style={s.heroOverview} numberOfLines={2}>{overview}</Text>
                ) : null}
                <View style={s.heroActions}>
                  <Pressable
                    style={s.heroPlayBtn}
                    onPress={() => router.push({ pathname: "/detail", params: { type: isMovie ? "movie" : "tv", id: String(item.id), title } })}
                  >
                    <Feather name="play" size={14} color="#fff" />
                    <Text style={s.heroPlayTxt}>Assistir</Text>
                  </Pressable>
                  <Pressable
                    style={s.heroInfoBtn}
                    onPress={() => router.push({ pathname: "/detail", params: { type: isMovie ? "movie" : "tv", id: String(item.id), title } })}
                  >
                    <Feather name="info" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={s.heroInfoTxt}>Detalhes</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.heroDots}>
        {items.map((_, i) => (
          <View
            key={i}
            style={[s.heroDot, { width: i === activeIdx ? 20 : 6, backgroundColor: i === activeIdx ? RED : "rgba(255,255,255,0.3)" }]}
          />
        ))}
      </View>
    </View>
  );
}

export default function DescobrirScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAvailable, byType } = useCatalog();
  const [trending, setTrending] = useState<any[]>([]);
  const [heroBanners, setHeroBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  useEffect(() => {
    Promise.all([
      fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}&language=pt-BR`)
        .then((r) => r.json()),
      fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&language=pt-BR&page=1`)
        .then((r) => r.json()),
    ])
      .then(async ([trendData, nowData]) => {
        const trendItems = (trendData.results ?? [])
          .filter((m: any) => isAvailable(m.id));
        const bannerItems = (nowData.results ?? [])
          .filter((m: any) => m.backdrop_path && isAvailable(m.id));

        if (trendItems.length >= 4) {
          setTrending(trendItems.slice(0, 10));
          setHeroBanners(bannerItems.slice(0, 6));
          return;
        }

        // Fallback: use catalog IDs
        const movieIds = (byType.movie ?? []).slice(0, 10);
        const tvIds    = (byType.tv    ?? []).slice(0, 10);
        const [movieRes, tvRes] = await Promise.all([
          Promise.all(movieIds.map((id: number) =>
            fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&language=pt-BR`)
              .then((r) => r.ok ? r.json() : null).catch(() => null)
          )),
          Promise.all(tvIds.map((id: number) =>
            fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}&language=pt-BR`)
              .then((r) => r.ok ? r.json() : null).catch(() => null)
          )),
        ]);
        const combined = [...(movieRes.filter(Boolean)), ...(tvRes.filter(Boolean))];
        setTrending(combined.slice(0, 10));
        setHeroBanners(combined.filter((m: any) => m.backdrop_path).slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAvailable, byType]);

  const handleMood = (genre: string, type: string, label: string) => {
    router.push({ pathname: "/genre-browse", params: { genre_id: genre, type, title: label } });
  };

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* ── HEADER — above the banner, not overlapping ── */}
      <View style={[s.header, { paddingTop: topPad + 10 }]}>
        <LinearGradient
          colors={[BG, "transparent"]}
          style={StyleSheet.absoluteFill}
          locations={[0.6, 1]}
        />
        <View style={{ zIndex: 1 }}>
          <Text style={s.headerTitle}>Descobrir</Text>
          <Text style={s.headerSub}>Explore por humor, gênero e universo</Text>
        </View>
        <Pressable style={[s.headerSearch, { zIndex: 1 }]} onPress={() => router.push("/(tabs)/search")}>
          <Feather name="search" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* ── HERO BANNER ─────────────────────────────── */}
        <HeroBanner items={heroBanners} />

        {/* ── POR HUMOR ──────────────────────────────── */}
        <SectionTitle title="Por Humor" subtitle="Escolha como você está se sentindo" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.moodRow}>
          {MOODS.map((m) => (
            <MoodBannerCard
              key={m.label}
              {...m}
              onPress={() => handleMood(m.genre, m.type, m.label)}
            />
          ))}
        </ScrollView>

        {/* ── UNIVERSOS & FRANQUIAS ────────────────────── */}
        <SectionTitle title="Universos & Franquias" subtitle="Mergulhe nos seus universos favoritos" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.universeRow}>
          {UNIVERSES.map((u) => (
            <UniverseCard key={u.label + u.collectionId} {...u} />
          ))}
        </ScrollView>

        {/* ── COLEÇÕES EM DESTAQUE ─────────────────────── */}
        <SectionTitle title="Coleções em Destaque" subtitle="Seleções especiais para você" />
        <View style={s.curatedList}>
          {CURATED.map((item) => (
            <CuratedCard key={item.label} item={item} />
          ))}
        </View>

        {/* ── EM ALTA ESSA SEMANA ──────────────────────── */}
        <SectionTitle title="Em Alta essa Semana" subtitle="O que o mundo está assistindo" />
        {loading ? (
          <ActivityIndicator color={RED} style={{ marginVertical: 20 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trendingRow}>
            {trending.map((item) => (
              <TrendingCard key={item.id} item={item} />
            ))}
          </ScrollView>
        )}

        {/* ── CANAIS AO VIVO ───────────────────────────── */}
        <SectionTitle title="Canais ao Vivo" subtitle="Transmissões em tempo real" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveRow}>
          {LIVE_CHANNELS.map((ch) => (
            <Pressable
              key={ch.name}
              style={({ pressed }) => [s.liveCard, { borderColor: ch.color + "55", opacity: pressed ? 0.8 : 1 }]}
              onPress={() => router.push("/(tabs)/channels")}
            >
              <LinearGradient colors={[ch.color + "22", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />
              <View style={s.livePulse}>
                <View style={[s.liveDot, { backgroundColor: ch.color }]} />
              </View>
              <View style={[s.liveIconWrap, { backgroundColor: ch.color + "22" }]}>
                <Feather name={ch.icon} size={22} color={ch.color} />
              </View>
              <Text style={s.liveName}>{ch.name}</Text>
              <Text style={s.liveSub}>{ch.sub}</Text>
              <View style={[s.liveBtn, { backgroundColor: ch.color }]}>
                <Feather name="play" size={10} color="#fff" />
                <Text style={s.liveBtnTxt}>Ao Vivo</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

      </ScrollView>
    </View>
  );
}

const MOOD_W = (SW - 60) / 2.1;
const MOOD_H = MOOD_W * 0.62;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: BG,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 },
  headerSearch: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B,
    alignItems: "center", justifyContent: "center",
  },

  heroContainer: { marginBottom: 28, position: "relative" },
  heroImage: { width: SW, height: SW * 0.58 },
  heroContent: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 30,
  },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  heroBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  heroBadgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  heroRating: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  heroRatingTxt: { fontSize: 11, color: "#fff", fontWeight: "600" },
  heroTitle: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginBottom: 6, lineHeight: 26 },
  heroOverview: { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 17, marginBottom: 14 },
  heroActions: { flexDirection: "row", gap: 10 },
  heroPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: RED, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 12,
    shadowColor: RED, shadowRadius: 8, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 },
  },
  heroPlayTxt: { fontSize: 13, fontWeight: "700", color: "#fff" },
  heroInfoBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  heroInfoTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  heroDots: {
    position: "absolute", bottom: 8, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5,
  },
  heroDot: { height: 4, borderRadius: 2 },

  sectionHeader: { paddingHorizontal: 20, marginBottom: 14, marginTop: 8 },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sectionSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 },

  moodRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 20 },
  moodCard: {
    width: MOOD_W,
    height: MOOD_H,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#1a1a1a",
  },
  moodAccent: {
    position: "absolute", top: 0, left: 0, right: 0, height: 3,
  },
  moodCardLabel: {
    fontSize: 14, fontWeight: "800", padding: 10,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  universeRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 20 },
  universeCard: {
    width: 130, height: 90, borderRadius: 16,
    borderWidth: 1.5, overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#1a1a1a",
  },
  universeAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  universeLabel: { fontSize: 12, fontWeight: "800", padding: 8, textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  curatedList: { paddingHorizontal: 20, gap: 10, marginBottom: 20 },
  curatedCard: {
    height: 80, borderRadius: 16, overflow: "hidden",
    borderWidth: 1, backgroundColor: "#1a1a1a",
    flexDirection: "row", alignItems: "flex-end",
    padding: 14,
  },
  curatedBadge: {
    position: "absolute", top: 10, left: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  curatedBadgeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  curatedLabel: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  trendingRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 20 },
  trendingCard: {
    width: (SW - 60) / 2.5,
    height: ((SW - 60) / 2.5) * 1.5,
    borderRadius: 16, overflow: "hidden",
    backgroundColor: "#1a1a1a",
    justifyContent: "flex-end",
    borderWidth: 1, borderColor: GLASS_B,
  },
  trendingBadge: {
    position: "absolute", top: 8, left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  trendingBadgeTxt: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },
  trendingInfo: { padding: 10 },
  trendingTitle: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  trendingMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  trendingYear: { fontSize: 10, color: "rgba(255,255,255,0.5)" },
  trendingDot: { fontSize: 10, color: "rgba(255,255,255,0.3)" },
  trendingRating: { fontSize: 10, color: "rgba(255,255,255,0.5)" },

  liveRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 20 },
  liveCard: {
    width: 120, height: 160, borderRadius: 16, overflow: "hidden",
    backgroundColor: "#0f0f0f", borderWidth: 1,
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  livePulse: { position: "absolute", top: 10, right: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  liveName: { fontSize: 13, fontWeight: "800", color: "#fff" },
  liveSub: { fontSize: 10, color: "rgba(255,255,255,0.45)", textAlign: "center", paddingHorizontal: 8 },
  liveBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4,
  },
  liveBtnTxt: { fontSize: 10, fontWeight: "700", color: "#fff" },
});
