import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/useColors";
import { getApiBase } from "@/lib/api";

const { width: SW } = Dimensions.get("window");
const NUM_COLS = 3;
const H_PAD = 14;
const GAP = 8;
const CARD_W = Math.floor((SW - H_PAD * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.floor(CARD_W * 1.5);
const PURPLE = "#a78bfa";
const CACHE_KEY = "exclusive_content_v4";
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12h — matches server cache

interface ExclusiveItem {
  id: string;
  tmdb_id: number;
  title: string;
  mediaType: "movie" | "tv";
  year: number;
  poster: string;
  backdrop: string;
  synopsis: string;
}

function PosterCard({ item, onPress }: { item: ExclusiveItem; onPress: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <Pressable style={s.card} onPress={onPress}>
      {item.poster && !err ? (
        <Image
          source={{ uri: item.poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setErr(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.noImg]}>
          <Feather name="film" size={22} color="rgba(255,255,255,0.15)" />
        </View>
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.88)"]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.pill}>
        <Feather name="zap" size={8} color={PURPLE} />
        <Text style={s.pillText}>NETPLAY</Text>
      </View>
      <View style={s.cardInfo}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.year > 0 && <Text style={s.cardYear}>{item.year}</Text>}
      </View>
    </Pressable>
  );
}

export default function ExclusiveScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [items, setItems] = useState<ExclusiveItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fromCache, setFromCache] = useState(false);
  const abortRef = useRef(false);

  const goTo = useCallback(
    (item: ExclusiveItem) => {
      router.push({
        pathname: "/detail",
        params: {
          type: item.mediaType,
          id: String(item.tmdb_id),
          flix2Id: item.id,
          title: item.title,
          poster: item.poster ?? "",
        },
      });
    },
    [router]
  );

  useEffect(() => {
    abortRef.current = false;
    run();
    return () => { abortRef.current = true; };
  }, []);

  async function run(forceRefresh = false) {
    const apiBase = getApiBase();
    setPhase("loading");
    setItems([]);

    // Try local AsyncStorage cache first (avoids cold server fetch on reload)
    if (!forceRefresh) {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { items: ci, ts } = JSON.parse(raw);
          if (Date.now() - ts < CACHE_TTL && Array.isArray(ci) && ci.length > 0) {
            setItems(ci);
            setFromCache(true);
            setPhase("done");
            return;
          }
        }
      } catch {}
    }

    setFromCache(false);

    try {
      const url = `${apiBase}/r2/flix2/exclusive${forceRefresh ? "?refresh=1" : ""}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) }); // 3 min — first call is slow
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (abortRef.current) return;

      const data: ExclusiveItem[] = json?.data ?? [];
      setItems(data);
      setFromCache(json.fromCache ?? false);
      setPhase("done");

      // Save to local cache
      if (data.length > 0) {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ items: data, ts: Date.now() })).catch(() => {});
      }
    } catch (err) {
      if (!abortRef.current) setPhase("error");
    }
  }

  const isLoading = phase === "loading";
  const isDone = phase === "done";
  const isError = phase === "error";

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.badge}>
            <Feather name="zap" size={10} color={PURPLE} />
            <Text style={s.badgeText}>SÓ NO NETPLAY</Text>
          </View>
          <Text style={s.headerTitle}>Conteúdos Exclusivos</Text>
        </View>
        <TouchableOpacity onPress={() => run(true)} style={s.refreshBtn} hitSlop={12}>
          <Feather name="refresh-cw" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={s.loadingTitle}>Buscando exclusivos…</Text>
          <Text style={s.loadingSubtitle}>
            Na primeira vez, verificamos centenas de títulos no TMDB.{"\n"}Isso pode levar 1-2 minutos.
          </Text>
          <Text style={s.loadingHint}>Os resultados ficam salvos por 12 horas.</Text>
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={s.emptyTitle}>Erro ao carregar</Text>
          <Text style={s.emptySubtitle}>Verifique sua conexão e tente novamente.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => run(true)}>
            <Text style={s.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : isDone && items.length === 0 ? (
        <View style={s.center}>
          <Feather name="zap-off" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={s.emptyTitle}>Nenhum exclusivo encontrado</Text>
          <Text style={s.emptySubtitle}>
            Todos os títulos verificados estão disponíveis em plataformas de streaming no Brasil.
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => run(true)}>
            <Text style={s.retryText}>Verificar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.tmdb_id}_${item.id}`}
          numColumns={NUM_COLS}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.row}
          renderItem={({ item }) => (
            <PosterCard item={item} onPress={() => goTo(item)} />
          )}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={s.countRow}>
                <Feather name="zap" size={13} color={PURPLE} />
                <Text style={s.countText}>
                  {items.length} exclusivo{items.length !== 1 ? "s" : ""}
                  {fromCache ? " (cache)" : " — não estão em nenhuma plataforma BR"}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={<View style={{ height: 120 }} />}
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
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(167,139,250,0.12)",
    backgroundColor: "#08060e",
  },
  backBtn: { padding: 4, marginRight: 8 },
  refreshBtn: { padding: 4, marginLeft: 8 },
  headerCenter: { flex: 1, alignItems: "center" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(167,139,250,0.15)",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.3)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  badgeText: { fontSize: 9, fontWeight: "900", color: PURPLE, letterSpacing: 1 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  loadingTitle: { fontSize: 16, fontWeight: "700", color: "#fff", marginTop: 12, textAlign: "center" },
  loadingSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 19 },
  loadingHint: { fontSize: 11, color: "rgba(167,139,250,0.5)", marginTop: 4, textAlign: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#fff", textAlign: "center", marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 19 },
  retryBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "rgba(167,139,250,0.18)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.3)",
  },
  retryText: { fontSize: 14, fontWeight: "700", color: PURPLE },
  grid: { paddingHorizontal: H_PAD, paddingTop: 14, paddingBottom: 40, gap: GAP },
  row: { gap: GAP, marginBottom: GAP },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  countText: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "600", flex: 1 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  noImg: { backgroundColor: "#110d1e", alignItems: "center", justifyContent: "center" },
  pill: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(167,139,250,0.28)",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.45)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  pillText: { fontSize: 8, fontWeight: "800", color: PURPLE, letterSpacing: 0.5 },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  cardTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  cardYear: { fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 },
});
