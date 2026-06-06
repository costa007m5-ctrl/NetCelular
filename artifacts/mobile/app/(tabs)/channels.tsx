import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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
const TAB_CLEARANCE = 120;

type SearchScope = "all" | "flix2" | "r2";

const SCOPES: { id: SearchScope; label: string; color: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "all",   label: "Todos",    color: "rgba(255,255,255,0.6)", icon: "search" },
  { id: "flix2", label: "Flix 2.0", color: RED,    icon: "play-circle" },
  { id: "r2",    label: "Acervo R2",color: AMBER,  icon: "database" },
];

interface SearchResult {
  key: string;
  title: string;
  poster: string | null;
  tmdbId: number;
  mediaType: "movie" | "tv";
  source: "flix2" | "r2";
  sourceLabel: string;
}

interface Flix2Hit {
  id: string | number;
  tmdb_id: number;
  title: string;
  poster?: string;
  type?: string;
}

interface R2Entry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  tmdb: {
    id: number; title: string; poster_path: string | null;
    media_type: "movie" | "tv";
  } | null;
}

function ResultCard({ item, onPress }: { item: SearchResult; onPress: () => void }) {
  const [err, setErr] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const uri = !err && item.poster ? item.poster : null;
  const srcColor = item.source === "flix2" ? RED : AMBER;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.93, useNativeDriver: true, speed: 28 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start()}
      style={{ width: CARD_W }}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" onError={() => setErr(true)} />
        ) : (
          <LinearGradient colors={["#1a1014", "#0a0810"]} style={StyleSheet.absoluteFill}>
            <View style={styles.placeholder}>
              <Feather name="film" size={18} color="rgba(255,255,255,0.1)" />
            </View>
          </LinearGradient>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cardInfo}>
          <View style={[styles.srcBadge, { backgroundColor: `${srcColor}25`, borderColor: srcColor }]}>
            <Text style={[styles.srcBadgeText, { color: srcColor }]}>{item.sourceLabel}</Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function ScopePill({ active, scope, onPress }: { active: boolean; scope: typeof SCOPES[0]; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.scopePill, active && { backgroundColor: `${scope.color}20`, borderColor: scope.color }]}
    >
      <Feather name={scope.icon} size={12} color={active ? scope.color : "rgba(255,255,255,0.3)"} />
      <Text style={[styles.scopePillText, { color: active ? scope.color : "rgba(255,255,255,0.3)" }]}>{scope.label}</Text>
    </Pressable>
  );
}

export default function BuscarScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchFlix2 = useCallback(async (q: string): Promise<SearchResult[]> => {
    try {
      const [movRes, serRes, aniRes] = await Promise.allSettled([
        r2Route<{ results: Flix2Hit[] }>(`/flix2/search?q=${encodeURIComponent(q)}&type=movies&limit=30`),
        r2Route<{ results: Flix2Hit[] }>(`/flix2/search?q=${encodeURIComponent(q)}&type=series&limit=20`),
        r2Route<{ results: Flix2Hit[] }>(`/flix2/search?q=${encodeURIComponent(q)}&type=animes&limit=20`),
      ]);
      const out: SearchResult[] = [];
      for (const res of [movRes, serRes, aniRes]) {
        if (res.status === "fulfilled") {
          for (const hit of res.value.results ?? []) {
            if (hit.tmdb_id) {
              const isAnime = (res === aniRes);
              const isSeries = (res === serRes);
              out.push({
                key: `flix2-${hit.id}`,
                title: hit.title,
                poster: hit.poster ?? null,
                tmdbId: hit.tmdb_id,
                mediaType: isSeries || isAnime ? "tv" : "movie",
                source: "flix2",
                sourceLabel: "Flix 2.0",
              });
            }
          }
        }
      }
      return out;
    } catch { return []; }
  }, []);

  const searchR2 = useCallback(async (q: string): Promise<SearchResult[]> => {
    try {
      const res = await r2Route<{ catalog: R2Entry[] }>("/catalog");
      const lq = q.toLowerCase();
      return (res.catalog ?? [])
        .filter((e) => (e.tmdb?.title ?? e.name).toLowerCase().includes(lq))
        .map((e) => ({
          key: `r2-${e.key}`,
          title: e.tmdb?.title ?? e.name,
          poster: e.tmdb?.poster_path ? `https://image.tmdb.org/t/p/w342${e.tmdb.poster_path}` : null,
          tmdbId: e.tmdb?.id ?? 0,
          mediaType: (e.tmdb?.media_type ?? e.type === "movie" ? "movie" : "tv") as "movie" | "tv",
          source: "r2" as const,
          sourceLabel: "R2",
        }));
    } catch { return []; }
  }, []);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const promises: Promise<SearchResult[]>[] = [];
      if (scope === "all" || scope === "flix2") promises.push(searchFlix2(trimmed));
      if (scope === "all" || scope === "r2")    promises.push(searchR2(trimmed));
      const all = await Promise.allSettled(promises);
      const merged: SearchResult[] = [];
      const seen = new Set<string>();
      for (const r of all) {
        if (r.status === "fulfilled") {
          for (const item of r.value) {
            if (!seen.has(item.key)) { seen.add(item.key); merged.push(item); }
          }
        }
      }
      setResults(merged);
    } finally { setLoading(false); }
  }, [scope, searchFlix2, searchR2]);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(text), 600);
  }, [doSearch]);

  const handleSubmit = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    Keyboard.dismiss();
    doSearch(query);
  }, [query, doSearch]);

  const goToDetail = useCallback((item: SearchResult) => {
    if (!item.tmdbId) return;
    router.push({ pathname: "/detail", params: { type: item.mediaType, id: String(item.tmdbId), title: item.title } });
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Buscar filmes, séries, animes..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={query}
            onChangeText={handleChange}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setResults([]); setSearched(false); }}>
              <Feather name="x" size={16} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Scope pills */}
      <View style={styles.scopeRow}>
        {SCOPES.map((s) => (
          <ScopePill
            key={s.id}
            scope={s}
            active={scope === s.id}
            onPress={() => {
              setScope(s.id);
              if (query.trim()) {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                setLoading(true);
                setTimeout(() => doSearch(query), 100);
              }
            }}
          />
        ))}
      </View>

      {/* Source legend */}
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: RED }]} />
        <Text style={styles.legendText}>Flix 2.0</Text>
        <View style={[styles.legendDot, { backgroundColor: AMBER, marginLeft: 10 }]} />
        <Text style={styles.legendText}>Acervo R2</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={RED} size="large" />
          <Text style={styles.loadingText}>Buscando em todas as fontes...</Text>
        </View>
      ) : !searched ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="search" size={40} color="rgba(255,255,255,0.08)" />
          </View>
          <Text style={styles.emptyTitle}>Busca Universal</Text>
          <Text style={styles.emptyHint}>Pesquise em Flix 2.0, Acervo R2 e Google Drive de uma vez</Text>
          <View style={styles.sourceList}>
            {[
              { icon: "play-circle" as const, label: "Flix 2.0 (nixplay.lat)", color: RED },
              { icon: "database" as const,    label: "Acervo R2 (Cloudflare)", color: AMBER },
              { icon: "cloud" as const,       label: "Google Drive",            color: GREEN },
            ].map((s) => (
              <View key={s.label} style={styles.sourceListItem}>
                <Feather name={s.icon} size={14} color={s.color} />
                <Text style={[styles.sourceListLabel, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color="rgba(255,255,255,0.08)" />
          <Text style={styles.emptyTitle}>Sem resultados</Text>
          <Text style={styles.emptyHint}>Tente outros termos ou verifique a conexão</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.key}
          numColumns={3}
          contentContainerStyle={[styles.grid, { paddingBottom: TAB_CLEARANCE }]}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.resultsCount}>
              {results.length} resultado{results.length !== 1 ? "s" : ""} para "{query}"
            </Text>
          }
          renderItem={({ item }) => (
            <ResultCard item={item} onPress={() => goToDetail(item)} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "500" },
  scopeRow: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 16, paddingBottom: 6,
  },
  scopePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  scopePillText: { fontSize: 11, fontWeight: "700" },
  legendRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 16, paddingBottom: 10,
  },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: "600" },
  grid: { paddingHorizontal: 12, paddingTop: 4 },
  gridRow: { gap: 8, marginBottom: 8 },
  resultsCount: {
    fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: "600",
    marginBottom: 10, paddingHorizontal: 4,
  },
  card: {
    width: CARD_W, height: CARD_H, borderRadius: 10,
    overflow: "hidden", backgroundColor: "#111",
  },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8 },
  srcBadge: {
    alignSelf: "flex-start", paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1, marginBottom: 4,
  },
  srcBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  cardTitle: { fontSize: 11, fontWeight: "700", color: "#fff", lineHeight: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: "500" },
  emptyState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 40, gap: 10,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "rgba(255,255,255,0.5)" },
  emptyHint: { fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", lineHeight: 20 },
  sourceList: { marginTop: 16, gap: 10, alignSelf: "stretch" },
  sourceListItem: { flexDirection: "row", alignItems: "center", gap: 10 },
  sourceListLabel: { fontSize: 13, fontWeight: "600" },
});
