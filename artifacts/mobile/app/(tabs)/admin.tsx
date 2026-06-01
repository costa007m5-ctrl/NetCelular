import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useAuth } from "@/lib/auth-context";
import { getApiBase } from "@/lib/api";

const RED = "#e50914";

interface R2Item {
  type: "folder" | "file";
  key: string;
  name: string;
  size?: number;
  lastModified?: string | null;
  fileType?: string;
  isVideo?: boolean;
}

interface R2Response {
  bucket: string;
  prefix: string;
  folders: R2Item[];
  files: R2Item[];
  isTruncated: boolean;
  nextToken: string | null;
}

interface R2Stats {
  bucket: string;
  objectCount: number;
  isTruncated: boolean;
  totalSizeBytes: number;
  videoCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function r2Fetch<T>(path: string): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error("Servidor API não configurado");
  const res = await fetch(`${base}/r2${path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function getSignedUrl(key: string): Promise<string> {
  const data = await r2Fetch<{ url: string }>(`/signed-url?key=${encodeURIComponent(key)}`);
  return data.url;
}

type Breadcrumb = { label: string; prefix: string };

export default function AdminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [prefix, setPrefix] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ label: "R2", prefix: "" }]);
  const [items, setItems] = useState<R2Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<R2Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"browser" | "stats">("browser");

  const load = useCallback(async (p: string, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const data = await r2Fetch<R2Response>(`/list?prefix=${encodeURIComponent(p)}&delimiter=/`);
      setItems([...data.folders, ...data.files]);
    } catch (e: any) {
      setError(e.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await r2Fetch<R2Stats>("/stats");
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { load(prefix); }, [prefix]);

  useEffect(() => {
    if (tab === "stats" && !stats) loadStats();
  }, [tab]);

  const onRefresh = () => {
    setRefreshing(true);
    load(prefix, true);
  };

  const navigateInto = (folder: R2Item) => {
    const newPrefix = folder.key;
    const label = folder.name || folder.key;
    setBreadcrumbs((prev) => [...prev, { label, prefix: newPrefix }]);
    setPrefix(newPrefix);
    setSearch("");
  };

  const navigateToBreadcrumb = (bc: Breadcrumb) => {
    const idx = breadcrumbs.findIndex((b) => b.prefix === bc.prefix);
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    setPrefix(bc.prefix);
    setSearch("");
  };

  const openFile = async (item: R2Item) => {
    if (!item.isVideo) return;
    try {
      const url = await getSignedUrl(item.key);
      router.push({ pathname: "/player", params: { url, title: item.name } });
    } catch (e: any) {
      setError(e.message ?? "Erro ao abrir arquivo");
    }
  };

  const filteredItems = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  if (user?.role !== "admin") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="lock" size={48} color="rgba(255,255,255,0.3)" />
        <Text style={[styles.errorText, { color: colors.text, marginTop: 16 }]}>
          Acesso restrito a administradores
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Admin</Text>
        <Text style={styles.headerSub}>Cloudflare R2</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tabBtn, tab === "browser" && styles.tabBtnActive]}
          onPress={() => setTab("browser")}
        >
          <Feather name="folder" size={14} color={tab === "browser" ? "#fff" : "rgba(255,255,255,0.4)"} />
          <Text style={[styles.tabLabel, { color: tab === "browser" ? "#fff" : "rgba(255,255,255,0.4)" }]}>
            Arquivos
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, tab === "stats" && styles.tabBtnActive]}
          onPress={() => setTab("stats")}
        >
          <Feather name="bar-chart-2" size={14} color={tab === "stats" ? "#fff" : "rgba(255,255,255,0.4)"} />
          <Text style={[styles.tabLabel, { color: tab === "stats" ? "#fff" : "rgba(255,255,255,0.4)" }]}>
            Estatísticas
          </Text>
        </Pressable>
      </View>

      {tab === "stats" ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 100 }}>
          {statsLoading ? (
            <ActivityIndicator color={RED} style={{ marginTop: 40 }} />
          ) : stats ? (
            <>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Bucket</Text>
                <Text style={styles.statValue}>{stats.bucket}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total de objetos</Text>
                <Text style={styles.statValue}>
                  {stats.isTruncated ? `${stats.objectCount}+` : stats.objectCount}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Vídeos</Text>
                <Text style={styles.statValue}>{stats.videoCount}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Tamanho total</Text>
                <Text style={styles.statValue}>{formatBytes(stats.totalSizeBytes)}</Text>
              </View>
              <Pressable style={styles.refreshBtn} onPress={loadStats}>
                <Feather name="refresh-cw" size={14} color="#fff" />
                <Text style={styles.refreshBtnText}>Atualizar</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.center}>
              <Feather name="cloud-off" size={40} color="rgba(255,255,255,0.3)" />
              <Text style={[styles.errorText, { marginTop: 12 }]}>
                R2 não configurado ou inacessível
              </Text>
              <Pressable style={[styles.refreshBtn, { marginTop: 20 }]} onPress={loadStats}>
                <Text style={styles.refreshBtnText}>Tentar novamente</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          {/* Breadcrumbs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.breadcrumbRow}
            contentContainerStyle={{ paddingHorizontal: 16, alignItems: "center" }}
          >
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={bc.prefix + idx}>
                {idx > 0 && (
                  <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" style={{ marginHorizontal: 4 }} />
                )}
                <Pressable onPress={() => navigateToBreadcrumb(bc)}>
                  <Text
                    style={[
                      styles.breadcrumb,
                      idx === breadcrumbs.length - 1 && styles.breadcrumbActive,
                    ]}
                  >
                    {bc.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </ScrollView>

          {/* Search */}
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.4)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Filtrar..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Feather name="x" size={16} color="rgba(255,255,255,0.4)" />
              </Pressable>
            )}
          </View>

          {/* File List */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={RED} size="large" />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Feather name="cloud-off" size={40} color="rgba(255,255,255,0.3)" />
              <Text style={[styles.errorText, { marginTop: 12 }]}>{error}</Text>
              <Pressable style={[styles.refreshBtn, { marginTop: 20 }]} onPress={() => load(prefix)}>
                <Text style={styles.refreshBtnText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={(item) => item.key}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RED} />}
              ListEmptyComponent={
                <View style={[styles.center, { paddingTop: 60 }]}>
                  <Feather name="inbox" size={40} color="rgba(255,255,255,0.2)" />
                  <Text style={[styles.errorText, { marginTop: 12 }]}>Pasta vazia</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
                  onPress={() => item.type === "folder" ? navigateInto(item) : openFile(item)}
                >
                  <View style={styles.itemIcon}>
                    {item.type === "folder" ? (
                      <Feather name="folder" size={22} color="#f5a623" />
                    ) : item.isVideo ? (
                      <Feather name="film" size={22} color={RED} />
                    ) : (
                      <Feather name="file" size={22} color="rgba(255,255,255,0.4)" />
                    )}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    {item.type === "file" && (
                      <Text style={styles.itemMeta}>
                        {item.size != null ? formatBytes(item.size) : ""}
                        {item.lastModified ? `  •  ${new Date(item.lastModified).toLocaleDateString("pt-BR")}` : ""}
                      </Text>
                    )}
                  </View>
                  {item.type === "folder" && (
                    <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.3)" />
                  )}
                  {item.type === "file" && item.isVideo && (
                    <Feather name="play-circle" size={20} color={RED} />
                  )}
                </Pressable>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerTitle: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tabBtnActive: { backgroundColor: "#e50914" },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  breadcrumbRow: {
    maxHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  breadcrumb: { color: "rgba(255,255,255,0.45)", fontSize: 13 },
  breadcrumbActive: { color: "#fff", fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  itemIcon: { width: 36, alignItems: "center" },
  itemInfo: { flex: 1 },
  itemName: { color: "#fff", fontSize: 14, fontWeight: "500" },
  itemMeta: { color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 },
  errorText: { color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: "center" },
  statCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statLabel: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 6 },
  statValue: { color: "#fff", fontSize: 22, fontWeight: "700" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#e50914",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  refreshBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
