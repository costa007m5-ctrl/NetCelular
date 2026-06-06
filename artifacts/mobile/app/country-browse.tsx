import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { api, COUNTRY_LANG, tmdbItemToContent } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: SW } = Dimensions.get("window");
const BANNER_H = 240;
const CARD_W = 120;
const CARD_H = 180;

// ── Genre definitions ──────────────────────────────────────────────────────
const GENRES = [
  { id: 0,     label: "Em Alta",   icon: "trending-up"  as const },
  { id: 28,    label: "Ação",      icon: "zap"          as const },
  { id: 18,    label: "Drama",     icon: "heart"        as const },
  { id: 35,    label: "Comédia",   icon: "smile"        as const },
  { id: 10749, label: "Romance",   icon: "heart"        as const },
  { id: 53,    label: "Thriller",  icon: "alert-circle" as const },
  { id: 27,    label: "Terror",    icon: "eye-off"      as const },
  { id: 878,   label: "Sci-Fi",    icon: "cpu"          as const },
  { id: 16,    label: "Animação",  icon: "star"         as const },
  { id: 99,    label: "Documentário", icon: "camera"    as const },
];

const TMDB_IMAGE = "https://image.tmdb.org/t/p/";
function backdropUrl(path: string | null) {
  return path ? `${TMDB_IMAGE}w780${path}` : null;
}

// ── Horizontal card ────────────────────────────────────────────────────────
function ContentCardH({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_W, marginRight: 10 }}>
      <View style={styles.hCard}>
        {!imgErr && item.posterPath ? (
          <Image source={{ uri: item.posterPath }} style={StyleSheet.absoluteFill}
            resizeMode="cover" onError={() => setImgErr(true)} />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="film" size={22} color="#444" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={styles.hCardGrad} locations={[0.5, 1]} />
        {item.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={8} color="#f59e0b" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
        <Text style={styles.hCardTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </Pressable>
  );
}

// ── Rotating hero banner ───────────────────────────────────────────────────
function HeroBanner({
  items,
  accentColor,
  onPress,
}: {
  items: ContentItem[];
  accentColor: string;
  onPress: (item: ContentItem) => void;
}) {
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (items.length < 2) return;
    const timer = setInterval(() => {
      setCurrent((prev) => {
        const next = (prev + 1) % items.length;
        scrollRef.current?.scrollTo({ x: next * SW, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <View style={{ height: BANNER_H, marginBottom: 20 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={{ flex: 1 }}
      >
        {items.map((item, idx) => {
          const bg = backdropUrl(item.backdropPath ?? null) ?? item.posterPath;
          return (
            <Pressable
              key={`hero-${item.id}-${idx}`}
              style={{ width: SW, height: BANNER_H }}
              onPress={() => onPress(item)}
            >
              {bg && !imgErrors[idx] ? (
                <Image source={{ uri: bg }} style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                  onError={() => setImgErrors((e) => ({ ...e, [idx]: true }))} />
              ) : (
                <LinearGradient colors={["#1a0a14", "#08060e"]} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient
                colors={["rgba(0,0,0,0.1)", "transparent", "rgba(0,0,0,0.85)"]}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* Bottom info */}
              <View style={styles.bannerInfo}>
                <View style={[styles.bannerBadge, { backgroundColor: `${accentColor}25`,
                  borderColor: `${accentColor}60` }]}>
                  <Text style={[styles.bannerBadgeText, { color: accentColor }]}>
                    {item.type === "movie" ? "FILME" : "SÉRIE"}
                  </Text>
                </View>
                <Text style={styles.bannerTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.bannerMeta}>
                  {item.rating > 0 && (
                    <View style={styles.bannerRating}>
                      <Feather name="star" size={10} color="#f59e0b" />
                      <Text style={styles.bannerRatingText}>{item.rating.toFixed(1)}</Text>
                    </View>
                  )}
                  {item.year ? (
                    <Text style={styles.bannerYear}>{item.year}</Text>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.bannerPlayBtn, { backgroundColor: accentColor }]}
                    onPress={() => onPress(item)}
                  >
                    <Feather name="play" size={10} color="#fff" />
                    <Text style={styles.bannerPlayText}>Ver detalhes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {/* Dots */}
      <View style={styles.dots}>
        {items.map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.dot,
              idx === current
                ? { backgroundColor: accentColor, width: 18 }
                : { backgroundColor: "rgba(255,255,255,0.35)", width: 6 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ── Genre row ──────────────────────────────────────────────────────────────
type GenreRow = {
  genreId: number;
  label: string;
  type: "movie" | "tv";
  items: ContentItem[];
  loading: boolean;
  error: boolean;
};

export default function CountryBrowseScreen() {
  const { id, label, flag, color } = useLocalSearchParams<{
    id: string; label: string; flag: string; color: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const countryId = id ?? "US";
  const countryLabel = label ?? "País";
  const countryFlag = flag ?? "🌍";
  const accentColor = color ?? "#3b82f6";
  const lang = COUNTRY_LANG[countryId] ?? "en";

  // Content type tab: movies or series
  const [tab, setTab] = useState<"movie" | "tv">("movie");

  // Hero items (first page, no genre filter)
  const [heroItems, setHeroItems] = useState<ContentItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  // Genre rows
  const [movieRows, setMovieRows] = useState<GenreRow[]>(
    GENRES.map((g) => ({ genreId: g.id, label: g.label, type: "movie", items: [], loading: true, error: false }))
  );
  const [tvRows, setTvRows] = useState<GenreRow[]>(
    GENRES.map((g) => ({ genreId: g.id, label: g.label, type: "tv", items: [], loading: true, error: false }))
  );

  const [retryKey, setRetryKey] = useState(0);
  const loadedRef = useRef<Set<string>>(new Set());

  const updateRow = (
    type: "movie" | "tv",
    genreId: number,
    patch: Partial<GenreRow>
  ) => {
    const setter = type === "movie" ? setMovieRows : setTvRows;
    setter((prev) => prev.map((r) => r.genreId === genreId ? { ...r, ...patch } : r));
  };

  // Load a single genre row
  const loadRow = (type: "movie" | "tv", genreId: number) => {
    const key = `${type}-${genreId}`;
    if (loadedRef.current.has(key)) return;
    loadedRef.current.add(key);

    api.tmdb
      .discoverByLang(type, lang, genreId, 1)
      .then((data) => {
        updateRow(type, genreId, {
          items: data.results.slice(0, 15).map(tmdbItemToContent),
          loading: false,
          error: data.results.length === 0,
        });
      })
      .catch(() => {
        loadedRef.current.delete(key);
        updateRow(type, genreId, { loading: false, error: true });
      });
  };

  // Load hero + first 3 rows of each type on mount / retry
  useEffect(() => {
    loadedRef.current = new Set();
    setHeroLoading(true);
    setMovieRows(GENRES.map((g) => ({ genreId: g.id, label: g.label, type: "movie", items: [], loading: true, error: false })));
    setTvRows(GENRES.map((g) => ({ genreId: g.id, label: g.label, type: "tv", items: [], loading: true, error: false })));

    // Hero: top movies
    api.tmdb
      .discoverByLang("movie", lang, 0, 1)
      .then((data) => {
        const withBackdrop = data.results
          .filter((r) => r.backdrop_path)
          .slice(0, 5)
          .map(tmdbItemToContent);
        setHeroItems(withBackdrop.length > 0 ? withBackdrop : data.results.slice(0, 5).map(tmdbItemToContent));
        setHeroLoading(false);
      })
      .catch(() => setHeroLoading(false));

    // Load first 4 genres for current tab eagerly
    GENRES.slice(0, 4).forEach((g) => {
      loadRow("movie", g.id);
      loadRow("tv", g.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, countryId]);

  // Lazy-load remaining rows when tab becomes visible
  useEffect(() => {
    GENRES.forEach((g) => loadRow(tab, g.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const goToDetail = (item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId ?? item.id),
        title: item.title,
      },
    });
  };

  const goToMore = (type: "movie" | "tv", genreId: number, rowLabel: string) => {
    router.push({
      pathname: "/genre-browse",
      params: {
        genre_id: String(genreId),
        type,
        title: `${countryFlag} ${rowLabel} · ${countryLabel}`,
        lang,
      },
    });
  };

  const rows = tab === "movie" ? movieRows : tvRows;
  const allLoading = heroLoading && rows.every((r) => r.loading);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: topPad + 8 }]}>
        <LinearGradient colors={[`${accentColor}28`, "transparent"]} style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerFlag}>{countryFlag}</Text>
          <View>
            <Text style={styles.headerSub}>Cinema do Mundo</Text>
            <Text style={[styles.headerLabel, { color: accentColor }]}>{countryLabel}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {allLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
            Carregando conteúdo de {countryLabel}...
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}>

          {/* Hero banner */}
          {heroItems.length > 0 && (
            <HeroBanner
              items={heroItems}
              accentColor={accentColor}
              onPress={goToDetail}
            />
          )}

          {/* ── Tabs: Filmes / Séries ─────────────────────────── */}
          <View style={styles.tabs}>
            {(["movie", "tv"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && { borderBottomColor: accentColor }]}
                onPress={() => setTab(t)}
              >
                <Feather
                  name={t === "movie" ? "film" : "tv"}
                  size={14}
                  color={tab === t ? accentColor : "#666"}
                />
                <Text style={[styles.tabText, { color: tab === t ? accentColor : "#666" }]}>
                  {t === "movie" ? "Filmes" : "Séries"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Genre rows ───────────────────────────────────────── */}
          {rows.map((row, ridx) => {
            if (row.error && row.items.length === 0) return null;
            return (
              <View key={`${tab}-${row.genreId}`} style={styles.genreSection}>
                {/* Row header */}
                <View style={styles.rowHeader}>
                  <View style={styles.rowTitleWrap}>
                    <View style={[styles.rowAccent, { backgroundColor: accentColor }]} />
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                      {row.label}
                    </Text>
                    {row.loading && (
                      <ActivityIndicator size="small" color={accentColor} style={{ marginLeft: 8 }} />
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.verMaisBtn}
                    onPress={() => goToMore(tab, row.genreId, row.label)}
                  >
                    <Text style={[styles.verMaisText, { color: accentColor }]}>Ver mais</Text>
                    <Feather name="chevron-right" size={14} color={accentColor} />
                  </TouchableOpacity>
                </View>

                {/* Cards */}
                {row.items.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.hScroll} decelerationRate="fast">
                    {row.items.map((item, idx) => (
                      <ContentCardH
                        key={`${item.id}-${idx}`}
                        item={item}
                        onPress={() => goToDetail(item)}
                      />
                    ))}
                  </ScrollView>
                ) : row.loading ? (
                  <View style={styles.rowLoading}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={styles.skeleton} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center", borderRadius: 20,
  },
  headerCenter: {
    flexDirection: "row", alignItems: "center", gap: 10,
    flex: 1, justifyContent: "center",
  },
  headerFlag: { fontSize: 32 },
  headerSub: {
    color: "#888", fontSize: 10, fontWeight: "500",
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  headerLabel: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  centered: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: 12, paddingHorizontal: 32,
  },
  // Hero banner
  bannerInfo: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 44, gap: 4,
  },
  bannerBadge: {
    alignSelf: "flex-start",
    borderWidth: 1, borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 2, marginBottom: 2,
  },
  bannerBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  bannerTitle: {
    color: "#fff", fontSize: 22, fontWeight: "800",
    letterSpacing: -0.3, lineHeight: 26,
  },
  bannerMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  bannerRating: { flexDirection: "row", alignItems: "center", gap: 3 },
  bannerRatingText: { color: "#f59e0b", fontSize: 12, fontWeight: "700" },
  bannerYear: { color: "#aaa", fontSize: 12 },
  bannerPlayBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginLeft: "auto",
  },
  bannerPlayText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  dots: {
    position: "absolute", bottom: 10, left: 0, right: 0,
    flexDirection: "row", justifyContent: "center", gap: 5,
  },
  dot: { height: 4, borderRadius: 2 },
  // Tabs
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 16,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "700" },
  // Genre sections
  genreSection: { marginBottom: 24 },
  rowHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, marginBottom: 10,
  },
  rowTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowAccent: { width: 3, height: 17, borderRadius: 2 },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  verMaisBtn: {
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingVertical: 4, paddingHorizontal: 6,
  },
  verMaisText: { fontSize: 12, fontWeight: "600" },
  hScroll: { paddingHorizontal: 16 },
  hCard: {
    width: CARD_W, height: CARD_H,
    borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a",
  },
  hCardGrad: { position: "absolute", bottom: 0, left: 0, right: 0, height: "55%" },
  hCardTitle: {
    position: "absolute", bottom: 6, left: 5, right: 5,
    color: "#fff", fontSize: 9, fontWeight: "600", lineHeight: 12,
  },
  ratingBadge: {
    position: "absolute", top: 5, right: 5,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4,
  },
  ratingText: { color: "#f59e0b", fontSize: 8, fontWeight: "700" },
  rowLoading: {
    flexDirection: "row", paddingHorizontal: 16, gap: 10,
  },
  skeleton: {
    width: CARD_W, height: CARD_H,
    borderRadius: 10, backgroundColor: "#1e1e1e",
  },
});
