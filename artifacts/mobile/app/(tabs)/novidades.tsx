import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { api, TMDB_IMG } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";

const { width: SW } = Dimensions.get("window");
const RED = "#ff1a1a";
const RED_DIM = "rgba(255,26,26,0.15)";
const RED_GLOW = "rgba(255,26,26,0.35)";
const GLASS = "rgba(255,255,255,0.04)";
const GLASS_BORDER = "rgba(255,255,255,0.08)";
const BG = "#050505";

const TMDB_URL = (path: string | null, size = "w500") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const FILTERS = ["Tudo", "Filmes", "Séries", "Canais", "Animes", "Docs", "Ao Vivo"] as const;

const UNIVERSOS = [
  { label: "Marvel", color: "#e50914", emoji: "⚡" },
  { label: "DC", color: "#1a56db", emoji: "🦇" },
  { label: "Anime", color: "#f97316", emoji: "🎌" },
  { label: "Terror", color: "#7c3aed", emoji: "👻" },
  { label: "Sci-Fi", color: "#06b6d4", emoji: "🚀" },
  { label: "Ação", color: "#eab308", emoji: "💥" },
];

const LIVE_CHANNELS = [
  { name: "ESPN", label: "NBA Finals", sub: "Lakers x Celtics", color: "#e50914" },
  { name: "Band Sports", label: "Mundo PBR", sub: "22min restantes", color: "#f97316" },
  { name: "Combate", label: "UFC Fight Night", sub: "18min restantes", color: "#7c3aed" },
  { name: "Disney+", label: "Star Wars: Ahsoka", sub: "S2 · E3", color: "#1a56db" },
];

function itemTitle(item: TmdbItem) {
  return item.title ?? item.name ?? "Sem título";
}
function itemYear(item: TmdbItem) {
  return (item.release_date ?? item.first_air_date ?? "2024").slice(0, 4);
}
function itemIsMovie(item: TmdbItem) {
  return item.media_type === "movie" || !!item.title;
}

/* ── Filter Pill ── */
function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[fp.pill, active && fp.active]}>
      <Text style={[fp.text, active && fp.textActive]}>{label}</Text>
    </Pressable>
  );
}
const fp = StyleSheet.create({
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    marginRight: 8,
    backgroundColor: GLASS,
  },
  active: { borderColor: RED, backgroundColor: RED_DIM },
  text: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  textActive: { color: "#fff" },
});

/* ── Hero Banner ── */
function HeroBanner({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const img = TMDB_URL(item.backdrop_path, "w1280") ?? TMDB_URL(item.poster_path, "w500");
  const rating = item.vote_average?.toFixed(1) ?? "–";
  const isMovie = itemIsMovie(item);

  return (
    <Pressable onPress={onPress} style={hb.wrap}>
      {img && <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      <LinearGradient
        colors={["rgba(5,5,5,0.1)", "rgba(5,5,5,0.5)", "rgba(5,5,5,0.98)"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["transparent", RED_GLOW]}
        locations={[0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.25 }]}
      />
      <View style={hb.badge}>
        <View style={hb.dot} />
        <Text style={hb.badgeText}>LANÇAMENTO</Text>
      </View>
      <View style={hb.content}>
        <Text style={hb.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <View style={hb.meta}>
          <Text style={hb.metaText}>{isMovie ? "Filme" : "Série"}</Text>
          <View style={hb.dot2} />
          <Text style={hb.metaText}>{itemYear(item)}</Text>
          <View style={hb.dot2} />
          <Text style={hb.metaText}>4K</Text>
          <View style={hb.dot2} />
          <View style={hb.imdb}>
            <Text style={hb.star}>⭐</Text>
            <Text style={hb.imdbText}>{rating}</Text>
          </View>
        </View>
        {!!item.overview && (
          <Text style={hb.overview} numberOfLines={2}>{item.overview}</Text>
        )}
        <View style={hb.buttons}>
          <Pressable onPress={onPress} style={hb.playBtn}>
            <Feather name="play" size={16} color="#fff" />
            <Text style={hb.playText}>Assistir agora</Text>
          </Pressable>
          <Pressable style={hb.listBtn}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={hb.listText}>Minha Lista</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
const hb = StyleSheet.create({
  wrap: { width: SW, height: 460, justifyContent: "flex-end", marginBottom: 28 },
  badge: {
    position: "absolute",
    top: 16,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: RED,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: -1, lineHeight: 36 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  dot2: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.3)" },
  imdb: { flexDirection: "row", alignItems: "center", gap: 3 },
  star: { fontSize: 11 },
  imdbText: { fontSize: 12, color: "#fbbf24", fontWeight: "700" },
  overview: { fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 19, marginTop: 2 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: RED,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: RED,
    shadowRadius: 12,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
    flex: 1,
    justifyContent: "center",
  },
  playText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  listBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  listText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});

/* ── Section Header ── */
function SectionHeader({ title, icon, accent }: { title: string; icon: any; accent?: string }) {
  return (
    <View style={s.sectionHead}>
      <View style={[s.sectionIcon, { backgroundColor: accent ? `${accent}22` : RED_DIM }]}>
        <Feather name={icon} size={13} color={accent ?? RED} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.seeAll}>Ver todos  ›</Text>
    </View>
  );
}

/* ── Poster Card ── */
function PosterCard({
  item,
  badge,
  rank,
  onPress,
}: {
  item: TmdbItem;
  badge?: string;
  rank?: number;
  onPress: () => void;
}) {
  const img = TMDB_URL(item.poster_path);
  const rating = item.vote_average?.toFixed(1) ?? "–";

  return (
    <Pressable onPress={onPress} style={pc.wrap}>
      {rank != null && <Text style={pc.rank}>{rank}</Text>}
      <View style={pc.card}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(5,5,5,0.9)"]}
          locations={[0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        {badge && (
          <View style={[pc.badge, badge === "HOT" && pc.badgeHot]}>
            <Text style={pc.badgeText}>{badge}</Text>
          </View>
        )}
        <View style={pc.info}>
          <Text style={pc.title} numberOfLines={1}>{itemTitle(item)}</Text>
          <View style={pc.row}>
            <Text style={pc.year}>{itemYear(item)}</Text>
            <View style={pc.ratingRow}>
              <Text style={pc.star}>⭐</Text>
              <Text style={pc.rating}>{rating}</Text>
            </View>
          </View>
        </View>
        <Pressable style={pc.playOverlay} onPress={onPress}>
          <Feather name="play" size={20} color="#fff" />
        </Pressable>
      </View>
    </Pressable>
  );
}
const CARD_W = 130;
const CARD_H = 195;
const pc = StyleSheet.create({
  wrap: { marginRight: 10, position: "relative" },
  rank: {
    position: "absolute",
    bottom: -8,
    left: -10,
    fontSize: 64,
    fontWeight: "900",
    color: "rgba(255,255,255,0.12)",
    lineHeight: 70,
    zIndex: 1,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "#111",
    justifyContent: "space-between",
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: RED,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeHot: { backgroundColor: "#f97316" },
  badgeText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },
  info: { padding: 8, gap: 3 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  year: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  star: { fontSize: 9 },
  rating: { fontSize: 10, color: "#fbbf24", fontWeight: "600" },
  playOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
});

/* ── Wide Card (Próximos Lançamentos) ── */
function WideCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const img = TMDB_URL(item.backdrop_path, "w780") ?? TMDB_URL(item.poster_path);

  return (
    <Pressable onPress={onPress} style={wc.wrap}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(5,5,5,0.97)"]}
        locations={[0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={wc.tag}>
        <Feather name="clock" size={10} color={RED} />
        <Text style={wc.tagText}>EM BREVE</Text>
      </View>
      <View style={wc.content}>
        <Text style={wc.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <Text style={wc.date}>{itemYear(item)}</Text>
        <Pressable style={wc.remindBtn}>
          <Feather name="bell" size={11} color="#fff" />
          <Text style={wc.remindText}>Lembrar-me</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
const wc = StyleSheet.create({
  wrap: {
    width: 220,
    height: 130,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "#111",
    marginRight: 10,
    justifyContent: "flex-end",
  },
  tag: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderWidth: 1,
    borderColor: RED,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: { fontSize: 9, fontWeight: "800", color: RED, letterSpacing: 1 },
  content: { padding: 12, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  date: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  remindBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: RED_DIM,
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  remindText: { fontSize: 10, fontWeight: "700", color: "#fff" },
});

/* ── Trending Row (Bombando) ── */
function TrendingCard({ item, viewers, onPress }: { item: TmdbItem; viewers: string; onPress: () => void }) {
  const img = TMDB_URL(item.poster_path);

  return (
    <Pressable onPress={onPress} style={tc.wrap}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,5,0.95)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={tc.viral}>
        <Text style={tc.viralText}>🔥 VIRAL</Text>
      </View>
      <View style={tc.info}>
        <Text style={tc.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <View style={tc.viewers}>
          <Feather name="eye" size={10} color={RED} />
          <Text style={tc.viewText}>{viewers}</Text>
        </View>
      </View>
    </Pressable>
  );
}
const tc = StyleSheet.create({
  wrap: {
    width: 140,
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    marginRight: 10,
    backgroundColor: "#111",
    justifyContent: "space-between",
  },
  viral: {
    margin: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(249,115,22,0.2)",
    borderWidth: 1,
    borderColor: "#f97316",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  viralText: { fontSize: 9, fontWeight: "800", color: "#f97316" },
  info: { padding: 8, gap: 3 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff" },
  viewers: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewText: { fontSize: 10, color: RED, fontWeight: "600" },
});

/* ── Live Channel Card ── */
function LiveCard({ channel }: { channel: typeof LIVE_CHANNELS[0] }) {
  return (
    <View style={lc.wrap}>
      <View style={[lc.logoBox, { backgroundColor: `${channel.color}22`, borderColor: `${channel.color}44` }]}>
        <Text style={[lc.logoText, { color: channel.color }]}>{channel.name}</Text>
      </View>
      <View style={lc.info}>
        <View style={lc.liveBadge}>
          <View style={lc.liveDot} />
          <Text style={lc.liveText}>AO VIVO</Text>
        </View>
        <Text style={lc.title} numberOfLines={1}>{channel.label}</Text>
        <Text style={lc.sub}>{channel.sub}</Text>
        <View style={lc.progressBg}>
          <View style={[lc.progressBar, { width: "60%", backgroundColor: channel.color }]} />
        </View>
      </View>
      <Pressable style={[lc.playBtn, { backgroundColor: channel.color }]}>
        <Feather name="play" size={14} color="#fff" />
      </Pressable>
    </View>
  );
}
const lc = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: GLASS,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 12,
    gap: 12,
  },
  logoBox: {
    width: 64,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  logoText: { fontSize: 11, fontWeight: "800", textAlign: "center", letterSpacing: 0.5 },
  info: { flex: 1, gap: 3 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RED },
  liveText: { fontSize: 9, fontWeight: "800", color: RED, letterSpacing: 1 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  progressBg: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  progressBar: { height: 2, borderRadius: 1 },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowRadius: 8,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
  },
});

/* ── Universo Card ── */
function UniversoCard({ u }: { u: typeof UNIVERSOS[0] }) {
  return (
    <Pressable style={[uc.card, { borderColor: `${u.color}33`, backgroundColor: `${u.color}11` }]}>
      <Text style={uc.emoji}>{u.emoji}</Text>
      <Text style={[uc.label, { color: u.color }]}>{u.label}</Text>
    </Pressable>
  );
}
const uc = StyleSheet.create({
  card: {
    width: (SW - 60) / 3,
    height: 72,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 8,
  },
  emoji: { fontSize: 22 },
  label: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
});

/* ══════════════ MAIN SCREEN ══════════════ */
export default function NovidadesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 64 : insets.top;

  const [activeFilter, setActiveFilter] = useState("Tudo");
  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<TmdbItem[]>([]);
  const [popular, setPopular] = useState<TmdbItem[]>([]);
  const [topRated, setTopRated] = useState<TmdbItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, pm, ptv, tm, ttv] = await Promise.all([
        api.tmdb.trending(),
        api.tmdb.popularMovies(),
        api.tmdb.popularTv(),
        api.tmdb.topMovies(),
        api.tmdb.topTv(),
      ]);
      setTrending(t.all.slice(0, 20));
      const mixed = [...pm.slice(0, 10), ...ptv.slice(0, 10)].sort(() => Math.random() - 0.5);
      setPopular(mixed);
      setTopRated([...tm.slice(0, 8), ...ttv.slice(0, 8)].sort(() => Math.random() - 0.5));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const navigate = (item: TmdbItem) => {
    const isMovie = itemIsMovie(item);
    router.push({
      pathname: "/detail",
      params: { type: isMovie ? "movie" : "tv", id: String(item.id), title: itemTitle(item) },
    });
  };

  const hero = trending[0];
  const chegouHoje = trending.slice(1, 9);
  const emAlta = popular.slice(0, 8);
  const proximos = topRated.slice(0, 6);
  const bombando = popular.slice(8, 16);
  const topStreaming = topRated.slice(8, 16);
  const recomendados = trending.slice(10, 18);

  const VIEWER_COUNTS = ["2.4M", "1.8M", "1.2M", "980K", "750K", "620K", "540K", "430K"];

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      {/* ambient top glow */}
      <View style={s.ambientGlow} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>

        {/* ── HEADER ── */}
        <View style={[s.header, { paddingTop: topPad + 12 }]}>
          <View style={s.headerRow}>
            <Text style={s.logo}><Text style={s.logoRed}>NET</Text>PLAY</Text>
            <View style={s.headerActions}>
              <Pressable style={s.iconBtn}>
                <Feather name="search" size={19} color="rgba(255,255,255,0.7)" />
              </Pressable>
              <Pressable style={s.iconBtn}>
                <Feather name="bell" size={19} color="rgba(255,255,255,0.7)" />
                <View style={s.notifDot} />
              </Pressable>
              <Pressable style={s.avatarBtn}>
                <Text style={s.avatarText}>{user?.avatarLetter ?? "N"}</Text>
              </Pressable>
            </View>
          </View>
          <View style={s.titleRow}>
            <View style={s.titleIcon}>
              <Text style={{ fontSize: 16 }}>✨</Text>
            </View>
            <View>
              <Text style={s.pageTitle}>Novidades</Text>
              <Text style={s.pageSubtitle}>Tudo que acabou de chegar para você.</Text>
            </View>
          </View>
        </View>

        {/* ── FILTERS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersWrap}>
          {FILTERS.map((f) => (
            <FilterPill key={f} label={f} active={activeFilter === f} onPress={() => setActiveFilter(f)} />
          ))}
        </ScrollView>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={RED} />
            <Text style={s.loadingText}>Carregando novidades...</Text>
          </View>
        ) : (
          <>
            {/* ── HERO BANNER ── */}
            {hero && <HeroBanner item={hero} onPress={() => navigate(hero)} />}

            {/* ── CHEGOU HOJE ── */}
            {chegouHoje.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Chegou Hoje" icon="zap" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {chegouHoje.map((item) => (
                    <PosterCard key={item.id} item={item} badge="NOVO" onPress={() => navigate(item)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── EM ALTA ── */}
            {emAlta.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Em Alta" icon="trending-up" accent="#f97316" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {emAlta.map((item, i) => (
                    <PosterCard key={item.id} item={item} rank={i + 1} badge="HOT" onPress={() => navigate(item)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── PRÓXIMOS LANÇAMENTOS ── */}
            {proximos.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Próximos Lançamentos" icon="clock" accent="#a78bfa" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {proximos.map((item) => (
                    <WideCard key={item.id} item={item} onPress={() => navigate(item)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── BOMBANDO NO MOMENTO ── */}
            {bombando.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Bombando no Momento" icon="activity" accent="#f97316" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {bombando.map((item, i) => (
                    <TrendingCard
                      key={item.id}
                      item={item}
                      viewers={VIEWER_COUNTS[i] ?? "100K"}
                      onPress={() => navigate(item)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── NOVIDADES NOS CANAIS AO VIVO ── */}
            <View style={s.section}>
              <SectionHeader title="Novidades nos Canais ao Vivo" icon="radio" accent="#22d3ee" />
              {LIVE_CHANNELS.map((ch) => (
                <LiveCard key={ch.name} channel={ch} />
              ))}
            </View>

            {/* ── TOP STREAMING ── */}
            {topStreaming.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Top Streaming" icon="award" accent="#fbbf24" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {topStreaming.map((item, i) => (
                    <PosterCard key={item.id} item={item} rank={i + 1} onPress={() => navigate(item)} />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── UNIVERSOS ── */}
            <View style={s.section}>
              <SectionHeader title="Universos" icon="globe" />
              <View style={s.universosGrid}>
                {UNIVERSOS.map((u) => (
                  <UniversoCard key={u.label} u={u} />
                ))}
              </View>
            </View>

            {/* ── PORQUE VOCÊ GOSTOU ── */}
            {recomendados.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Porque Você Gostou" icon="heart" accent="#f472b6" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {recomendados.map((item) => (
                    <PosterCard key={item.id} item={item} onPress={() => navigate(item)} />
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  ambientGlow: {
    position: "absolute",
    top: -100,
    left: SW / 2 - 180,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(255,26,26,0.05)",
  },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  logoRed: { color: RED },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RED,
    borderWidth: 1.5,
    borderColor: BG,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowRadius: 10,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: RED_DIM,
    borderWidth: 1,
    borderColor: "rgba(255,26,26,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.6 },
  pageSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 },
  filtersWrap: { paddingHorizontal: 20, paddingBottom: 20, alignItems: "center" },
  section: { marginBottom: 28 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#fff", flex: 1, letterSpacing: -0.3 },
  seeAll: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  hScroll: { paddingHorizontal: 20, paddingBottom: 4 },
  universosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    gap: 8,
  },
  loadingWrap: {
    height: 400,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: { color: "rgba(255,255,255,0.3)", fontSize: 13 },
});
