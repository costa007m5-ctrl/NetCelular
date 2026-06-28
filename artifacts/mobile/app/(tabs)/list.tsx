import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import type { WatchlistItem, WatchProgress } from "@/lib/supabase";
import { getAllLocalProgress } from "@/hooks/useWatchProgress";

const { width: SW } = Dimensions.get("window");
const TMDB = "https://image.tmdb.org/t/p";

const FILTERS = ["Todos", "Filmes", "Séries", "Canais", "Programas"] as const;
type Filter = (typeof FILTERS)[number];

const RED = "#ff1a1a";
const RED_GLOW = "rgba(255,26,26,0.18)";
const GLASS = "rgba(255,255,255,0.04)";
const GLASS_BORDER = "rgba(255,255,255,0.08)";
const BG = "#050505";

function StatCard({ icon, value, label, color }: { icon: any; value: any; label: string; color?: string }) {
  return (
    <View style={sc.card}>
      <View style={[sc.iconWrap, { backgroundColor: color ? `${color}22` : RED_GLOW }]}>
        <Feather name={icon} size={14} color={color ?? RED} />
      </View>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    padding: 12,
    alignItems: "flex-start",
    gap: 6,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { fontSize: 18, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  label: { fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: "600", letterSpacing: 0.5 },
});

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[fp.pill, active && fp.pillActive]}>
      {active && (
        <View style={fp.glow} />
      )}
      <Text style={[fp.text, active && fp.textActive]}>{label}</Text>
    </Pressable>
  );
}

const fp = StyleSheet.create({
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginRight: 8,
    backgroundColor: GLASS,
    position: "relative",
    overflow: "hidden",
  },
  pillActive: {
    borderColor: RED,
    backgroundColor: "rgba(255,26,26,0.15)",
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RED_GLOW,
    borderRadius: 50,
  },
  text: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  textActive: { color: "#fff" },
});

function SectionHeader({ title, icon }: { title: string; icon: any }) {
  return (
    <View style={sh.row}>
      <View style={sh.iconWrap}>
        <Feather name={icon} size={14} color={RED} />
      </View>
      <Text style={sh.title}>{title}</Text>
      <Text style={sh.seeAll}>Ver tudo  ›</Text>
    </View>
  );
}

const sh = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 8,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: RED_GLOW,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#fff", flex: 1, letterSpacing: -0.3 },
  seeAll: { fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: "600" },
});

function formatRemaining(posMsRaw?: number | null, durMsRaw?: number | null, pct?: number): string {
  const posMs = posMsRaw ?? 0;
  const durMs = durMsRaw ?? 0;
  if (durMs > 0 && posMs > 0) {
    const remainSec = Math.round((durMs - posMs) / 1000);
    if (remainSec <= 0) return "Concluído";
    const h = Math.floor(remainSec / 3600);
    const m = Math.floor((remainSec % 3600) / 60);
    if (h > 0) return `${h}h ${m}min restantes`;
    if (m > 0) return `${m} min restantes`;
    return `${remainSec}s restantes`;
  }
  const p = pct ?? 0;
  return p > 0 ? `${Math.round(100 - p)}% restante` : "";
}

function ContinueCard({ item, onPress }: { item: WatchProgress; onPress: () => void }) {
  // progress is stored as 0–1 ratio; convert to percentage for display
  const pct = Math.min(Math.max((item.progress ?? 0) * 100, 0), 100);
  const isLive = item.type === "tv" && item.season == null && item.episode == null;
  const imgUri = item.backdrop_path
    ? `${TMDB}/w780${item.backdrop_path}`
    : item.poster_path
    ? `${TMDB}/w342${item.poster_path}`
    : null;
  const remainText = formatRemaining((item as any).position_ms, (item as any).duration_ms, pct);

  return (
    <Pressable onPress={onPress} style={cc.wrap}>
      <View style={cc.card}>
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(5,5,5,0.5)", "rgba(5,5,5,0.97)"]}
          locations={[0.3, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        {isLive && (
          <View style={cc.liveBadge}>
            <View style={cc.liveDot} />
            <Text style={cc.liveText}>AO VIVO</Text>
          </View>
        )}
        <View style={cc.info}>
          <Text style={cc.title} numberOfLines={1}>{item.title}</Text>
          {item.season != null && (
            <Text style={cc.sub}>T{item.season} · E{item.episode ?? 1}</Text>
          )}
          <View style={cc.progressBg}>
            <View style={[cc.progressBar, { width: `${pct}%` as any }]} />
          </View>
          {remainText ? <Text style={cc.remaining}>{remainText}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const cc = StyleSheet.create({
  wrap: { marginRight: 12 },
  card: {
    width: 200,
    height: 280,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "#111",
    justifyContent: "flex-end",
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: RED,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },
  info: { padding: 12, gap: 4 },
  title: { fontSize: 14, fontWeight: "700", color: "#fff" },
  sub: { fontSize: 11, color: RED, fontWeight: "600" },
  progressBg: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  progressBar: {
    height: 3,
    backgroundColor: RED,
    borderRadius: 2,
    shadowColor: RED,
    shadowRadius: 4,
    shadowOpacity: 1,
  },
  remaining: { fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 },
});

function FavoriteCard({
  item,
  progress,
  onPress,
  onRemove,
}: {
  item: WatchlistItem;
  progress?: number;
  onPress: () => void;
  onRemove: () => void;
}) {
  const imgUri = item.poster_path ? `${TMDB}/w342${item.poster_path}` : null;
  const pct = Math.min(Math.max((progress ?? 0) * 100, 0), 100);

  return (
    <Pressable onPress={onPress} style={fv.wrap}>
      <View style={fv.card}>
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(5,5,5,0.95)"]}
          locations={[0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Pressable onPress={onRemove} style={fv.heartBtn} hitSlop={8}>
          <Feather name="heart" size={14} color={RED} />
        </Pressable>
        <View style={fv.badge}>
          <Text style={fv.badgeText}>{item.type === "movie" ? "FILME" : "SÉRIE"}</Text>
        </View>
        <View style={fv.bottom}>
          <Text style={fv.title} numberOfLines={2}>{item.title}</Text>
          {pct > 2 && pct < 96 && (
            <View style={fv.progressBg}>
              <View style={[fv.progressBar, { width: `${pct}%` as any }]} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const fv = StyleSheet.create({
  wrap: { marginRight: 12 },
  card: {
    width: 140,
    height: 210,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    backgroundColor: "#111",
    justifyContent: "space-between",
  },
  heartBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,26,26,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,26,26,0.3)",
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  badgeText: { fontSize: 8, fontWeight: "800", color: "rgba(255,255,255,0.6)", letterSpacing: 0.8 },
  bottom: { padding: 10, gap: 4 },
  title: { fontSize: 12, fontWeight: "700", color: "#fff", lineHeight: 16 },
  progressBg: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 1,
    overflow: "hidden",
    marginTop: 2,
  },
  progressBar: { height: 2, backgroundColor: RED, borderRadius: 1 },
});

function SavedRow({
  item,
  progress,
  onPress,
  onRemove,
}: {
  item: WatchlistItem;
  progress?: number;
  onPress: () => void;
  onRemove: () => void;
}) {
  const imgUri = item.poster_path ? `${TMDB}/w185${item.poster_path}` : null;
  const pct = Math.min(Math.max((progress ?? 0) * 100, 0), 100);
  const hasProgress = pct > 2 && pct < 96;

  return (
    <Pressable onPress={onPress} style={sr.row}>
      <View style={sr.thumb}>
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.5)"]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={sr.info}>
        <Text style={sr.title} numberOfLines={1}>{item.title}</Text>
        <Text style={sr.meta}>
          {item.type === "movie" ? "Filme" : "Série"}
          {hasProgress ? `  ·  ${Math.round(100 - pct)}% restante` : ""}
        </Text>
        <View style={sr.progressBg}>
          <View style={[sr.progressBar, { width: `${hasProgress ? pct : 0}%` as any }]} />
        </View>
      </View>
      <View style={sr.actions}>
        <Pressable onPress={onPress} style={sr.playBtn} hitSlop={8}>
          <Feather name="play" size={14} color="#fff" />
        </Pressable>
        <Pressable onPress={onRemove} style={sr.moreBtn} hitSlop={8}>
          <Feather name="more-vertical" size={16} color="rgba(255,255,255,0.35)" />
        </Pressable>
      </View>
    </Pressable>
  );
}

const sr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: GLASS,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: "hidden",
    padding: 0,
  },
  thumb: {
    width: 72,
    height: 68,
    backgroundColor: "#111",
    position: "relative",
  },
  info: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  meta: { fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: "500" },
  progressBg: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  progressBar: {
    height: 2,
    backgroundColor: RED,
    borderRadius: 1,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 12 },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: RED,
    shadowRadius: 8,
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 0 },
  },
  moreBtn: { padding: 4 },
});

export default function ListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 64 : insets.top;

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [progress, setProgress] = useState<WatchProgress[]>([]);
  const [progressMap, setProgressMap] = useState<Map<string, number>>(new Map());
  const [activeFilter, setActiveFilter] = useState<Filter>("Todos");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    // 1. Load local AsyncStorage data immediately (fast, no auth needed)
    let localMap = new Map<string, number>();
    try {
      const localEntries = await getAllLocalProgress();
      for (const e of localEntries) {
        localMap.set(e.contentId, e.progress);
      }
      if (localMap.size > 0) setProgressMap(new Map(localMap));
    } catch {}

    // 2. Stop spinner as soon as local data is ready — don't wait for Supabase
    setLoading(false);

    // 3. Load Supabase in background (non-blocking — spinner already gone)
    if (!user?.id || !isSupabaseConfigured) return;
    try {
      const [wl, pr] = await Promise.all([
        db.watchlist.getAll(user.id),
        db.progress.getAll(user.id),
      ]);
      setWatchlist(wl);

      // Merge cloud progress — cloud wins for cross-device sync
      const mergedMap = new Map(localMap);
      for (const p of pr) {
        const cid = `${p.type}_${p.tmdb_id}`;
        mergedMap.set(cid, p.progress ?? 0);
      }
      setProgressMap(mergedMap);
      setProgress(pr);
    } catch {}
  }, [user?.id]);

  // Only useFocusEffect — fires on mount AND whenever the tab regains focus
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const removeWatchlist = async (item: WatchlistItem) => {
    if (!user?.id) return;
    await db.watchlist.remove(user.id, item.tmdb_id, item.type);
    setWatchlist((prev) =>
      prev.filter((x) => !(x.tmdb_id === item.tmdb_id && x.type === item.type))
    );
  };

  const navigate = (id: number, type: "movie" | "tv", title: string) => {
    router.push({ pathname: "/detail", params: { type, id: String(id), title } });
  };

  const filteredWatchlist = watchlist.filter((item) => {
    if (activeFilter === "Todos" || activeFilter === "Canais" || activeFilter === "Programas") return true;
    if (activeFilter === "Filmes") return item.type === "movie";
    if (activeFilter === "Séries") return item.type === "tv";
    return true;
  });

  const movieCount = watchlist.filter((w) => w.type === "movie").length;
  const tvCount = watchlist.filter((w) => w.type === "tv").length;
  const totalItems = watchlist.length;
  const estHours = Math.round(movieCount * 2 + tvCount * 0.75);

  if (!user) {
    return (
      <View style={s.container}>
        <StatusBar style="light" />
        <View style={[s.emptyWrap, { paddingTop: topPad }]}>
          <View style={s.emptyIcon}>
            <Feather name="user" size={28} color={RED} />
          </View>
          <Text style={s.emptyTitle}>Entre na sua conta</Text>
          <Text style={s.emptyDesc}>Faça login para ver sua lista salva</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        {/* AMBIENT GLOW BG */}
        <View style={s.ambientGlow} />

        {/* HEADER */}
        <View style={[s.header, { paddingTop: topPad + 12 }]}>
          <View style={s.headerRow}>
            <Text style={s.logo}>
              <Text style={s.logoRed}>NET</Text>PLAY
            </Text>
            <View style={s.headerActions}>
              <Pressable style={s.avatarBtn} onPress={() => router.push("/(tabs)/profile")}>
                <Text style={s.avatarText}>{user.avatarLetter}</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <View style={s.logoAccent} />
            <Text style={s.pageTitle}><Text style={{ color: "#22c55e" }}>MINHA</Text>{" LISTA"}</Text>
          </View>
          <Text style={s.pageSubtitle}>Tudo que você salvou para assistir depois.</Text>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={RED} />
          </View>
        ) : (
          <>
            {/* STATS CARDS */}
            <View style={s.statsRow}>
              <StatCard icon="bookmark" value={totalItems} label="Na lista" />
              <StatCard icon="clock" value={`${estHours}h`} label="Estimado" color="#a78bfa" />
              <StatCard icon="film" value={movieCount} label="Filmes" color="#60a5fa" />
              <StatCard icon="monitor" value={tvCount} label="Séries" color="#34d399" />
            </View>

            {/* FILTERS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filtersWrap}
            >
              {FILTERS.map((f) => (
                <FilterPill
                  key={f}
                  label={f}
                  active={activeFilter === f}
                  onPress={() => setActiveFilter(f)}
                />
              ))}
            </ScrollView>

            {/* CONTINUE ASSISTINDO */}
            {progress.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Continue Assistindo" icon="play-circle" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.hScroll}
                >
                  {progress.map((item) => (
                    <ContinueCard
                      key={`${item.tmdb_id}-${item.type}`}
                      item={item}
                      onPress={() => navigate(item.tmdb_id, item.type, item.title)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* MEUS FAVORITOS */}
            {filteredWatchlist.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Meus Favoritos" icon="heart" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.hScroll}
                >
                  {filteredWatchlist.slice(0, 10).map((item) => (
                    <FavoriteCard
                      key={`${item.tmdb_id}-${item.type}`}
                      item={item}
                      progress={progressMap.get(`${item.type}_${item.tmdb_id}`)}
                      onPress={() => navigate(item.tmdb_id, item.type, item.title)}
                      onRemove={() => removeWatchlist(item)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* SALVOS PARA DEPOIS */}
            {filteredWatchlist.length > 0 && (
              <View style={s.section}>
                <SectionHeader title="Salvos para Depois" icon="bookmark" />
                {filteredWatchlist.map((item) => (
                  <SavedRow
                    key={`${item.tmdb_id}-${item.type}-row`}
                    item={item}
                    progress={progressMap.get(`${item.type}_${item.tmdb_id}`)}
                    onPress={() => navigate(item.tmdb_id, item.type, item.title)}
                    onRemove={() => removeWatchlist(item)}
                  />
                ))}
              </View>
            )}

            {/* EMPTY STATE */}
            {filteredWatchlist.length === 0 && progress.length === 0 && (
              <View style={s.emptyWrap}>
                <View style={s.emptyIcon}>
                  <Feather name="bookmark" size={28} color={RED} />
                </View>
                <Text style={s.emptyTitle}>Lista vazia</Text>
                <Text style={s.emptyDesc}>
                  Explore e adicione filmes e séries para assistir depois
                </Text>
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
    top: -80,
    left: SW / 2 - 150,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(255,26,26,0.06)",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  logo: { fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: 3 },
  logoRed: { color: RED },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  logoAccent: { width: 3, height: 26, borderRadius: 2, backgroundColor: "#22c55e" },
  pageTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  filtersWrap: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: "center",
  },
  section: { marginBottom: 32 },
  hScroll: { paddingHorizontal: 20, paddingBottom: 4 },
  loadingWrap: {
    height: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 14,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: RED_GLOW,
    borderWidth: 1,
    borderColor: "rgba(255,26,26,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    lineHeight: 20,
  },
});
