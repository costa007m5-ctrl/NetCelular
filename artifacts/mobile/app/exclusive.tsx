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
const CACHE_KEY = "exclusive_content_v3";
const CACHE_TTL = 2 * 60 * 60 * 1000;
const PROVIDER_BATCH = 40;
const CATALOG_BATCH = 500;

interface Flix2Item {
  id: string;
  tmdb_id: number;
  title: string;
  type: "filme" | "serie";
  year: number;
  rating: string;
  poster: string;
  backdrop: string;
  synopsis: string;
}

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
        <Image source={{ uri: item.poster }} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setErr(true)} />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.noImg]}>
          <Feather name="film" size={22} color="rgba(255,255,255,0.15)" />
        </View>
      )}
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
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

async function r2Fetch(apiBase: string, type: "movies" | "series" | "animes"): Promise<Flix2Item[]> {
  const res = await fetch(`${apiBase}/r2/flix2/catalog-full?type=${type}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.data ?? []) as Flix2Item[];
}

async function batchCheckProviders(apiBase: string, items: { id: number; type: "movie" | "tv" }[]): Promise<Set<number>> {
  const exclusive = new Set<number>();
  for (let i = 0; i < items.length; i += PROVIDER_BATCH) {
    const batch = items.slice(i, i + PROVIDER_BATCH);
    try {
      const res = await fetch(`${apiBase}/tmdb/batch-providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const { exclusive: ids } = await res.json();
        (ids as number[]).forEach(id => exclusive.add(id));
      }
    } catch {}
  }
  return exclusive;
}

export default function ExclusiveScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [items, setItems] = useState<ExclusiveItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "checking" | "done">("idle");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const abortRef = useRef(false);

  const goTo = useCallback((item: ExclusiveItem) => {
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
  }, [router]);

  useEffect(() => {
    abortRef.current = false;
    run();
    return () => { abortRef.current = true; };
  }, []);

  async function run(forceRefresh = false) {
    const apiBase = getApiBase();

    if (!forceRefresh) {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { items: ci, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL && ci?.length > 0) {
            setItems(ci);
            setPhase("done");
            return;
          }
        }
      } catch {}
    }

    setItems([]);
    setPhase("loading");

    // Fetch movies + series catalogs
    let allFlix2: Flix2Item[] = [];
    try {
      const [movies, series, animes] = await Promise.all([
        r2Fetch(apiBase, "movies"),
        r2Fetch(apiBase, "series"),
        r2Fetch(apiBase, "animes"),
      ]);
      allFlix2 = [...movies, ...series, ...animes];
    } catch {
      setPhase("done");
      return;
    }

    if (abortRef.current) return;

    // Only items with a valid TMDB ID can be checked
    const withTmdb = allFlix2.filter(i => i.tmdb_id > 0);

    if (withTmdb.length === 0) {
      setPhase("done");
      return;
    }

    setPhase("checking");
    setProgress({ checked: 0, total: withTmdb.length });

    const providerInput = withTmdb.map(i => ({
      id: i.tmdb_id,
      type: (i.type === "serie" ? "tv" : "movie") as "movie" | "tv",
    }));

    // Check in batches, updating progress after each
    const exclusiveIds = new Set<number>();
    for (let i = 0; i < providerInput.length; i += PROVIDER_BATCH) {
      if (abortRef.current) break;
      const batch = providerInput.slice(i, i + PROVIDER_BATCH);
      try {
        const res = await fetch(`${apiBase}/tmdb/batch-providers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batch }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          const { exclusive: ids } = await res.json();
          (ids as number[]).forEach(id => exclusiveIds.add(id));
        }
      } catch {}

      const checkedSoFar = Math.min(i + PROVIDER_BATCH, withTmdb.length);
      setProgress({ checked: checkedSoFar, total: withTmdb.length });

      // Show partial results progressively
      const partial = withTmdb
        .filter(e => exclusiveIds.has(e.tmdb_id))
        .map(toExclusive);
      setItems(partial);
    }

    if (abortRef.current) return;

    const final = withTmdb.filter(e => exclusiveIds.has(e.tmdb_id)).map(toExclusive);
    setItems(final);
    setPhase("done");
    if (final.length > 0) {
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ items: final, ts: Date.now() })).catch(() => {});
    }
  }

  function toExclusive(e: Flix2Item): ExclusiveItem {
    return {
      id: e.id,
      tmdb_id: e.tmdb_id,
      title: e.title,
      mediaType: e.type === "serie" ? "tv" : "movie",
      year: e.year,
      poster: e.poster,
      backdrop: e.backdrop,
      synopsis: e.synopsis,
    };
  }

  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;
  const isChecking = phase === "checking";
  const isLoading = phase === "loading";
  const isDone = phase === "done";

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

      {/* Progress bar while checking */}
      {isChecking && (
        <View style={s.progressWrap}>
          <View style={[s.progressFill, { width: `${pct}%` as any }]} />
          <Text style={s.progressText}>
            Verificando no TMDB… {progress.checked}/{progress.total} — {items.length} exclusivos encontrados
          </Text>
        </View>
      )}

      {/* Loading catalog */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={s.loadingText}>Carregando catálogo…</Text>
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
          keyExtractor={item => `${item.tmdb_id}_${item.id}`}
          numColumns={NUM_COLS}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.row}
          renderItem={({ item }) => <PosterCard item={item} onPress={() => goTo(item)} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={s.countRow}>
                <Feather name="zap" size={13} color={PURPLE} />
                <Text style={s.countText}>
                  {items.length} exclusivo{items.length !== 1 ? "s" : ""}
                  {isChecking ? " (buscando mais…)" : " — não estão em nenhuma plataforma BR"}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            isChecking ? (
              <View style={s.footerRow}>
                <ActivityIndicator size="small" color={PURPLE} />
                <Text style={s.footerText}>Verificando mais títulos ({pct}%)…</Text>
              </View>
            ) : (
              <View style={{ height: 120 }} />
            )
          }
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
  progressWrap: {
    height: 34,
    backgroundColor: "rgba(167,139,250,0.07)",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(167,139,250,0.1)",
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    left: 0, top: 0, bottom: 0,
    backgroundColor: "rgba(167,139,250,0.2)",
  },
  progressText: { fontSize: 11, color: "rgba(167,139,250,0.75)", fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  loadingText: { fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#fff", textAlign: "center", marginTop: 8 },
  emptySubtitle: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", lineHeight: 19 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: "rgba(167,139,250,0.18)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(167,139,250,0.3)",
  },
  retryText: { fontSize: 14, fontWeight: "700", color: PURPLE },
  grid: { paddingHorizontal: H_PAD, paddingTop: 14, paddingBottom: 40, gap: GAP },
  row: { gap: GAP, marginBottom: GAP },
  countRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  countText: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "600", flex: 1 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 20 },
  footerText: { fontSize: 12, color: "rgba(167,139,250,0.6)" },
  card: { width: CARD_W, height: CARD_H, borderRadius: 10, overflow: "hidden", backgroundColor: "#1a1a1a" },
  noImg: { backgroundColor: "#110d1e", alignItems: "center", justifyContent: "center" },
  pill: {
    position: "absolute", top: 6, left: 6,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(167,139,250,0.28)", borderWidth: 1,
    borderColor: "rgba(167,139,250,0.45)", borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  pillText: { fontSize: 8, fontWeight: "800", color: PURPLE, letterSpacing: 0.5 },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  cardTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 14 },
  cardYear: { fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 },
});
