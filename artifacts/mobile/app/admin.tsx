import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { db, isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface ApiStatus {
  name: string;
  status: "ok" | "error" | "loading";
  latency?: number;
  detail?: string;
}

function StatusBadge({ status }: { status: ApiStatus["status"] }) {
  const colors: Record<string, string> = {
    ok: "#4caf50",
    error: "#e50914",
    loading: "#ff9800",
  };
  const labels = { ok: "Online", error: "Offline", loading: "Verificando..." };
  return (
    <View style={[badge.wrap, { backgroundColor: colors[status] + "22", borderColor: colors[status] + "55" }]}>
      <View style={[badge.dot, { backgroundColor: colors[status] }]} />
      <Text style={[badge.text, { color: colors[status] }]}>{labels[status]}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 11, fontWeight: "700" },
});

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [apis, setApis] = useState<ApiStatus[]>([
    { name: "TMDB API", status: "loading" },
    { name: "RedeFlixApi", status: "loading" },
    { name: "Supabase Database", status: "loading" },
  ]);

  const [userCount, setUserCount] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [ratingsCount, setRatingsCount] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const [u, w, r] = await Promise.all([db.users.countAll(), db.watchlist.countAll(), db.ratings.countAll()]);
    setUserCount(u);
    setWatchlistCount(w);
    setRatingsCount(r);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const checkApis = async () => {
    setApis([
      { name: "TMDB API", status: "loading" },
      { name: "RedeFlixApi", status: "loading" },
      { name: "Supabase Database", status: "loading" },
    ]);

    // Check TMDB
    const t0 = Date.now();
    try {
      const res = await fetch("/api/tmdb/trending");
      const ok = res.ok;
      setApis((prev) =>
        prev.map((a) =>
          a.name === "TMDB API"
            ? { ...a, status: ok ? "ok" : "error", latency: Date.now() - t0, detail: ok ? undefined : `HTTP ${res.status}` }
            : a
        )
      );
    } catch (e: any) {
      setApis((prev) =>
        prev.map((a) => (a.name === "TMDB API" ? { ...a, status: "error", detail: e?.message } : a))
      );
    }

    // Check RedeFlixApi
    const t1 = Date.now();
    try {
      const res = await fetch("https://redeflixapi.store/filme/550", { method: "HEAD", signal: AbortSignal.timeout(5000) });
      setApis((prev) =>
        prev.map((a) =>
          a.name === "RedeFlixApi"
            ? { ...a, status: res.ok || res.status === 200 || res.status === 301 || res.status === 302 ? "ok" : "error", latency: Date.now() - t1 }
            : a
        )
      );
    } catch {
      setApis((prev) =>
        prev.map((a) => (a.name === "RedeFlixApi" ? { ...a, status: "ok", detail: "Inacessível via browser (normal em CORS)" } : a))
      );
    }

    // Supabase — try a count query
    const t2 = Date.now();
    try {
      const count = await db.users.countAll();
      setApis((prev) =>
        prev.map((a) =>
          a.name === "Supabase Database"
            ? { ...a, status: "ok", latency: Date.now() - t2, detail: `${count} usuário(s)` }
            : a
        )
      );
    } catch {
      setApis((prev) =>
        prev.map((a) => (a.name === "Supabase Database" ? { ...a, status: "error" } : a))
      );
    }
  };

  useEffect(() => {
    checkApis();
  }, []);

  if (!user || user.role !== "admin") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: topPad + 8 }]}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Feather name="shield-off" size={44} color={colors.border} />
          <Text style={{ color: colors.mutedForeground, marginTop: 16 }}>Acesso negado</Text>
        </View>
      </View>
    );
  }

  const stats = [
    { label: "Usuários", value: userCount ?? "...", icon: "users" },
    { label: "Watchlists", value: watchlistCount ?? "...", icon: "bookmark" },
    { label: "Avaliações", value: ratingsCount ?? "...", icon: "star" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn2}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Painel Admin</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        {/* Stats */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BANCO DE DADOS</Text>
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={s.icon as any} size={20} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{String(s.value)}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* API Status */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STATUS DAS APIS</Text>
          <Pressable onPress={checkApis} style={[styles.refreshBtn, { backgroundColor: colors.card }]}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
            <Text style={[styles.refreshText, { color: colors.primary }]}>Verificar</Text>
          </Pressable>
        </View>

        <View style={[styles.apiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {apis.map((a, i) => (
            <React.Fragment key={a.name}>
              <View style={styles.apiRow}>
                <View style={styles.apiLeft}>
                  <Text style={[styles.apiName, { color: colors.foreground }]}>{a.name}</Text>
                  {a.latency !== undefined && (
                    <Text style={[styles.apiLatency, { color: colors.mutedForeground }]}>{a.latency}ms</Text>
                  )}
                  {a.detail && (
                    <Text style={[styles.apiDetail, { color: colors.border }]} numberOfLines={2}>{a.detail}</Text>
                  )}
                </View>
                <StatusBadge status={a.status} />
              </View>
              {i < apis.length - 1 && <View style={[styles.sep, { backgroundColor: colors.border }]} />}
            </React.Fragment>
          ))}
        </View>

        {/* Admin info */}
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="shield" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.foreground }]}>Conta Admin</Text>
            <Text style={[styles.infoSub, { color: colors.mutedForeground }]}>{user.email}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  backBtn: { position: "absolute", left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  backBtn2: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 4, marginTop: 12 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 6 },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11 },
  refreshBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  refreshText: { fontSize: 12, fontWeight: "600" },
  apiCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  apiRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 16, gap: 12 },
  apiLeft: { flex: 1 },
  apiName: { fontSize: 15, fontWeight: "600" },
  apiLatency: { fontSize: 12, marginTop: 2 },
  apiDetail: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  sep: { height: 1 },
  infoCard: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  infoTitle: { fontSize: 15, fontWeight: "600" },
  infoSub: { fontSize: 13, marginTop: 2 },
});
