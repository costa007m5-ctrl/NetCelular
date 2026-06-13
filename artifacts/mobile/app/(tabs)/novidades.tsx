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
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import type { ContentItem } from "@/constants/content";
import { r2Route } from "@/lib/r2-direct";

const { width: W, height: H } = Dimensions.get("window");
const RED    = "#e50914";
const AMBER  = "#f59e0b";
const GREEN  = "#22c55e";
const BLUE   = "#3b82f6";
const PURPLE = "#8b5cf6";
const TEAL   = "#0891b2";

// ─── Data types ───────────────────────────────────────────────────────────────
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
interface WhatsNewResponse {
  ok: boolean;
  since: string;
  days: number;
  total: number;
  movies: WhatsNewItem[];
  series: WhatsNewItem[];
  episodes?: WhatsNewItem[];
}

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

async function fetchWhatsNew(days = 30): Promise<WhatsNewResponse> {
  try {
    const res = await r2Route<WhatsNewResponse>(`/flix2/whats-new?days=${days}`);
    if (!res.ok) return { ok: false, since: "", days, total: 0, movies: [], series: [] };
    return res;
  } catch {
    return { ok: false, since: "", days, total: 0, movies: [], series: [] };
  }
}

function dateLabel(dateStr: string): string {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yDate = new Date(now.getTime() - 86400000);
  const yesterday = yDate.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  if (dateStr === today) return "Hoje";
  if (dateStr === yesterday) return "Ontem";
  if (dateStr >= weekAgo) return "Esta semana";
  return "Anteriores";
}

function groupItems(items: WhatsNewItem[]): Record<string, WhatsNewItem[]> {
  const groups: Record<string, WhatsNewItem[]> = {
    "Hoje": [],
    "Ontem": [],
    "Esta semana": [],
    "Anteriores": [],
  };
  for (const item of items) {
    const label = dateLabel(item.added_date);
    groups[label].push(item);
  }
  return groups;
}

// ─── SkeletonCard ─────────────────────────────────────────────────────────────
function SkeletonCard({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.04)", "rgba(255,255,255,0.10)"],
  });
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 28 }}>
      {[0, 1, 2, 3].map((i) => (
        <Animated.View key={i} style={{
          width: 120, height: 175, borderRadius: 12, backgroundColor: bg as any,
        }} />
      ))}
    </View>
  );
}

// ─── PosterCard ───────────────────────────────────────────────────────────────
function PosterCard({ item, onPress, isNew = false }: {
  item: ContentItem; onPress: () => void; isNew?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const pi = () => Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 30 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 26 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po}>
      <Animated.View style={{ width: 120, marginRight: 10, transform: [{ scale }] }}>
        <View style={sty.pCard}>
          {!err && item.posterPath ? (
            <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={280}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="film" size={22} color="rgba(255,255,255,0.08)" />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.82)"]}
            locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
          {isNew && (
            <View style={sty.newBadge}>
              <Text style={sty.newBadgeText}>NOVO</Text>
            </View>
          )}
          {item.rating > 0 && (
            <View style={sty.ratingPin}>
              <Feather name="star" size={8} color={AMBER} />
              <Text style={sty.ratingPinText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={sty.pTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={sty.pMeta}>{item.type === "movie" ? "Filme" : "Série"}{item.year > 0 ? ` · ${item.year}` : ""}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── FeaturedCard (hero for top item) ────────────────────────────────────────
function FeaturedCard({ item, onPress, badge }: {
  item: ContentItem; onPress: () => void; badge?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const [err, setErr] = useState(false);
  const imgUri = item.backdropPath || item.posterPath;
  const pi = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 28 }).start();
  const po = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pi} onPressOut={po} style={sty.featPad}>
      <Animated.View style={[sty.featCard, { transform: [{ scale }] }]}>
        {!err && imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" transition={300}
            onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.96)"]}
          locations={[0.25, 0.55, 1]} style={StyleSheet.absoluteFill} />
        <View style={sty.featContent}>
          {badge && (
            <View style={sty.featBadge}>
              <Feather name="zap" size={9} color={RED} />
              <Text style={sty.featBadgeText}>{badge}</Text>
            </View>
          )}
          <Text style={sty.featTitle} numberOfLines={2}>{item.title}</Text>
          <View style={sty.featMeta}>
            {item.year > 0 && <Text style={sty.featYear}>{item.year}</Text>}
            <Text style={sty.featType}>{item.type === "movie" ? "Filme" : "Série"}</Text>
            {item.rating > 0 && (
              <View style={sty.featRate}>
                <Feather name="star" size={9} color={AMBER} />
                <Text style={sty.featRateText}>{item.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
          <View style={sty.featPlayBtn}>
            <Feather name="play" size={13} color="#fff" />
            <Text style={sty.featPlayText}>Assistir agora</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
function SectionHeader({ title, icon, badge, accentColor = RED, onSeeAll }: {
  title: string; icon?: keyof typeof Feather.glyphMap;
  badge?: string; accentColor?: string; onSeeAll?: () => void;
}) {
  const words = title.split(" ");
  const first = words[0];
  const rest  = words.slice(1).join(" ");
  return (
    <View style={[sty.secHead, { overflow: "hidden" }]}>
      <LinearGradient
        colors={[`${accentColor}28`, "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={[sty.accentBar, { backgroundColor: accentColor }]} />
        {icon && (
          <View style={[sty.iconWrap, { backgroundColor: `${accentColor}18` }]}>
            <Feather name={icon} size={13} color={accentColor} />
          </View>
        )}
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={[sty.secTitle, { color: accentColor }]}>{first}</Text>
          {rest.length > 0 && <Text style={sty.secTitle}> {rest}</Text>}
        </View>
        {badge && (
          <View style={[sty.badge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
            <Text style={[sty.badgeText, { color: accentColor }]}>{badge}</Text>
          </View>
        )}
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={sty.seeAllBtn}>
          <Text style={sty.seeAllText}>Ver mais</Text>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── DateDivider ──────────────────────────────────────────────────────────────
function DateDivider({ label, accentColor = RED, count }: { label: string; accentColor?: string; count: number }) {
  return (
    <View style={sty.divRow}>
      <LinearGradient colors={["transparent", `${accentColor}44`, "transparent"]}
        style={sty.divLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
      <View style={[sty.divLabel, { backgroundColor: `${accentColor}14`, borderColor: `${accentColor}30` }]}>
        <Text style={[sty.divText, { color: accentColor }]}>{label}</Text>
        <View style={[sty.divCount, { backgroundColor: `${accentColor}25` }]}>
          <Text style={[sty.divCountText, { color: accentColor }]}>{count}</Text>
        </View>
      </View>
      <LinearGradient colors={["transparent", `${accentColor}44`, "transparent"]}
        style={sty.divLine} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} />
    </View>
  );
}

// ─── Ver Mais Modal ───────────────────────────────────────────────────────────
function VerMaisModal({ visible, title, items, accentColor = RED, onClose, onItemPress }: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (item: ContentItem) => void;
}) {
  const slideY   = useRef(new Animated.Value(H)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) {
      setQuery("");
      Animated.parallel([
        Animated.timing(slideY, { toValue: 0, duration: 340, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: H, duration: 300, useNativeDriver: true }),
        Animated.timing(backdrop, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter((i) => i.title.toLowerCase().includes(q));
  }, [query, items]);

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.7)", opacity: backdrop }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[sty.modal, { transform: [{ translateY: slideY }] }]}>
        <LinearGradient colors={["#0a0810", "#060408"]} style={StyleSheet.absoluteFill} />
        <View style={[sty.modalHandle, { backgroundColor: `${accentColor}60` }]} />
        <View style={sty.modalHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={[sty.modalAccent, { backgroundColor: accentColor }]} />
            <Text style={sty.modalTitle}>{title}</Text>
            <View style={[sty.badge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
              <Text style={[sty.badgeText, { color: accentColor }]}>
                {query.trim() ? `${filtered.length} de ${items.length}` : items.length}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={sty.modalClose}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
        <View style={sty.searchWrap}>
          <Feather name="search" size={14} color={query ? accentColor : "rgba(255,255,255,0.35)"} style={{ marginRight: 8 }} />
          <TextInput
            value={query} onChangeText={setQuery}
            placeholder="Buscar nesta lista..." placeholderTextColor="rgba(255,255,255,0.28)"
            style={[sty.searchInput, query ? { color: "#fff" } : {}]}
            returnKeyType="search" clearButtonMode="while-editing" autoCorrect={false}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x-circle" size={14} color={accentColor} />
            </TouchableOpacity>
          ) : null}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `${item.id}_${idx}`}
          numColumns={3}
          style={{ flex: 1 }}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={9}
          windowSize={5}
          renderItem={({ item }) => {
            const [err, setErr] = useState(false);
            return (
              <Pressable onPress={() => { onItemPress(item); onClose(); }}
                style={{ width: CARD_W, marginBottom: 8 }}>
                <View style={{ width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" }}>
                  {!err && item.posterPath ? (
                    <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
                      contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
                  ) : (
                    <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
                  )}
                  <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]} locations={[0.5, 1]}
                    style={StyleSheet.absoluteFill} />
                  <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 }}>
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 14 }}
                      numberOfLines={2}>{item.title}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </Animated.View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
type FilterType = "all" | "movies" | "series";

const ACCENT_BY_LABEL: Record<string, string> = {
  "Hoje": RED,
  "Ontem": PURPLE,
  "Esta semana": BLUE,
  "Anteriores": TEAL,
};

export default function NovidadesScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 0 : insets.top;

  const shimmer = useRef(new Animated.Value(0)).current;
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData]             = useState<WhatsNewResponse | null>(null);
  const [filter, setFilter]         = useState<FilterType>("all");
  const [modal, setModal]           = useState<{
    visible: boolean; title: string; items: ContentItem[]; accent: string;
  }>({ visible: false, title: "", items: [], accent: RED });

  const openModal = (title: string, items: ContentItem[], accent = RED) =>
    setModal({ visible: true, title, items, accent });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  }, [router]);

  const load = useCallback(async () => {
    const res = await fetchWhatsNew(30);
    setData(res);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    if (Platform.OS === "web") loop.start();
    load().then(() => {
      loop.stop();
      setLoading(false);
    });
    return () => loop.stop();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().then(() => setRefreshing(false));
  }, [load]);

  // ── Compute filtered + grouped items ───────────────────────────────────────
  const allItems = useMemo((): WhatsNewItem[] => {
    if (!data) return [];
    let items: WhatsNewItem[] = [];
    if (filter === "all")     items = [...(data.movies ?? []), ...(data.series ?? [])];
    else if (filter === "movies") items = data.movies ?? [];
    else items = data.series ?? [];
    return items.filter((i) => i.title);
  }, [data, filter]);

  const groups = useMemo(() => groupItems(allItems), [allItems]);
  const GROUP_ORDER: string[] = ["Hoje", "Ontem", "Esta semana", "Anteriores"];

  // ── Featured: first item with a poster ─────────────────────────────────────
  const featured = useMemo((): ContentItem | null => {
    const first = allItems.find((i) => i.poster);
    return first ? wn2Content(first) : null;
  }, [allItems]);

  const stats = useMemo(() => {
    const m = (data?.movies ?? []).length;
    const s = (data?.series ?? []).length;
    return { movies: m, series: s, total: m + s };
  }, [data]);

  return (
    <View style={[sty.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <View style={[sty.header, { paddingTop: topPad + 8 }]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.95)", "rgba(0,0,0,0.6)", "transparent"]}
          style={StyleSheet.absoluteFill} />
        <View style={sty.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[sty.logoAccent, { backgroundColor: RED }]} />
            <Text style={sty.logoRed}>NOVI</Text>
            <Text style={sty.logoWhite}>DADES</Text>
            {stats.total > 0 && (
              <View style={sty.headerBadge}>
                <Text style={sty.headerBadgeText}>{stats.total}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={sty.iconBtn}
            onPress={() => router.push("/(tabs)/list")} activeOpacity={0.75}>
            <Feather name="bookmark" size={20} color="rgba(255,255,255,0.82)" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ═══ SCROLL ══════════════════════════════════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={RED} colors={[RED]} progressViewOffset={topPad + 50} />
        }
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* ── Top padding for header ────────────────────────────────────── */}
        <View style={{ height: topPad + 58 }} />

        {/* ── FILTER PILLS ─────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}
          style={{ flexGrow: 0, marginBottom: 12 }}>
          {(["all", "movies", "series"] as FilterType[]).map((f) => {
            const labels = { all: "Todos", movies: "Filmes", series: "Séries" };
            const icons: Record<FilterType, keyof typeof Feather.glyphMap> = {
              all: "layers", movies: "film", series: "tv",
            };
            const active = filter === f;
            return (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} activeOpacity={0.8}
                style={[sty.pill, active && sty.pillActive]}>
                <Feather name={icons[f]} size={12} color={active ? "#fff" : "rgba(255,255,255,0.5)"} />
                <Text style={[sty.pillText, active && sty.pillTextActive]}>{labels[f]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── STATS BAR ────────────────────────────────────────────────── */}
        {!loading && stats.total > 0 && (
          <View style={sty.statsBar}>
            <LinearGradient colors={[`${RED}18`, "transparent"]} style={StyleSheet.absoluteFill} />
            <Feather name="clock" size={12} color={RED} />
            <Text style={sty.statsText}>
              <Text style={{ color: RED, fontWeight: "800" }}>{stats.movies}</Text> filmes · <Text style={{ color: PURPLE, fontWeight: "800" }}>{stats.series}</Text> séries adicionados nos últimos 30 dias
            </Text>
          </View>
        )}

        {loading ? (
          <View style={{ marginTop: 16 }}>
            <SkeletonCard shimmer={shimmer} />
            <SkeletonCard shimmer={shimmer} />
            <SkeletonCard shimmer={shimmer} />
          </View>
        ) : (
          <>
            {/* ── FEATURED ──────────────────────────────────────────────── */}
            {featured && (
              <View style={{ marginBottom: 8 }}>
                <FeaturedCard
                  item={featured}
                  onPress={() => goTo(featured)}
                  badge="ADICIONADO RECENTEMENTE"
                />
              </View>
            )}

            {/* ── DATE GROUPS ───────────────────────────────────────────── */}
            {GROUP_ORDER.map((groupLabel) => {
              const groupItems = groups[groupLabel] ?? [];
              if (!groupItems.length) return null;
              const accent = ACCENT_BY_LABEL[groupLabel] ?? RED;
              const contentItems = groupItems.map(wn2Content);
              return (
                <View key={groupLabel} style={{ marginBottom: 8 }}>
                  <DateDivider label={groupLabel} accentColor={accent} count={groupItems.length} />
                  <View style={sty.sec}>
                    <SectionHeader
                      title={groupLabel === "Hoje" ? "Adicionados Hoje" :
                             groupLabel === "Ontem" ? "Adicionados Ontem" :
                             groupLabel === "Esta semana" ? "Esta Semana" : "Mais Antigos"}
                      icon={groupLabel === "Hoje" ? "zap" :
                            groupLabel === "Ontem" ? "clock" :
                            groupLabel === "Esta semana" ? "calendar" : "archive"}
                      badge={String(groupItems.length)}
                      accentColor={accent}
                      onSeeAll={contentItems.length > 6
                        ? () => openModal(groupLabel, contentItems, accent)
                        : undefined}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
                      decelerationRate="fast">
                      {contentItems.slice(0, 10).map((item) => (
                        <PosterCard key={item.id} item={item} onPress={() => goTo(item)} isNew />
                      ))}
                      {contentItems.length > 10 && (
                        <Pressable
                          onPress={() => openModal(groupLabel, contentItems, accent)}
                          style={sty.morePill}>
                          <LinearGradient colors={[`${accent}28`, `${accent}10`]}
                            style={StyleSheet.absoluteFill} />
                          <Feather name="plus" size={16} color={accent} />
                          <Text style={[sty.morePillText, { color: accent }]}>
                            +{contentItems.length - 10}
                          </Text>
                        </Pressable>
                      )}
                    </ScrollView>
                  </View>
                </View>
              );
            })}

            {/* ── EMPTY STATE ───────────────────────────────────────────── */}
            {allItems.length === 0 && (
              <View style={sty.emptyState}>
                <Feather name="inbox" size={40} color="rgba(255,255,255,0.1)" />
                <Text style={sty.emptyTitle}>Nenhuma novidade encontrada</Text>
                <Text style={sty.emptySub}>Puxe para baixo para atualizar</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ─── Ver Mais Modal ────────────────────────────────────────────────── */}
      <VerMaisModal
        visible={modal.visible}
        title={modal.title}
        items={modal.items}
        accentColor={modal.accent}
        onClose={closeModal}
        onItemPress={goTo}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sty = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
    paddingBottom: 12,
  },
  headerInner: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  logoAccent: { width: 4, height: 22, borderRadius: 2 },
  logoRed:   { color: RED, fontSize: 22, fontWeight: "900", letterSpacing: 1.5 },
  logoWhite: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 1.5 },
  headerBadge: {
    backgroundColor: `${RED}25`, borderWidth: 1, borderColor: `${RED}50`,
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  headerBadgeText: { color: RED, fontSize: 11, fontWeight: "800" },
  iconBtn: { padding: 6 },

  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  pillActive: {
    backgroundColor: RED, borderColor: RED,
  },
  pillText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: "#fff" },

  statsBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: `${RED}20`,
  },
  statsText: { color: "rgba(255,255,255,0.65)", fontSize: 12, flex: 1 },

  featPad: { paddingHorizontal: 16, marginBottom: 8 },
  featCard: {
    height: 200, borderRadius: 18, overflow: "hidden",
    backgroundColor: "#111",
  },
  featContent: {
    position: "absolute", bottom: 0, left: 0, right: 0, padding: 16,
  },
  featBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: `${RED}22`, borderWidth: 1, borderColor: `${RED}55`,
    alignSelf: "flex-start", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6,
  },
  featBadgeText: { color: RED, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  featTitle: { color: "#fff", fontSize: 20, fontWeight: "900", marginBottom: 6, lineHeight: 24 },
  featMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  featYear:  { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" },
  featType:  { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  featRate:  { flexDirection: "row", alignItems: "center", gap: 3 },
  featRateText: { color: AMBER, fontSize: 11, fontWeight: "700" },
  featPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: RED, borderRadius: 22,
    alignSelf: "flex-start",
    paddingHorizontal: 16, paddingVertical: 9,
  },
  featPlayText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  sec: { marginBottom: 8 },
  secHead: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 0,
  },
  accentBar: { width: 3, height: 18, borderRadius: 2 },
  iconWrap:  { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  secTitle:  { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  badge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "800" },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  seeAllText: { color: "rgba(255,255,255,0.35)", fontSize: 12 },

  pCard: {
    width: 120, height: 175, borderRadius: 12, overflow: "hidden",
    backgroundColor: "#111",
  },
  newBadge: {
    position: "absolute", top: 7, left: 7,
    backgroundColor: RED, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  newBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  ratingPin: {
    position: "absolute", bottom: 6, right: 6,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.72)", borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  ratingPinText: { color: AMBER, fontSize: 8, fontWeight: "700" },
  pTitle: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 5, lineHeight: 14 },
  pMeta:  { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 },

  divRow: {
    flexDirection: "row", alignItems: "center",
    marginVertical: 12, paddingHorizontal: 16,
  },
  divLine: { flex: 1, height: 1 },
  divLabel: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1, marginHorizontal: 10,
  },
  divText:  { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  divCount: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  divCountText: { fontSize: 10, fontWeight: "800" },

  morePill: {
    width: 60, height: 175, borderRadius: 12, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  morePillText: { fontSize: 13, fontWeight: "900" },

  emptyState: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 80, gap: 12,
  },
  emptyTitle: { color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: "700" },
  emptySub:   { color: "rgba(255,255,255,0.18)", fontSize: 13 },

  modal: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: H * 0.88,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden",
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 12,
  },
  modalAccent: { width: 3, height: 18, borderRadius: 2 },
  modalTitle:  { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalClose:  { padding: 6 },
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600" },
});
