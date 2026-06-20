import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  clearShortsShares,
  formatTimeAgo,
  loadShortsShares,
  type ShortsShareItem,
} from "@/lib/shorts-shares";

function ShareCard({
  item,
  onPress,
  onShare,
}: {
  item: ShortsShareItem;
  onPress: () => void;
  onShare: () => void;
}) {
  const typeLabel = item.type === "movie" ? "Filme" : "Série";

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      {/* Poster */}
      <View style={s.posterWrap}>
        {item.poster ? (
          <Image source={{ uri: item.poster }} style={s.poster} contentFit="cover" />
        ) : (
          <View style={[s.poster, s.posterPlaceholder]}>
            <Feather name="film" size={24} color="rgba(255,255,255,0.3)" />
          </View>
        )}
        {/* Share count badge */}
        {item.shareCount > 1 && (
          <View style={s.countBadge}>
            <Text style={s.countBadgeText}>{item.shareCount}×</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={s.info}>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        <View style={s.metaRow}>
          <View style={s.typePill}>
            <Text style={s.typePillText}>{typeLabel}</Text>
          </View>
          <Text style={s.meta}>{item.year}</Text>
          {item.rating > 0 && (
            <>
              <Feather name="star" size={11} color="#f59e0b" />
              <Text style={[s.meta, { color: "#f59e0b" }]}>{item.rating.toFixed(1)}</Text>
            </>
          )}
        </View>
        {item.genre ? <Text style={s.genre} numberOfLines={1}>{item.genre}</Text> : null}
        <View style={s.bottomRow}>
          <Feather name="clock" size={11} color="rgba(255,255,255,0.4)" />
          <Text style={s.timeAgo}>{formatTimeAgo(item.sharedAt)}</Text>
        </View>
      </View>

      {/* Re-share button */}
      <TouchableOpacity style={s.reshareBtn} onPress={onShare} hitSlop={12}>
        <Feather name="share-2" size={18} color="#e50914" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={s.empty}>
      <View style={s.emptyIconWrap}>
        <Feather name="share-2" size={40} color="rgba(229,9,20,0.4)" />
      </View>
      <Text style={s.emptyTitle}>Nenhum Short compartilhado</Text>
      <Text style={s.emptyBody}>
        Quando você compartilhar um Short, ele aparecerá aqui com a contagem de vezes que foi enviado.
      </Text>
    </View>
  );
}

export default function ShortsSharesScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  const [items, setItems] = useState<ShortsShareItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await loadShortsShares();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGoDetail = useCallback((item: ShortsShareItem) => {
    if (!item.tmdbId) return;
    router.push({
      pathname: "/detail",
      params: { type: item.type, id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  const handleReshare = useCallback(async (item: ShortsShareItem) => {
    const emoji = item.type === "movie" ? "🎬" : "📺";
    const stars = "⭐".repeat(Math.round(item.rating / 2));
    const msg = `${emoji} ${item.title} (${item.year}) ${stars}\n\nAssistindo no NETPLAY — o melhor streaming! 🍿`;
    try {
      if (isWeb) {
        await navigator.clipboard?.writeText(msg);
      } else {
        await Share.share({ message: msg, title: item.title });
      }
    } catch {}
  }, [isWeb]);

  const handleClear = useCallback(() => {
    Alert.alert(
      "Limpar histórico",
      "Remover todos os Shorts compartilhados desta lista?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            await clearShortsShares();
            setItems([]);
          },
        },
      ]
    );
  }, []);

  // Summary stats
  const totalShares = items.reduce((acc, it) => acc + it.shareCount, 0);
  const uniqueTitles = items.length;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Shorts Compartilhados</Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={handleClear} hitSlop={12}>
            <Feather name="trash-2" size={20} color="#e50914" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      {/* Stats bar */}
      {items.length > 0 && (
        <View style={s.statsBar}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{uniqueTitles}</Text>
            <Text style={s.statLabel}>título{uniqueTitles !== 1 ? "s" : ""}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>{totalShares}</Text>
            <Text style={s.statLabel}>compartilhamento{totalShares !== 1 ? "s" : ""}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>
              {items[0] ? formatTimeAgo(items[0].sharedAt) : "—"}
            </Text>
            <Text style={s.statLabel}>último</Text>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(it) => it.id + it.sharedAt}
        renderItem={({ item }) => (
          <ShareCard
            item={item}
            onPress={() => handleGoDetail(item)}
            onShare={() => handleReshare(item)}
          />
        )}
        ListEmptyComponent={!loading ? <EmptyState /> : null}
        contentContainerStyle={[
          s.list,
          { paddingBottom: (isWeb ? 34 : insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const ACCENT = "#e50914";

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },

  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statItem: { alignItems: "center", flex: 1 },
  statValue: { color: ACCENT, fontSize: 20, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: "rgba(255,255,255,0.12)" },

  list: { paddingTop: 12, paddingHorizontal: 16 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    marginBottom: 10,
    padding: 12,
    gap: 12,
  },

  posterWrap: { position: "relative" },
  poster: { width: 70, height: 100, borderRadius: 10 },
  posterPlaceholder: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  countBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: ACCENT,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  countBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  info: { flex: 1, gap: 4 },
  title: { color: "#fff", fontSize: 14, fontWeight: "700", lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  typePill: {
    backgroundColor: "rgba(229,9,20,0.18)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typePillText: { color: ACCENT, fontSize: 10, fontWeight: "700" },
  meta: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  genre: { color: "rgba(255,255,255,0.4)", fontSize: 11 },
  bottomRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  timeAgo: { color: "rgba(255,255,255,0.4)", fontSize: 11 },

  reshareBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(229,9,20,0.12)",
    alignItems: "center", justifyContent: "center",
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: "rgba(229,9,20,0.08)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { color: "#fff", fontSize: 17, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  emptyBody: { color: "rgba(255,255,255,0.45)", fontSize: 13, textAlign: "center", lineHeight: 20 },
});
