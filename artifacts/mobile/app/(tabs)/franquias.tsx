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
import {
  FRANCHISES,
  BANNER_FRANCHISES,
  TOP10_FRANCHISES,
  GENRE_SECTIONS,
  type Franchise,
  type FranchiseGenre,
} from "@/constants/franchises";
import { api, TMDB_IMG } from "@/lib/api";
import { useFavorites } from "@/hooks/useFavorites";

const { width: W } = Dimensions.get("window");
const BANNER_H = 370;
const CARD_W = 130;
const CARD_H = 160;
const ROW_ITEMS_DEFAULT = 8;

// ── Module-level caches ──────────────────────────────────────
const _imgCache = new Map<string, string | null>();
const _imgFetching = new Set<string>();
const _logoCache = new Map<string, string | null>();
const _logoFetching = new Set<string>();

async function fetchFranchiseImage(franchise: Franchise): Promise<string | null> {
  if (_imgCache.has(franchise.id)) return _imgCache.get(franchise.id)!;
  if (_imgFetching.has(franchise.id)) return null;
  _imgFetching.add(franchise.id);
  try {
    let path: string | null = null;
    if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
      const d = await api.tmdb.collection(franchise.tmdbCollectionId);
      path = d.backdrop_path;
    } else if (franchise.tmdbTvId) {
      const d = await (api.tmdb.tv(franchise.tmdbTvId) as Promise<any>);
      path = d.backdrop_path ?? null;
    } else {
      const q = franchise.searchQuery ?? franchise.name;
      const type = franchise.category === "anime" ? "tv" : "movie";
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.backdrop_path ?? null;
    }
    const url = path ? (TMDB_IMG(path, "w780") ?? null) : null;
    _imgCache.set(franchise.id, url);
    return url;
  } catch {
    _imgCache.set(franchise.id, null);
    return null;
  } finally {
    _imgFetching.delete(franchise.id);
  }
}

async function fetchFranchiseLogo(franchise: Franchise): Promise<string | null> {
  if (_logoCache.has(franchise.id)) return _logoCache.get(franchise.id)!;
  if (_logoFetching.has(franchise.id)) return null;
  _logoFetching.add(franchise.id);
  try {
    let type: "collection" | "tv" | "movie" = "movie";
    let id = 0;
    if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
      type = "collection";
      id = franchise.tmdbCollectionId;
    } else if (franchise.tmdbTvId) {
      type = "tv";
      id = franchise.tmdbTvId;
    }
    if (!id) { _logoCache.set(franchise.id, null); return null; }
    const data = await api.tmdb.franchiseLogo(type, id);
    const url = data.logo_path ? (TMDB_IMG(data.logo_path, "w500") ?? null) : null;
    _logoCache.set(franchise.id, url);
    return url;
  } catch {
    _logoCache.set(franchise.id, null);
    return null;
  } finally {
    _logoFetching.delete(franchise.id);
  }
}

function useFranchiseImage(franchise: Franchise) {
  const [url, setUrl] = useState<string | null>(
    _imgCache.has(franchise.id) ? _imgCache.get(franchise.id)! : null
  );
  useEffect(() => {
    if (_imgCache.has(franchise.id)) { setUrl(_imgCache.get(franchise.id)!); return; }
    fetchFranchiseImage(franchise).then(setUrl);
  }, [franchise.id]);
  return url;
}

function useFranchiseLogo(franchise: Franchise) {
  const [url, setUrl] = useState<string | null>(
    _logoCache.has(franchise.id) ? _logoCache.get(franchise.id)! : null
  );
  useEffect(() => {
    if (_logoCache.has(franchise.id)) { setUrl(_logoCache.get(franchise.id)!); return; }
    fetchFranchiseLogo(franchise).then(setUrl);
  }, [franchise.id]);
  return url;
}

// ── Banner slide ─────────────────────────────────────────────
function BannerSlide({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const imgUrl = useFranchiseImage(franchise);
  return (
    <View style={{ width: W, height: BANNER_H }}>
      {imgUrl
        ? <Image source={{ uri: imgUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.5)", "#000"]}
        locations={[0.1, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.bannerAccent, { backgroundColor: franchise.color }]} />
      <View style={styles.bannerContent}>
        <View style={[styles.bannerBadge, { borderColor: franchise.color + "99" }]}>
          <Text style={[styles.bannerBadgeText, { color: franchise.accentColor }]}>
            {franchise.category.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.bannerTitle}>{franchise.name.toUpperCase()}</Text>
        <Text style={[styles.bannerTagline, { color: franchise.accentColor }]}>{franchise.tagline}</Text>
        <Text style={styles.bannerMeta}>{franchise.contentCount} conteúdos · {franchise.yearRange}</Text>
        <TouchableOpacity onPress={onPress} style={[styles.bannerBtn, { backgroundColor: franchise.color }]}>
          <Feather name="play" size={12} color="#fff" />
          <Text style={styles.bannerBtnText}>EXPLORAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Rotating banner ──────────────────────────────────────────
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
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
        style={{ width: W }}
      >
        {BANNER_FRANCHISES.map((f) => (
          <BannerSlide key={f.id} franchise={f} onPress={() => onPress(f.id)} />
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {BANNER_FRANCHISES.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx
            ? { backgroundColor: "#fff", width: 18 }
            : { backgroundColor: "rgba(255,255,255,0.3)", width: 6 }]} />
        ))}
      </View>
    </View>
  );
}

// ── Franchise card ────────────────────────────────────────────
function FranchiseCard({
  franchise,
  onPress,
  showHeart,
  isFav,
  onFavPress,
  rank,
}: {
  franchise: Franchise;
  onPress: () => void;
  showHeart?: boolean;
  isFav?: boolean;
  onFavPress?: () => void;
  rank?: number;
}) {
  const imgUrl = useFranchiseImage(franchise);
  const logoUrl = useFranchiseLogo(franchise);
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start()}
    >
      <Animated.View style={[styles.card, { width: CARD_W, height: CARD_H, transform: [{ scale }] }]}>
        {imgUrl
          ? <Image source={{ uri: imgUrl }} style={[StyleSheet.absoluteFill, styles.cardImg]} resizeMode="cover" />
          : <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />}
        <LinearGradient
          colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.88)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.cardAccent, { backgroundColor: franchise.color }]} />

        {rank != null && (
          <View style={styles.cardRank}>
            <Text style={styles.cardRankText}>{rank}</Text>
          </View>
        )}

        {showHeart && (
          <Pressable onPress={onFavPress} style={styles.cardHeart} hitSlop={8}>
            <Feather name="heart" size={14} color={isFav ? "#FF3B30" : "rgba(255,255,255,0.7)"} />
          </Pressable>
        )}

        {/* Logo area — centered vertically in upper 60% */}
        <View style={styles.cardLogoArea}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.cardLogoImg}
              resizeMode="contain"
            />
          ) : (
            <Text style={[styles.cardNameFallback, { color: franchise.accentColor }]} numberOfLines={2}>
              {franchise.shortName}
            </Text>
          )}
        </View>

        <View style={styles.cardInfo}>
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

// ── Franchise row (horizontal) ────────────────────────────────
function FranchiseRow({
  title,
  franchises,
  accentColor,
  onPress,
  showHeart,
  favorites,
  onFavToggle,
  showRanks,
}: {
  title: string;
  franchises: Franchise[];
  accentColor?: string;
  onPress: (id: string) => void;
  showHeart?: boolean;
  favorites?: string[];
  onFavToggle?: (id: string) => void;
  showRanks?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? franchises : franchises.slice(0, ROW_ITEMS_DEFAULT);

  if (franchises.length === 0) return null;

  return (
    <View style={styles.rowSection}>
      <View style={styles.rowHeader}>
        <View style={[styles.rowAccentBar, { backgroundColor: accentColor ?? "#E50914" }]} />
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowCount}>
          {franchises.length} franquia{franchises.length !== 1 ? "s" : ""}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowScroll}
      >
        {visible.map((f, i) => (
          <FranchiseCard
            key={f.id}
            franchise={f}
            onPress={() => onPress(f.id)}
            showHeart={showHeart}
            isFav={favorites?.includes(f.id)}
            onFavPress={() => onFavToggle?.(f.id)}
            rank={showRanks ? i + 1 : undefined}
          />
        ))}
        {!expanded && franchises.length > ROW_ITEMS_DEFAULT && (
          <Pressable onPress={() => setExpanded(true)} style={styles.verMaisCard}>
            <View style={styles.verMaisInner}>
              <Feather name="plus-circle" size={24} color="#fff" />
              <Text style={styles.verMaisText}>Ver mais</Text>
              <Text style={styles.verMaisCount}>+{franchises.length - ROW_ITEMS_DEFAULT}</Text>
            </View>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function FranquiasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const { favorites, toggle, isFavorite } = useFavorites();

  const [search, setSearch] = useState("");
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [BANNER_H - 60, BANNER_H],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const goTo = (id: string) => router.push({ pathname: "/franchise", params: { id } });

  const searchResults = search.trim()
    ? FRANCHISES.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.tagline.toLowerCase().includes(search.toLowerCase()) ||
          f.description.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const favoriteFranchises = FRANCHISES.filter((f) => isFavorite(f.id));

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
        {/* ── Rotating banner ──────────────────────── */}
        <RotatingBanner onPress={goTo} />

        {/* ── Search bar ───────────────────────────── */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Feather name="search" size={15} color="rgba(255,255,255,0.45)" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar franquias..."
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

        {/* ── Search results ────────────────────────── */}
        {search.trim().length > 0 && (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={styles.searchResultsTitle}>
              {searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""} para "{search}"
            </Text>
            <View style={styles.searchGrid}>
              {searchResults.map((f) => (
                <FranchiseCard
                  key={f.id}
                  franchise={f}
                  onPress={() => goTo(f.id)}
                  showHeart
                  isFav={isFavorite(f.id)}
                  onFavPress={() => toggle(f.id)}
                />
              ))}
              {searchResults.length === 0 && (
                <View style={styles.emptySearch}>
                  <Feather name="search" size={32} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyText}>Nenhuma franquia encontrada</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {search.trim().length === 0 && (
          <>
            {/* ── Favoritos ────────────────────────────── */}
            {favoriteFranchises.length > 0 && (
              <FranchiseRow
                title="❤️ Meus Favoritos"
                franchises={favoriteFranchises}
                accentColor="#FF3B30"
                onPress={goTo}
                showHeart
                favorites={favorites}
                onFavToggle={toggle}
              />
            )}

            {/* ── Top 10 ──────────────────────────────── */}
            <FranchiseRow
              title="🏆 Top 10 Universos"
              franchises={TOP10_FRANCHISES}
              accentColor="#FFD700"
              onPress={goTo}
              showHeart
              favorites={favorites}
              onFavToggle={toggle}
              showRanks
            />

            {/* ── Genre rows ───────────────────────────── */}
            {GENRE_SECTIONS.map(({ genre, label, emoji }) => {
              const items = FRANCHISES.filter((f) => f.genre === genre);
              return (
                <FranchiseRow
                  key={genre}
                  title={`${emoji} ${label}`}
                  franchises={items}
                  accentColor={items[0]?.color}
                  onPress={goTo}
                  showHeart
                  favorites={favorites}
                  onFavToggle={toggle}
                />
              );
            })}
          </>
        )}
      </Animated.ScrollView>

      {/* ── Sticky header ─────────────────────────── */}
      <Animated.View style={[styles.stickyHeader, { paddingTop: topPad }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: headerOpacity }]} />
        <View style={styles.stickyHeaderContent}>
          <Text style={styles.stickyTitle}>🌌 UNIVERSOS</Text>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push("/(tabs)/search")}>
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
  bannerAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  bannerContent: { position: "absolute", bottom: 52, left: 20, right: 20, zIndex: 2 },
  bannerBadge: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8,
  },
  bannerBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  bannerTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: 2, lineHeight: 32, marginBottom: 4 },
  bannerTagline: { fontSize: 13, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 },
  bannerMeta: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 14 },
  bannerBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, alignSelf: "flex-start",
  },
  bannerBtnText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  dots: {
    position: "absolute", bottom: 18, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5,
  },
  dot: { height: 5, borderRadius: 3 },

  // Search
  searchSection: { paddingHorizontal: 16, paddingVertical: 14 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14, paddingVertical: 11,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" },
  searchResultsTitle: { color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 14 },
  searchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  emptySearch: { width: "100%", alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { color: "rgba(255,255,255,0.35)", fontSize: 15 },

  // Card
  card: { borderRadius: 14, overflow: "hidden", position: "relative", marginRight: 10 },
  cardImg: { borderRadius: 14 },
  cardAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 2 },
  cardRank: {
    position: "absolute", top: 8, left: 8, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  cardRankText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  cardHeart: {
    position: "absolute", top: 8, right: 8, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.6)", width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  cardLogoArea: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 38,
    zIndex: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 8,
  },
  cardLogoImg: { width: "88%", height: 52, maxWidth: 108 },
  cardNameFallback: {
    fontSize: 13, fontWeight: "900", textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5,
  },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, zIndex: 2 },
  cardBadge: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  cardBadgeText: { fontSize: 10, fontWeight: "700" },

  // Row section
  rowSection: { marginBottom: 28 },
  rowHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, marginBottom: 14 },
  rowAccentBar: { width: 3, height: 16, borderRadius: 2 },
  rowTitle: { color: "#fff", fontSize: 17, fontWeight: "800", flex: 1 },
  rowCount: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
  rowScroll: { paddingHorizontal: 16, paddingBottom: 4 },

  // Ver mais
  verMaisCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  verMaisInner: { alignItems: "center", gap: 6 },
  verMaisText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  verMaisCount: { color: "rgba(255,255,255,0.45)", fontSize: 11 },

  // Sticky header
  stickyHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  stickyHeaderContent: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 8,
  },
  stickyTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 1.5 },
  headerIconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center",
  },
});
