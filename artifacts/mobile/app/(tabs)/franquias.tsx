import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FRANCHISES, BANNER_FRANCHISES, type Franchise } from "@/constants/franchises";
import { api, TMDB_IMG } from "@/lib/api";

const { width: W } = Dimensions.get("window");
const BANNER_H = 380;
const CARD_W = Math.floor((W - 48) / 2);
const CARD_H = 155;

type Category = "todos" | "filmes" | "series" | "anime";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "todos",  label: "Todos" },
  { id: "filmes", label: "Filmes" },
  { id: "series", label: "Séries" },
  { id: "anime",  label: "Animes" },
];

// ── Module-level image cache ────────────────────────────────────
const _imgCache = new Map<string, string | null>();
const _imgFetching = new Set<string>();

async function fetchFranchiseImage(franchise: Franchise): Promise<string | null> {
  if (_imgCache.has(franchise.id)) return _imgCache.get(franchise.id)!;
  if (_imgFetching.has(franchise.id)) return null;
  _imgFetching.add(franchise.id);
  try {
    let path: string | null = null;
    if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
      const d = await api.tmdb.collection(franchise.tmdbCollectionId);
      path = d.backdrop_path;
    } else if ((franchise.fetchType === "tv" || franchise.fetchType === "keyword") && franchise.tmdbTvId) {
      const d = await api.tmdb.tv(franchise.tmdbTvId) as any;
      path = d.backdrop_path ?? null;
    } else {
      const q = franchise.searchQuery ?? franchise.name;
      const type = franchise.searchType ?? (franchise.category === "anime" ? "tv" : "movie");
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.backdrop_path ?? null;
    }
    const url = path ? (TMDB_IMG(path, "w1280") ?? null) : null;
    _imgCache.set(franchise.id, url);
    return url;
  } catch {
    _imgCache.set(franchise.id, null);
    return null;
  } finally {
    _imgFetching.delete(franchise.id);
  }
}

function useFranchiseImage(franchise: Franchise) {
  const [url, setUrl] = useState<string | null>(
    _imgCache.has(franchise.id) ? _imgCache.get(franchise.id)! : null
  );
  useEffect(() => {
    if (_imgCache.has(franchise.id)) {
      setUrl(_imgCache.get(franchise.id)!);
      return;
    }
    fetchFranchiseImage(franchise).then((u) => setUrl(u));
  }, [franchise.id]);
  return url;
}

// ── Banner item ─────────────────────────────────────────────────
function BannerSlide({
  franchise,
  onPress,
}: {
  franchise: Franchise;
  onPress: () => void;
}) {
  const imgUrl = useFranchiseImage(franchise);

  return (
    <View style={{ width: W, height: BANNER_H }}>
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
      )}

      {/* dark overlay */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.55)", "#000"]}
        locations={[0.15, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* accent line */}
      <View style={[styles.bannerAccent, { backgroundColor: franchise.color }]} />

      <View style={styles.bannerContent}>
        <View style={[styles.bannerCategoryBadge, { borderColor: franchise.color + "99" }]}>
          <Text style={[styles.bannerCategoryText, { color: franchise.accentColor }]}>
            {franchise.category.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.bannerTitle}>{franchise.name.toUpperCase()}</Text>
        <Text style={[styles.bannerTagline, { color: franchise.accentColor }]}>
          {franchise.tagline}
        </Text>
        <Text style={styles.bannerMeta}>
          {franchise.contentCount} conteúdos · {franchise.yearRange}
        </Text>
        <TouchableOpacity
          onPress={onPress}
          style={[styles.bannerBtn, { backgroundColor: franchise.color }]}
        >
          <Feather name="play" size={13} color="#fff" />
          <Text style={styles.bannerBtnText}>EXPLORAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Rotating banner ─────────────────────────────────────────────
function RotatingBanner({ onPress }: { onPress: (id: string) => void }) {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<any>(null);
  const total = BANNER_FRANCHISES.length;

  useEffect(() => {
    const t = setInterval(() => {
      const next = (idx + 1) % total;
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
      setIdx(next);
    }, 5000);
    return () => clearInterval(t);
  }, [idx, total]);

  return (
    <View style={{ height: BANNER_H }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / W);
          setIdx(i);
        }}
        style={{ width: W }}
      >
        {BANNER_FRANCHISES.map((f) => (
          <BannerSlide key={f.id} franchise={f} onPress={() => onPress(f.id)} />
        ))}
      </ScrollView>

      {/* dots */}
      <View style={styles.dots}>
        {BANNER_FRANCHISES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === idx
                ? { backgroundColor: "#fff", width: 18 }
                : { backgroundColor: "rgba(255,255,255,0.3)", width: 6 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ── Franchise grid card ─────────────────────────────────────────
function FranchiseCard({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const imgUrl = useFranchiseImage(franchise);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 30, bounciness: 4 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { width: CARD_W, height: CARD_H, transform: [{ scale }] }]}>
        {/* background */}
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={[StyleSheet.absoluteFill, styles.cardImg]} resizeMode="cover" />
        ) : (
          <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
        )}

        {/* overlay gradient so text is readable */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.75)"]}
          locations={[0.3, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* top accent line */}
        <View style={[styles.cardAccent, { backgroundColor: franchise.color }]} />

        {/* info */}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={2}>{franchise.name}</Text>
          <View style={[styles.cardBadge, { backgroundColor: franchise.color + "33", borderColor: franchise.color + "55" }]}>
            <Text style={[styles.cardBadgeText, { color: franchise.accentColor }]}>
              {franchise.contentCount} títulos
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ── Main screen ─────────────────────────────────────────────────
export default function FranquiasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [activeCategory, setActiveCategory] = useState<Category>("todos");
  const [search, setSearch] = useState("");

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [BANNER_H - 60, BANNER_H],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const filtered = FRANCHISES.filter((f) => {
    const matchesCat = activeCategory === "todos" || f.category === activeCategory;
    const matchesSearch =
      search.trim() === "" ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.tagline.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const goTo = (id: string) => router.push({ pathname: "/franchise", params: { id } });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* ── Rotating banner ─────────────────────────── */}
        <RotatingBanner onPress={goTo} />

        {/* ── Search bar ──────────────────────────────── */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Feather name="search" size={15} color="rgba(255,255,255,0.45)" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar franquia..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Feather name="x" size={14} color="rgba(255,255,255,0.45)" />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Category filter ──────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
          style={{ marginBottom: 16 }}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategory(cat.id)}
              style={[
                styles.categoryChip,
                activeCategory === cat.id
                  ? { backgroundColor: "#E50914", borderColor: "#E50914" }
                  : { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.13)" },
              ]}
            >
              <Text
                style={[
                  styles.categoryLabel,
                  { color: activeCategory === cat.id ? "#fff" : "rgba(255,255,255,0.55)" },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Section title ────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionAccentBar} />
          <Text style={styles.sectionTitle}>
            {activeCategory === "todos"
              ? "Todos os Universos"
              : activeCategory === "filmes"
              ? "Sagas de Filmes"
              : activeCategory === "series"
              ? "Universos de Séries"
              : "Universos de Animes"}
          </Text>
        </View>

        {/* ── Grid ─────────────────────────────────────── */}
        <View style={styles.grid}>
          {filtered.map((f) => (
            <FranchiseCard key={f.id} franchise={f} onPress={() => goTo(f.id)} />
          ))}
          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Feather name="search" size={36} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>Nenhuma franquia encontrada</Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── Sticky header ────────────────────────────── */}
      <Animated.View style={[styles.stickyHeader, { paddingTop: topPad }]} pointerEvents="box-none">
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: headerOpacity }]}
        />
        <View style={styles.stickyHeaderContent}>
          <Text style={styles.stickyTitle}>🌌 UNIVERSOS</Text>
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={() => router.push("/(tabs)/search")}
          >
            <Feather name="search" size={20} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  // Banner
  bannerAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 2,
  },
  bannerContent: {
    position: "absolute",
    bottom: 52,
    left: 20,
    right: 20,
    zIndex: 2,
  },
  bannerCategoryBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  bannerCategoryText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  bannerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 2,
    lineHeight: 32,
    marginBottom: 4,
  },
  bannerTagline: { fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 },
  bannerMeta: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 14 },
  bannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  bannerBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },

  // Dots
  dots: {
    position: "absolute",
    bottom: 18,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: { height: 5, borderRadius: 3 },

  // Search
  searchSection: { paddingHorizontal: 16, paddingVertical: 14 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" },

  // Category
  categoryScroll: { paddingHorizontal: 16, gap: 8 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryLabel: { fontSize: 13, fontWeight: "700" },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 14,
  },
  sectionAccentBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#E50914",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  cardImg: { borderRadius: 14 },
  cardAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
  },
  cardInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    zIndex: 2,
  },
  cardName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 5,
    letterSpacing: 0.2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cardBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardBadgeText: { fontSize: 10, fontWeight: "700" },

  // Empty
  empty: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: { color: "rgba(255,255,255,0.35)", fontSize: 15 },

  // Sticky header
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  stickyHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  stickyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  searchIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
