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
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FRANCHISES, getFranchise, type ChronologicalItem } from "@/constants/franchises";
import { api, tmdbItemToContent, TMDB_IMG } from "@/lib/api";
import { useFavorites } from "@/hooks/useFavorites";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const BACKDROP_H = 320;
const CARD_W = 120;
const CARD_H = 178;

type Tab = "filmes" | "series" | "cronologia";

// ─── Poster card for horizontal carousel ───────────────────────
function PosterCard({
  item,
  accentColor,
  onPress,
  rank,
}: {
  item: ContentItem;
  accentColor: string;
  onPress: () => void;
  rank?: number;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_W, marginRight: 10 }}>
      <View style={styles.posterCard}>
        {!imgErr && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={styles.posterCardImg}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient
            colors={[accentColor + "44", "#111"]}
            style={[styles.posterCardImg, styles.posterPlaceholder]}
          >
            <Feather name="film" size={20} color={accentColor} />
          </LinearGradient>
        )}
        {item.type === "series" && (
          <View style={[styles.mediaTypeBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.mediaTypeBadgeText}>TV</Text>
          </View>
        )}
        {rank != null && (
          <View style={styles.rankBadge}>
            <Text style={styles.rankBadgeText}>{rank}</Text>
          </View>
        )}
        {item.rating > 0 && (
          <View style={styles.ratingBadge}>
            <Feather name="star" size={8} color="#fbbf24" />
            <Text style={styles.ratingBadgeText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.posterCardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.posterCardYear}>{item.year}</Text>
    </Pressable>
  );
}

// ─── Horizontal carousel section ───────────────────────────────
function ContentCarousel({
  title,
  items,
  accentColor,
  onPressItem,
  loading,
  showRanks,
}: {
  title: string;
  items: ContentItem[];
  accentColor: string;
  onPressItem: (item: ContentItem) => void;
  loading?: boolean;
  showRanks?: boolean;
}) {
  if (!loading && items.length === 0) return null;
  return (
    <View style={styles.carouselSection}>
      <View style={styles.carouselHeader}>
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <Text style={styles.carouselTitle}>{title}</Text>
        {!loading && (
          <Text style={[styles.carouselCount, { color: accentColor }]}>
            {items.length} títulos
          </Text>
        )}
      </View>
      {loading ? (
        <View style={styles.carouselLoading}>
          <ActivityIndicator color={accentColor} size="small" />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselScroll}
        >
          {items.map((item, i) => (
            <PosterCard
              key={item.id}
              item={item}
              accentColor={accentColor}
              onPress={() => onPressItem(item)}
              rank={showRanks ? i + 1 : undefined}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Chronological order row ────────────────────────────────────
function ChronologyRow({
  items,
  contentItems,
  accentColor,
  onPressItem,
  loading,
}: {
  items: ChronologicalItem[];
  contentItems: ContentItem[];
  accentColor: string;
  onPressItem: (item: ContentItem) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={accentColor} size="large" />
        <Text style={styles.loadingText}>Montando linha do tempo...</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {items.map((chrono, idx) => {
        const found = contentItems.find(
          (c) => Number(c.tmdbId) === chrono.tmdbId
        );
        const [imgErr, setImgErr] = useState(false);
        return (
          <Pressable
            key={`${chrono.tmdbId}-${idx}`}
            onPress={() => found && onPressItem(found)}
            style={styles.chronoItem}
          >
            {/* Timeline line */}
            <View style={styles.chronoLeft}>
              <View style={[styles.chronoDot, { backgroundColor: accentColor }]} />
              {idx < items.length - 1 && (
                <View style={[styles.chronoLine, { backgroundColor: accentColor + "33" }]} />
              )}
            </View>

            {/* Content */}
            <View style={styles.chronoContent}>
              <View style={styles.chronoPoster}>
                {found && found.posterPath && !imgErr ? (
                  <Image
                    source={{ uri: found.posterPath }}
                    style={styles.chronoPosterImg}
                    resizeMode="cover"
                    onError={() => setImgErr(true)}
                  />
                ) : (
                  <LinearGradient
                    colors={[accentColor + "33", "#111"]}
                    style={[styles.chronoPosterImg, styles.posterPlaceholder]}
                  >
                    <Feather name="film" size={14} color={accentColor} />
                  </LinearGradient>
                )}
              </View>
              <View style={styles.chronoInfo}>
                <Text style={[styles.chronoLabel, { color: accentColor }]}>{chrono.label}</Text>
                {chrono.note && (
                  <Text style={styles.chronoNote}>{chrono.note}</Text>
                )}
                {found && (
                  <>
                    <Text style={styles.chronoTitle} numberOfLines={1}>{found.title}</Text>
                    <View style={styles.chronoMeta}>
                      <Text style={styles.chronoYear}>{found.year}</Text>
                      {found.rating > 0 && (
                        <View style={styles.ratingRow}>
                          <Feather name="star" size={9} color="#fbbf24" />
                          <Text style={styles.ratingText}>{found.rating.toFixed(1)}</Text>
                        </View>
                      )}
                    </View>
                  </>
                )}
                {!found && (
                  <Text style={styles.chronoTitle} numberOfLines={1}>
                    {chrono.type === "movie" ? "Filme" : "Série"}
                  </Text>
                )}
              </View>
              {found && (
                <View style={[styles.playBtn, { backgroundColor: accentColor + "22", borderColor: accentColor + "55" }]}>
                  <Feather name="play" size={14} color={accentColor} />
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Related franchise card with real image ────────────────────
function RelatedCard({ franchiseId, onPress }: { franchiseId: string; onPress: () => void }) {
  const f = getFranchise(franchiseId);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!f) return;
    const load = async () => {
      try {
        let path: string | null = null;
        if (f.fetchType === "collection" && f.tmdbCollectionId) {
          const d = await api.tmdb.collection(f.tmdbCollectionId);
          path = d.backdrop_path;
        } else if (f.tmdbTvId) {
          const d = await (api.tmdb.tv(f.tmdbTvId) as Promise<any>);
          path = d.backdrop_path ?? null;
        } else {
          const type = f.category === "anime" ? "tv" : "movie";
          const d = await api.tmdb.search(f.searchQuery ?? f.name, type as any);
          path = d.results[0]?.backdrop_path ?? null;
        }
        if (path) setImgUrl(TMDB_IMG(path, "w780") ?? null);
      } catch {}
    };
    load();
  }, [franchiseId]);

  if (!f) return null;

  return (
    <Pressable onPress={onPress} style={styles.relatedCard}>
      {imgUrl ? (
        <Image source={{ uri: imgUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 12 }]} resizeMode="cover" />
      ) : (
        <LinearGradient colors={f.bgGradient} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        locations={[0.2, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.relatedAccent, { backgroundColor: f.color }]} />
      <View style={styles.relatedInfo}>
        <Text style={styles.relatedName}>{f.shortName}</Text>
        <Text style={[styles.relatedCount, { color: f.accentColor }]}>{f.contentCount} títulos</Text>
      </View>
    </Pressable>
  );
}

// ─── Main screen ───────────────────────────────────────────────
export default function FranchiseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const franchise = getFranchise(params.id ?? "");
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;
  const { isFavorite, toggle } = useFavorites();

  const [backdropUrl, setBackdropUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [series, setSeries] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("filmes");

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [BACKDROP_H - 80, BACKDROP_H],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // ── Fetch backdrop image ──────────────────────────────────────
  useEffect(() => {
    if (!franchise) return;
    const load = async () => {
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
        if (path) setBackdropUrl(TMDB_IMG(path, "w1280") ?? null);
      } catch {}
    };
    load();
  }, [franchise?.id]);

  // ── Fetch content ─────────────────────────────────────────────
  useEffect(() => {
    if (!franchise) return;
    setLoading(true);
    setMovies([]);
    setSeries([]);

    const load = async () => {
      try {
        let allItems: ContentItem[] = [];

        // Helper: fetch a list of TMDB collection IDs and return movie ContentItems
        const fetchCollections = async (ids: number[]): Promise<ContentItem[]> => {
          const results = await Promise.allSettled(ids.map((id) => api.tmdb.collection(id)));
          return results
            .filter((r) => r.status === "fulfilled")
            .flatMap((r: any) => r.value.parts ?? [])
            .map((p: any) => tmdbItemToContent({ ...p, media_type: "movie" }));
        };

        // Helper: fetch a list of TV IDs and return series ContentItems
        const fetchTvShows = async (ids: number[]): Promise<ContentItem[]> => {
          const results = await Promise.allSettled(ids.map((id) => api.tmdb.tv(id) as Promise<any>));
          return results
            .filter((r) => r.status === "fulfilled")
            .map((r: any) => tmdbItemToContent({ ...r.value, media_type: "tv" }));
        };

        if (franchise.fetchType === "collection" && franchise.tmdbCollectionId) {
          // Primary collection + any extra collections + related TV shows
          const allCollectionIds = [franchise.tmdbCollectionId, ...(franchise.relatedCollectionIds ?? [])];
          const [movieItems, tvItems] = await Promise.all([
            fetchCollections(allCollectionIds),
            fetchTvShows(franchise.relatedTvIds ?? []),
          ]);
          allItems = [...movieItems, ...tvItems];

        } else if (franchise.fetchType === "keyword" && franchise.tmdbKeywordId) {
          // Keyword-based (Marvel, DC, Conjuring…) — fetch up to 3 pages
          const pages = [1, 2, 3];
          const [mvPages, tvPages] = await Promise.all([
            Promise.all(pages.map((p) => api.tmdb.keywordDiscover(franchise.tmdbKeywordId!, "movie", p))),
            Promise.all(pages.map((p) => api.tmdb.keywordDiscover(franchise.tmdbKeywordId!, "tv", p))),
          ]);
          const mvItems = mvPages.flatMap((d) => d.results).map((m) => tmdbItemToContent({ ...m, media_type: "movie" }));
          const tvItems = tvPages.flatMap((d) => d.results).map((t) => tmdbItemToContent({ ...t, media_type: "tv" }));
          allItems = [...mvItems, ...tvItems].sort((a, b) => b.rating - a.rating);

        } else if (franchise.fetchType === "tv" && franchise.tmdbTvId) {
          // TV show(s) + any related movie collections (coletâneas TMDB)
          const tvIds = [franchise.tmdbTvId, ...(franchise.relatedTvIds ?? [])];
          const [tvItems, movieItems] = await Promise.all([
            fetchTvShows(tvIds),
            fetchCollections(franchise.relatedCollectionIds ?? []),
          ]);
          allItems = [...tvItems, ...movieItems];

        } else {
          // Search fallback
          const q = franchise.searchQuery ?? franchise.name;
          const type = franchise.searchType ?? (franchise.category === "anime" ? "tv" : "movie");
          const data = await api.tmdb.search(q, type as any);
          allItems = data.results
            .slice(0, 15)
            .map((item) => tmdbItemToContent({ ...item, media_type: type as any }));
          allItems.sort((a, b) => b.rating - a.rating);
        }

        // Deduplicate
        const seen = new Set<number>();
        const unique = allItems.filter((item) => {
          if (!item.tmdbId || seen.has(item.tmdbId)) return false;
          seen.add(item.tmdbId);
          return true;
        });

        setMovies(unique.filter((i) => i.type === "movie"));
        setSeries(unique.filter((i) => i.type === "series"));
      } catch (e) {
        console.warn("Franchise fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [franchise?.id]);

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

  if (!franchise) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#666" }}>Franquia não encontrada</Text>
      </View>
    );
  }

  const allItems = [...movies, ...series];
  const hasCronologia = !!franchise.chronologicalContent;

  const TABS: { id: Tab; label: string }[] = [
    ...(loading || movies.length > 0 ? [{ id: "filmes" as Tab, label: `Filmes (${movies.length})` }] : []),
    ...(loading || series.length > 0 ? [{ id: "series" as Tab, label: `Séries (${series.length})` }] : []),
    ...(hasCronologia ? [{ id: "cronologia" as Tab, label: "Cronologia" }] : []),
  ];

  // Auto-switch tab if current one has no content after loading
  useEffect(() => {
    if (loading) return;
    if (activeTab === "filmes" && movies.length === 0 && series.length > 0) setActiveTab("series");
    if (activeTab === "series" && series.length === 0 && movies.length > 0) setActiveTab("filmes");
  }, [loading, movies.length, series.length]);

  const fav = isFavorite(franchise.id);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* ── Backdrop header ─────────────────────────── */}
        <View style={[styles.backdrop, { height: BACKDROP_H }]}>
          {backdropUrl ? (
            <Image source={{ uri: backdropUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={franchise.bgGradient} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.5)", "#000"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.backdropAccent, { backgroundColor: franchise.color }]} />
          <View style={styles.backdropInfo}>
            <View style={[styles.categoryBadge, { borderColor: franchise.color + "80" }]}>
              <Text style={[styles.categoryBadgeText, { color: franchise.accentColor }]}>
                {franchise.category.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.franchiseName}>{franchise.name.toUpperCase()}</Text>
            <Text style={[styles.franchiseTagline, { color: franchise.accentColor }]}>
              {franchise.tagline}
            </Text>
          </View>
        </View>

        {/* ── Stats ────────────────────────────────────── */}
        <View style={styles.statsRow}>
          {[
            { icon: "film" as const,     value: String(franchise.contentCount), label: "Títulos" },
            { icon: "clock" as const,    value: `${franchise.totalHours}h`,     label: "Total" },
            { icon: "calendar" as const, value: franchise.yearRange,            label: "Período" },
          ].map((s) => (
            <View key={s.label} style={[styles.statItem, { borderColor: franchise.color + "33" }]}>
              <Feather name={s.icon} size={14} color={franchise.accentColor} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Description ──────────────────────────────── */}
        <Text style={styles.description}>{franchise.description}</Text>

        {/* ── Action buttons ────────────────────────────── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: franchise.color }]}
            onPress={() => allItems[0] && goToDetail(allItems[0])}
          >
            <Feather name="play" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>Maratonar Tudo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              fav && { backgroundColor: franchise.color + "22", borderColor: franchise.color + "55" },
            ]}
            onPress={() => toggle(franchise.id)}
          >
            <Feather name="heart" size={14} color={fav ? franchise.accentColor : "rgba(255,255,255,0.7)"} />
            <Text style={[styles.secondaryBtnText, fav && { color: franchise.accentColor }]}>
              {fav ? "Favoritado" : "Favoritar"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs ──────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
          style={{ marginBottom: 4 }}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[
                styles.tab,
                activeTab === tab.id
                  ? { borderBottomColor: franchise.color, borderBottomWidth: 2 }
                  : {},
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.45)" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.divider, { backgroundColor: "rgba(255,255,255,0.08)" }]} />

        {/* ── Tab: Filmes ───────────────────────────────── */}
        {activeTab === "filmes" && (
          <>
            {loading && movies.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={franchise.accentColor} />
                <Text style={styles.loadingText}>Carregando filmes...</Text>
              </View>
            ) : movies.length === 0 ? (
              <View style={styles.centered}>
                <Feather name="film" size={32} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>Nenhum filme encontrado</Text>
              </View>
            ) : (
              <ContentCarousel
                title="Filmes"
                items={movies}
                accentColor={franchise.accentColor}
                onPressItem={goToDetail}
                loading={false}
              />
            )}
          </>
        )}

        {/* ── Tab: Séries ───────────────────────────────── */}
        {activeTab === "series" && (
          <>
            {loading && series.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={franchise.accentColor} />
                <Text style={styles.loadingText}>Carregando séries...</Text>
              </View>
            ) : series.length === 0 ? (
              <View style={styles.centered}>
                <Feather name="tv" size={32} color="rgba(255,255,255,0.2)" />
                <Text style={styles.emptyText}>Nenhuma série encontrada</Text>
              </View>
            ) : (
              <ContentCarousel
                title="Séries"
                items={series}
                accentColor={franchise.accentColor}
                onPressItem={goToDetail}
                loading={false}
              />
            )}
          </>
        )}

        {/* ── Tab: Cronologia ───────────────────────────── */}
        {activeTab === "cronologia" && hasCronologia && (
          <View>
            <View style={styles.chronoIntro}>
              <Feather name="clock" size={16} color={franchise.accentColor} />
              <Text style={[styles.chronoIntroText, { color: franchise.accentColor }]}>
                Ordem cronológica do universo
              </Text>
            </View>
            <ChronologyRow
              items={franchise.chronologicalContent!}
              contentItems={allItems}
              accentColor={franchise.accentColor}
              onPressItem={goToDetail}
              loading={loading}
            />
          </View>
        )}

        {/* ── Related franchises ────────────────────────── */}
        {franchise.related.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.sectionHeader}>
              <View style={[styles.accentBar, { backgroundColor: franchise.color }]} />
              <Text style={styles.sectionTitle}>Se você gosta de {franchise.shortName}…</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedScroll}
            >
              {franchise.related.map((rid) => (
                <RelatedCard
                  key={rid}
                  franchiseId={rid}
                  onPress={() => router.push({ pathname: "/franchise", params: { id: rid } })}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.ScrollView>

      {/* ── Sticky header ─────────────────────────────── */}
      <Animated.View style={[styles.stickyHeader, { paddingTop: topPad }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: headerOpacity }]} />
        <View style={styles.stickyHeaderContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.circleBtn}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Animated.Text style={[styles.stickyTitle, { opacity: headerOpacity }]}>
            {franchise.shortName.toUpperCase()}
          </Animated.Text>
          <TouchableOpacity style={styles.circleBtn} onPress={() => toggle(franchise.id)}>
            <Feather name="heart" size={18} color={isFavorite(franchise.id) ? franchise.accentColor : "rgba(255,255,255,0.7)"} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "relative", justifyContent: "flex-end", overflow: "hidden" },
  backdropAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 3, zIndex: 2 },
  backdropInfo: { paddingHorizontal: 20, paddingBottom: 22, zIndex: 2 },
  categoryBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  categoryBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },
  franchiseName: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: 2, lineHeight: 32, marginBottom: 4 },
  franchiseTagline: { fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginTop: 16, marginBottom: 16 },
  statItem: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12,
    alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.04)",
  },
  statValue: { color: "#fff", fontSize: 13, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: "500" },

  description: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 20, paddingHorizontal: 20, marginBottom: 18 },

  actionsRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, flex: 1, justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },

  tabsScroll: { paddingHorizontal: 16, gap: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14, fontWeight: "700" },
  divider: { height: 1, marginBottom: 8 },

  carouselSection: { marginBottom: 24 },
  carouselHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 8, marginBottom: 14 },
  accentBar: { width: 3, height: 16, borderRadius: 2 },
  carouselTitle: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },
  carouselCount: { fontSize: 12, fontWeight: "600" },
  carouselLoading: { height: CARD_H, alignItems: "center", justifyContent: "center" },
  carouselScroll: { paddingHorizontal: 20, paddingBottom: 4 },

  posterCard: { width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", marginBottom: 6, position: "relative" },
  posterCardImg: { width: "100%", height: "100%" },
  posterPlaceholder: { alignItems: "center", justifyContent: "center" },
  mediaTypeBadge: { position: "absolute", top: 6, left: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  mediaTypeBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  rankBadge: {
    position: "absolute", bottom: 6, left: 6,
    backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  rankBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  ratingBadge: {
    position: "absolute", top: 6, right: 6,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 5,
  },
  ratingBadgeText: { color: "#fbbf24", fontSize: 9, fontWeight: "800" },
  posterCardTitle: { color: "#fff", fontSize: 12, fontWeight: "600", lineHeight: 16 },
  posterCardYear: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 },

  // ── Chronology ───────────────────────────────────────────────
  chronoIntro: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, marginBottom: 4,
  },
  chronoIntroText: { fontSize: 13, fontWeight: "600", letterSpacing: 0.3 },
  chronoItem: { flexDirection: "row", marginBottom: 0 },
  chronoLeft: { width: 32, alignItems: "center" },
  chronoDot: { width: 10, height: 10, borderRadius: 5, marginTop: 14, zIndex: 1 },
  chronoLine: { width: 2, flex: 1, marginTop: 2, minHeight: 40 },
  chronoContent: {
    flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingBottom: 16, paddingRight: 16,
  },
  chronoPoster: { width: 52, height: 75, borderRadius: 6, overflow: "hidden", flexShrink: 0 },
  chronoPosterImg: { width: "100%", height: "100%" },
  chronoInfo: { flex: 1, paddingTop: 2 },
  chronoLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 2 },
  chronoNote: { color: "rgba(255,255,255,0.35)", fontSize: 10, marginBottom: 4 },
  chronoTitle: { color: "#fff", fontSize: 13, fontWeight: "700", marginBottom: 3 },
  chronoMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  chronoYear: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  playBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginTop: 8,
  },

  centered: { alignItems: "center", paddingVertical: 50, gap: 10 },
  loadingText: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  emptyText: { color: "rgba(255,255,255,0.3)", fontSize: 14 },

  relatedSection: { marginTop: 4, marginBottom: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 8, marginBottom: 14 },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  relatedScroll: { paddingHorizontal: 16, gap: 10 },
  relatedCard: { width: 140, height: 105, borderRadius: 12, overflow: "hidden", position: "relative" },
  relatedAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 2, zIndex: 2 },
  relatedInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, zIndex: 2 },
  relatedName: { color: "#fff", fontSize: 13, fontWeight: "800", marginBottom: 2 },
  relatedCount: { fontSize: 10, fontWeight: "600" },

  stickyHeader: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  stickyHeaderContent: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 8,
  },
  circleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center",
  },
  stickyTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 2 },
});
