import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  liveTvApi,
  type LiveChannel,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  getAccent,
} from "@/lib/live-tv-api";

const RED = "#e50914";

const CAT_ICONS: Record<number, string> = {
  0: "grid",
  1: "activity",
  5: "radio",
  6: "tv",
  4: "film",
  2: "smile",
  7: "star",
  3: "book-open",
};

function LiveDot({ color = RED }: { color?: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[sd.liveDot, { backgroundColor: color, opacity: anim }]} />;
}

function FeaturedCard({ ch, onPress }: { ch: LiveChannel; onPress: () => void }) {
  const accent = getAccent(ch.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [sd.featCard, { opacity: pressed ? 0.88 : 1 }]}>
      {/* background */}
      {ch.preview ? (
        <Image source={{ uri: ch.preview }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: accent + "30" }]} />
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)"]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* logo pill */}
      <View style={[sd.featLogoPill, { backgroundColor: accent + "22", borderColor: accent + "44" }]}>
        {ch.image ? (
          <Image source={{ uri: ch.image }} style={sd.featLogoImg} resizeMode="contain" />
        ) : (
          <Feather name="tv" size={18} color={accent} />
        )}
      </View>
      {/* live badge */}
      <View style={sd.featBadge}>
        <LiveDot />
        <Text style={sd.featBadgeTxt}>AO VIVO</Text>
      </View>
      {/* name */}
      <Text style={sd.featName} numberOfLines={2}>{ch.name}</Text>
    </Pressable>
  );
}

function ChannelCard({ ch, onPress }: { ch: LiveChannel; onPress: () => void }) {
  const colors = useColors();
  const accent = getAccent(ch.id);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [sd.card, { backgroundColor: colors.card, borderColor: colors.border + "60", opacity: pressed ? 0.85 : 1 }]}
    >
      {/* top logo area */}
      <View style={[sd.cardLogoWrap, { backgroundColor: accent + "14" }]}>
        {ch.preview ? (
          <>
            <Image source={{ uri: ch.preview }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            <LinearGradient
              colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.55)"]}
              style={StyleSheet.absoluteFillObject}
            />
          </>
        ) : null}
        {ch.image ? (
          <View style={[sd.cardLogoBox, { backgroundColor: "#00000050" }]}>
            <Image source={{ uri: ch.image }} style={sd.cardLogoImg} resizeMode="contain" />
          </View>
        ) : (
          <View style={[sd.cardLogoFallback, { backgroundColor: accent + "28" }]}>
            <Feather name="tv" size={28} color={accent} />
          </View>
        )}
        {/* live pill top-right */}
        <View style={sd.cardLivePill}>
          <LiveDot />
          <Text style={sd.cardLiveTxt}>AO VIVO</Text>
        </View>
      </View>

      {/* bottom info */}
      <View style={sd.cardBottom}>
        <View style={[sd.cardAccentBar, { backgroundColor: accent }]} />
        <Text style={[sd.cardName, { color: colors.foreground }]} numberOfLines={2}>{ch.name}</Text>
      </View>
    </Pressable>
  );
}

export default function ChannelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState(0);
  const [search, setSearch] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await liveTvApi.getChannels();
      setChannels(data.channels ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar canais");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openChannel = (ch: LiveChannel) => {
    router.push({
      pathname: "/channel-detail",
      params: {
        channelId: ch.id,
        channelName: ch.name,
        channelImage: ch.image ?? "",
        channelPreview: ch.preview ?? "",
        channelUrl: ch.url ?? "",
        channelCategories: JSON.stringify(ch.categories ?? []),
      },
    });
  };

  const filtered = channels.filter((ch) => {
    const matchCat = selectedCat === 0 || ch.categories?.includes(selectedCat);
    const matchSearch = !search.trim() || ch.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const availableCatIds = [0, ...Array.from(new Set(channels.flatMap((c) => c.categories ?? [])))];
  const catPills = MAIN_CATEGORIES
    .filter((id) => availableCatIds.includes(id))
    .map((id) => ({ id, label: CATEGORY_LABELS[id] ?? `Cat ${id}`, icon: CAT_ICONS[id] ?? "tv" }));

  const featured = channels.slice(0, 8);

  return (
    <View style={[sd.root, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[sd.header, { paddingTop: insets.top + 10 }]}>
        <View style={sd.headerLeft}>
          <View style={[sd.headerAccent, { backgroundColor: RED }]} />
          <Text style={[sd.headerTitle, { color: colors.foreground }]}>Ao Vivo</Text>
          {channels.length > 0 && (
            <View style={sd.liveCountBadge}>
              <LiveDot />
              <Text style={sd.liveCountTxt}>{channels.length}</Text>
            </View>
          )}
        </View>
        <Pressable
          style={[sd.searchToggle, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}
          onPress={() => {}}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {loading ? (
        <View style={sd.center}>
          <View style={[sd.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={RED} size="large" />
            <Text style={[sd.loadingTxt, { color: colors.mutedForeground }]}>Carregando transmissões ao vivo...</Text>
          </View>
        </View>
      ) : error ? (
        <View style={sd.center}>
          <View style={[sd.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={sd.errorIconWrap}>
              <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[sd.errorTitle, { color: colors.foreground }]}>Sem conexão</Text>
            <Text style={[sd.errorSub, { color: colors.mutedForeground }]}>{error}</Text>
            <Pressable style={[sd.retryBtn, { backgroundColor: RED }]} onPress={() => load()}>
              <Feather name="refresh-cw" size={14} color="#fff" />
              <Text style={sd.retryTxt}>Tentar novamente</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RED} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          columnWrapperStyle={sd.columnWrapper}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* ── Search bar ── */}
              <View style={[sd.searchBar, { backgroundColor: colors.card, borderColor: colors.border + "60" }]}>
                <Feather name="search" size={15} color={colors.mutedForeground} />
                <TextInput
                  style={[sd.searchInput, { color: colors.foreground }]}
                  placeholder="Buscar canal..."
                  placeholderTextColor={colors.mutedForeground + "88"}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Feather name="x" size={15} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              {/* ── Featured row ── */}
              {!search && selectedCat === 0 && featured.length > 0 && (
                <View style={sd.featSection}>
                  <View style={sd.sectionHeader}>
                    <View style={[sd.sectionDot, { backgroundColor: RED }]} />
                    <Text style={[sd.sectionTitle, { color: colors.foreground }]}>Em Destaque</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={sd.featRow}
                  >
                    {featured.map((ch) => (
                      <FeaturedCard key={ch.id} ch={ch} onPress={() => openChannel(ch)} />
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* ── Category pills ── */}
              {catPills.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={sd.catRow}
                >
                  {catPills.map(({ id, label, icon }) => {
                    const active = selectedCat === id;
                    const count = id === 0 ? channels.length : channels.filter((c) => c.categories?.includes(id)).length;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => setSelectedCat(id)}
                        style={[sd.catPill, active
                          ? { backgroundColor: RED, borderColor: RED }
                          : { backgroundColor: colors.card, borderColor: colors.border + "70" }
                        ]}
                      >
                        <Feather name={icon as any} size={12} color={active ? "#fff" : colors.mutedForeground} />
                        <Text style={[sd.catPillTxt, { color: active ? "#fff" : colors.mutedForeground }]}>{label}</Text>
                        <View style={[sd.catCount, { backgroundColor: active ? "#ffffff33" : colors.background + "cc" }]}>
                          <Text style={[sd.catCountTxt, { color: active ? "#fff" : colors.mutedForeground }]}>{count}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {/* ── Grid header ── */}
              <View style={sd.gridHeader}>
                <View style={sd.sectionHeader}>
                  <View style={[sd.sectionDot, { backgroundColor: RED }]} />
                  <Text style={[sd.sectionTitle, { color: colors.foreground }]}>
                    {search ? `Resultados para "${search}"` : selectedCat === 0 ? "Todos os Canais" : CATEGORY_LABELS[selectedCat]}
                  </Text>
                </View>
                <Text style={[sd.gridCount, { color: colors.mutedForeground }]}>{filtered.length} canais</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={sd.empty}>
              <View style={[sd.emptyIcon, { backgroundColor: colors.card }]}>
                <Feather name="tv" size={28} color={colors.mutedForeground} />
              </View>
              <Text style={[sd.emptyTxt, { color: colors.mutedForeground }]}>Nenhum canal encontrado</Text>
            </View>
          }
          renderItem={({ item: ch }) => (
            <ChannelCard key={ch.id} ch={ch} onPress={() => openChannel(ch)} />
          )}
        />
      )}
    </View>
  );
}

const CARD_RADIUS = 14;

const sd = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerAccent: { width: 3, height: 22, borderRadius: 2 },
  headerTitle: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  liveCountBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#e5091420", borderWidth: 1, borderColor: "#e5091440",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveCountTxt: { color: RED, fontSize: 11, fontWeight: "800" },
  searchToggle: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  /* search bar */
  searchBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 12, marginBottom: 14,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, borderWidth: 1, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },

  /* featured */
  featSection: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, marginBottom: 10 },
  sectionDot: { width: 3, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "800" },
  featRow: { paddingHorizontal: 12, gap: 10, paddingBottom: 4 },
  featCard: {
    width: 180,
    height: 110,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#111",
    justifyContent: "flex-end",
    padding: 10,
  },
  featLogoPill: {
    position: "absolute", top: 8, left: 8,
    borderRadius: 8, borderWidth: 1,
    padding: 5,
    alignItems: "center", justifyContent: "center",
  },
  featLogoImg: { width: 28, height: 28 },
  featBadge: {
    position: "absolute", top: 8, right: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#e50914", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
  },
  featBadgeTxt: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  featName: { color: "#fff", fontSize: 12, fontWeight: "800", lineHeight: 16 },

  /* category pills */
  catRow: { paddingHorizontal: 12, paddingBottom: 12, gap: 7 },
  catPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  catPillTxt: { fontSize: 12, fontWeight: "700" },
  catCount: {
    paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 10, minWidth: 20, alignItems: "center",
  },
  catCountTxt: { fontSize: 9, fontWeight: "800" },

  /* grid header */
  gridHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingRight: 16, marginBottom: 8,
  },
  gridCount: { fontSize: 11, fontWeight: "600" },

  /* channel cards */
  columnWrapper: { paddingHorizontal: 12, gap: 10, marginBottom: 10 },
  card: {
    flex: 1, borderRadius: CARD_RADIUS, borderWidth: 1,
    overflow: "hidden",
  },
  cardLogoWrap: {
    width: "100%", aspectRatio: 1.75,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden", position: "relative",
  },
  cardLogoBox: {
    width: 56, height: 56, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    padding: 6,
  },
  cardLogoImg: { width: "100%", height: "100%" },
  cardLogoFallback: {
    width: 56, height: 56, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  cardLivePill: {
    position: "absolute", top: 7, right: 7,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#e5091488",
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
  },
  cardLiveTxt: { color: "#fff", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  cardBottom: { padding: 10, gap: 5 },
  cardAccentBar: { height: 2, width: 24, borderRadius: 1, marginBottom: 2 },
  cardName: { fontSize: 12, fontWeight: "700", lineHeight: 16 },

  /* states */
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingCard: {
    alignItems: "center", gap: 14, padding: 32,
    borderRadius: 20, borderWidth: 1, minWidth: 220,
  },
  loadingTxt: { fontSize: 13, textAlign: "center" },
  errorCard: {
    alignItems: "center", gap: 10, padding: 28,
    borderRadius: 20, borderWidth: 1, maxWidth: 280,
  },
  errorIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)", marginBottom: 4,
  },
  errorTitle: { fontSize: 18, fontWeight: "800" },
  errorSub: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 12, marginTop: 6,
  },
  retryTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  empty: { alignItems: "center", gap: 12, paddingTop: 60, paddingBottom: 40 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
  emptyTxt: { fontSize: 14 },
});
