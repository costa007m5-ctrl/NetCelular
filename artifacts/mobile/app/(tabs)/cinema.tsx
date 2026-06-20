import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ProfileAvatarButton } from "@/components/ProfileAvatarButton";
import type { ContentItem } from "@/constants/content";
import { r2Route } from "@/lib/r2-direct";

const { width: W, height: H } = Dimensions.get("window");
const GOLD   = "#c9a227";
const GOLD2  = "#f0c040";
const RED    = "#e50914";
const AMBER  = "#f59e0b";
const DARK   = "#0a0804";

// ─── Portuguese month labels ──────────────────────────────────────────────────
const MONTH_PT: Record<number, string> = {
  1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
  5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
  9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
};

const MONTH_COLORS: string[] = [
  "#c9a227", "#e50914", "#3b82f6", "#22c55e",
  "#8b5cf6", "#f97316", "#0891b2", "#ec4899",
  "#dc2626", "#6366f1", "#f59e0b", "#10b981",
];

// ─── Data ─────────────────────────────────────────────────────────────────────
interface CinemaItem {
  id: string | number;
  title: string;
  tmdb_id: number;
  year: number;
  release_date?: string;
  poster: string;
  backdrop?: string;
  rating?: string;
  synopsis?: string;
  added_at?: number;
}

interface MonthGroup {
  key: string;   // "2026-06"
  label: string; // "Junho 2026"
  items: CinemaItem[];
}

interface CinemaData {
  ok: boolean;
  warming?: boolean;
  total: number;
  topRated: CinemaItem[];
  months: MonthGroup[];
}

function toContent(item: CinemaItem): ContentItem {
  return {
    id: String(item.id),
    tmdbId: Number(item.tmdb_id) || 0,
    title:  item.title ?? "",
    year:   item.year || 0,
    rating: parseFloat(item.rating ?? "0") || 0,
    posterPath:   item.poster ?? "",
    backdropPath: item.backdrop ?? item.poster ?? "",
    description:  item.synopsis ?? "",
    genres: [],
    type: "movie",
    mediaType: "movie",
  };
}

async function fetchCinema(attempt = 0): Promise<CinemaData> {
  try {
    const res = await r2Route<CinemaData>("/flix2/cinema-2026");
    if (res.warming && attempt < 20) {
      // Server still warming — retry every 5s for up to ~100s
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return fetchCinema(attempt + 1);
    }
    // If warmed but still empty (0 results), retry a few more times to let title matching complete
    if (res.ok && res.total === 0 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return fetchCinema(attempt + 1);
    }
    return res;
  } catch {
    return { ok: false, total: 0, topRated: [], months: [] };
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonBanner({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(201,162,39,0.04)", "rgba(201,162,39,0.10)"],
  });
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
      <Animated.View style={{ height: 240, borderRadius: 20, backgroundColor: bg as any }} />
    </View>
  );
}

function SkeletonRow({ shimmer }: { shimmer: Animated.Value }) {
  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(201,162,39,0.04)", "rgba(201,162,39,0.09)"],
  });
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 28 }}>
      {[0, 1, 2, 3].map((i) => (
        <Animated.View key={i} style={{ width: 120, height: 180, borderRadius: 12, backgroundColor: bg as any }} />
      ))}
    </View>
  );
}

// ─── RotatingBanner ───────────────────────────────────────────────────────────
function RotatingBanner({
  items, onPress,
}: {
  items: ContentItem[]; onPress: (item: ContentItem) => void;
}) {
  const [idx, setIdx] = useState(0);
  const fade   = useRef(new Animated.Value(1)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [paused, setPaused] = useState(false);

  const BANNER_H = 260;
  const ITEMS    = items.slice(0, 8);

  const goTo = useCallback((next: number) => {
    Animated.parallel([
      Animated.timing(fade,   { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(slideX, { toValue: -20, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      setIdx(next);
      slideX.setValue(20);
      Animated.parallel([
        Animated.timing(fade,   { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideX, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  }, [fade, slideX]);

  const advance = useCallback(() => {
    setIdx((prev) => {
      const next = (prev + 1) % ITEMS.length;
      goTo(next);
      return prev;
    });
  }, [goTo, ITEMS.length]);

  useEffect(() => {
    if (paused || ITEMS.length <= 1) return;
    timerRef.current = setInterval(advance, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, advance, ITEMS.length]);

  if (!ITEMS.length) return null;
  const item = ITEMS[idx];
  const imgUri = item.backdropPath || item.posterPath;

  return (
    <View style={sty.bannerWrap}>
      <Pressable
        onPressIn={() => setPaused(true)}
        onPressOut={() => setPaused(false)}
        onPress={() => onPress(item)}
      >
        <Animated.View style={[sty.bannerCard, { opacity: fade, transform: [{ translateX: slideX }] }]}>
          {imgUri ? (
            <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill}
              contentFit="cover" cachePolicy="memory-disk" transition={200} />
          ) : (
            <LinearGradient colors={["#1a1208", "#0a0804"]} style={StyleSheet.absoluteFill} />
          )}
          {/* Letterbox bars */}
          <View style={sty.lbTop} />
          <View style={sty.lbBot} />
          {/* Gradient overlay */}
          <LinearGradient
            colors={["transparent", `${GOLD}10`, "rgba(0,0,0,0.97)"]}
            locations={[0.15, 0.55, 1]} style={StyleSheet.absoluteFill} />
          {/* Gold top strip */}
          <LinearGradient
            colors={[GOLD2, GOLD, `${GOLD}00`]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={sty.goldStrip} />

          {/* Film perforations decoration */}
          <View style={sty.perfLeft}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={sty.perfHole} />
            ))}
          </View>
          <View style={sty.perfRight}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={sty.perfHole} />
            ))}
          </View>

          {/* Content */}
          <View style={sty.bannerContent}>
            <View style={sty.bannerTopRow}>
              <View style={sty.cinemaBadge}>
                <Feather name="film" size={9} color={GOLD} />
                <Text style={sty.cinemaBadgeText}>EM CARTAZ 2026</Text>
              </View>
              {item.rating > 0 && (
                <View style={sty.ratingBadge}>
                  <Feather name="star" size={9} color={AMBER} />
                  <Text style={sty.ratingBadgeText}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>
            <Text style={sty.bannerTitle} numberOfLines={2}>{item.title}</Text>
            {item.description ? (
              <Text style={sty.bannerDesc} numberOfLines={2}>{item.description}</Text>
            ) : null}
            <View style={sty.bannerBtns}>
              <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.85} style={sty.btnPlay}>
                <Feather name="play" size={14} color="#000" />
                <Text style={sty.btnPlayText}>Assistir</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.85} style={sty.btnInfo}>
                <Feather name="info" size={14} color="#fff" />
                <Text style={sty.btnInfoText}>Detalhes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Pressable>

      {/* Progress dots */}
      <View style={sty.dotsRow}>
        {ITEMS.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => goTo(i)} activeOpacity={0.8}
            style={[sty.dot, i === idx && sty.dotActive]}>
            {i === idx && (
              <LinearGradient colors={[GOLD2, GOLD]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─── PosterCard ───────────────────────────────────────────────────────────────
function PosterCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
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
              contentFit="cover" cachePolicy="memory-disk" transition={220}
              onError={() => setErr(true)} />
          ) : (
            <LinearGradient colors={["#1a1208", "#0a0804"]} style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="film" size={22} color={`${GOLD}18`} />
              </View>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.88)"]}
            locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
          <View style={sty.pNewBadge}>
            <Text style={sty.pNewText}>2026</Text>
          </View>
          {item.rating > 0 && (
            <View style={sty.pRating}>
              <Feather name="star" size={7} color={AMBER} />
              <Text style={sty.pRatingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <View style={sty.pInfo}>
            <Text style={sty.pTitle} numberOfLines={2}>{item.title}</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── MaisAssistidosRow ────────────────────────────────────────────────────────
function MaisAssistidosRow({ items, onItemPress }: {
  items: ContentItem[]; onItemPress: (i: ContentItem) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
        paddingHorizontal: 16, paddingVertical: 12, overflow: "hidden" }}>
        <LinearGradient
          colors={["rgba(229,9,20,0.18)", "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
          style={StyleSheet.absoluteFill} />
        <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: RED }} />
        <View style={{ width: 24, height: 24, borderRadius: 7,
          alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(229,9,20,0.18)" }}>
          <Feather name="trending-up" size={12} color={RED} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: "900", color: RED }}>Mais Assistidos</Text>
        <Text style={{ fontSize: 15, fontWeight: "900", color: "#fff" }}>Hoje</Text>
        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
          backgroundColor: "rgba(229,9,20,0.18)", borderWidth: 1,
          borderColor: "rgba(229,9,20,0.4)" }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: RED }}>
            {items.length}
          </Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }} decelerationRate="fast">
        {items.map((item) => (
          <PosterCard key={item.id} item={item} onPress={() => onItemPress(item)} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── MonthSection ─────────────────────────────────────────────────────────────
function MonthSection({
  label, items, accentColor, onItemPress, onSeeAll,
}: {
  label: string; items: ContentItem[];
  accentColor: string; onItemPress: (i: ContentItem) => void;
  onSeeAll?: () => void;
}) {
  const [month, ...rest] = label.split(" ");
  return (
    <View style={sty.monthSec}>
      {/* Section header */}
      <View style={[sty.monthHead, { overflow: "hidden" }]}>
        <LinearGradient
          colors={[`${accentColor}28`, "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0 }}
          style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[sty.monthBar, { backgroundColor: accentColor }]} />
          <View style={[sty.monthIconWrap, { backgroundColor: `${accentColor}18` }]}>
            <Feather name="calendar" size={12} color={accentColor} />
          </View>
          <Text style={[sty.monthName, { color: accentColor }]}>{month}</Text>
          {rest.length > 0 && <Text style={sty.monthYear}>{rest.join(" ")}</Text>}
          <View style={[sty.monthBadge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
            <Text style={[sty.monthBadgeText, { color: accentColor }]}>{items.length}</Text>
          </View>
        </View>
        {onSeeAll && (
          <TouchableOpacity onPress={onSeeAll} activeOpacity={0.7} style={sty.seeAll}>
            <Text style={sty.seeAllText}>Ver tudo</Text>
            <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        )}
      </View>
      {/* Horizontal scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        decelerationRate="fast">
        {items.slice(0, 12).map((item) => (
          <PosterCard key={item.id} item={item} onPress={() => onItemPress(item)} />
        ))}
        {items.length > 12 && (
          <Pressable onPress={onSeeAll} style={sty.morePill}>
            <LinearGradient colors={[`${accentColor}25`, `${accentColor}08`]}
              style={StyleSheet.absoluteFill} />
            <Feather name="plus" size={18} color={accentColor} />
            <Text style={[sty.morePillText, { color: accentColor }]}>+{items.length - 12}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ─── CinemaModalCard ─────────────────────────────────────────────────────────
function CinemaModalCard({ item, cardW, cardH, onPress }: {
  item: ContentItem; cardW: number; cardH: number; onPress: () => void;
}) {
  const [err, setErr] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: cardW, marginBottom: 8 }}>
      <View style={{ width: cardW, height: cardH, borderRadius: 10, overflow: "hidden", backgroundColor: "#111" }}>
        {!err && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1208", "#0a0804"]} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.5, 1]}
          style={StyleSheet.absoluteFill} />
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 14 }}
            numberOfLines={2}>{item.title}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Ver Tudo Modal ───────────────────────────────────────────────────────────
function VerTudoModal({ visible, title, items, accentColor = GOLD, onClose, onItemPress }: {
  visible: boolean; title: string; items: ContentItem[];
  accentColor?: string; onClose: () => void; onItemPress: (i: ContentItem) => void;
}) {
  const slideY = useRef(new Animated.Value(H)).current;

  useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : H,
      duration: visible ? 340 : 280,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const CARD_W = (W - 48) / 3;
  const CARD_H = CARD_W * 1.5;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.72)" }]}
          onPress={onClose} />
        {/* Sheet */}
        <Animated.View style={[sty.modal, { transform: [{ translateY: slideY }] }]}>
          <LinearGradient colors={["#0a0804", "#060402"]} style={StyleSheet.absoluteFill} />
          <View style={[sty.modalHandle, { backgroundColor: `${accentColor}60` }]} />
          <View style={sty.modalHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[sty.modalAccent, { backgroundColor: accentColor }]} />
              <Text style={sty.modalTitle}>{title}</Text>
              <View style={[sty.monthBadge, { backgroundColor: `${accentColor}20`, borderColor: `${accentColor}40` }]}>
                <Text style={[sty.monthBadgeText, { color: accentColor }]}>{items.length}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: 6 }}>
              <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item, idx) => `modal_${item.id}_${idx}`}
            numColumns={3}
            style={{ flex: 1 }}
            columnWrapperStyle={{ gap: 8, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            maxToRenderPerBatch={9}
            windowSize={5}
            renderItem={({ item }) => (
              <CinemaModalCard
                item={item} cardW={CARD_W} cardH={CARD_H}
                onPress={() => { onItemPress(item); onClose(); }}
              />
            )}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── StatsStrip ───────────────────────────────────────────────────────────────
function StatsStrip({ total, months }: { total: number; months: number }) {
  return (
    <View style={sty.statsStrip}>
      <LinearGradient
        colors={[`${GOLD}20`, `${GOLD}08`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill} />
      <View style={sty.statItem}>
        <Feather name="film" size={14} color={GOLD} />
        <Text style={sty.statVal}>{total}</Text>
        <Text style={sty.statLbl}>filmes de 2026</Text>
      </View>
      <View style={sty.statDivider} />
      <View style={sty.statItem}>
        <Feather name="calendar" size={14} color={GOLD} />
        <Text style={sty.statVal}>{months}</Text>
        <Text style={sty.statLbl}>{months === 1 ? "mês" : "meses"} com lançamentos</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CinemaScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const isWeb   = Platform.OS === "web";
  const topPad  = isWeb ? 0 : insets.top;

  const shimmer = useRef(new Animated.Value(0)).current;
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cinemaData, setCinemaData] = useState<CinemaData>({
    ok: false, total: 0, topRated: [], months: [],
  });
  const [modal, setModal] = useState<{
    visible: boolean; title: string; items: ContentItem[]; accent: string;
  }>({ visible: false, title: "", items: [], accent: GOLD });

  const load = useCallback(async () => {
    const data = await fetchCinema();
    setCinemaData(data);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    if (Platform.OS === "web") loop.start();
    load().then(() => { loop.stop(); setLoading(false); });
    return () => loop.stop();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().then(() => setRefreshing(false));
  }, [load]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: "movie",
        id: String(item.tmdbId),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  }, [router]);

  // Flat list of all 2026 items for banner + stats
  const allContent = useMemo(
    () => cinemaData.months.flatMap((g) => g.items).map(toContent),
    [cinemaData.months]
  );

  const topRatedContent = useMemo(
    () => cinemaData.topRated.map(toContent),
    [cinemaData.topRated]
  );

  // Banner: use topRated first (best rated), fall back to first items with a poster
  const bannerItems = useMemo(() => {
    const pool = topRatedContent.length >= 4
      ? topRatedContent
      : allContent.filter((i) => !!i.posterPath);
    return pool.slice(0, 8);
  }, [topRatedContent, allContent]);

  // Months come pre-grouped from server
  const monthGroups = cinemaData.months;

  const openModal = (title: string, items: ContentItem[], accent = GOLD) =>
    setModal({ visible: true, title, items, accent });
  const closeModal = () => setModal((m) => ({ ...m, visible: false }));

  return (
    <View style={[sty.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* ═══ HEADER ══════════════════════════════════════════════════════════ */}
      <View style={[sty.header, { paddingTop: topPad + 8 }]}>
        <LinearGradient
          colors={["rgba(10,8,4,0.98)", "rgba(10,8,4,0.7)", "transparent"]}
          style={StyleSheet.absoluteFill} />
        <View style={sty.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={sty.logoAccent} />
            <Text style={sty.logoGold}>CINE</Text>
            <Text style={sty.logoWhite}>MA</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TouchableOpacity style={sty.iconBtn}
              onPress={() => router.push("/buscar")} activeOpacity={0.75}>
              <Feather name="search" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity style={sty.iconBtn}
              onPress={() => router.push("/(tabs)/list")} activeOpacity={0.75}>
              <Feather name="bookmark" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <ProfileAvatarButton />
          </View>
        </View>
      </View>

      {/* ═══ MAIN SCROLL ══════════════════════════════════════════════════════ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={GOLD} colors={[GOLD]} progressViewOffset={topPad + 50} />
        }
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        {/* Spacer for header */}
        <View style={{ height: topPad + 58 }} />

        {loading ? (
          <>
            <SkeletonBanner shimmer={shimmer} />
            <SkeletonRow shimmer={shimmer} />
            <SkeletonRow shimmer={shimmer} />
          </>
        ) : (
          <>
            {/* ── ROTATING BANNER ───────────────────────────────────────── */}
            {bannerItems.length > 0 && (
              <RotatingBanner items={bannerItems} onPress={goTo} />
            )}

            {/* ── STATS STRIP ──────────────────────────────────────────── */}
            {allContent.length > 0 && (
              <StatsStrip total={allContent.length} months={monthGroups.length} />
            )}

            {/* ── MAIS ASSISTIDOS HOJE ─────────────────────────────────── */}
            <MaisAssistidosRow items={topRatedContent} onItemPress={goTo} />

            {/* ── MONTH CAROUSELS ───────────────────────────────────────── */}
            {monthGroups.map((group, groupIdx) => {
              const accent = MONTH_COLORS[groupIdx % MONTH_COLORS.length];
              const contentItems = group.items.map(toContent);
              return (
                <MonthSection
                  key={group.key}
                  label={group.label}
                  items={contentItems}
                  accentColor={accent}
                  onItemPress={goTo}
                  onSeeAll={contentItems.length > 12
                    ? () => openModal(group.label, contentItems, accent)
                    : undefined}
                />
              );
            })}

            {/* ── EMPTY STATE ───────────────────────────────────────────── */}
            {allContent.length === 0 && (
              <View style={sty.emptyState}>
                <Feather name="film" size={48} color={`${GOLD}20`} />
                <Text style={sty.emptyTitle}>Nenhum filme encontrado</Text>
                <Text style={sty.emptySub}>Puxe para baixo para atualizar</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ─── Modal ─────────────────────────────────────────────────────────── */}
      <VerTudoModal
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
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 100, paddingBottom: 12,
  },
  headerInner: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 16,
  },
  logoAccent: { width: 3, height: 22, borderRadius: 2, backgroundColor: GOLD },
  logoGold: { color: GOLD, fontSize: 22, fontWeight: "900", letterSpacing: 2.5 },
  logoWhite: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 2.5 },
  iconBtn: { padding: 6 },

  // ── Rotating Banner
  bannerWrap: { paddingHorizontal: 16, marginBottom: 4 },
  bannerCard: {
    height: 260, borderRadius: 20, overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1, borderColor: `${GOLD}30`,
  },
  lbTop: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: 16, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 1,
  },
  lbBot: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 16, backgroundColor: "rgba(0,0,0,0.75)", zIndex: 1,
  },
  goldStrip: { position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 2 },

  // Film perforations
  perfLeft: {
    position: "absolute", left: 0, top: 16, bottom: 16, width: 12,
    alignItems: "center", justifyContent: "space-around",
    zIndex: 2,
  },
  perfRight: {
    position: "absolute", right: 0, top: 16, bottom: 16, width: 12,
    alignItems: "center", justifyContent: "space-around",
    zIndex: 2,
  },
  perfHole: {
    width: 6, height: 10, borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderWidth: 1, borderColor: "rgba(201,162,39,0.2)",
  },

  bannerContent: { position: "absolute", bottom: 16, left: 16, right: 16, zIndex: 3 },
  bannerTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 7 },
  cinemaBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: `${GOLD}22`, borderWidth: 1, borderColor: `${GOLD}60`,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  cinemaBadgeText: { color: GOLD, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  ratingBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  ratingBadgeText: { color: AMBER, fontSize: 10, fontWeight: "800" },
  bannerTitle: { color: "#fff", fontSize: 24, fontWeight: "900", lineHeight: 28, marginBottom: 6 },
  bannerDesc: { color: "rgba(255,255,255,0.5)", fontSize: 12, lineHeight: 17, marginBottom: 12 },
  bannerBtns: { flexDirection: "row", gap: 10 },
  btnPlay: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: GOLD, borderRadius: 22,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  btnPlayText: { color: "#000", fontSize: 13, fontWeight: "900" },
  btnInfo: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  btnInfoText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  // Progress dots
  dotsRow: {
    flexDirection: "row", justifyContent: "center",
    alignItems: "center", gap: 6, marginTop: 10, marginBottom: 4,
  },
  dot: {
    width: 20, height: 4, borderRadius: 2,
    backgroundColor: "rgba(201,162,39,0.25)",
    overflow: "hidden",
  },
  dotActive: { width: 32 },

  // ── Stats Strip
  statsStrip: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginVertical: 14,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: `${GOLD}25`,
  },
  statItem:    { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  statDivider: { width: 1, height: 28, backgroundColor: `${GOLD}25`, marginHorizontal: 12 },
  statVal:     { color: GOLD, fontSize: 17, fontWeight: "900" },
  statLbl:     { color: "rgba(255,255,255,0.45)", fontSize: 11 },

  // ── Month Section
  monthSec: { marginBottom: 6 },
  monthHead: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  monthBar:  { width: 3, height: 18, borderRadius: 2 },
  monthIconWrap: {
    width: 24, height: 24, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
  },
  monthName: { fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  monthYear: { color: "#fff", fontSize: 15, fontWeight: "900" },
  monthBadge: {
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  monthBadgeText: { fontSize: 10, fontWeight: "800" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  seeAllText: { color: "rgba(255,255,255,0.33)", fontSize: 12 },

  // ── Poster Card
  pCard: {
    width: 120, height: 180, borderRadius: 13,
    overflow: "hidden", backgroundColor: "#111",
  },
  pNewBadge: {
    position: "absolute", top: 7, left: 7,
    backgroundColor: `${GOLD}22`, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: `${GOLD}50`,
  },
  pNewText: { color: GOLD, fontSize: 8, fontWeight: "900" },
  pRating: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  pRatingText: { color: AMBER, fontSize: 8, fontWeight: "700" },
  pInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 9 },
  pTitle: { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 14 },

  morePill: {
    width: 70, height: 180, borderRadius: 13, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    marginRight: 10,
  },
  morePillText: { fontSize: 14, fontWeight: "900" },

  emptyState: { alignItems: "center", paddingVertical: 80, gap: 12 },
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
});
