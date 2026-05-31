import React, { useEffect, useRef, useState, useCallback } from "react";
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
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
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
} from "@/constants/franchises";
import { api, TMDB_IMG } from "@/lib/api";
import { useFavorites } from "@/hooks/useFavorites";

const { width: W } = Dimensions.get("window");
const BG = "#050505";
const RED = "#e50914";
const GLASS = "rgba(255,255,255,0.06)";
const GLASS_B = "rgba(255,255,255,0.11)";
const CARD_W = 150;
const CARD_H = 210;

const _imgCache = new Map<string, string | null>();
const _posterCache = new Map<string, string | null>();
const _logoCache = new Map<string, string | null>();

async function fetchFranchiseImage(f: Franchise): Promise<string | null> {
  if (_imgCache.has(f.id)) return _imgCache.get(f.id)!;
  try {
    let path: string | null = null;
    if (f.fetchType === "collection" && f.tmdbCollectionId) {
      const d = await api.tmdb.collection(f.tmdbCollectionId);
      path = d.backdrop_path;
    } else if (f.tmdbTvId) {
      const d = await (api.tmdb.tv(f.tmdbTvId) as Promise<any>);
      path = d.backdrop_path ?? null;
    } else {
      const q = f.searchQuery ?? f.name;
      const type = f.category === "anime" ? "tv" : "movie";
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.backdrop_path ?? null;
    }
    const url = path ? (TMDB_IMG(path, "w1280") ?? null) : null;
    _imgCache.set(f.id, url);
    return url;
  } catch {
    _imgCache.set(f.id, null);
    return null;
  }
}

async function fetchFranchisePoster(f: Franchise): Promise<string | null> {
  if (_posterCache.has(f.id)) return _posterCache.get(f.id)!;
  try {
    let path: string | null = null;
    if (f.fetchType === "collection" && f.tmdbCollectionId) {
      const d = await api.tmdb.collection(f.tmdbCollectionId);
      path = d.poster_path ?? d.backdrop_path;
    } else if (f.tmdbTvId) {
      const d = await (api.tmdb.tv(f.tmdbTvId) as Promise<any>);
      path = d.poster_path ?? d.backdrop_path ?? null;
    } else {
      const q = f.searchQuery ?? f.name;
      const type = f.category === "anime" ? "tv" : "movie";
      const d = await api.tmdb.search(q, type as any);
      path = d.results[0]?.poster_path ?? null;
    }
    const url = path ? (TMDB_IMG(path, "w500") ?? null) : null;
    _posterCache.set(f.id, url);
    return url;
  } catch {
    _posterCache.set(f.id, null);
    return null;
  }
}

async function fetchFranchiseLogo(f: Franchise): Promise<string | null> {
  if (_logoCache.has(f.id)) return _logoCache.get(f.id)!;
  try {
    let type: "collection" | "tv" | "movie" = "movie";
    let id = 0;
    if (f.fetchType === "collection" && f.tmdbCollectionId) { type = "collection"; id = f.tmdbCollectionId; }
    else if (f.tmdbTvId) { type = "tv"; id = f.tmdbTvId; }
    if (!id) { _logoCache.set(f.id, null); return null; }
    const data = await api.tmdb.franchiseLogo(type, id);
    const url = data.logo_path ? (TMDB_IMG(data.logo_path, "w500") ?? null) : null;
    _logoCache.set(f.id, url);
    return url;
  } catch {
    _logoCache.set(f.id, null);
    return null;
  }
}

function useFranchiseAssets(f: Franchise) {
  const [img, setImg] = useState<string | null>(_imgCache.get(f.id) ?? null);
  const [poster, setPoster] = useState<string | null>(_posterCache.get(f.id) ?? null);
  const [logo, setLogo] = useState<string | null>(_logoCache.get(f.id) ?? null);
  useEffect(() => {
    if (!_imgCache.has(f.id)) fetchFranchiseImage(f).then(setImg);
    if (!_posterCache.has(f.id)) fetchFranchisePoster(f).then(setPoster);
    if (!_logoCache.has(f.id)) fetchFranchiseLogo(f).then(setLogo);
  }, [f.id]);
  return { img, poster, logo };
}

/* ── Hero Banner Card ─────────────────────────────────────── */
function HeroSlide({ franchise, onPress }: { franchise: Franchise; onPress: () => void }) {
  const { img, logo } = useFranchiseAssets(franchise);
  return (
    <Pressable onPress={onPress} style={{ width: W, height: 340 }}>
      {img ? (
        <ExpoImage source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={["rgba(5,5,5,0.08)", "rgba(5,5,5,0.55)", BG]}
        locations={[0.1, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[hero.accentLine, { backgroundColor: franchise.color }]} />
      <View style={hero.content}>
        <View style={[hero.badge, { borderColor: franchise.color + "88" }]}>
          <Text style={[hero.badgeTxt, { color: franchise.accentColor }]}>
            {franchise.category.toUpperCase()}
          </Text>
        </View>
        {logo ? (
          <ExpoImage source={{ uri: logo }} style={hero.logo} contentFit="contain" />
        ) : (
          <Text style={hero.name}>{franchise.name.toUpperCase()}</Text>
        )}
        <Text style={[hero.tagline, { color: franchise.accentColor }]}>{franchise.tagline}</Text>
        {franchise.yearRange ? (
          <View style={hero.metaRow}>
            <View style={[hero.metaPill, { backgroundColor: "rgba(0,0,0,0.55)", borderColor: "rgba(255,255,255,0.12)" }]}>
              <Feather name="calendar" size={10} color={franchise.accentColor} />
              <Text style={[hero.metaTxt, { color: franchise.accentColor }]}>{franchise.yearRange}</Text>
            </View>
          </View>
        ) : null}
        <Pressable onPress={onPress} style={[hero.btn, { backgroundColor: franchise.color }]}>
          <Feather name="play" size={12} color="#fff" />
          <Text style={hero.btnTxt}>EXPLORAR UNIVERSO</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const hero = StyleSheet.create({
  accentLine: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  content: { position: "absolute", bottom: 40, left: 20, right: 20, zIndex: 2 },
  badge: {
    alignSelf: "flex-start", borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 9, paddingVertical: 3, marginBottom: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  badgeTxt: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  logo: { width: 180, height: 56, marginBottom: 8 },
  name: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: 2, lineHeight: 32, marginBottom: 6 },
  tagline: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2, marginBottom: 12 },
  metaRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  metaPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  metaTxt: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, alignSelf: "flex-start",
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, shadowOpacity: 0.5,
  },
  btnTxt: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
});

/* ── Rotating Hero ─────────────────────────────────────────── */
function RotatingHero({ onPress }: { onPress: (id: string) => void }) {
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
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
      >
        {BANNER_FRANCHISES.map((f) => (
          <HeroSlide key={f.id} franchise={f} onPress={() => onPress(f.id)} />
        ))}
      </ScrollView>
      <View style={s.dots}>
        {BANNER_FRANCHISES.map((_, i) => (
          <View key={i} style={[s.dot, i === idx
            ? { backgroundColor: "#fff", width: 20 }
            : { backgroundColor: "rgba(255,255,255,0.25)", width: 6 }
          ]} />
        ))}
      </View>
    </View>
  );
}

/* ── Franchise Card ────────────────────────────────────────── */
function FranchiseCard({
  franchise,
  onPress,
  isFav,
  onFavPress,
  rank,
}: {
  franchise: Franchise;
  onPress: () => void;
  isFav?: boolean;
  onFavPress?: () => void;
  rank?: number;
}) {
  const { poster, logo } = useFranchiseAssets(franchise);
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 6 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[s.card, { transform: [{ scale }] }]}>
        {/* Poster / fallback gradient */}
        {poster ? (
          <ExpoImage source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
        )}

        {/* Dark vignette */}
        <LinearGradient
          colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.18)", "rgba(0,0,0,0.82)"]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Top accent line */}
        <View style={[s.cardTopLine, { backgroundColor: franchise.color }]} />

        {/* Rank badge */}
        {rank != null && (
          <View style={[s.rankBadge, { borderColor: franchise.color + "88" }]}>
            <Text style={[s.rankTxt, { color: franchise.accentColor }]}>{rank}</Text>
          </View>
        )}

        {/* Heart */}
        {onFavPress && (
          <Pressable onPress={onFavPress} style={[s.heartBtn, isFav && { backgroundColor: "rgba(255,60,60,0.25)" }]} hitSlop={10}>
            <Feather name="heart" size={12} color={isFav ? "#ff4c4c" : "rgba(255,255,255,0.6)"} />
          </Pressable>
        )}

        {/* Logo overlay (only visible when no poster) */}
        {!poster && logo && (
          <View style={s.cardLogoArea}>
            <ExpoImage source={{ uri: logo }} style={s.logoImg} contentFit="contain" />
          </View>
        )}

        {/* Bottom name */}
        <View style={s.cardBottom}>
          {logo ? (
            <ExpoImage source={{ uri: logo }} style={s.cardLogoBottom} contentFit="contain" />
          ) : (
            <Text style={s.cardName} numberOfLines={2}>{franchise.shortName}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/* ── Category Filter Pills ─────────────────────────────────── */
const GENRE_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "superherois", label: "Super-heróis" },
  { key: "acao", label: "Ação" },
  { key: "scifi", label: "Sci-Fi" },
  { key: "fantasia", label: "Fantasia" },
  { key: "terror", label: "Terror" },
  { key: "animacao", label: "Animação" },
  { key: "anime", label: "Anime" },
  { key: "drama", label: "Drama" },
];

/* ── Section Row ───────────────────────────────────────────── */
function SectionRow({
  title,
  accentColor,
  franchises,
  onPress,
  isFav,
  onFavToggle,
  showRanks,
  router,
  genre,
  label,
}: {
  title: string;
  accentColor?: string;
  franchises: Franchise[];
  onPress: (id: string) => void;
  isFav?: (id: string) => boolean;
  onFavToggle?: (id: string) => void;
  showRanks?: boolean;
  router?: any;
  genre?: string;
  label?: string;
}) {
  if (franchises.length === 0) return null;

  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <View style={[s.accentBar, { backgroundColor: accentColor ?? RED }]} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
        {franchises.map((f, i) => (
          <FranchiseCard
            key={f.id}
            franchise={f}
            onPress={() => onPress(f.id)}
            isFav={isFav?.(f.id)}
            onFavPress={() => onFavToggle?.(f.id)}
            rank={showRanks ? i + 1 : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/* ── Main Screen ───────────────────────────────────────────── */
export default function FranquiasScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const { favorites, toggle, isFavorite } = useFavorites();

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [tmdbLoading, setTmdbLoading] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headerBg = scrollY.interpolate({
    inputRange: [270, 320],
    outputRange: ["rgba(5,5,5,0)", "rgba(5,5,5,0.98)"],
    extrapolate: "clamp",
  });

  const goTo = useCallback((id: string) => router.push({ pathname: "/franchise", params: { id } }), [router]);

  const searchResults = search.trim()
    ? FRANCHISES.filter(
        (f) =>
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.tagline.toLowerCase().includes(search.toLowerCase()) ||
          f.category.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) { setTmdbResults([]); setTmdbLoading(false); return; }
    setTmdbLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await api.tmdb.searchCollections(text.trim());
        const localIds = new Set(FRANCHISES.map((f) => f.tmdbCollectionId).filter(Boolean));
        const fresh = (data.results ?? []).filter((r: any) => !localIds.has(r.id)).slice(0, 12);
        setTmdbResults(fresh);
      } catch {
        setTmdbResults([]);
      } finally {
        setTmdbLoading(false);
      }
    }, 500);
  }, []);

  const favoriteFranchises = FRANCHISES.filter((f) => isFavorite(f.id));

  const filteredByGenre = useCallback((genre: string) => {
    if (activeFilter === "all") return FRANCHISES.filter((f) => f.genre === genre);
    return FRANCHISES.filter((f) => f.genre === genre && f.genre === activeFilter);
  }, [activeFilter]);

  const visibleSections = activeFilter === "all"
    ? GENRE_SECTIONS
    : GENRE_SECTIONS.filter((g) => g.genre === activeFilter);

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        {/* ── HERO BANNER ────────────────────────── */}
        <RotatingHero onPress={goTo} />

        {/* ── SEARCH ─────────────────────────────── */}
        <View style={s.searchWrap}>
          <View style={s.searchBar}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              value={search}
              onChangeText={handleSearchChange}
              placeholder="Buscar universos e franquias..."
              placeholderTextColor="rgba(255,255,255,0.28)"
              style={s.searchInput}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Feather name="x" size={15} color="rgba(255,255,255,0.4)" />
              </Pressable>
            )}
          </View>
        </View>

        {/* ── SEARCH RESULTS ─────────────────────── */}
        {search.trim().length > 0 ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <Text style={s.searchResultLabel}>
              {searchResults.length + tmdbResults.length} resultado{(searchResults.length + tmdbResults.length) !== 1 ? "s" : ""} para "{search}"
            </Text>

            {/* Local franchise results */}
            {searchResults.length > 0 && (
              <>
                <Text style={s.searchSectionLabel}>📂 Franquias locais</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                  {searchResults.map((f) => (
                    <FranchiseCard
                      key={f.id}
                      franchise={f}
                      onPress={() => goTo(f.id)}
                      isFav={isFavorite(f.id)}
                      onFavPress={() => toggle(f.id)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* TMDB collection results */}
            {(tmdbLoading || tmdbResults.length > 0) && (
              <>
                <Text style={[s.searchSectionLabel, { marginTop: searchResults.length > 0 ? 18 : 0 }]}>
                  🎬 Coleções do TMDB
                </Text>
                {tmdbLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    <Text style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Buscando no TMDB...</Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hScroll}>
                    {tmdbResults.map((col: any) => {
                      const posterUri = col.poster_path
                        ? `https://image.tmdb.org/t/p/w500${col.poster_path}`
                        : col.backdrop_path
                          ? `https://image.tmdb.org/t/p/w500${col.backdrop_path}`
                          : null;
                      return (
                        <Pressable
                          key={col.id}
                          onPress={() => router.push({ pathname: "/franchise", params: { id: `tmdb_collection_${col.id}`, name: col.name } })}
                          style={s.tmdbColCard}
                        >
                          {posterUri ? (
                            <ExpoImage
                              source={{ uri: posterUri }}
                              style={StyleSheet.absoluteFill}
                              contentFit="cover"
                            />
                          ) : (
                            <LinearGradient colors={["#1a1a2e", "#0a0a14"]} style={StyleSheet.absoluteFill} />
                          )}
                          <LinearGradient
                            colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.75)"]}
                            locations={[0.5, 1]}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={s.tmdbColBadge}>
                            <Text style={s.tmdbColBadgeTxt}>TMDB</Text>
                          </View>
                          <View style={s.tmdbColBottom}>
                            <Text style={s.tmdbColName} numberOfLines={2}>{col.name}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {/* Empty state */}
            {!tmdbLoading && searchResults.length === 0 && tmdbResults.length === 0 && (
              <View style={s.emptySearch}>
                <Feather name="search" size={36} color="rgba(255,255,255,0.15)" />
                <Text style={s.emptyTxt}>Nenhuma franquia encontrada</Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* ── CATEGORY FILTER PILLS ────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterRow}
            >
              {GENRE_FILTERS.map((gf) => (
                <Pressable
                  key={gf.key}
                  onPress={() => setActiveFilter(gf.key)}
                  style={[
                    s.filterPill,
                    activeFilter === gf.key
                      ? { backgroundColor: RED, borderColor: RED }
                      : { backgroundColor: GLASS, borderColor: GLASS_B },
                  ]}
                >
                  <Text style={[s.filterTxt, { color: activeFilter === gf.key ? "#fff" : "rgba(255,255,255,0.65)" }]}>
                    {gf.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* ── FAVORITOS ─────────────────────────── */}
            {favoriteFranchises.length > 0 && (
              <SectionRow
                title="❤️ Meus Favoritos"
                accentColor="#ff4c4c"
                franchises={favoriteFranchises}
                onPress={goTo}
                isFav={isFavorite}
                onFavToggle={toggle}
              />
            )}

            {/* ── TOP 10 ────────────────────────────── */}
            {(activeFilter === "all") && (
              <SectionRow
                title="🏆 Top 10 Universos"
                accentColor="#FFD700"
                franchises={TOP10_FRANCHISES}
                onPress={goTo}
                isFav={isFavorite}
                onFavToggle={toggle}
                showRanks
              />
            )}

            {/* ── GENRE SECTIONS ────────────────────── */}
            {visibleSections.map(({ genre, label }) => {
              const items = FRANCHISES.filter((f) => f.genre === genre);
              return (
                <SectionRow
                  key={genre}
                  title={label}
                  accentColor={items[0]?.color}
                  franchises={items}
                  onPress={goTo}
                  isFav={isFavorite}
                  onFavToggle={toggle}
                  router={router}
                  genre={genre}
                  label={label}
                />
              );
            })}
          </>
        )}
      </Animated.ScrollView>

      {/* ── STICKY HEADER ──────────────────────── */}
      <Animated.View
        style={[s.stickyHeader, { paddingTop: topPad, backgroundColor: headerBg as any }]}
        pointerEvents="box-none"
      >
        <View style={s.stickyContent}>
          <View>
            <Text style={s.stickyTitle}>🌌 UNIVERSOS</Text>
          </View>
          <View style={s.stickyRight}>
            <Pressable
              style={s.stickyBtn}
              onPress={() => router.push("/(tabs)/search")}
            >
              <Feather name="search" size={18} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Dots
  dots: {
    position: "absolute", bottom: 14, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5,
  },
  dot: { height: 4, borderRadius: 2 },

  // Search
  searchWrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: GLASS, borderRadius: 16,
    borderWidth: 1, borderColor: GLASS_B,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" },

  searchResultLabel: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 14 },
  searchSectionLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "700", marginBottom: 10, letterSpacing: 0.5 },
  emptySearch: { alignItems: "center", paddingVertical: 50, gap: 14 },
  emptyTxt: { color: "rgba(255,255,255,0.35)", fontSize: 15 },

  // TMDB collection card (search results)
  tmdbColCard: {
    width: CARD_W, height: CARD_H,
    borderRadius: 16, overflow: "hidden",
    marginRight: 12, backgroundColor: "#111",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  tmdbColBadge: {
    position: "absolute", top: 10, right: 10, zIndex: 3,
    backgroundColor: "#032541", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1, borderColor: "#01b4e4",
  },
  tmdbColBadgeTxt: { color: "#01b4e4", fontSize: 8, fontWeight: "800" },
  tmdbColBottom: { position: "absolute", bottom: 10, left: 10, right: 10, zIndex: 2 },
  tmdbColName: { color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 16 },

  // Filter pills
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 20 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 24, borderWidth: 1,
  },
  filterTxt: { fontSize: 12, fontWeight: "700" },

  // Section
  section: { marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, gap: 10, marginBottom: 14,
  },
  accentBar: { width: 3.5, height: 18, borderRadius: 2 },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "800", flex: 1 },
  sectionCount: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
  hScroll: { paddingHorizontal: 16, paddingBottom: 4, gap: 0 },

  // Card
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 14, overflow: "hidden",
    marginRight: 12, backgroundColor: "#111",
  },
  cardTopLine: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  rankBadge: {
    position: "absolute", top: 9, left: 9, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.78)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7,
    borderWidth: 1,
  },
  rankTxt: { fontSize: 12, fontWeight: "900" },
  heartBtn: {
    position: "absolute", top: 9, right: 9, zIndex: 3,
    backgroundColor: "rgba(0,0,0,0.65)", width: 27, height: 27, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
  },
  cardLogoArea: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 52,
    zIndex: 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
  },
  logoImg: { width: "85%", height: 60, maxWidth: 120 },
  cardBottom: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
    padding: 10, paddingBottom: 11,
  },
  cardLogoBottom: { width: "100%", height: 32 },
  cardName: {
    color: "#fff", fontSize: 13, fontWeight: "800", lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.95)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },

  // Sticky header
  stickyHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  stickyContent: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 10,
  },
  stickyTitle: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 1.5 },
  stickyRight: { flexDirection: "row", gap: 10 },
  stickyBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B,
    alignItems: "center", justifyContent: "center",
  },
});
