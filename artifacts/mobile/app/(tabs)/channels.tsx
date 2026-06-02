import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  liveTvApi,
  type LiveChannel,
  type LiveCategory,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  getAccent,
} from "@/lib/live-tv-api";

const RED = "#e50914";

export default function ChannelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState(0); // 0 = all
  const [search, setSearch] = useState("");

  // Rotating banner
  const [bannerIdx, setBannerIdx] = useState(0);
  const bannerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (channels.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(bannerOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setBannerIdx((prev) => (prev + 1) % Math.min(channels.length, 8));
        Animated.timing(bannerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [channels, bannerOpacity]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await liveTvApi.getChannels();
      setChannels(data.channels ?? []);
      setCategories(data.categories ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar canais");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = channels.filter((ch) => {
    const matchCat = selectedCat === 0 || ch.categories?.includes(selectedCat);
    const matchSearch = !search.trim() || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const openChannel = (ch: LiveChannel) => {
    router.push({
      pathname: "/channel-detail",
      params: {
        id: ch.id,
        name: ch.name,
        image: ch.image ?? "",
        preview: ch.preview ?? "",
        url: ch.url ?? "",
        categories: JSON.stringify(ch.categories ?? []),
      },
    });
  };

  // Available category pills — only show cats that have channels
  const availableCatIds = [0, ...Array.from(new Set(channels.flatMap((c) => c.categories ?? [])))];
  const catPills: { id: number; label: string }[] = MAIN_CATEGORIES
    .filter((id) => availableCatIds.includes(id))
    .map((id) => ({ id, label: CATEGORY_LABELS[id] ?? `Cat ${id}` }));

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.headerLeft}>
          <View style={[s.accent, { backgroundColor: RED }]} />
          <Text style={s.title}>Canais ao Vivo</Text>
        </View>
        {channels.length > 0 && (
          <Text style={[s.count, { color: colors.mutedForeground }]}>{filtered.length} canais</Text>
        )}
      </View>

      {/* Rotating Banner */}
      {!loading && !error && channels.length > 0 && (() => {
        const bannerCh = channels[bannerIdx];
        if (!bannerCh) return null;
        const accent = getAccent(bannerCh.id);
        return (
          <Animated.View style={[s.banner, { opacity: bannerOpacity }]}>
            <Pressable
              onPress={() => openChannel(bannerCh)}
              style={[s.bannerInner, { backgroundColor: accent + "22", borderColor: accent + "40" }]}
            >
              {bannerCh.image ? (
                <Image source={{ uri: bannerCh.image }} style={s.bannerLogo} resizeMode="contain" />
              ) : (
                <View style={[s.bannerLogoFallback, { backgroundColor: accent + "30" }]}>
                  <Feather name="tv" size={36} color={accent} />
                </View>
              )}
              <View style={s.bannerInfo}>
                <View style={s.bannerLivePill}>
                  <View style={[s.liveDot, { backgroundColor: RED, width: 7, height: 7 }]} />
                  <Text style={[s.liveBadgeText, { fontSize: 10 }]}>AO VIVO</Text>
                </View>
                <Text style={[s.bannerName, { color: colors.foreground }]} numberOfLines={2}>
                  {bannerCh.name}
                </Text>
                <Text style={[s.bannerSub, { color: colors.mutedForeground }]}>
                  Toque para assistir
                </Text>
              </View>
              <View style={s.bannerDots}>
                {Array.from({ length: Math.min(channels.length, 8) }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      { backgroundColor: i === bannerIdx ? RED : colors.mutedForeground + "60" },
                    ]}
                  />
                ))}
              </View>
            </Pressable>
          </Animated.View>
        );
      })()}

      {/* Search */}
      <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}>
        <Feather name="search" size={15} color={colors.mutedForeground} />
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          placeholder="Buscar canal..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {/* Category pills */}
      {catPills.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catRow}
        >
          {catPills.map(({ id, label }) => (
            <Pressable
              key={id}
              onPress={() => setSelectedCat(id)}
              style={[
                s.catPill,
                {
                  backgroundColor: selectedCat === id ? RED : colors.card,
                  borderColor: selectedCat === id ? RED : colors.border + "60",
                },
              ]}
            >
              <Text style={[s.catPillText, { color: selectedCat === id ? "#fff" : colors.mutedForeground }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Carregando canais...</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[s.errorText, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable style={[s.retryBtn, { borderColor: RED }]} onPress={() => load()}>
            <Text style={{ color: RED, fontWeight: "700", fontSize: 14 }}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Feather name="tv" size={40} color={colors.mutedForeground} />
          <Text style={[s.errorText, { color: colors.mutedForeground }]}>Nenhum canal encontrado</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RED} />}
          contentContainerStyle={{ padding: 10, paddingBottom: insets.bottom + 100 }}
          columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
          renderItem={({ item: ch }) => {
            const accent = getAccent(ch.id);
            return (
              <Pressable
                onPress={() => openChannel(ch)}
                style={({ pressed }) => [
                  s.channelCard,
                  { backgroundColor: colors.card, borderColor: colors.border + "50", opacity: pressed ? 0.8 : 1 },
                ]}
              >
                {/* Logo */}
                <View style={[s.logoWrap, { backgroundColor: accent + "18" }]}>
                  {ch.image ? (
                    <Image source={{ uri: ch.image }} style={s.logo} resizeMode="contain" />
                  ) : (
                    <View style={s.logoFallback}>
                      <Feather name="tv" size={22} color={accent} />
                    </View>
                  )}
                </View>
                {/* Live badge */}
                <View style={s.liveBadgeRow}>
                  <View style={[s.liveDot, { backgroundColor: RED }]} />
                  <Text style={s.liveBadgeText}>AO VIVO</Text>
                </View>
                {/* Name */}
                <Text style={[s.channelName, { color: colors.foreground }]} numberOfLines={2}>
                  {ch.name}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  accent: { width: 3, height: 22, borderRadius: 2 },
  title: { fontSize: 22, fontWeight: "800", color: "#fff" },
  count: { fontSize: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  catRow: { paddingHorizontal: 12, paddingBottom: 10, gap: 7 },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  catPillText: { fontSize: 12, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40 },
  loadingText: { fontSize: 14 },
  errorText: { fontSize: 14, textAlign: "center" },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 },
  banner: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  bannerInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    position: "relative",
  },
  bannerLogo: { width: 72, height: 72, borderRadius: 10 },
  bannerLogoFallback: {
    width: 72,
    height: 72,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerInfo: { flex: 1, gap: 4 },
  bannerLivePill: { flexDirection: "row", alignItems: "center", gap: 5 },
  bannerName: { fontSize: 15, fontWeight: "800", lineHeight: 20 },
  bannerSub: { fontSize: 11 },
  bannerDots: {
    position: "absolute",
    bottom: 8,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  channelCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    paddingBottom: 8,
  },
  logoWrap: {
    width: "100%",
    aspectRatio: 1.6,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  logo: { width: "100%", height: "100%" },
  logoFallback: { alignItems: "center", justifyContent: "center", flex: 1 },
  liveBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingTop: 5,
    paddingBottom: 3,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveBadgeText: { fontSize: 8, fontWeight: "900", color: RED, letterSpacing: 0.5 },
  channelName: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 7,
    lineHeight: 14,
  },
});
