import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { r2Route } from "@/lib/r2-direct";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");
const RED = "#e50914";
const AMBER = "#f59e0b";
const GREEN = "#16a34a";
const CARD_W = (W - 48) / 3;
const CARD_H = CARD_W * 1.5;
const WIDE_W = (W - 40) / 2;
const WIDE_H = WIDE_W * 1.4;
const TAB_CLEARANCE = 120;

type AcervoTab = "r2" | "drive";

interface R2Entry {
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
    media_type: "movie" | "tv";
  } | null;
}

interface DriveRoot {
  drive: 0 | 1;
  name: string;
  icon: string;
  folders: string[];
}

const TMDB_IMG = (p: string | null, size = "w342") =>
  p ? `https://image.tmdb.org/t/p/${size}${p}` : null;

function CatalogCard({ entry, onPress }: { entry: R2Entry; onPress: () => void }) {
  const [err, setErr] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const poster = !err && entry.tmdb?.poster_path ? TMDB_IMG(entry.tmdb.poster_path) : null;
  const typeColor = entry.type === "movie" ? RED : entry.type === "tv" ? AMBER : "rgba(255,255,255,0.2)";
  const typeLabel = entry.type === "movie" ? "Filme" : entry.type === "tv" ? "Série" : "?";

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
      style={{ width: CARD_W }}
    >
      <Animated.View style={[styles.catalogCard, { transform: [{ scale }] }]}>
        {poster ? (
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1014", "#0a0810"]} style={StyleSheet.absoluteFill}>
            <View style={styles.cardPlaceholder}>
              <Feather name={entry.type === "movie" ? "film" : "tv"} size={20} color="rgba(255,255,255,0.1)" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.catalogCardInfo}>
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}22`, borderColor: typeColor }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <Text style={styles.catalogCardTitle} numberOfLines={2}>{entry.tmdb?.title ?? entry.name}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function DriveCard({ item, onPress }: { item: DriveRoot; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
    >
      <Animated.View style={[styles.driveCard, { transform: [{ scale }] }]}>
        <LinearGradient colors={["#0d1a12", "#060a08"]} style={StyleSheet.absoluteFill} />
        <View style={styles.driveIcon}>
          <Feather name="folder" size={28} color={GREEN} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.driveName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.driveHint}>Google Drive</Text>
        </View>
        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
      </Animated.View>
    </Pressable>
  );
}

export default function AcervoScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [activeTab, setActiveTab] = useState<AcervoTab>("r2");
  const [catalog, setCatalog] = useState<R2Entry[]>([]);
  const [driveRoots, setDriveRoots] = useState<DriveRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "movie" | "tv">("all");

  const loadCatalog = useCallback(async () => {
    try {
      const res = await r2Route<{ catalog: R2Entry[] }>("/catalog");
      setCatalog(res.catalog ?? []);
    } catch {}
  }, []);

  const loadDriveRoots = useCallback(async () => {
    try {
      const { DRIVE_ROOTS } = await import("@/lib/gdrive-index");
      setDriveRoots(DRIVE_ROOTS ?? []);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([loadCatalog(), loadDriveRoots()]);
    setLoading(false);
    setRefreshing(false);
  }, [loadCatalog, loadDriveRoots]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const filteredCatalog = catalog.filter((e) =>
    filterType === "all" ? true : e.type === filterType
  );

  const movieCount = catalog.filter((e) => e.type === "movie").length;
  const tvCount = catalog.filter((e) => e.type === "tv").length;

  const goToEntry = useCallback((entry: R2Entry) => {
    if (entry.tmdb?.id) {
      router.push({
        pathname: "/detail",
        params: { type: entry.tmdb.media_type, id: String(entry.tmdb.id), title: entry.tmdb.title },
      });
    } else {
      router.push({ pathname: "/r2-catalog" });
    }
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 14 }]}>
        <View>
          <Text style={styles.headerTitle}>Acervo</Text>
          <Text style={styles.headerSub}>
            {loading ? "Carregando..." : `${catalog.length} itens R2 · ${driveRoots.length} pastas Drive`}
          </Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: "/r2-catalog" })} style={styles.manageBtn}>
          <Feather name="settings" size={16} color={AMBER} />
          <Text style={styles.manageBtnText}>Gestão</Text>
        </Pressable>
      </View>

      {/* Source tabs */}
      <View style={styles.srcTabRow}>
        <Pressable
          onPress={() => setActiveTab("r2")}
          style={[styles.srcTab, activeTab === "r2" && { borderBottomColor: AMBER, borderBottomWidth: 2 }]}
        >
          <Feather name="database" size={14} color={activeTab === "r2" ? AMBER : "rgba(255,255,255,0.3)"} />
          <Text style={[styles.srcTabText, { color: activeTab === "r2" ? AMBER : "rgba(255,255,255,0.3)" }]}>
            Cloudflare R2
          </Text>
          {catalog.length > 0 && (
            <View style={[styles.srcTabBadge, { backgroundColor: activeTab === "r2" ? `${AMBER}22` : "rgba(255,255,255,0.06)" }]}>
              <Text style={[styles.srcTabBadgeNum, { color: activeTab === "r2" ? AMBER : "rgba(255,255,255,0.3)" }]}>{catalog.length}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("drive")}
          style={[styles.srcTab, activeTab === "drive" && { borderBottomColor: GREEN, borderBottomWidth: 2 }]}
        >
          <Feather name="cloud" size={14} color={activeTab === "drive" ? GREEN : "rgba(255,255,255,0.3)"} />
          <Text style={[styles.srcTabText, { color: activeTab === "drive" ? GREEN : "rgba(255,255,255,0.3)" }]}>
            Google Drive
          </Text>
          {driveRoots.length > 0 && (
            <View style={[styles.srcTabBadge, { backgroundColor: activeTab === "drive" ? `${GREEN}22` : "rgba(255,255,255,0.06)" }]}>
              <Text style={[styles.srcTabBadgeNum, { color: activeTab === "drive" ? GREEN : "rgba(255,255,255,0.3)" }]}>{driveRoots.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={activeTab === "r2" ? AMBER : GREEN} size="large" />
          <Text style={styles.loadingText}>Carregando acervo...</Text>
        </View>
      ) : activeTab === "r2" ? (
        <>
          {/* Filter pills */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
            style={styles.filterRow}
          >
            {([
              { id: "all",   label: `Todos (${catalog.length})`,  color: "rgba(255,255,255,0.5)" },
              { id: "movie", label: `Filmes (${movieCount})`,      color: RED },
              { id: "tv",    label: `Séries (${tvCount})`,         color: AMBER },
            ] as const).map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFilterType(f.id)}
                style={[styles.filterPill, filterType === f.id && { backgroundColor: `${f.color}22`, borderColor: f.color }]}
              >
                <Text style={[styles.filterPillText, { color: filterType === f.id ? f.color : "rgba(255,255,255,0.35)" }]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <FlatList
            data={filteredCatalog}
            keyExtractor={(e) => e.key}
            numColumns={3}
            contentContainerStyle={[styles.grid, { paddingBottom: TAB_CLEARANCE }]}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AMBER} colors={[AMBER]} />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="database" size={48} color="rgba(255,255,255,0.07)" />
                <Text style={styles.emptyText}>Acervo R2 vazio</Text>
                <Text style={styles.emptyHint}>Faça upload de conteúdo via Gestão</Text>
                <Pressable onPress={() => router.push({ pathname: "/r2-catalog" })} style={styles.emptyBtn}>
                  <Feather name="plus-circle" size={14} color={AMBER} />
                  <Text style={[styles.emptyBtnText, { color: AMBER }]}>Abrir Gestão</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <CatalogCard entry={item} onPress={() => goToEntry(item)} />
            )}
          />
        </>
      ) : (
        <FlatList
          data={driveRoots}
          keyExtractor={(i) => String(i.drive)}
          contentContainerStyle={[styles.driveList, { paddingBottom: TAB_CLEARANCE }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} colors={[GREEN]} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="cloud" size={48} color="rgba(255,255,255,0.07)" />
              <Text style={styles.emptyText}>Nenhuma pasta Drive configurada</Text>
              <Text style={styles.emptyHint}>Configure as pastas no servidor</Text>
            </View>
          }
          renderItem={({ item }) => (
            <DriveCard
              item={item}
              onPress={() => router.push({ pathname: "/r2-catalog", params: { tab: "drive", drive: String(item.drive) } })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, fontWeight: "500" },
  manageBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: `${AMBER}15`, borderWidth: 1, borderColor: `${AMBER}40`,
  },
  manageBtnText: { fontSize: 12, fontWeight: "700", color: AMBER },
  srcTabRow: {
    flexDirection: "row",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)",
    marginHorizontal: 16, marginBottom: 4,
  },
  srcTab: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 11, marginRight: 4,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  srcTabText: { fontSize: 13, fontWeight: "700" },
  srcTabBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    marginLeft: 2,
  },
  srcTabBadgeNum: { fontSize: 10, fontWeight: "800" },
  filterRow: { maxHeight: 46 },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 6, gap: 8, flexDirection: "row" },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  filterPillText: { fontSize: 12, fontWeight: "700" },
  grid: { paddingHorizontal: 12, paddingTop: 8 },
  row: { gap: 8, marginBottom: 8 },
  catalogCard: {
    width: CARD_W, height: CARD_H, borderRadius: 10,
    overflow: "hidden", backgroundColor: "#111",
  },
  cardPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  catalogCardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  typeBadge: {
    alignSelf: "flex-start", paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1, marginBottom: 4,
  },
  typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  catalogCardTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 15 },
  driveList: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
  driveCard: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 14, paddingVertical: 14, gap: 12,
  },
  driveIcon: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: `${GREEN}18`, alignItems: "center", justifyContent: "center",
  },
  driveName: { fontSize: 14, fontWeight: "700", color: "#fff", lineHeight: 19 },
  driveHint: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, fontWeight: "500" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: "rgba(255,255,255,0.3)", fontWeight: "700" },
  emptyHint: { fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: "500" },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10,
    backgroundColor: `${AMBER}15`, borderWidth: 1, borderColor: `${AMBER}40`, marginTop: 8,
  },
  emptyBtnText: { fontSize: 13, fontWeight: "700" },
});
