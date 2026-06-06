import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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
import { api, tmdbItemToContent } from "@/lib/api";
import type { ContentItem } from "@/constants/content";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_W = 120;
const CARD_H = 180;

// Compact horizontal card
function ContentCardH({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_W, marginRight: 10 }}>
      <View style={styles.hCard}>
        {!imgErr && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <LinearGradient colors={["#1e1e1e", "#2a1a1a"]} style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="film" size={22} color="#444" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.85)"]}
          style={styles.hCardGrad}
          locations={[0.5, 1]}
        />
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

type Section = {
  key: string;
  title: string;
  emoji: string;
  type: "movie" | "tv";
  items: ContentItem[];
  loading: boolean;
  error: boolean;
  page: number;
  totalPages: number;
};

export default function CountryBrowseScreen() {
  const { id, label, flag, color } = useLocalSearchParams<{
    id: string;
    label: string;
    flag: string;
    color: string;
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

  const [sections, setSections] = useState<Section[]>([
    {
      key: "movies",
      title: "Filmes",
      emoji: "🎬",
      type: "movie",
      items: [],
      loading: true,
      error: false,
      page: 0,
      totalPages: 999,
    },
    {
      key: "series",
      title: "Séries",
      emoji: "📺",
      type: "tv",
      items: [],
      loading: true,
      error: false,
      page: 0,
      totalPages: 999,
    },
  ]);
  const [retryKey, setRetryKey] = useState(0);

  const loadingRef = useRef<Record<string, boolean>>({});

  const fetchSection = (type: "movie" | "tv", page: number, append: boolean) => {
    const key = type === "movie" ? "movies" : "series";
    if (loadingRef.current[key]) return;
    loadingRef.current[key] = true;

    setSections((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, loading: true, error: false } : s
      )
    );

    api.tmdb
      .discoverByCountry(type, countryId, page)
      .then((data) => {
        const newItems = data.results.map(tmdbItemToContent);
        setSections((prev) =>
          prev.map((s) => {
            if (s.key !== key) return s;
            return {
              ...s,
              items: append ? [...s.items, ...newItems] : newItems,
              page,
              totalPages: data.total_pages ?? 999,
              loading: false,
              error: newItems.length === 0 && !append,
            };
          })
        );
      })
      .catch(() => {
        setSections((prev) =>
          prev.map((s) =>
            s.key === key ? { ...s, loading: false, error: true } : s
          )
        );
      })
      .finally(() => {
        loadingRef.current[key] = false;
      });
  };

  useEffect(() => {
    loadingRef.current = {};
    setSections((prev) =>
      prev.map((s) => ({ ...s, items: [], loading: true, error: false, page: 0 }))
    );
    fetchSection("movie", 1, false);
    fetchSection("tv", 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, countryId]);

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

  const goToMore = (type: "movie" | "tv", sectionTitle: string) => {
    router.push({
      pathname: "/genre-browse",
      params: { genre_id: "0", type, title: `${countryFlag} ${sectionTitle} de ${countryLabel}` },
    });
  };

  const allLoading = sections.every((s) => s.loading && s.items.length === 0);
  const allError = sections.every((s) => s.error && s.items.length === 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[styles.headerWrap, { paddingTop: topPad + 8 }]}>
        <LinearGradient
          colors={[`${accentColor}30`, "transparent"]}
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerFlag}>{countryFlag}</Text>
          <View>
            <Text style={styles.headerSub}>Cinema do Mundo</Text>
            <Text style={[styles.headerLabel, { color: accentColor }]}>
              {countryLabel}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Content ────────────────────────────────────────────── */}
      {allLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={[styles.loadingText, { color: "#888" }]}>
            Carregando conteúdo de {countryLabel}...
          </Text>
        </View>
      ) : allError ? (
        <View style={styles.centered}>
          <View style={[styles.errorIcon, { backgroundColor: `${accentColor}18` }]}>
            <Feather name="wifi-off" size={32} color={accentColor} />
          </View>
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Não foi possível carregar
          </Text>
          <Text style={{ color: "#888", fontSize: 13, textAlign: "center" }}>
            Verifique sua conexão e tente novamente
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: accentColor }]}
            onPress={() => setRetryKey((k) => k + 1)}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Country badge */}
          <View style={[styles.heroBadge, { borderColor: `${accentColor}40` }]}>
            <LinearGradient
              colors={[`${accentColor}20`, `${accentColor}08`]}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.heroBadgeFlag}>{countryFlag}</Text>
            <Text style={[styles.heroBadgeTitle, { color: accentColor }]}>
              {countryLabel}
            </Text>
            <Text style={styles.heroBadgeSub}>
              Filmes e séries originais de {countryLabel}
            </Text>
          </View>

          {sections.map((section) => (
            <View key={section.key} style={styles.sectionWrap}>
              {/* Section header */}
              <View style={styles.sectionRow}>
                <View style={styles.sectionTitleWrap}>
                  <View
                    style={[styles.sectionAccent, { backgroundColor: accentColor }]}
                  />
                  <Text style={styles.sectionEmoji}>{section.emoji}</Text>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                    {section.title}
                  </Text>
                  {section.loading && (
                    <ActivityIndicator
                      size="small"
                      color={accentColor}
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => goToMore(section.type, section.title)}
                  style={styles.verMaisBtn}
                >
                  <Text style={[styles.verMaisText, { color: accentColor }]}>
                    Ver mais
                  </Text>
                  <Feather name="chevron-right" size={14} color={accentColor} />
                </TouchableOpacity>
              </View>

              {/* Cards */}
              {section.error && section.items.length === 0 ? (
                <View style={styles.sectionError}>
                  <Feather name="alert-circle" size={18} color="#555" />
                  <Text style={{ color: "#555", fontSize: 13 }}>
                    Falha ao carregar
                  </Text>
                </View>
              ) : section.items.length === 0 && !section.loading ? (
                <View style={styles.sectionError}>
                  <Text style={{ color: "#555", fontSize: 13 }}>
                    Nenhum título encontrado
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hScroll}
                  decelerationRate="fast"
                >
                  {section.items.map((item, idx) => (
                    <ContentCardH
                      key={`${item.id}-${idx}`}
                      item={item}
                      onPress={() => goToDetail(item)}
                    />
                  ))}
                  {/* Load more button at end */}
                  {section.page < section.totalPages && (
                    <TouchableOpacity
                      style={styles.loadMoreCard}
                      onPress={() => fetchSection(section.type, section.page + 1, true)}
                    >
                      <LinearGradient
                        colors={[`${accentColor}20`, `${accentColor}08`]}
                        style={StyleSheet.absoluteFill}
                      />
                      <Feather name="plus" size={22} color={accentColor} />
                      <Text style={[styles.loadMoreText, { color: accentColor }]}>
                        Mais
                      </Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}
            </View>
          ))}

          {/* Ver tudo de filmes e séries */}
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.ctaBtn, { borderColor: `${accentColor}50` }]}
              onPress={() => goToMore("movie", "Filmes")}
            >
              <LinearGradient
                colors={[`${accentColor}18`, "transparent"]}
                style={StyleSheet.absoluteFill}
              />
              <Feather name="film" size={16} color={accentColor} />
              <Text style={[styles.ctaBtnText, { color: accentColor }]}>
                Todos os filmes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaBtn, { borderColor: `${accentColor}50` }]}
              onPress={() => goToMore("tv", "Séries")}
            >
              <LinearGradient
                colors={[`${accentColor}18`, "transparent"]}
                style={StyleSheet.absoluteFill}
              />
              <Feather name="tv" size={16} color={accentColor} />
              <Text style={[styles.ctaBtnText, { color: accentColor }]}>
                Todas as séries
              </Text>
            </TouchableOpacity>
          </View>
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
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    justifyContent: "center",
  },
  headerFlag: {
    fontSize: 34,
  },
  headerSub: {
    color: "#888",
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  headerLabel: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: { fontSize: 13, fontWeight: "500", marginTop: 4 },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  errorTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
    marginTop: 8,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  heroBadge: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 4,
    overflow: "hidden",
  },
  heroBadgeFlag: { fontSize: 48, marginBottom: 4 },
  heroBadgeTitle: { fontSize: 22, fontWeight: "800" },
  heroBadgeSub: { color: "#888", fontSize: 13, textAlign: "center" },
  sectionWrap: { marginBottom: 28 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 2,
  },
  sectionEmoji: { fontSize: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  verMaisBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  verMaisText: { fontSize: 13, fontWeight: "600" },
  hScroll: { paddingHorizontal: 16 },
  hCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  hCardGrad: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "55%",
  },
  hCardTitle: {
    position: "absolute",
    bottom: 6,
    left: 5,
    right: 5,
    color: "#fff",
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 12,
  },
  ratingBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: { color: "#f59e0b", fontSize: 8, fontWeight: "700" },
  loadMoreCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#141414",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginRight: 10,
  },
  loadMoreText: { fontSize: 12, fontWeight: "600" },
  sectionError: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  ctaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  ctaBtnText: { fontSize: 14, fontWeight: "700" },
});
