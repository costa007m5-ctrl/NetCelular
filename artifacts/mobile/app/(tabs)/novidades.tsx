import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { api } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";

const { width: SW } = Dimensions.get("window");
const RED = "#ff1a1a";
const RED_DIM = "rgba(255,26,26,0.15)";
const RED_GLOW = "rgba(255,26,26,0.4)";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_BORDER = "rgba(255,255,255,0.09)";
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

const VIEWER_COUNTS = ["2.4M", "1.8M", "1.2M", "980K", "750K", "620K", "540K", "430K"];

function itemTitle(item: TmdbItem) { return item.title ?? item.name ?? "Sem título"; }
function itemYear(item: TmdbItem) { return (item.release_date ?? item.first_air_date ?? "2024").slice(0, 4); }
function itemIsMovie(item: TmdbItem) { return item.media_type === "movie" || (!!item.title && !item.name); }

/* ── Filter Pill ── */
function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[fp.pill, active && fp.active]}>
      <Text style={[fp.text, active && fp.textActive]}>{label}</Text>
    </Pressable>
  );
}
const fp = StyleSheet.create({
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50, borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 8, backgroundColor: GLASS },
  active: { borderColor: RED, backgroundColor: RED_DIM },
  text: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  textActive: { color: "#fff" },
});

/* ── Hero Banner (header overlaid on top) ── */
function HeroBanner({
  item, topPad, user, onPress, onAddToList,
}: {
  item: TmdbItem; topPad: number; user: any; onPress: () => void; onAddToList: () => void;
}) {
  const router = useRouter();
  const img = TMDB_URL(item.backdrop_path, "w1280") ?? TMDB_URL(item.poster_path, "w500");
  const rating = item.vote_average?.toFixed(1) ?? "–";
  const isMovie = itemIsMovie(item);

  return (
    <View style={[hb.wrap]}>
      {img && <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />}

      {/* multi-layer gradients for depth */}
      <LinearGradient
        colors={["rgba(5,5,5,0.55)", "transparent", "transparent", "rgba(5,5,5,0.7)", "rgba(5,5,5,0.99)"]}
        locations={[0, 0.15, 0.45, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["transparent", "rgba(255,26,26,0.08)"]}
        locations={[0.5, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* NETPLAY header overlaid on banner */}
      <View style={[hb.header, { paddingTop: topPad + 12 }]}>
        <Text style={hb.logo}><Text style={hb.logoRed}>NET</Text>PLAY</Text>
        <View style={hb.actions}>
          <Pressable style={hb.iconBtn} onPress={() => router.push("/(tabs)/search")}>
            <Feather name="search" size={19} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Pressable style={hb.iconBtn} onPress={() => Alert.alert("Notificações", "Você não tem novas notificações no momento.")}>
            <Feather name="bell" size={19} color="rgba(255,255,255,0.85)" />
            <View style={hb.notifDot} />
          </Pressable>
          <Pressable style={hb.avatarBtn} onPress={() => router.push("/(tabs)/profile")}>
            <Text style={hb.avatarText}>{user?.avatarLetter ?? "N"}</Text>
          </Pressable>
        </View>
      </View>

      {/* badge */}
      <View style={hb.badge}>
        <View style={hb.badgeDot} />
        <Text style={hb.badgeText}>LANÇAMENTO</Text>
      </View>

      {/* content at bottom */}
      <View style={hb.content}>
        <Text style={hb.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <View style={hb.metaRow}>
          <Text style={hb.metaText}>{isMovie ? "Filme" : "Série"}</Text>
          <View style={hb.sep} />
          <Text style={hb.metaText}>{itemYear(item)}</Text>
          <View style={hb.sep} />
          <Text style={hb.metaText}>4K</Text>
          <View style={hb.sep} />
          <Text style={hb.star}>⭐</Text>
          <Text style={hb.rating}>{rating}</Text>
        </View>
        {!!item.overview && (
          <Text style={hb.overview} numberOfLines={2}>{item.overview}</Text>
        )}
        <View style={hb.btns}>
          <Pressable onPress={onPress} style={hb.playBtn}>
            <Feather name="play" size={15} color="#fff" />
            <Text style={hb.playText}>Assistir agora</Text>
          </Pressable>
          <Pressable style={hb.listBtn} onPress={onAddToList}>
            <Feather name="plus" size={15} color="#fff" />
            <Text style={hb.listText}>Minha Lista</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const hb = StyleSheet.create({
  wrap: { width: SW, height: 500, justifyContent: "flex-end" },
  header: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  logoRed: { color: RED },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  notifDot: {
    position: "absolute", top: 6, right: 6,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: RED, borderWidth: 1.5, borderColor: BG,
  },
  avatarBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: RED,
    alignItems: "center", justifyContent: "center",
    shadowColor: RED, shadowRadius: 8, shadowOpacity: 0.6, shadowOffset: { width: 0, height: 0 },
  },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  badge: {
    position: "absolute", top: 110, left: 20,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: RED, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 34, fontWeight: "900", color: "#fff", letterSpacing: -1, lineHeight: 38 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  sep: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.25)" },
  star: { fontSize: 11 },
  rating: { fontSize: 12, color: "#fbbf24", fontWeight: "700" },
  overview: { fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 19 },
  btns: { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: RED, paddingVertical: 13, borderRadius: 12,
    shadowColor: RED, shadowRadius: 14, shadowOpacity: 0.55, shadowOffset: { width: 0, height: 0 },
  },
  playText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  listBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12,
  },
  listText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});

/* ── Section Header ── */
function SectionHeader({ title, icon, accent }: { title: string; icon: any; accent?: string }) {
  const c = accent ?? RED;
  return (
    <View style={s.sectionHead}>
      <View style={[s.sectionIcon, { backgroundColor: `${c}22` }]}>
        <Feather name={icon} size={13} color={c} />
      </View>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.seeAll}>Ver todos  ›</Text>
    </View>
  );
}

/* ── Poster Card — clean, no overlapping text ── */
function PosterCard({
  item, badge, rank, onPress,
}: {
  item: TmdbItem; badge?: string; rank?: number; onPress: () => void;
}) {
  const img = TMDB_URL(item.poster_path);
  const rating = item.vote_average?.toFixed(1) ?? "–";

  return (
    <View style={pc.wrap}>
      {/* big rank number BEHIND the card, well separated */}
      {rank != null && (
        <Text style={pc.rank}>{rank}</Text>
      )}
      <Pressable onPress={onPress} style={pc.card}>
        {img ? (
          <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        {/* gradient only at bottom for text */}
        <LinearGradient
          colors={["transparent", "rgba(5,5,5,0.98)"]}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        {/* badge top-left only (no title overlap) */}
        {badge && (
          <View style={[pc.badge, badge === "HOT" && pc.badgeHot]}>
            <Text style={pc.badgeTxt}>{badge}</Text>
          </View>
        )}
        {/* play button top-right */}
        <View style={pc.playBtn}>
          <Feather name="play" size={11} color="#fff" />
        </View>
        {/* info at bottom */}
        <View style={pc.info}>
          <Text style={pc.title} numberOfLines={2}>{itemTitle(item)}</Text>
          <View style={pc.row}>
            <Text style={pc.year}>{itemYear(item)}</Text>
            <View style={pc.ratingRow}>
              <Text style={pc.ratingStar}>⭐</Text>
              <Text style={pc.ratingTxt}>{rating}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
const CARD_W = 128;
const CARD_H = 192;
const pc = StyleSheet.create({
  wrap: { marginRight: rank_enabled() ? 18 : 10, position: "relative" },
  rank: {
    position: "absolute",
    bottom: 0,
    left: -14,
    fontSize: 72,
    fontWeight: "900",
    color: "rgba(255,255,255,0.10)",
    lineHeight: 72,
    zIndex: 0,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "#111",
    zIndex: 1,
  },
  badge: {
    position: "absolute", top: 8, left: 8,
    backgroundColor: RED, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  badgeHot: { backgroundColor: "#f97316" },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },
  playBtn: {
    position: "absolute", top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14, marginBottom: 3 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  year: { fontSize: 10, color: "rgba(255,255,255,0.45)" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingStar: { fontSize: 9 },
  ratingTxt: { fontSize: 10, color: "#fbbf24", fontWeight: "600" },
});
// dummy to avoid StyleSheet key error (rank margin varies at runtime)
function rank_enabled() { return false; }

/* ── Wide Card (Próximos Lançamentos) ── */
function WideCard({ item, onPress, onRemind }: { item: TmdbItem; onPress: () => void; onRemind: () => void }) {
  const img = TMDB_URL(item.backdrop_path, "w780") ?? TMDB_URL(item.poster_path);
  return (
    <Pressable onPress={onPress} style={wc.card}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,5,0.97)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      <View style={wc.tag}>
        <Feather name="clock" size={10} color={RED} />
        <Text style={wc.tagTxt}>EM BREVE</Text>
      </View>
      <View style={wc.info}>
        <Text style={wc.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <Text style={wc.year}>{itemYear(item)}</Text>
        <Pressable style={wc.remindBtn} onPress={(e) => { e.stopPropagation?.(); onRemind(); }}>
          <Feather name="bell" size={11} color="#fff" />
          <Text style={wc.remindTxt}>Lembrar-me</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
const wc = StyleSheet.create({
  card: {
    width: 220, height: 130, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: "#111",
    marginRight: 10, justifyContent: "flex-end",
  },
  tag: {
    position: "absolute", top: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: RED,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  tagTxt: { fontSize: 9, fontWeight: "800", color: RED, letterSpacing: 1 },
  info: { padding: 12, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  year: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  remindBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: RED_DIM, borderWidth: 1, borderColor: RED,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    marginTop: 6, alignSelf: "flex-start",
  },
  remindTxt: { fontSize: 10, fontWeight: "700", color: "#fff" },
});

/* ── Trending / Bombando Card ── */
function TrendingCard({ item, viewers, onPress }: { item: TmdbItem; viewers: string; onPress: () => void }) {
  const img = TMDB_URL(item.poster_path);
  return (
    <Pressable onPress={onPress} style={tc.card}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}
      <LinearGradient colors={["transparent", "rgba(5,5,5,0.95)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
      <View style={tc.viral}>
        <Text style={tc.viralTxt}>🔥 VIRAL</Text>
      </View>
      <View style={tc.info}>
        <Text style={tc.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <View style={tc.viewRow}>
          <Feather name="eye" size={10} color={RED} />
          <Text style={tc.viewTxt}>{viewers} assistindo</Text>
        </View>
      </View>
    </Pressable>
  );
}
const tc = StyleSheet.create({
  card: {
    width: 138, height: 195, borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: GLASS_BORDER, marginRight: 10,
    backgroundColor: "#111", justifyContent: "space-between",
  },
  viral: {
    margin: 8, alignSelf: "flex-start",
    backgroundColor: "rgba(249,115,22,0.18)", borderWidth: 1, borderColor: "#f97316",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  viralTxt: { fontSize: 9, fontWeight: "800", color: "#f97316" },
  info: { padding: 8, gap: 3 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff" },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewTxt: { fontSize: 10, color: RED, fontWeight: "600" },
});

/* ── Live Channel Row ── */
function LiveCard({ channel, onPress }: { channel: typeof LIVE_CHANNELS[0]; onPress: () => void }) {
  return (
    <Pressable style={lc.wrap} onPress={onPress}>
      <View style={[lc.logoBox, { backgroundColor: `${channel.color}22`, borderColor: `${channel.color}44` }]}>
        <Text style={[lc.logoTxt, { color: channel.color }]}>{channel.name}</Text>
      </View>
      <View style={lc.info}>
        <View style={lc.liveRow}>
          <View style={lc.liveDot} />
          <Text style={lc.liveTxt}>AO VIVO</Text>
        </View>
        <Text style={lc.title} numberOfLines={1}>{channel.label}</Text>
        <Text style={lc.sub}>{channel.sub}</Text>
        <View style={lc.progBg}>
          <View style={[lc.progBar, { width: "60%", backgroundColor: channel.color }]} />
        </View>
      </View>
      <View style={[lc.playBtn, { backgroundColor: channel.color, shadowColor: channel.color }]}>
        <Feather name="play" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}
const lc = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, marginBottom: 10,
    backgroundColor: GLASS, borderRadius: 14, borderWidth: 1, borderColor: GLASS_BORDER,
    padding: 12, gap: 12,
  },
  logoBox: { width: 64, height: 54, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 6 },
  logoTxt: { fontSize: 10, fontWeight: "800", textAlign: "center", letterSpacing: 0.4 },
  info: { flex: 1, gap: 2 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RED },
  liveTxt: { fontSize: 9, fontWeight: "800", color: RED, letterSpacing: 1 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  progBg: { height: 2, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 1, marginTop: 4, overflow: "hidden" },
  progBar: { height: 2, borderRadius: 1 },
  playBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", shadowRadius: 8, shadowOpacity: 0.5, shadowOffset: { width: 0, height: 0 } },
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
  card: { width: (SW - 60) / 3, height: 70, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 8 },
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
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const navigate = (item: TmdbItem) => {
    router.push({ pathname: "/detail", params: { type: itemIsMovie(item) ? "movie" : "tv", id: String(item.id), title: itemTitle(item) } });
  };

  const hero = trending[0];
  const chegouHoje = trending.slice(1, 9);
  const emAlta = popular.slice(0, 8);
  const proximos = topRated.slice(0, 6);
  const bombando = popular.slice(8, 16);
  const topStreaming = topRated.slice(8, 16);
  const recomendados = trending.slice(10, 18);

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {loading && !hero ? (
        <View style={s.loadingFull}>
          {/* loading header */}
          <View style={[s.loadingHeader, { paddingTop: topPad + 12 }]}>
            <Text style={s.logo}><Text style={s.logoRed}>NET</Text>PLAY</Text>
          </View>
          <ActivityIndicator size="large" color={RED} />
          <Text style={s.loadingTxt}>Carregando novidades...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>

          {/* ── HERO BANNER (header inside) ── */}
          {hero && (
            <HeroBanner item={hero} topPad={topPad} user={user} onPress={() => navigate(hero)} />
          )}

          {/* ── FILTERS below banner ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersWrap}>
            {FILTERS.map((f) => (
              <FilterPill key={f} label={f} active={activeFilter === f} onPress={() => setActiveFilter(f)} />
            ))}
          </ScrollView>

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
                  <PosterCard key={item.id} item={item} badge="HOT" rank={i + 1} onPress={() => navigate(item)} />
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

          {/* ── BOMBANDO ── */}
          {bombando.length > 0 && (
            <View style={s.section}>
              <SectionHeader title="Bombando no Momento" icon="activity" accent="#f97316" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                {bombando.map((item, i) => (
                  <TrendingCard key={item.id} item={item} viewers={VIEWER_COUNTS[i] ?? "100K"} onPress={() => navigate(item)} />
                ))}
              </ScrollView>
            </View>
          )}

          {/* ── CANAIS AO VIVO ── */}
          <View style={s.section}>
            <SectionHeader title="Novidades nos Canais ao Vivo" icon="radio" accent="#22d3ee" />
            {LIVE_CHANNELS.map((ch) => <LiveCard key={ch.name} channel={ch} />)}
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
            <View style={s.universoGrid}>
              {UNIVERSOS.map((u) => <UniversoCard key={u.label} u={u} />)}
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
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loadingFull: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingHeader: { position: "absolute", top: 0, left: 20, right: 20, flexDirection: "row" },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  logoRed: { color: RED },
  loadingTxt: { color: "rgba(255,255,255,0.3)", fontSize: 13 },
  filtersWrap: { paddingHorizontal: 20, paddingVertical: 16, alignItems: "center" },
  section: { marginBottom: 28 },
  sectionHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 14, gap: 8 },
  sectionIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#fff", flex: 1, letterSpacing: -0.3 },
  seeAll: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  hScroll: { paddingHorizontal: 20, paddingBottom: 4 },
  universoGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 8 },
});
