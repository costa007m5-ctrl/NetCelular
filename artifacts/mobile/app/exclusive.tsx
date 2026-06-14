import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
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
const PURPLE = "#a78bfa";
const CACHE_KEY = "exclusive_content_v5";
const CACHE_TTL = 12 * 60 * 60 * 1000;

// TMDB genre ID → Portuguese name
const GENRE_NAMES: Record<number, string> = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 53: "Suspense",
  10752: "Guerra", 37: "Faroeste", 10759: "Ação & Aventura",
  10762: "Infantil", 10763: "Notícias", 10764: "Reality",
  10765: "Sci-Fi & Fantasia", 10766: "Novela", 10768: "Guerra & Política",
  10770: "Filmes de TV", 10767: "Talk Show",
};

interface ExclusiveItem {
  id: string;
  tmdb_id: number;
  title: string;
  mediaType: "movie" | "tv";
  year: number;
  poster: string;
  backdrop: string;
  synopsis: string;
  genre_ids: number[];
}

interface GenreSection {
  genreId: number;
  name: string;
  items: ExclusiveItem[];
}

// Card dimensions for horizontal carousels
const CARD_W = 110;
const CARD_H = Math.floor(CARD_W * 1.5);

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
          <Feather name="film" size={20} color="rgba(255,255,255,0.15)" />
        </View>
      )}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.88)"]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.pill}>
        <Feather name="zap" size={7} color={PURPLE} />
        <Text style={s.pillText}>NETPLAY</Text>
      </View>
      <View style={s.cardInfo}>
        <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.year > 0 && <Text style={s.cardYear}>{item.year}</Text>}
      </View>
    </Pressable>
  );
}

function GenreRow({ section, onPress }: { section: GenreSection; onPress: (item: ExclusiveItem) => void }) {
  return (
    <View style={s.sectionWrap}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{section.name}</Text>
        <Text style={s.sectionCount}>{section.items.length}</Text>
      </View>
      <FlatList
        data={section.items}
        keyExtractor={(i) => `${section.genreId}_${i.tmdb_id}_${i.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.rowPad}
        ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        renderItem={({ item }) => (
          <PosterCard item={item} onPress={() => onPress(item)} />
        )}
      />
    </View>
  );
}

function buildSections(items: ExclusiveItem[]): GenreSection[] {
  const map = new Map<number, ExclusiveItem[]>();

  for (const item of items) {
    const genres = item.genre_ids?.length ? item.genre_ids : [0];
    // Primary genre only (first one)
    const primary = genres[0];
    if (!map.has(primary)) map.set(primary, []);
    map.get(primary)!.push(item);
  }

  const sections: GenreSection[] = [];
  map.forEach((sItems, genreId) => {
    const name = GENRE_NAMES[genreId] ?? (genreId === 0 ? "Outros" : `Gênero ${genreId}`);
    sections.push({ genreId, name, items: sItems });
  });

  // Sort sections: largest first
  sections.sort((a, b) => b.items.length - a.items.length);
  return sections;
}

export default function ExclusiveScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 0 : insets.top;

  const [allItems, setAllItems] = useState<ExclusiveItem[]>([]);
  const [sections, setSections] = useState<GenreSection[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fromCache, setFromCache] = useState(false);
  const [activeFilter, setActiveFilter] = useState<number | null>(null); // null = all
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

  function applyItems(raw: ExclusiveItem[]) {
    // Client-side dedup by tmdb_id
    const seen = new Set<number>();
    const deduped = raw.filter((i) => {
      if (seen.has(i.tmdb_id)) return false;
      seen.add(i.tmdb_id);
      return true;
    });
    setAllItems(deduped);
    setSections(buildSections(deduped));
  }

  async function run(forceRefresh = false) {
    const apiBase = getApiBase();
    setPhase("loading");
    setAllItems([]);
    setSections([]);

    if (!forceRefresh) {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { items: ci, ts } = JSON.parse(raw);
          if (Date.now() - ts < CACHE_TTL && Array.isArray(ci) && ci.length > 0) {
            applyItems(ci);
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
      const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (abortRef.current) return;

      const data: ExclusiveItem[] = json?.data ?? [];
      applyItems(data);
      setFromCache(json.fromCache ?? false);
      setPhase("done");

      if (data.length > 0) {
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ items: data, ts: Date.now() })).catch(() => {});
      }
    } catch {
      if (!abortRef.current) setPhase("error");
    }
  }

  const filteredSections =
    activeFilter === null
      ? sections
      : sections.filter((s) => s.genreId === activeFilter);

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
            Na primeira vez verificamos centenas de títulos.{"\n"}Aguarde 1–2 minutos.
          </Text>
          <Text style={s.loadingHint}>Resultado salvo por 12h após a busca.</Text>
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
      ) : isDone && allItems.length === 0 ? (
        <View style={s.center}>
          <Feather name="zap-off" size={40} color="rgba(255,255,255,0.2)" />
          <Text style={s.emptyTitle}>Nenhum exclusivo encontrado</Text>
          <Text style={s.emptySubtitle}>
            Todos os títulos estão em plataformas de streaming no Brasil.
          </Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => run(true)}>
            <Text style={s.retryText}>Verificar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Summary bar */}
          <View style={s.summaryBar}>
            <Feather name="zap" size={13} color={PURPLE} />
            <Text style={s.summaryText}>
              {allItems.length} exclusivo{allItems.length !== 1 ? "s" : ""}
              {fromCache ? " (cache)" : " — sem equivalente em plataformas BR"}
            </Text>
          </View>

          {/* Genre filter chips */}
          {sections.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterRow}
              style={s.filterScroll}
            >
              <TouchableOpacity
                style={[s.chip, activeFilter === null && s.chipActive]}
                onPress={() => setActiveFilter(null)}
              >
                <Text style={[s.chipText, activeFilter === null && s.chipTextActive]}>
                  Todos
                </Text>
              </TouchableOpacity>
              {sections.map((sec) => (
                <TouchableOpacity
                  key={sec.genreId}
                  style={[s.chip, activeFilter === sec.genreId && s.chipActive]}
                  onPress={() => setActiveFilter(sec.genreId)}
                >
                  <Text style={[s.chipText, activeFilter === sec.genreId && s.chipTextActive]}>
                    {sec.name}
                  </Text>
                  <Text style={[s.chipCount, activeFilter === sec.genreId && s.chipCountActive]}>
                    {sec.items.length}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Genre carousels */}
          {filteredSections.map((section) => (
            <GenreRow key={section.genreId} section={section} onPress={goTo} />
          ))}
        </ScrollView>
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
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(167,139,250,0.15)",
    borderWidth: 1, borderColor: "rgba(167,139,250,0.3)",
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
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
    marginTop: 10, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: "rgba(167,139,250,0.18)", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(167,139,250,0.3)",
  },
  retryText: { fontSize: 14, fontWeight: "700", color: PURPLE },

  summaryBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
  },
  summaryText: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "600" },

  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 14, gap: 8, alignItems: "center", paddingVertical: 4 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  chipActive: {
    backgroundColor: "rgba(167,139,250,0.2)",
    borderColor: "rgba(167,139,250,0.5)",
  },
  chipText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.55)" },
  chipTextActive: { color: PURPLE },
  chipCount: {
    fontSize: 10, fontWeight: "700",
    color: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
  },
  chipCountActive: { color: PURPLE, backgroundColor: "rgba(167,139,250,0.15)" },

  sectionWrap: { marginTop: 20 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
  sectionCount: {
    fontSize: 11, fontWeight: "700", color: "rgba(167,139,250,0.7)",
    backgroundColor: "rgba(167,139,250,0.12)",
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1,
  },
  rowPad: { paddingHorizontal: 16 },

  card: {
    width: CARD_W, height: CARD_H, borderRadius: 10,
    overflow: "hidden", backgroundColor: "#1a1a1a",
  },
  noImg: { backgroundColor: "#110d1e", alignItems: "center", justifyContent: "center" },
  pill: {
    position: "absolute", top: 5, left: 5,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(167,139,250,0.28)", borderWidth: 1,
    borderColor: "rgba(167,139,250,0.45)", borderRadius: 5,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  pillText: { fontSize: 7, fontWeight: "800", color: PURPLE, letterSpacing: 0.5 },
  cardInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 },
  cardTitle: { fontSize: 10, fontWeight: "700", color: "#fff", lineHeight: 13 },
  cardYear: { fontSize: 9, color: "rgba(255,255,255,0.45)", marginTop: 2 },
});
