import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { api, TMDB_IMG } from "@/lib/api";
import { ProfileAvatarButton } from "@/components/ProfileAvatarButton";

const { width: W, height: H } = Dimensions.get("window");
const RED = "#e50914";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShortItem {
  id: string;
  tmdbId: number;
  title: string;
  type: "movie" | "tv";
  backdrop: string;
  poster: string;
  overview: string;
  year: number;
  rating: number;
  genre: string;
  liked: boolean;
  likes: number;
  saved: boolean;
}

// ─── Genre label map ──────────────────────────────────────────────────────────

const GENRE_MAP: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia",
  80: "Crime", 18: "Drama", 14: "Fantasia", 27: "Terror",
  9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste",
  10759: "Ação & Aventura", 10765: "Sci-Fi & Fantasy",
};

function firstGenre(ids: number[]): string {
  for (const id of ids) {
    if (GENRE_MAP[id]) return GENRE_MAP[id];
  }
  return "Filme";
}

// ─── Fetch shorts feed ────────────────────────────────────────────────────────

async function fetchShorts(): Promise<ShortItem[]> {
  try {
    const [movies, series] = await Promise.all([
      api.tmdb.trending("movie", "week").catch(() => ({ results: [] })),
      api.tmdb.trending("tv", "week").catch(() => ({ results: [] })),
    ]);

    const movieItems: ShortItem[] = ((movies as any)?.results ?? [])
      .filter((r: any) => r.backdrop_path && r.poster_path)
      .slice(0, 15)
      .map((r: any, i: number) => ({
        id: `movie-${r.id}`,
        tmdbId: r.id,
        title: r.title ?? r.name ?? "",
        type: "movie" as const,
        backdrop: `${TMDB_IMG}/w780${r.backdrop_path}`,
        poster: `${TMDB_IMG}/w342${r.poster_path}`,
        overview: r.overview ?? "",
        year: parseInt((r.release_date ?? "2024").slice(0, 4)),
        rating: Math.round((r.vote_average ?? 0) * 10) / 10,
        genre: firstGenre(r.genre_ids ?? []),
        liked: false,
        likes: Math.floor(Math.random() * 9000) + 1000,
        saved: false,
      }));

    const seriesItems: ShortItem[] = ((series as any)?.results ?? [])
      .filter((r: any) => r.backdrop_path && r.poster_path)
      .slice(0, 10)
      .map((r: any) => ({
        id: `tv-${r.id}`,
        tmdbId: r.id,
        title: r.name ?? r.title ?? "",
        type: "tv" as const,
        backdrop: `${TMDB_IMG}/w780${r.backdrop_path}`,
        poster: `${TMDB_IMG}/w342${r.poster_path}`,
        overview: r.overview ?? "",
        year: parseInt((r.first_air_date ?? "2024").slice(0, 4)),
        rating: Math.round((r.vote_average ?? 0) * 10) / 10,
        genre: firstGenre(r.genre_ids ?? []),
        liked: false,
        likes: Math.floor(Math.random() * 9000) + 1000,
        saved: false,
      }));

    const all = [...movieItems, ...seriesItems];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  } catch {
    return [];
  }
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon, label, color = "#fff", onPress, active = false,
}: {
  icon: string; label: string; color?: string; onPress: () => void; active?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const tap = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.75, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 5 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={tap} activeOpacity={0.8} style={s.actionBtn}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Feather name={icon as any} size={28} color={active ? RED : color} />
      </Animated.View>
      <Text style={[s.actionLabel, active && { color: RED }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Single Short card ────────────────────────────────────────────────────────

function ShortCard({
  item,
  isVisible,
  onLike,
  onSave,
  onDetail,
}: {
  item: ShortItem;
  isVisible: boolean;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onDetail: (item: ShortItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;

  const playScale = useRef(new Animated.Value(0)).current;
  const playOpacity = useRef(new Animated.Value(0)).current;
  const infoY = useRef(new Animated.Value(30)).current;
  const infoOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.parallel([
        Animated.spring(playScale, { toValue: 1, useNativeDriver: true, tension: 220, friction: 6, delay: 200 }),
        Animated.timing(playOpacity, { toValue: 1, duration: 300, useNativeDriver: true, delay: 200 }),
        Animated.timing(infoY, { toValue: 0, duration: 400, useNativeDriver: true, delay: 100 }),
        Animated.timing(infoOp, { toValue: 1, duration: 350, useNativeDriver: true, delay: 100 }),
      ]).start();
    } else {
      playScale.setValue(0);
      playOpacity.setValue(0);
      infoY.setValue(30);
      infoOp.setValue(0);
    }
  }, [isVisible]);

  return (
    <View style={{ width: W, height: H }}>
      {/* Backdrop fill */}
      <Image
        source={{ uri: item.backdrop }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
      />

      {/* Top gradient */}
      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: topPad + 80 }}
      />

      {/* Bottom gradient */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.4)", "rgba(0,0,0,0.88)"]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: H * 0.55 }}
      />

      {/* Play button center */}
      <Animated.View
        style={[s.playWrap, { opacity: playOpacity, transform: [{ scale: playScale }] }]}
        pointerEvents="none"
      >
        <TouchableOpacity onPress={() => onDetail(item)} activeOpacity={0.8} style={s.playBtn}>
          <Feather name="play" size={32} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {/* Right action column */}
      <View style={[s.actions, { bottom: bottomPad + 100 }]}>
        <ActionBtn
          icon="heart"
          label={fmtNum(item.likes + (item.liked ? 1 : 0))}
          active={item.liked}
          onPress={() => onLike(item.id)}
        />
        <ActionBtn
          icon="bookmark"
          label="Salvar"
          active={item.saved}
          onPress={() => onSave(item.id)}
        />
        <ActionBtn
          icon="share-2"
          label="Partilhar"
          onPress={() => {}}
        />
        <ActionBtn
          icon="info"
          label="Detalhes"
          onPress={() => onDetail(item)}
        />
      </View>

      {/* Bottom info */}
      <Animated.View
        style={[s.info, { bottom: bottomPad + 92, opacity: infoOp, transform: [{ translateY: infoY }] }]}
      >
        {/* Poster thumbnail */}
        <View style={s.infoRow}>
          <Image source={{ uri: item.poster }} style={s.miniPoster} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle} numberOfLines={2}>{item.title}</Text>
            <View style={s.infoMeta}>
              <View style={s.genrePill}>
                <Text style={s.genreText}>{item.genre}</Text>
              </View>
              <Text style={s.metaText}>{item.year}</Text>
              <Feather name="star" size={11} color="#f59e0b" />
              <Text style={[s.metaText, { color: "#f59e0b" }]}>{item.rating}</Text>
            </View>
            <Text style={s.overview} numberOfLines={2}>{item.overview}</Text>
          </View>
        </View>

        {/* Watch button */}
        <TouchableOpacity style={s.watchBtn} onPress={() => onDetail(item)} activeOpacity={0.85}>
          <Feather name="play-circle" size={15} color="#fff" />
          <Text style={s.watchBtnText}>Assistir agora</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ShortsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [items, setItems] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleIndex, setVisibleIndex] = useState(0);

  useEffect(() => {
    fetchShorts().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  const onLike = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, liked: !it.liked } : it));
  }, []);

  const onSave = useCallback((id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, saved: !it.saved } : it));
  }, []);

  const onDetail = useCallback((item: ShortItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.type, id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        setVisibleIndex(viewableItems[0].index ?? 0);
      }
    }
  ).current;

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <View style={{ alignItems: "center", gap: 14 }}>
          <Feather name="scissors" size={40} color={RED} />
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Carregando Shorts...</Text>
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[s.root, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
        <StatusBar style="light" />
        <Feather name="scissors" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 15, marginTop: 16 }}>
          Nenhum short disponível
        </Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* ── TikTok-style vertical feed ── */}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={H}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => (
          <ShortCard
            item={item}
            isVisible={index === visibleIndex}
            onLike={onLike}
            onSave={onSave}
            onDetail={onDetail}
          />
        )}
        getItemLayout={(_, index) => ({ length: H, offset: H * index, index })}
      />

      {/* ── Floating header ── */}
      <View style={[s.header, { paddingTop: topPad + 8 }]} pointerEvents="box-none">
        <View style={s.headerInner}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <LinearGradient colors={[RED, "#b5060f"]} style={s.headerIcon}>
              <Feather name="scissors" size={13} color="#fff" />
            </LinearGradient>
            <Text style={s.headerTitle}>SHORTS</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => router.push("/buscar")}
              activeOpacity={0.75}
            >
              <Feather name="search" size={20} color="rgba(255,255,255,0.82)" />
            </TouchableOpacity>
            <ProfileAvatarButton />
          </View>
        </View>
      </View>

      {/* ── Scroll indicator dots ── */}
      <View style={[s.dots, { top: topPad + 64 }]} pointerEvents="none">
        {items.slice(0, Math.min(items.length, 8)).map((_, i) => (
          <View
            key={i}
            style={[s.dot, i === visibleIndex % Math.min(items.length, 8) && s.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  // Header
  header: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
  },
  headerInner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 6,
  },
  headerIcon: {
    width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 2,
  },
  iconBtn: {
    width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20,
  },

  // Scroll dots
  dots: {
    position: "absolute", right: 6, flexDirection: "column", gap: 4, alignItems: "center",
  },
  dot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)",
  },
  dotActive: {
    backgroundColor: RED, height: 12, borderRadius: 3,
  },

  // Play button
  playWrap: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(229,9,20,0.85)",
    alignItems: "center", justifyContent: "center",
    paddingLeft: 4,
  },

  // Right actions
  actions: {
    position: "absolute", right: 12,
    alignItems: "center", gap: 20,
  },
  actionBtn: { alignItems: "center", gap: 4 },
  actionLabel: {
    color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700",
  },

  // Bottom info
  info: {
    position: "absolute", left: 0, right: 80, paddingHorizontal: 16, gap: 10,
  },
  infoRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  miniPoster: {
    width: 52, height: 76, borderRadius: 8,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
  },
  infoTitle: {
    color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: 0.2, marginBottom: 5,
  },
  infoMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 },
  genrePill: {
    backgroundColor: "rgba(229,9,20,0.85)", borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  genreText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  metaText: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "600" },
  overview: { color: "rgba(255,255,255,0.6)", fontSize: 12, lineHeight: 17 },

  // Watch button
  watchBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: RED, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16, alignSelf: "flex-start",
  },
  watchBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
