import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { api } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";

const { width: SW } = Dimensions.get("window");
const RED = "#e50914";

function itemTitle(it: TmdbItem) { return it.title ?? it.name ?? "Sem título"; }
function itemYear(it: TmdbItem)  { return (it.release_date ?? it.first_air_date ?? "2024").slice(0, 4); }
function itemIsMovie(it: TmdbItem) { return it.media_type === "movie" || (!!it.title && !it.name); }
function tmdbImg(path: string | null | undefined, size = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/* ─── Hero Banner ─────────────────────────────────────────────────────────── */
function HeroBanner({
  items,
  topPad,
  user,
  onNavigate,
  onAddToList,
}: {
  items: TmdbItem[];
  topPad: number;
  user: any;
  onNavigate: (it: TmdbItem) => void;
  onAddToList: (it: TmdbItem) => void;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => setIdx((i) => (i + 1) % Math.min(items.length, 6)), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  const img = tmdbImg(item.backdrop_path, "w1280") ?? tmdbImg(item.poster_path, "w500");
  const rating = item.vote_average ? Math.round(item.vote_average * 10) / 10 : null;
  const isMovie = itemIsMovie(item);

  return (
    <View style={hb.wrap}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.45)", "transparent", "rgba(0,0,0,0.65)", "rgba(0,0,0,0.97)"]}
        locations={[0, 0.2, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header overlaid */}
      <View style={[hb.header, { paddingTop: topPad + 10 }]}>
        <Text style={hb.logo}>
          <Text style={{ color: RED }}>NET</Text>PLAY
        </Text>
        <View style={hb.actions}>
          <Pressable style={hb.iconBtn} onPress={() => router.push("/(tabs)/search")}>
            <Feather name="search" size={18} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Pressable style={hb.avatarBtn} onPress={() => router.push("/(tabs)/profile")}>
            <Text style={hb.avatarTxt}>{user?.avatarLetter ?? "N"}</Text>
          </Pressable>
        </View>
      </View>

      {/* New badge */}
      <View style={hb.newBadge}>
        <View style={hb.newDot} />
        <Text style={hb.newTxt}>NOVO</Text>
      </View>

      {/* Content */}
      <View style={hb.content}>
        <Text style={hb.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <View style={hb.meta}>
          <Text style={hb.metaTxt}>{isMovie ? "Filme" : "Série"}</Text>
          <View style={hb.dot} />
          <Text style={hb.metaTxt}>{itemYear(item)}</Text>
          {rating != null && (
            <>
              <View style={hb.dot} />
              <Text style={{ fontSize: 10 }}>⭐</Text>
              <Text style={[hb.metaTxt, { color: "#fbbf24" }]}>{rating}</Text>
            </>
          )}
        </View>
        {!!item.overview && (
          <Text style={hb.overview} numberOfLines={2}>{item.overview}</Text>
        )}
        <View style={hb.btns}>
          <Pressable style={hb.playBtn} onPress={() => onNavigate(item)}>
            <Feather name="play" size={15} color="#fff" />
            <Text style={hb.playTxt}>Assistir</Text>
          </Pressable>
          <Pressable style={hb.listBtn} onPress={() => onAddToList(item)}>
            <Feather name="plus" size={15} color="#fff" />
            <Text style={hb.listTxt}>Minha Lista</Text>
          </Pressable>
        </View>
      </View>

      {/* Indicator dots */}
      <View style={hb.dots}>
        {items.slice(0, 6).map((_, i) => (
          <Pressable key={i} onPress={() => setIdx(i)} style={[hb.dotItem, i === idx && hb.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const hb = StyleSheet.create({
  wrap: { width: SW, height: 520, justifyContent: "flex-end" },
  header: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, zIndex: 10,
  },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  avatarBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: RED, alignItems: "center", justifyContent: "center",
  },
  avatarTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },
  newBadge: {
    position: "absolute", top: 110, left: 20,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: RED, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  newDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  newTxt: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  title: { fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: -0.5, lineHeight: 36 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaTxt: { fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.25)" },
  overview: { fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 19 },
  btns: { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: RED, paddingVertical: 13, borderRadius: 12,
  },
  playTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
  listBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12,
  },
  listTxt: { fontSize: 14, fontWeight: "600", color: "#fff" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, paddingBottom: 14 },
  dotItem: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "rgba(255,255,255,0.25)" },
  dotActive: { width: 18, backgroundColor: RED },
});

/* ─── Section Header ──────────────────────────────────────────────────────── */
function SectionHeader({
  title,
  icon,
  onSeeAll,
  accent,
}: {
  title: string;
  icon: any;
  onSeeAll?: () => void;
  accent?: string;
}) {
  const c = accent ?? RED;
  return (
    <View style={sh.row}>
      <View style={[sh.iconBox, { backgroundColor: `${c}22` }]}>
        <Feather name={icon} size={13} color={c} />
      </View>
      <Text style={sh.title}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} style={sh.seeAll}>
          <Text style={sh.seeAllTxt}>Ver todos</Text>
          <Feather name="chevron-right" size={13} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, marginBottom: 14 },
  iconBox: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 15, fontWeight: "800", color: "#fff" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllTxt: { fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: "600" },
});

/* ─── Poster Card ─────────────────────────────────────────────────────────── */
function PosterCard({
  item,
  badge,
  badgeColor,
  onPress,
}: {
  item: TmdbItem;
  badge?: string;
  badgeColor?: string;
  onPress: () => void;
}) {
  const img = tmdbImg(item.poster_path, "w342");
  return (
    <Pressable style={pc.card} onPress={onPress}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
          <Feather name="film" size={24} color="rgba(255,255,255,0.2)" />
        </View>
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.95)"]}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {badge && (
        <View style={[pc.badge, { backgroundColor: badgeColor ?? RED }]}>
          <Text style={pc.badgeTxt}>{badge}</Text>
        </View>
      )}
      <View style={pc.info}>
        <Text style={pc.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <Text style={pc.year}>{itemYear(item)}</Text>
      </View>
    </Pressable>
  );
}
const CARD_W = 120;
const CARD_H = 178;
const pc = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 12,
    overflow: "hidden", marginRight: 10,
    backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  badge: {
    position: "absolute", top: 7, left: 7,
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  title: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14, marginBottom: 2 },
  year: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
});

/* ─── Wide Backdrop Card (Em Breve) ───────────────────────────────────────── */
function UpcomingCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const img = tmdbImg(item.backdrop_path, "w780") ?? tmdbImg(item.poster_path, "w342");
  const dateStr = item.release_date ?? item.first_air_date ?? "";
  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : "Em breve";

  return (
    <Pressable style={uc.card} onPress={onPress}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a" }]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.95)"]}
        locations={[0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={uc.dateBadge}>
        <Feather name="clock" size={9} color={RED} />
        <Text style={uc.dateTxt}>{formattedDate.toUpperCase()}</Text>
      </View>
      <View style={uc.info}>
        <Text style={uc.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <Text style={uc.type}>{itemIsMovie(item) ? "Filme" : "Série"}</Text>
      </View>
    </Pressable>
  );
}
const uc = StyleSheet.create({
  card: {
    width: 210, height: 126, borderRadius: 12, overflow: "hidden",
    marginRight: 10, backgroundColor: "#1a1a1a",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    justifyContent: "space-between",
  },
  dateBadge: {
    margin: 8, alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: `${RED}55`,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  dateTxt: { fontSize: 9, fontWeight: "800", color: RED, letterSpacing: 0.8 },
  info: { padding: 10, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  type: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
});

/* ─── Episode Card (airing today) ─────────────────────────────────────────── */
function EpisodeCard({ item, onPress }: { item: TmdbItem; onPress: () => void }) {
  const img = tmdbImg(item.backdrop_path, "w780") ?? tmdbImg(item.poster_path, "w342");
  return (
    <Pressable style={ec.card} onPress={onPress}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a" }]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.95)"]}
        locations={[0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={ec.liveBadge}>
        <View style={ec.liveDot} />
        <Text style={ec.liveTxt}>HOJE</Text>
      </View>
      <View style={ec.info}>
        <Text style={ec.title} numberOfLines={1}>{itemTitle(item)}</Text>
        <Text style={ec.sub}>Novo episódio</Text>
      </View>
    </Pressable>
  );
}
const ec = StyleSheet.create({
  card: {
    width: 200, height: 115, borderRadius: 12, overflow: "hidden",
    marginRight: 10, backgroundColor: "#1a1a1a",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    justifyContent: "space-between",
  },
  liveBadge: {
    margin: 8, alignSelf: "flex-start",
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(0,0,0,0.6)", borderWidth: 1, borderColor: "#4caf5066",
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4caf50" },
  liveTxt: { fontSize: 9, fontWeight: "800", color: "#4caf50", letterSpacing: 1 },
  info: { padding: 10, gap: 2 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  sub: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
});

/* ─── Filter Tabs ─────────────────────────────────────────────────────────── */
type Filter = "Todos" | "Filmes" | "Séries" | "Em Breve";
const FILTERS: Filter[] = ["Todos", "Filmes", "Séries", "Em Breve"];

/* ══════════════════ MAIN SCREEN ══════════════════ */
export default function NovidadesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [filter, setFilter] = useState<Filter>("Todos");
  const [loading, setLoading] = useState(true);
  const [nowPlaying, setNowPlaying] = useState<TmdbItem[]>([]);
  const [upcoming, setUpcoming] = useState<TmdbItem[]>([]);
  const [onTheAir, setOnTheAir] = useState<TmdbItem[]>([]);
  const [airingToday, setAiringToday] = useState<TmdbItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [np, up, ota, at] = await Promise.all([
        api.tmdb.nowPlaying().catch(() => [] as TmdbItem[]),
        api.tmdb.upcoming().catch(() => [] as TmdbItem[]),
        api.tmdb.onTheAir().catch(() => [] as TmdbItem[]),
        api.tmdb.airingToday().catch(() => [] as TmdbItem[]),
      ]);
      setNowPlaying(np.slice(0, 20));
      setUpcoming(up.slice(0, 20));
      setOnTheAir(ota.slice(0, 20));
      setAiringToday(at.slice(0, 20));
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const navigate = (it: TmdbItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: itemIsMovie(it) ? "movie" : "tv",
        id: String(it.id),
        title: itemTitle(it),
      },
    });
  };

  const addToList = async (it: TmdbItem) => {
    if (!user?.id || !isSupabaseConfigured) {
      Alert.alert("Login necessário", "Faça login para adicionar à sua lista.");
      return;
    }
    try {
      await db.watchlist.add({
        user_id: user.id,
        tmdb_id: it.id,
        type: itemIsMovie(it) ? "movie" : "tv",
        title: itemTitle(it),
        poster_path: it.poster_path ?? "",
      });
      Alert.alert("Adicionado!", `"${itemTitle(it)}" foi adicionado à sua lista.`);
    } catch {
      Alert.alert("Erro", "Não foi possível adicionar à lista.");
    }
  };

  /* hero items: now playing + on the air */
  const heroItems = [
    ...nowPlaying.slice(0, 4),
    ...onTheAir.slice(0, 2),
  ];

  const isLoading = loading && heroItems.length === 0;

  /* Filtered sections */
  const showMovies = filter === "Todos" || filter === "Filmes";
  const showSeries = filter === "Todos" || filter === "Séries";
  const showEpisodes = filter === "Todos" || filter === "Séries";
  const showUpcoming = filter === "Todos" || filter === "Em Breve";

  return (
    <View style={st.container}>
      <StatusBar style="light" />

      {isLoading ? (
        <View style={st.loadWrap}>
          <View style={[st.loadHeader, { paddingTop: topPad + 10 }]}>
            <Text style={st.loadLogo}>
              <Text style={{ color: RED }}>NET</Text>PLAY
            </Text>
          </View>
          <ActivityIndicator color={RED} size="large" />
          <Text style={st.loadTxt}>Carregando novidades...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* Hero */}
          {heroItems.length > 0 && (
            <HeroBanner
              items={heroItems}
              topPad={topPad}
              user={user}
              onNavigate={navigate}
              onAddToList={addToList}
            />
          )}

          {/* Filter tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.filterRow}
            style={{ marginTop: 20, marginBottom: 28 }}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[st.filterPill, filter === f && st.filterActive]}
              >
                <Text style={[st.filterTxt, filter === f && st.filterTxtActive]}>{f}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Novos Filmes (now_playing) */}
          {showMovies && nowPlaying.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <SectionHeader
                title="🎬 Novos Filmes"
                icon="film"
                accent={RED}
                onSeeAll={() => router.push({ pathname: "/genre-browse", params: { type: "movie", title: "Novos Filmes" } })}
              />
              <FlatList
                data={nowPlaying}
                keyExtractor={(it) => String(it.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <PosterCard
                    item={item}
                    badge="NOVO"
                    badgeColor={RED}
                    onPress={() => navigate(item)}
                  />
                )}
              />
            </View>
          )}

          {/* Novas Séries (on_the_air) */}
          {showSeries && onTheAir.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <SectionHeader
                title="📺 Novas Séries"
                icon="tv"
                accent="#8b5cf6"
                onSeeAll={() => router.push({ pathname: "/genre-browse", params: { type: "tv", title: "Novas Séries" } })}
              />
              <FlatList
                data={onTheAir}
                keyExtractor={(it) => String(it.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <PosterCard
                    item={item}
                    badge="SÉRIE"
                    badgeColor="#8b5cf6"
                    onPress={() => navigate(item)}
                  />
                )}
              />
            </View>
          )}

          {/* Episódios de Hoje (airing_today) */}
          {showEpisodes && airingToday.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <SectionHeader
                title="🔴 Episódios de Hoje"
                icon="radio"
                accent="#4caf50"
              />
              <FlatList
                data={airingToday}
                keyExtractor={(it) => String(it.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <EpisodeCard item={item} onPress={() => navigate(item)} />
                )}
              />
            </View>
          )}

          {/* Em Breve (upcoming) */}
          {showUpcoming && upcoming.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <SectionHeader
                title="🕐 Em Breve"
                icon="clock"
                accent="#f97316"
                onSeeAll={() => router.push({ pathname: "/genre-browse", params: { type: "movie", title: "Em Breve" } })}
              />
              <FlatList
                data={upcoming}
                keyExtractor={(it) => String(it.id)}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <UpcomingCard item={item} onPress={() => navigate(item)} />
                )}
              />
            </View>
          )}

          {/* Empty state */}
          {!loading && nowPlaying.length === 0 && onTheAir.length === 0 && upcoming.length === 0 && (
            <View style={st.empty}>
              <Feather name="film" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={st.emptyTxt}>Nenhuma novidade disponível</Text>
              <TouchableOpacity onPress={load} style={[st.retryBtn, { backgroundColor: RED }]}>
                <Text style={st.retryTxt}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loadWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "#000" },
  loadHeader: {
    position: "absolute", top: 0, left: 0, right: 0,
    paddingHorizontal: 20,
  },
  loadLogo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  loadTxt: { fontSize: 14, color: "rgba(255,255,255,0.4)" },
  filterRow: { paddingHorizontal: 20, gap: 8 },
  filterPill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  filterActive: { borderColor: RED, backgroundColor: `${RED}20` },
  filterTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  filterTxtActive: { color: "#fff" },
  empty: { marginTop: 80, alignItems: "center", gap: 16 },
  emptyTxt: { fontSize: 14, color: "rgba(255,255,255,0.35)" },
  retryBtn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
