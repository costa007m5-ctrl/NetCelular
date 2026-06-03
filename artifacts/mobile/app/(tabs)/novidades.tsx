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
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { api, getApiBase } from "@/lib/api";
import type { TmdbItem } from "@/lib/api";

interface R2RegItem {
  id: string; r2Key: string; tmdbId: number; tmdbType: "movie" | "tv";
  title: string; label: string; season: number | null; episode: number | null; addedAt: string;
}

import { useCatalog } from "@/lib/catalog-context";

const { width: SW } = Dimensions.get("window");
const RED = "#e50914";
const BATCH = 12;

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function itemTitle(it: TmdbItem) { return it.title ?? it.name ?? "Sem título"; }
function itemYear(it: TmdbItem)  { return (it.release_date ?? it.first_air_date ?? "").slice(0, 4); }
function itemIsMovie(it: TmdbItem) {
  return !!(it.title && !it.name) || it.media_type === "movie";
}
function tmdbImg(path: string | null | undefined, size = "w500") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/* Fetch TMDB item — tries TV first, then movie (needed for anime IDs that
   can be either type in TMDB) */
async function fetchTmdbItem(id: number, preferType?: "movie" | "tv"): Promise<TmdbItem | null> {
  if (preferType === "movie") {
    return api.tmdb.movie(id).catch(() => null);
  }
  if (preferType === "tv") {
    return api.tmdb.tv(id).catch(() => null);
  }
  // Unknown type: try TV first, fallback to movie
  const tv = await api.tmdb.tv(id).catch(() => null);
  if (tv) return tv;
  return api.tmdb.movie(id).catch(() => null);
}

/* ─── Hero Banner ──────────────────────────────────────────────────────────── */
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (items.length < 2) return;
    timer.current = setInterval(() => setIdx((i) => (i + 1) % Math.min(items.length, 6)), 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [items.length]);

  const item = items[idx];
  if (!item) return null;

  const img = tmdbImg(item.backdrop_path, "w1280") ?? tmdbImg(item.poster_path, "w500");
  const rating = item.vote_average ? Math.round(item.vote_average * 10) / 10 : null;
  const isMovie = itemIsMovie(item);

  return (
    <View style={hb.wrap}>
      {img ? (
        <Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" transition={500} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a" }]} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0.5)", "transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,1)"]}
        locations={[0, 0.2, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[hb.header, { paddingTop: topPad + 10 }]}>
        <Text style={hb.logo}><Text style={{ color: RED }}>NET</Text>PLAY</Text>
        <View style={hb.actions}>
          <Pressable style={hb.iconBtn} onPress={() => router.push("/(tabs)/search" as any)}>
            <Feather name="search" size={18} color="rgba(255,255,255,0.85)" />
          </Pressable>
          <Pressable style={hb.avatarBtn} onPress={() => router.push("/(tabs)/profile" as any)}>
            <Text style={hb.avatarTxt}>{user?.avatarLetter ?? "N"}</Text>
          </Pressable>
        </View>
      </View>

      {/* NOVO badge */}
      <View style={hb.newBadge}>
        <View style={hb.newDot} />
        <Text style={hb.newTxt}>NOVO</Text>
      </View>

      {/* Content bottom */}
      <View style={hb.content}>
        <Text style={hb.title} numberOfLines={2}>{itemTitle(item)}</Text>
        <View style={hb.meta}>
          <View style={[hb.typePill, { backgroundColor: isMovie ? "#3b82f620" : "#8b5cf620", borderColor: isMovie ? "#3b82f640" : "#8b5cf640" }]}>
            <Text style={[hb.typeTxt, { color: isMovie ? "#3b82f6" : "#8b5cf6" }]}>{isMovie ? "FILME" : "SÉRIE"}</Text>
          </View>
          {itemYear(item) ? <Text style={hb.metaTxt}>{itemYear(item)}</Text> : null}
          {rating != null && (
            <>
              <Text style={hb.metaDot}>•</Text>
              <Text style={{ fontSize: 11 }}>⭐</Text>
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

      {/* Dot indicators */}
      <View style={hb.dots}>
        {items.slice(0, 6).map((_, i) => (
          <Pressable key={i} onPress={() => setIdx(i)} style={[hb.dotBase, i === idx && hb.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const hb = StyleSheet.create({
  wrap: { width: SW, height: 530, justifyContent: "flex-end" },
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
  content: { paddingHorizontal: 20, paddingBottom: 10, gap: 8 },
  title: { fontSize: 30, fontWeight: "900", color: "#fff", letterSpacing: -0.5, lineHeight: 34 },
  meta: { flexDirection: "row", alignItems: "center", gap: 7 },
  typePill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  typeTxt: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  metaTxt: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "600" },
  metaDot: { fontSize: 10, color: "rgba(255,255,255,0.2)" },
  overview: { fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 19 },
  btns: { flexDirection: "row", gap: 10, marginTop: 4 },
  playBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: RED, paddingVertical: 13, borderRadius: 12,
  },
  playTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
  listBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12,
  },
  listTxt: { fontSize: 14, fontWeight: "600", color: "#fff" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, paddingBottom: 14 },
  dotBase: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "rgba(255,255,255,0.25)" },
  dotActive: { width: 18, backgroundColor: RED },
});

/* ─── Section Header ──────────────────────────────────────────────────────── */
function SectionHeader({
  title,
  icon,
  accent,
  onSeeAll,
}: {
  title: string;
  icon: any;
  accent?: string;
  onSeeAll?: () => void;
}) {
  const c = accent ?? RED;
  return (
    <View style={sh.row}>
      <View style={[sh.iconBox, { backgroundColor: `${c}22` }]}>
        <Feather name={icon} size={13} color={c} />
      </View>
      <Text style={sh.title}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} style={sh.seeAll} hitSlop={8}>
          <Text style={sh.seeAllTxt}>Ver todos</Text>
          <Feather name="chevron-right" size={13} color="rgba(255,255,255,0.3)" />
        </TouchableOpacity>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, marginBottom: 14,
  },
  iconBox: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  title: { flex: 1, fontSize: 15, fontWeight: "800", color: "#fff" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllTxt: { fontSize: 12, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
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
          <Feather name="film" size={24} color="rgba(255,255,255,0.15)" />
        </View>
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.9)"]}
        locations={[0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {badge && (
        <View style={[pc.badge, { backgroundColor: badgeColor ?? RED }]}>
          <Text style={pc.badgeTxt}>{badge}</Text>
        </View>
      )}
      <View style={pc.info}>
        <Text style={pc.titleTxt} numberOfLines={2}>{itemTitle(item)}</Text>
        <Text style={pc.yearTxt}>{itemYear(item)}</Text>
      </View>
    </Pressable>
  );
}
const CARD_W = 118;
const CARD_H = 176;
const pc = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 12, overflow: "hidden",
    marginRight: 10, backgroundColor: "#1a1a1a",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  badge: {
    position: "absolute", top: 7, left: 7,
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  info: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, gap: 2 },
  titleTxt: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  yearTxt: { fontSize: 10, color: "rgba(255,255,255,0.35)" },
});

/* ─── Episode Card (new episodes) ─────────────────────────────────────────── */
function EpisodeCard({
  item,
  onPress,
}: {
  item: TmdbItem & { last_episode_to_air?: any };
  onPress: () => void;
}) {
  const ep = item.last_episode_to_air;
  const img = ep?.still_path
    ? `https://image.tmdb.org/t/p/w500${ep.still_path}`
    : tmdbImg(item.backdrop_path, "w780") ?? tmdbImg(item.poster_path, "w342");
  const airDate = ep?.air_date
    ? new Date(ep.air_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : null;

  return (
    <Pressable style={epCard.card} onPress={onPress}>
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
      {/* Series title top */}
      <View style={epCard.topRow}>
        <View style={epCard.seriesBadge}>
          <Text style={epCard.seriesTxt} numberOfLines={1}>{itemTitle(item)}</Text>
        </View>
      </View>
      {/* Episode info bottom */}
      <View style={epCard.info}>
        {ep && (
          <Text style={epCard.epLabel}>
            T{ep.season_number} E{ep.episode_number}
            {ep.name ? `  •  ${ep.name}` : ""}
          </Text>
        )}
        {airDate && (
          <View style={epCard.dateRow}>
            <Feather name="calendar" size={10} color="#4caf50" />
            <Text style={epCard.dateTxt}>{airDate}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
const epCard = StyleSheet.create({
  card: {
    width: 230, height: 130, borderRadius: 12, overflow: "hidden",
    marginRight: 10, backgroundColor: "#1a1a1a",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    justifyContent: "space-between",
  },
  topRow: { padding: 8 },
  seriesBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
  },
  seriesTxt: { fontSize: 11, fontWeight: "700", color: "#fff", maxWidth: 160 },
  info: { padding: 10, gap: 4 },
  epLabel: { fontSize: 12, fontWeight: "700", color: "#fff" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dateTxt: { fontSize: 11, color: "#4caf50", fontWeight: "600" },
});

/* ─── Skeleton placeholder ────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <View style={[pc.card, { backgroundColor: "#1a1a1a", borderColor: "rgba(255,255,255,0.05)" }]}>
      <View style={{ flex: 1, backgroundColor: "#222" }} />
    </View>
  );
}

/* ─── Filter tabs ─────────────────────────────────────────────────────────── */
type Filter = "Todos" | "Filmes" | "Séries" | "Animes" | "Doramas";
const FILTERS: Filter[] = ["Todos", "Filmes", "Séries", "Animes", "Doramas"];

/* ══════════════════ MAIN SCREEN ══════════════════ */
export default function NovidadesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { byType, loading: catalogLoading } = useCatalog();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [filter, setFilter] = useState<Filter>("Todos");
  const [loading, setLoading] = useState(true);

  const [movies, setMovies] = useState<TmdbItem[]>([]);
  const [series, setSeries] = useState<(TmdbItem & { last_episode_to_air?: any })[]>([]);
  const [animes, setAnimes] = useState<TmdbItem[]>([]);
  const [doramas, setDoramas] = useState<TmdbItem[]>([]);

  // R2 Acervo
  const [r2MovieSet, setR2MovieSet] = useState<Set<number>>(new Set());
  const [r2TvSet, setR2TvSet] = useState<Set<number>>(new Set());
  const [r2Movies, setR2Movies] = useState<TmdbItem[]>([]);
  const [r2EpSeries, setR2EpSeries] = useState<(TmdbItem & { last_episode_to_air: any })[]>([]);
  const [r2SeriesList, setR2SeriesList] = useState<TmdbItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const movieIds  = byType.movie  ?? [];
      const tvIds     = byType.tv     ?? [];
      const animeIds  = byType.anime  ?? [];
      const doramaIds = byType.dorama ?? [];

      if (movieIds.length > 0) {
        /* Catalog loaded — fetch TMDB details from IDs */
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

        const [mResults, tResults, aResults, dResults] = await Promise.all([
          Promise.all(mSlice.map((id) => api.tmdb.movie(id).catch(() => null))),
          Promise.all(tSlice.map((id) => api.tmdb.tv(id).catch(() => null))),
          Promise.all(aSlice.map((id) => {
            const t = inferType(id, "tv");
            return (t === "tv" ? api.tmdb.tv(id) : api.tmdb.movie(id)).catch(() => null);
          })),
          Promise.all(dSlice.map((id) => {
            const t = inferType(id, "tv");
            return (t === "tv" ? api.tmdb.tv(id) : api.tmdb.movie(id)).catch(() => null);
          })),
        ]);

        setMovies(mResults.filter(Boolean) as TmdbItem[]);
        setSeries(tResults.filter(Boolean) as any[]);
        setAnimes(aResults.filter(Boolean) as TmdbItem[]);
        setDoramas(dResults.filter(Boolean) as TmdbItem[]);
      } else {
        /* Fallback: catalog not available — use TMDB popular/trending directly */
        const [popularMovies, popularTv, trending] = await Promise.all([
          api.tmdb.popularMovies().catch(() => [] as TmdbItem[]),
          api.tmdb.popularTv().catch(() => [] as TmdbItem[]),
          api.tmdb.trending().catch(() => ({ all: [] as TmdbItem[], movies: [] as TmdbItem[], tv: [] as TmdbItem[] })),
        ]);

        setMovies((popularMovies.length > 0 ? popularMovies : trending.movies).slice(0, BATCH));
        setSeries((popularTv.length > 0 ? popularTv : trending.tv).slice(0, BATCH) as any[]);
        /* Animes/doramas: filter trending by original_language */
        const animeItems = trending.all
          .filter((it) => it.original_language === "ja")
          .slice(0, BATCH);
        const doramaItems = trending.all
          .filter((it) => it.original_language === "ko")
          .slice(0, BATCH);
        setAnimes(animeItems);
        setDoramas(doramaItems);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [byType]);

  useEffect(() => {
    if (!catalogLoading) load();
  }, [load, catalogLoading]);

  // Load R2 registry non-blocking
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
        const items: R2RegItem[] = data.items ?? [];
        if (items.length === 0) return;

        // Reverse so newest additions come first (registry stores oldest→newest)
        const sortedItems = [...items].reverse();

        // Movies
        const movieItems = sortedItems.filter((i) => i.tmdbType === "movie");
        const uniqueMovieIds = [...new Set(movieItems.map((i) => i.tmdbId))];
        const movieResults = await Promise.all(
          uniqueMovieIds.map((id) => api.tmdb.movie(id).catch(() => null))
        );
        const validMovies = movieResults.filter(Boolean) as TmdbItem[];
        setR2Movies(validMovies);
        setR2MovieSet(new Set(uniqueMovieIds));

        // All TV series from R2 → "Novas Séries"
        const allTvItems = sortedItems.filter((i) => i.tmdbType === "tv");
        const uniqueAllTvIds = [...new Set(allTvItems.map((i) => i.tmdbId))];
        const allTvResults = await Promise.all(
          uniqueAllTvIds.map((id) => api.tmdb.tv(id).catch(() => null))
        );
        const validTvSeries = allTvResults.filter(Boolean) as TmdbItem[];
        setR2SeriesList(validTvSeries);
        setR2TvSet(new Set(uniqueAllTvIds));

        // TV with specific episodes → inject into "Novos Episódios"
        const tvItems = sortedItems.filter((i) => i.tmdbType === "tv" && i.episode != null);
        const uniqueTvIds = [...new Set(tvItems.map((i) => i.tmdbId))];
        const epSeries = validTvSeries
          .filter((s) => uniqueTvIds.includes(s.id))
          .map((tmdbItem) => {
            const epRegs = tvItems.filter((i) => i.tmdbId === tmdbItem.id);
            const latest = epRegs[0]; // sortedItems is reversed (newest first), so [0] is newest
            return {
              ...tmdbItem,
              last_episode_to_air: {
                season_number: latest.season,
                episode_number: latest.episode,
                name: latest.label,
                air_date: latest.addedAt,
                still_path: null,
              },
            };
          });
        setR2EpSeries(epSeries);
      } catch {}
    };
    loadR2();
  }, []);

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
      Alert.alert("Erro", "Não foi possível adicionar.");
    }
  };

  /* Merge R2 items into catalog lists */
  const allMovies = [
    ...r2Movies,
    ...movies.filter((m) => !r2MovieSet.has(m.id)),
  ];
  const allSeries = [
    ...r2SeriesList,
    ...series.filter((s: any) => !r2TvSet.has(s.id)),
  ];
  // R2 TV series that have TMDB last_episode_to_air (even folder-level registrations)
  const r2EpSeriesIds = new Set(r2EpSeries.map((s) => s.id));
  const r2SeriesWithLatestEp = r2SeriesList.filter(
    (s: any) => s?.last_episode_to_air?.episode_number && !r2EpSeriesIds.has(s.id)
  );
  const allEpisodes = [
    ...r2EpSeries,
    ...r2SeriesWithLatestEp,
    ...series.filter((s: any) => s?.last_episode_to_air?.episode_number && !r2TvSet.has(s.id)),
  ];

  /* Hero items: first 4 movies + first 2 series */
  const heroItems = [...allMovies.slice(0, 4), ...series.slice(0, 2)];

  /* Episodes: series that have last_episode_to_air info */
  const withEpisodes = allEpisodes;

  const showMovies   = filter === "Todos" || filter === "Filmes";
  const showSeries   = filter === "Todos" || filter === "Séries";
  const showEpisodes = filter === "Todos" || filter === "Séries";
  const showAnimes   = filter === "Todos" || filter === "Animes";
  const showDoramas  = filter === "Todos" || filter === "Doramas";

  const isLoading = loading;

  return (
    <View style={st.container}>
      <StatusBar style="light" />

      {isLoading ? (
        /* Loading state */
        <View style={st.loadWrap}>
          <View style={[st.loadHeader, { paddingTop: topPad + 10 }]}>
            <Text style={st.loadLogo}><Text style={{ color: RED }}>NET</Text>PLAY</Text>
          </View>
          <ActivityIndicator color={RED} size="large" />
          <Text style={st.loadTxt}>Carregando novidades...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
          {/* Hero Banner */}
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
            style={{ marginTop: 20, marginBottom: 24 }}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[st.pill, filter === f && st.pillActive]}
              >
                <Text style={[st.pillTxt, filter === f && st.pillTxtActive]}>{f}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* ── Novos Filmes ── */}
          {showMovies && allMovies.length > 0 && (
            <View style={st.section}>
              <SectionHeader
                title="🎬 Novos Filmes"
                icon="film"
                accent={RED}
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "movie", title: "Novos Filmes" } } as any)}
              />
              <FlatList
                data={allMovies}
                keyExtractor={(it) => `m-${it.id}`}
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

          {/* ── Novas Séries ── */}
          {showSeries && allSeries.length > 0 && (
            <View style={st.section}>
              <SectionHeader
                title="📺 Novas Séries"
                icon="tv"
                accent="#8b5cf6"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "tv", title: "Novas Séries" } } as any)}
              />
              <FlatList
                data={allSeries}
                keyExtractor={(it) => `t-${it.id}`}
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

          {/* ── Novos Episódios ── */}
          {showEpisodes && withEpisodes.length > 0 && (
            <View style={st.section}>
              <SectionHeader title="🔴 Novos Episódios" icon="radio" accent="#4caf50" />
              <FlatList
                data={withEpisodes}
                keyExtractor={(it) => `ep-${it.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <EpisodeCard item={item as any} onPress={() => navigate(item)} />
                )}
              />
            </View>
          )}

          {/* ── Animes ── */}
          {showAnimes && animes.length > 0 && (
            <View style={st.section}>
              <SectionHeader
                title="🎌 Animes"
                icon="zap"
                accent="#f97316"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "anime", title: "Animes" } } as any)}
              />
              <FlatList
                data={animes}
                keyExtractor={(it) => `a-${it.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <PosterCard item={item} badge="ANIME" badgeColor="#f97316" onPress={() => navigate(item)} />
                )}
              />
            </View>
          )}

          {/* ── Doramas ── */}
          {showDoramas && doramas.length > 0 && (
            <View style={st.section}>
              <SectionHeader
                title="🌸 Doramas"
                icon="heart"
                accent="#ec4899"
                onSeeAll={() => router.push({ pathname: "/catalog-list", params: { catalog_type: "dorama", title: "Doramas" } } as any)}
              />
              <FlatList
                data={doramas}
                keyExtractor={(it) => `d-${it.id}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item }) => (
                  <PosterCard item={item} badge="DORAMA" badgeColor="#ec4899" onPress={() => navigate(item)} />
                )}
              />
            </View>
          )}

          {/* Empty state */}
          {!loading &&
            allMovies.length === 0 &&
            series.length === 0 &&
            animes.length === 0 &&
            doramas.length === 0 && (
              <View style={st.empty}>
                <Feather name="wifi-off" size={40} color="rgba(255,255,255,0.12)" />
                <Text style={st.emptyTxt}>Não foi possível carregar novidades</Text>
                <TouchableOpacity onPress={load} style={[st.retryBtn, { backgroundColor: RED }]}>
                  <Feather name="refresh-cw" size={14} color="#fff" />
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

  /* Loading */
  loadWrap: {
    flex: 1, backgroundColor: "#000",
    alignItems: "center", justifyContent: "center", gap: 16,
  },
  loadHeader: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 20 },
  loadLogo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  loadTxt: { fontSize: 14, color: "rgba(255,255,255,0.4)" },

  /* Filter row */
  filterRow: { paddingHorizontal: 20, gap: 8 },
  pill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 50,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillActive: { borderColor: RED, backgroundColor: `${RED}20` },
  pillTxt: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  pillTxtActive: { color: "#fff" },

  /* Sections */
  section: { marginBottom: 30 },

  /* Empty */
  empty: { marginTop: 60, alignItems: "center", gap: 16, paddingHorizontal: 40 },
  emptyTxt: { fontSize: 14, color: "rgba(255,255,255,0.35)", textAlign: "center" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
  },
  retryTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
