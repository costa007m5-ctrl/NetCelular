import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
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
import { getPlatform } from "@/constants/streamings";
import { api, tmdbItemToContent, TMDB_IMG } from "@/lib/api";
import type { ContentItem } from "@/constants/content";
import { useRouter as useNav } from "expo-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLS = 3;
const H_PAD = 12;
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - H_PAD * 2) / NUM_COLS) - 4;
const CARD_HEIGHT = Math.floor(CARD_WIDTH * 1.5);

type ContentType = "movie" | "tv" | "all";

function GridCard({
  item,
  accent,
  onPress,
}: {
  item: ContentItem;
  accent: string;
  onPress: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH, marginBottom: 12 }}>
      <View style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>
        {!imgError && item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <LinearGradient
            colors={[accent + "33", "#1a1a1a"]}
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.cardPlaceholder}>
              <Feather name="film" size={22} color={accent} />
            </View>
          </LinearGradient>
        )}
        {item.type === "series" && (
          <View style={[styles.typeBadge, { backgroundColor: accent + "CC" }]}>
            <Text style={styles.typeBadgeText}>SÉRIE</Text>
          </View>
        )}
      </View>
      <Text style={[styles.cardLabel, { color: "rgba(255,255,255,0.7)" }]} numberOfLines={1}>
        {item.title}
      </Text>
    </Pressable>
  );
}

function PlatformLogo({ platform }: { platform: NonNullable<ReturnType<typeof getPlatform>> }) {
  const [logoError, setLogoError] = useState(false);
  const logoUrl = platform.logoPath
    ? `https://image.tmdb.org/t/p/w300${platform.logoPath}`
    : null;

  if (logoUrl && !logoError) {
    return (
      <Image
        source={{ uri: logoUrl }}
        style={styles.platformLogo}
        resizeMode="contain"
        onError={() => setLogoError(true)}
      />
    );
  }

  // Text fallback logo
  const parts = platform.name.split(" ");
  return (
    <View style={styles.textLogo}>
      <Text style={[styles.textLogoMain, { color: platform.brandColor }]}>
        {parts[0].toUpperCase()}
      </Text>
      {parts.length > 1 && (
        <Text style={[styles.textLogoSub, { color: platform.accentColor }]}>
          {parts.slice(1).join(" ").toUpperCase()}
        </Text>
      )}
    </View>
  );
}

export default function StreamingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const platform = getPlatform(params.id ?? "");
  const isWeb = Platform.OS === "web";

  const [activeType, setActiveType] = useState<ContentType>("all");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(999);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const loadingRef = useRef(false);

  const accent = platform?.accentColor ?? "#E50914";
  const bgColor = platform?.bgColor ?? "#141414";
  const gradient = platform?.bgGradient ?? ["#141414", "#0a0a0a", "#000000"];
  const topPad = isWeb ? 0 : insets.top;

  const fetchItems = useCallback(
    async (type: ContentType, pageNum: number) => {
      if (loadingRef.current || pageNum > totalPages) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const providerId = platform?.tmdbId;
        let results: ContentItem[] = [];
        let maxPages = 1;

        if (!providerId) {
          // No TMDB ID — show nothing for now
          setItems([]);
          setInitialLoading(false);
          loadingRef.current = false;
          setLoading(false);
          return;
        }

        if (type === "all" || type === "movie") {
          const movieData = await api.tmdb.streaming(providerId, "movie", pageNum);
          const movieItems = movieData.results.map(tmdbItemToContent);
          results = [...results, ...movieItems];
          maxPages = movieData.total_pages;
        }
        if (type === "all" || type === "tv") {
          const tvData = await api.tmdb.streaming(providerId, "tv", pageNum);
          const tvItems = tvData.results.map(tmdbItemToContent);
          results = [...results, ...tvItems];
          if (tvData.total_pages > maxPages) maxPages = tvData.total_pages;
        }

        // Shuffle for "all" mode for variety
        if (type === "all") {
          for (let i = results.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [results[i], results[j]] = [results[j], results[i]];
          }
        }

        setItems((prev) => (pageNum === 1 ? results : [...prev, ...results]));
        setPage(pageNum);
        setTotalPages(maxPages);
      } catch (e) {
        console.warn("Streaming fetch error:", e);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [platform, totalPages]
  );

  useEffect(() => {
    setInitialLoading(true);
    setItems([]);
    setPage(0);
    setTotalPages(999);
    loadingRef.current = false;
    fetchItems(activeType, 1);
  }, [activeType, platform?.id]);

  const loadMore = () => {
    if (!loading && page < totalPages) {
      fetchItems(activeType, page + 1);
    }
  };

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

  if (!platform) {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <Pressable style={[styles.backBtn, { top: topPad + 8 }]} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Text style={{ color: "#666" }}>Plataforma não encontrada</Text>
        </View>
      </View>
    );
  }

  const tabs: { type: ContentType; label: string }[] = [
    { type: "all", label: "Tudo" },
    { type: "movie", label: "Filmes" },
    { type: "tv", label: "Séries" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar style="light" />

      {/* Background gradient */}
      <LinearGradient
        colors={gradient as any}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Decorative accent glow */}
      <View
        style={[
          styles.accentGlow,
          { backgroundColor: accent, top: topPad + 20 },
        ]}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.circleBtn}>
          <Feather name="arrow-left" size={20} color="#fff" />
        </Pressable>
        <PlatformLogo platform={platform} />
        <View style={{ width: 40 }} />
      </View>

      {/* Tagline */}
      {platform.tagline ? (
        <Text style={[styles.tagline, { color: "rgba(255,255,255,0.5)" }]}>
          {platform.tagline}
        </Text>
      ) : null}

      {/* Content type tabs */}
      <View style={styles.tabsRow}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.type}
            onPress={() => setActiveType(t.type)}
            style={[
              styles.tab,
              activeType === t.type && {
                backgroundColor: accent,
                borderColor: accent,
              },
              activeType !== t.type && {
                backgroundColor: "rgba(255,255,255,0.08)",
                borderColor: "rgba(255,255,255,0.15)",
              },
            ]}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeType === t.type ? "#fff" : "rgba(255,255,255,0.6)" },
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: accent + "40" }]} />

      {initialLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 13 }}>
            Carregando catálogo...
          </Text>
        </View>
      ) : items.length === 0 && !platform.tmdbId ? (
        <View style={styles.centered}>
          <Feather name="clock" size={40} color={accent} />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 16, textAlign: "center" }}>
            Em breve
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 8, textAlign: "center", paddingHorizontal: 40 }}>
            O catálogo do {platform.name} será disponibilizado em breve.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.id}-${idx}`}
          numColumns={NUM_COLS}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 80 }]}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <GridCard item={item} accent={accent} onPress={() => goToDetail(item)} />
          )}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={{ padding: 24, alignItems: "center" }}>
                <ActivityIndicator color={accent} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 2,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  platformLogo: {
    width: 140,
    height: 44,
    flexShrink: 0,
  },
  textLogo: {
    alignItems: "center",
  },
  textLogoMain: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 28,
  },
  textLogoSub: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2,
  },
  tagline: {
    textAlign: "center",
    fontSize: 12,
    letterSpacing: 0.3,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  tabsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 80,
    alignItems: "center",
  },
  tabText: { fontSize: 13, fontWeight: "700" },
  divider: { height: 1, marginHorizontal: 12, marginBottom: 12 },
  grid: { paddingHorizontal: H_PAD, paddingTop: 4 },
  row: { justifyContent: "space-between" },
  card: { borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" },
  cardPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  typeBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  typeBadgeText: { color: "#fff", fontSize: 8, fontWeight: "700", letterSpacing: 0.4 },
  cardLabel: { fontSize: 11, fontWeight: "500", marginTop: 5, textAlign: "center" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  accentGlow: {
    position: "absolute",
    top: 0,
    left: "25%",
    right: "25%",
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
    zIndex: 1,
  },
});
