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
import { r2Route } from "@/lib/r2-direct";
import type { ContentItem } from "@/constants/content";

const { width: SW } = Dimensions.get("window");
const NUM_COLS = 3;
const H_PAD = 14;
const GAP = 8;
const CARD_W = Math.floor((SW - H_PAD * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS);
const CARD_H = Math.floor(CARD_W * 1.5);
const PURPLE = "#a78bfa";
const CACHE_KEY = "exclusive_content_v2";
const CACHE_TTL = 60 * 60 * 1000;
const BATCH_SIZE = 40;

const TMDB_POSTER = "https://image.tmdb.org/t/p/w342";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w780";

interface CatalogEntry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  seasons: { number: number; prefix: string; label: string }[];
  tmdb: {
    id: number;
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    overview: string;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
    media_type: "movie" | "tv";
  } | null;
}

function entryToContent(entry: CatalogEntry): ContentItem {
  const t = entry.tmdb;
  const isTv = entry.type === "tv" || (entry.seasons?.length > 0) || t?.media_type === "tv";
  const rawYear = (t?.release_date ?? t?.first_air_date ?? "2024").slice(0, 4);
  const year = parseInt(rawYear, 10);
  return {
    id: `r2-${entry.key}`,
    tmdbId: t?.id ?? 0,
    title: t?.title ?? entry.name,
    year: isNaN(year) ? 2024 : year,
    rating: t?.vote_average ?? 0,
    posterPath: t?.poster_path ? `${TMDB_POSTER}${t.poster_path}` : "",
    backdropPath: t?.backdrop_path ? `${TMDB_BACKDROP}${t.backdrop_path}` : "",
    description: t?.overview ?? "",
    genres: [],
    type: isTv ? "series" : "movie",
    mediaType: isTv ? "tv" : "movie",
    exclusive: true,
  };
}

function PosterCard({ item, onPress }: { item: ContentItem; onPress: () => void }) {
  const [err, setErr] = useState(false);
  return (
    <Pressable style={s.card} onPress={onPress}>
      {item.posterPath && !err ? (
        <Image
          source={{ uri: item.posterPath }}
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
        colors={["transparent", "rgba(0,0,0,0.9)"]}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.exclusivePill}>
        <Feather name="zap" size={8} color={PURPLE} />
        <Text style={s.exclusivePillText}>NETPLAY</Text>
      </View>
      <View style={s.cardInfo}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.cardYear}>{item.year}</Text>
      </View>
    </Pressable>
  );
}

async function loadExclusiveItems(): Promise<ContentItem[]> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const { items, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL && items?.length) return items;
    }
  } catch {}
  return [];
}

async function saveExclusiveCache(items: ContentItem[]) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ items, ts: Date.now() }));
  } catch {}
}

export default function ExclusiveScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [items, setItems] = useState<ContentItem[]>([]);
  const [phase, setPhase] = useState<"loading" | "checking" | "done">("loading");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const abortRef = useRef(false);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: {
        type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"),
        id: String(item.tmdbId || 0),
        flix2Id: String(item.id ?? ""),
        title: item.title,
        poster: item.posterPath ?? "",
      },
    });
  }, [router]);

  useEffect(() => {
    abortRef.current = false;
    run();
    return () => { abortRef.current = true; };
  }, []);

  async function run() {
    setPhase("loading");

    const cached = await loadExclusiveItems();
    if (cached.length) {
      setItems(cached);
      setPhase("done");
      return;
    }

    setPhase("checking");

    let allEntries: CatalogEntry[] = [];
    try {
      const data = await r2Route<CatalogEntry[] | { items?: CatalogEntry[] }>("/flix2/catalog-full");
      allEntries = Array.isArray(data) ? data : (data as any).items ?? [];
    } catch {
      setPhase("done");
      return;
    }

    const withTmdb = allEntries.filter(e => e.tmdb?.id);
    setProgress({ checked: 0, total: withTmdb.length });

    const apiBase = getApiBase();
    const exclusiveIds = new Set<number>();
    const checked: number[] = [];

    for (let i = 0; i < withTmdb.length; i += BATCH_SIZE) {
      if (abortRef.current) break;

      const batch = withTmdb.slice(i, i + BATCH_SIZE);
      const batchItems = batch.map(e => ({
        id: e.tmdb!.id,
        type: (e.type === "tv" || (e.seasons?.length > 0) ? "tv" : "movie") as "movie" | "tv",
      }));

      try {
        const res = await fetch(`${apiBase}/api/tmdb/batch-providers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batchItems }),
        });
        if (res.ok) {
          const { exclusive } = await res.json();
          exclusive.forEach((id: number) => exclusiveIds.add(id));
        }
      } catch {}

      checked.push(...batch.map(e => e.tmdb!.id));
      setProgress({ checked: Math.min(i + BATCH_SIZE, withTmdb.length), total: withTmdb.length });

      if (abortRef.current) break;

      const found = withTmdb
        .filter(e => exclusiveIds.has(e.tmdb!.id))
        .map(entryToContent);

      setItems(found);
    }

    const final = withTmdb
      .filter(e => exclusiveIds.has(e.tmdb!.id))
      .map(entryToContent);

    setItems(final);
    setPhase("done");
    if (final.length) saveExclusiveCache(final);
  }

  function clearCache() {
    AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    setItems([]);
    setProgress({ checked: 0, total: 0 });
    run();
  }

  const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerBadge}>
            <Feather name="zap" size={10} color={PURPLE} />
            <Text style={s.headerBadgeText}>SÓ NO NETPLAY</Text>
          </View>
          <Text style={s.headerTitle}>Conteúdos Exclusivos</Text>
        </View>
        <TouchableOpacity onPress={clearCache} style={s.refreshBtn} hitSlop={12}>
          <Feather name="refresh-cw" size={18} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      {phase === "checking" && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${pct}%` as any }]} />
          <Text style={s.progressText}>
            Verificando disponibilidade… {progress.checked}/{progress.total}
          </Text>
        </View>
      )}

      {phase === "loading" && items.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={PURPLE} />
          <Text style={s.loadingText}>Carregando catálogo…</Text>
        </View>
      ) : items.length === 0 && phase === "done" ? (
        <View style={s.center}>
          <Feather name="zap-off" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={s.emptyTitle}>Nenhum exclusivo encontrado</Text>
          <Text style={s.emptyText}>
            Todos os títulos do catálogo foram encontrados em plataformas de streaming.
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={clearCache}>
            <Text style={s.retryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
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
                  {items.length} título{items.length !== 1 ? "s" : ""} exclusivo{items.length !== 1 ? "s" : ""}
                  {phase === "checking" ? " (buscando mais…)" : ""}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            phase === "checking" ? (
              <View style={s.footerLoader}>
                <ActivityIndicator size="small" color={PURPLE} />
                <Text style={s.footerText}>Verificando mais títulos…</Text>
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
  headerBadge: {
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
  headerBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: PURPLE,
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
  },
  progressBar: {
    height: 32,
    backgroundColor: "rgba(167,139,250,0.08)",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(167,139,250,0.1)",
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(167,139,250,0.18)",
  },
  progressText: {
    fontSize: 11,
    color: "rgba(167,139,250,0.7)",
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "rgba(167,139,250,0.18)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.3)",
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: PURPLE,
  },
  grid: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
    paddingBottom: 40,
    gap: GAP,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
  },
  countText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "600",
  },
  footerLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 12,
    color: "rgba(167,139,250,0.6)",
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  noImg: {
    backgroundColor: "#110d1e",
    alignItems: "center",
    justifyContent: "center",
  },
  exclusivePill: {
    position: "absolute",
    top: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(167,139,250,0.25)",
    borderWidth: 1,
    borderColor: "rgba(167,139,250,0.4)",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  exclusivePillText: {
    fontSize: 8,
    fontWeight: "800",
    color: PURPLE,
    letterSpacing: 0.5,
  },
  cardInfo: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 14,
  },
  cardYear: {
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
});
