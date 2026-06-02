import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  liveTvApi,
  getAccent,
  calcProgress,
  calcRemaining,
  CATEGORY_LABELS,
  MAIN_CATEGORIES,
  type LiveChannel,
  type EpgEntry,
  type ChannelsResponse,
} from "@/lib/live-tv-api";

const RED = "#e50914";
const { width: SW } = Dimensions.get("window");
const CARD_W = (SW - 16 * 2 - 12) / 2;
const CARD_H = CARD_W * 0.62;

function ProgressBar({ start, accent }: { start: string; accent: string }) {
  const pct = calcProgress(start);
  return (
    <View style={s.progressTrack}>
      <View style={[s.progressFill, { width: `${pct}%` as any, backgroundColor: accent }]} />
    </View>
  );
}

function ChannelCard({
  channel,
  epg,
  onPress,
}: {
  channel: LiveChannel;
  epg?: EpgEntry;
  onPress: () => void;
}) {
  const accent = getAccent(channel.id);
  const isLive = true;
  const prog = epg?.epg.start_date ? calcProgress(epg.epg.start_date) : 40;
  const remaining = epg?.epg.start_date ? calcRemaining(epg.epg.start_date) : "AO VIVO";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
      <View style={[s.cardImgWrap, { borderColor: accent + "55" }]}>
        {channel.image ? (
          <Image
            source={{ uri: channel.image }}
            style={s.cardImg}
            contentFit="contain"
            transition={200}
          />
        ) : (
          <View style={[s.cardImgFallback, { backgroundColor: accent + "22" }]}>
            <Feather name="tv" size={28} color={accent} />
          </View>
        )}
        {isLive && (
          <View style={[s.liveBadge, { backgroundColor: accent }]}>
            <View style={s.liveDot} />
            <Text style={s.liveTxt}>AO VIVO</Text>
          </View>
        )}
      </View>

      <View style={s.cardInfo}>
        <Text style={s.cardName} numberOfLines={1}>{channel.name}</Text>
        {epg?.epg.title ? (
          <Text style={s.cardEpg} numberOfLines={1}>{epg.epg.title}</Text>
        ) : (
          <Text style={[s.cardEpg, { color: "rgba(255,255,255,0.3)" }]}>Ao Vivo</Text>
        )}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${prog}%` as any, backgroundColor: accent }]} />
        </View>
        <Text style={[s.remaining, { color: accent }]}>{remaining}</Text>
      </View>
    </Pressable>
  );
}

export default function ChannelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<ChannelsResponse | null>(null);
  const [epgMap, setEpgMap] = useState<Record<string, EpgEntry>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<number>(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [chRes, epgRes] = await Promise.all([
        liveTvApi.getChannels(),
        liveTvApi.getEpgs().catch(() => [] as EpgEntry[]),
      ]);
      setData(chRes);
      const map: Record<string, EpgEntry> = {};
      for (const e of epgRes) { map[e.id] = e; }
      setEpgMap(map);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar canais");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const visibleChannels = (data?.channels ?? []).filter((ch) => {
    if (selectedCat === 0) return true;
    return ch.categories.includes(selectedCat);
  });

  const navigate = (ch: LiveChannel) => {
    const epg = epgMap[ch.id];
    router.push({
      pathname: "/channel-detail",
      params: {
        channelId: ch.id,
        channelName: ch.name,
        channelImage: ch.image,
        channelPreview: ch.preview,
        channelUrl: ch.url,
        channelCategories: JSON.stringify(ch.categories),
        epgTitle: epg?.epg.title ?? "",
        epgDesc: epg?.epg.desc ?? "",
        epgStart: epg?.epg.start_date ?? "",
      },
    });
  };

  const availableCats = MAIN_CATEGORIES.filter((catId) => {
    if (catId === 0) return true;
    return (data?.channels ?? []).some((ch) => ch.categories.includes(catId));
  });

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerLeft}>
          <Feather name="tv" size={20} color={RED} />
          <Text style={s.headerTitle}>Canais de TV</Text>
        </View>
        <View style={[s.livePill, { backgroundColor: RED }]}>
          <View style={s.liveDot} />
          <Text style={s.livePillTxt}>AO VIVO</Text>
        </View>
      </View>

      {/* Category filters */}
      {!loading && !error && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
          style={{ marginBottom: 12 }}
        >
          {availableCats.map((catId) => (
            <Pressable
              key={catId}
              onPress={() => setSelectedCat(catId)}
              style={[s.pill, selectedCat === catId && { backgroundColor: RED, borderColor: RED }]}
            >
              <Text style={[s.pillTxt, selectedCat === catId && { color: "#fff", fontWeight: "700" }]}>
                {CATEGORY_LABELS[catId] ?? `Cat ${catId}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={[s.loadTxt, { color: colors.mutedForeground }]}>
            Carregando canais...
          </Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[s.loadTxt, { color: colors.mutedForeground }]}>{error}</Text>
          <Pressable onPress={() => load(false)} style={[s.retryBtn, { borderColor: RED }]}>
            <Text style={{ color: RED, fontWeight: "600" }}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : visibleChannels.length === 0 ? (
        <View style={s.center}>
          <Feather name="tv" size={40} color={colors.mutedForeground} />
          <Text style={[s.loadTxt, { color: colors.mutedForeground }]}>
            Nenhum canal nesta categoria
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleChannels}
          keyExtractor={(ch) => ch.id}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={RED} />
          }
          renderItem={({ item }) => (
            <ChannelCard
              channel={item}
              epg={epgMap[item.id]}
              onPress={() => navigate(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  livePillTxt: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillTxt: { fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: "500" },
  row: { gap: 12, marginBottom: 12 },
  card: {
    width: CARD_W,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardImgWrap: {
    width: "100%",
    height: CARD_H,
    backgroundColor: "#1a1a1a",
    borderBottomWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardImg: { width: "80%", height: "80%" },
  cardImgFallback: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#fff" },
  liveTxt: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  cardInfo: { padding: 8, gap: 3 },
  cardName: { fontSize: 13, fontWeight: "700", color: "#fff" },
  cardEpg: { fontSize: 11, color: "rgba(255,255,255,0.55)" },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: { height: "100%", borderRadius: 1 },
  remaining: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  loadTxt: { fontSize: 14, textAlign: "center" },
  retryBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
});
