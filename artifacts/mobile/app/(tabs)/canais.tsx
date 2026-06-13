import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import {
  liveTvApi,
  LiveChannel,
  LiveCategory,
  getAccent,
  CATEGORY_LABELS,
} from "@/lib/live-tv-api";

const { width: W } = Dimensions.get("window");
const CARD_W = (W - 16 * 2 - 10 * 2) / 3;
const TAB_CLEAR = Platform.OS === "web" ? 100 : 110;

// ── Category Pill ─────────────────────────────────────────────────────────────
function CategoryPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Channel Card ──────────────────────────────────────────────────────────────
function ChannelCard({ channel }: { channel: LiveChannel }) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;
  const [imgErr, setImgErr] = useState(false);
  const accent = getAccent(channel.id);

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  const onPress = () =>
    router.push({
      pathname: "/channel-detail" as never,
      params: {
        channelId: channel.id,
        channelName: channel.name,
        channelImage: channel.image,
        channelUrl: channel.url,
      },
    } as never);

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[styles.card, { width: CARD_W, transform: [{ scale }] }]}>
        <View style={[styles.cardBg, { borderColor: accent + "33" }]}>
          <View style={[styles.liveTag]}>
            <View style={[styles.liveDot, { backgroundColor: accent }]} />
            <Text style={[styles.liveText, { color: accent }]}>AO VIVO</Text>
          </View>
          {channel.image && !imgErr ? (
            <Image
              source={{ uri: channel.image }}
              style={styles.channelLogo}
              resizeMode="contain"
              onError={() => setImgErr(true)}
            />
          ) : (
            <View style={[styles.channelLogoFallback, { backgroundColor: accent + "22" }]}>
              <Feather name="tv" size={26} color={accent} />
            </View>
          )}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>
          {channel.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function CanaisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    liveTvApi
      .getChannels()
      .then((data) => {
        setChannels(data.channels ?? []);
        // Build category list: "Todos" first, then the rest sorted by id
        const cats = [{ id: 0, name: "Todos" }, ...(data.categories ?? []).filter((c) => c.id !== 0).sort((a, b) => a.id - b.id)];
        setCategories(cats);
      })
      .catch((e) => setError(e?.message ?? "Erro ao carregar canais"))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    selectedCat === 0
      ? channels
      : channels.filter((ch) => ch.categories?.includes(selectedCat));

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.headerRow}>
          <Feather name="tv" size={22} color="#e50914" />
          <Text style={styles.headerTitle}>Canais ao Vivo</Text>
          {!loading && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{filtered.length}</Text>
            </View>
          )}
        </View>
        <Text style={styles.headerSub}>Transmissões em tempo real</Text>
      </View>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsRow}
          contentContainerStyle={styles.pillsContent}
        >
          {categories.map((cat) => (
            <CategoryPill
              key={cat.id}
              label={cat.name}
              active={selectedCat === cat.id}
              onPress={() => setSelectedCat(cat.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* States */}
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#e50914" />
          <Text style={styles.loadingText}>Carregando canais…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.center}>
          <Feather name="wifi-off" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Channel grid */}
      {!loading && !error && (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_CLEAR, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <ChannelCard channel={item} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Nenhum canal nesta categoria</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.4,
    flex: 1,
  },
  countBadge: {
    backgroundColor: "#e50914",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  headerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginTop: 3,
  },

  pillsRow: { maxHeight: 46 },
  pillsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  pillActive: {
    backgroundColor: "#e50914",
    borderColor: "#e50914",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
  },
  pillTextActive: {
    color: "#fff",
  },

  row: { gap: 10, marginBottom: 10 },

  card: { alignItems: "center" },
  cardBg: {
    width: "100%",
    aspectRatio: 1.4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  liveTag: {
    position: "absolute",
    top: 5,
    left: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  channelLogo: {
    width: "80%",
    height: "60%",
  },
  channelLogoFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  cardName: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginTop: 5,
    lineHeight: 13,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingTop: 60,
  },
  loadingText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
  },
  errorText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
  },
});
