import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { ContentItem } from "@/constants/content";

const { width: W } = Dimensions.get("window");
const RED    = "#e50914";
const TMDB_KEY  = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_W500  = "https://image.tmdb.org/t/p/w500";

async function tfetch(path: string, params: Record<string, string> = {}): Promise<any> {
  try {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set("api_key", TMDB_KEY);
    url.searchParams.set("language", "pt-BR");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const r = await fetch(url.toString());
    if (!r.ok) return { results: [] };
    return r.json();
  } catch { return { results: [] }; }
}

function toItem(raw: any, forcedType?: "movie" | "tv"): ContentItem {
  const isMovie = forcedType
    ? forcedType === "movie"
    : raw.media_type === "movie" || !!(raw.title && !raw.name);
  const year = parseInt(((raw.release_date ?? raw.first_air_date) || "2024").slice(0, 4));
  return {
    id: String(raw.id),
    tmdbId: raw.id,
    title: raw.title ?? raw.name ?? "",
    year,
    rating: raw.vote_average ?? 0,
    posterPath: raw.poster_path ? `${IMG_W500}${raw.poster_path}` : "",
    backdropPath: raw.backdrop_path ? `${IMG_W500}${raw.backdrop_path}` : "",
    description: raw.overview ?? "",
    genres: [],
    type: isMovie ? "movie" : "series",
    mediaType: isMovie ? "movie" : "tv",
  };
}

const CATEGORIES = [
  { id: "trending",  label: "Em Alta",   icon: "trending-up", color: "#e50914", bg: "rgba(229,9,20,0.15)" },
  { id: "live",      label: "Ao Vivo",   icon: "radio",       color: "#0891b2", bg: "rgba(8,145,178,0.15)" },
  { id: "new",       label: "Novidades", icon: "bell",        color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
  { id: "ia",        label: "IA Picks",  icon: "cpu",         color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
];

const MOODS = [
  { id: "epico",    label: "Algo épico",        emoji: "🌟", query: "épico aventura ação" },
  { id: "rir",      label: "Quero rir",          emoji: "😂", query: "comédia humor" },
  { id: "assustar", label: "Quero me assustar",  emoji: "👻", query: "terror suspense" },
  { id: "chorar",   label: "Quero chorar",        emoji: "😢", query: "drama romance" },
  { id: "acao",     label: "Muita ação",          emoji: "💥", query: "ação adrenalina" },
  { id: "romance",  label: "Romance",             emoji: "❤️",  query: "romance amor" },
];

const CATEGORY_QUERIES: Record<string, { path: string; params?: Record<string, string>; label: string }> = {
  trending: { path: "/trending/all/week", label: "Em Alta Agora" },
  live:     { path: "/movie/now_playing",  label: "Ao Vivo / Em Cartaz" },
  new:      { path: "/movie/upcoming",     label: "Novidades" },
  ia:       { path: "/movie/top_rated",    label: "IA Picks — Mais Bem Avaliados" },
};

interface ResultCardProps {
  item: ContentItem;
  onPress: () => void;
}

function ResultCard({ item, onPress }: ResultCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardImg}>
        {item.posterPath ? (
          <Image
            source={{ uri: item.posterPath }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <LinearGradient colors={["#1a0a14", "#0e0810"]}
            style={[StyleSheet.absoluteFill, styles.cardPlaceholder]}>
            <Feather name="film" size={22} color="rgba(255,255,255,0.15)" />
          </LinearGradient>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.75)"]}
          style={styles.cardGrad}
        />
        {item.rating >= 7 && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.cardYear}>{item.year}</Text>
    </Pressable>
  );
}

export default function BuscarScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const params   = useLocalSearchParams<{ q?: string }>();
  const inputRef = useRef<TextInput>(null);

  const [query,        setQuery]        = useState(params.q ?? "");
  const [results,      setResults]      = useState<ContentItem[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [featItems,    setFeatItems]    = useState<ContentItem[]>([]);
  const [featLabel,    setFeatLabel]    = useState("Em Alta Agora");
  const [featLoading,  setFeatLoading]  = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [listening,    setListening]    = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;
  const recogRef = useRef<any>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    loadCategory("trending");
  }, []);

  const loadCategory = useCallback(async (id: string) => {
    const cfg = CATEGORY_QUERIES[id];
    if (!cfg) return;
    setActiveCategory(id);
    setFeatLoading(true);
    setFeatLabel(cfg.label);
    const data = await tfetch(cfg.path, cfg.params ?? {});
    setFeatItems((data.results ?? []).slice(0, 20).map((x: any) => toItem(x)));
    setFeatLoading(false);
  }, []);

  const stopListening = useCallback(() => {
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
    setListening(false);
    micPulse.stopAnimation();
    micPulse.setValue(1);
  }, [micPulse]);

  const startVoice = useCallback(() => {
    if (listening) { stopListening(); return; }
    if (Platform.OS !== "web") {
      Alert.alert("Busca por voz", "Disponível apenas na versão web. Digite normalmente.", [{ text: "OK" }]);
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { Alert.alert("Não suportado", "Use Chrome ou Edge.", [{ text: "OK" }]); return; }
    const rec = new SR();
    rec.lang = "pt-BR"; rec.continuous = false; rec.interimResults = false;
    rec.onstart = () => {
      setListening(true);
      Animated.loop(Animated.sequence([
        Animated.timing(micPulse, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(micPulse, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ])).start();
    };
    rec.onresult = (e: any) => { setQuery(e.results[0][0].transcript); inputRef.current?.focus(); };
    rec.onerror = () => stopListening();
    rec.onend   = () => stopListening();
    recogRef.current = rec;
    rec.start();
  }, [listening, micPulse, stopListening]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const data = await tfetch("/search/multi", { query: q, include_adult: "false" });
      const items: ContentItem[] = (data.results ?? [])
        .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
        .map((x: any) => toItem(x));
      setResults(items);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = useCallback((item: ContentItem) => {
    router.push({
      pathname: "/detail",
      params: { type: item.mediaType ?? (item.type === "movie" ? "movie" : "tv"), id: String(item.tmdbId), title: item.title },
    });
  }, [router]);

  const setMoodQuery = useCallback((mood: typeof MOODS[0]) => {
    setQuery(mood.query);
    inputRef.current?.blur();
  }, []);

  const isSearching = query.trim().length >= 2;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <StatusBar style="light" />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buscar conteúdo</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* ── SEARCH BAR ── */}
      <View style={styles.searchWrap}>
        <LinearGradient
          colors={["rgba(255,255,255,0.09)", "rgba(255,255,255,0.04)"]}
          style={styles.searchBar}
        >
          <View style={styles.searchIconWrap}>
            <Feather name="search" size={16} color={RED} />
          </View>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar filmes, séries, atores, canais..."
            placeholderTextColor="rgba(255,255,255,0.32)"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            selectionColor={RED}
          />
          {query.length > 0 ? (
            <Pressable style={[styles.micBtn, styles.clearBtn]} hitSlop={8}
              onPress={() => { setQuery(""); inputRef.current?.focus(); }}>
              <Feather name="x" size={13} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.micBtn, listening && styles.micBtnActive]}
              hitSlop={8}
              onPress={startVoice}
            >
              <Animated.View style={listening ? { opacity: micPulse } : undefined}>
                <Feather name="mic" size={14} color={listening ? RED : "rgba(255,255,255,0.4)"} />
              </Animated.View>
            </Pressable>
          )}
        </LinearGradient>
      </View>

      {isSearching ? (
        /* ── SEARCH RESULTS ── */
        <View style={styles.flex}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={RED} size="large" />
              <Text style={styles.loadingText}>Buscando...</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="search" size={52} color="rgba(255,255,255,0.08)" />
              <Text style={styles.emptyTitle}>Nenhum resultado</Text>
              <Text style={styles.emptySubtitle}>Tente outro termo ou verifique a ortografia</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resultsLabel}>
                {results.length} resultado{results.length !== 1 ? "s" : ""} para &quot;{query.trim()}&quot;
              </Text>
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                numColumns={3}
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <ResultCard item={item} onPress={() => goTo(item)} />
                )}
              />
            </>
          )}
        </View>
      ) : (
        /* ── DISCOVERY STATE ── */
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
          >
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.catPill,
                  { backgroundColor: cat.bg, borderColor: activeCategory === cat.id ? cat.color : "transparent" },
                  activeCategory === cat.id && { borderWidth: 1.5 },
                ]}
                onPress={() => loadCategory(cat.id)}
              >
                <View style={[styles.catIcon, { backgroundColor: cat.color + "25" }]}>
                  <Feather name={cat.icon as any} size={14} color={cat.color} />
                </View>
                <Text style={[styles.catLabel, { color: cat.color }]}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Mood section */}
          <View style={styles.moodSection}>
            <View style={styles.moodHeader}>
              <Text style={styles.moodIcon}>⚡</Text>
              <Text style={styles.moodTitle}>O que quer assistir hoje?</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moodRow}
            >
              {MOODS.map((m) => (
                <Pressable key={m.id} style={styles.moodChip} onPress={() => setMoodQuery(m)}>
                  <Text style={styles.moodEmoji}>{m.emoji}</Text>
                  <Text style={styles.moodLabel}>{m.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Featured content */}
          <View style={styles.featSection}>
            <View style={styles.featHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="trending-up" size={16} color={RED} />
                <Text style={styles.featTitle}>{featLabel}</Text>
                {activeCategory === "trending" && (
                  <View style={styles.topBadge}>
                    <Text style={styles.topBadgeText}>TOP 10</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => loadCategory(activeCategory ?? "trending")}>
                <Text style={styles.verTudo}>Ver tudo ›</Text>
              </Pressable>
            </View>

            {featLoading ? (
              <View style={{ height: 200, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={RED} />
              </View>
            ) : (
              <FlatList
                data={featItems}
                keyExtractor={(item) => item.id}
                numColumns={3}
                scrollEnabled={false}
                contentContainerStyle={styles.grid}
                renderItem={({ item }) => (
                  <ResultCard item={item} onPress={() => goTo(item)} />
                )}
              />
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const CARD_W = (W - 32 - 16) / 3;

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: "#050306" },
  flex:        { flex: 1 },
  centered:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },

  /* header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  headerTitle:  { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },

  /* search bar */
  searchWrap:   { paddingHorizontal: 16, marginBottom: 18 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "rgba(229,9,20,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  micBtnActive: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.14)" },
  clearBtn:     { backgroundColor: RED, borderColor: RED },

  /* category pills */
  catRow:  { paddingHorizontal: 16, gap: 10, paddingBottom: 6 },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  catIcon:  { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  catLabel: { fontSize: 14, fontWeight: "700" },

  /* mood */
  moodSection: { paddingHorizontal: 16, marginTop: 22, marginBottom: 6 },
  moodHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  moodIcon:    { fontSize: 18 },
  moodTitle:   { color: "#fff", fontSize: 16, fontWeight: "700" },
  moodRow:     { gap: 10 },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  moodEmoji: { fontSize: 16 },
  moodLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },

  /* featured content */
  featSection: { marginTop: 26, paddingBottom: 8 },
  featHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  featTitle:  { color: "#fff", fontSize: 16, fontWeight: "700" },
  topBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: RED,
  },
  topBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  verTudo:      { color: RED, fontSize: 13, fontWeight: "700" },

  /* results */
  resultsLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  loadingText:  { color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 10 },
  emptyTitle:   { color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: "700" },
  emptySubtitle:{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", lineHeight: 20 },

  /* grid */
  grid: { paddingHorizontal: 16, gap: 8 },
  card: { width: CARD_W, marginBottom: 4 },
  cardImg: {
    width: CARD_W,
    height: CARD_W * 1.48,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1a0a14",
    marginBottom: 6,
  },
  cardPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardGrad:  { ...StyleSheet.absoluteFillObject, top: "55%" },
  ratingBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  ratingText: { color: "#f59e0b", fontSize: 10, fontWeight: "800" },
  cardTitle:  { color: "#fff", fontSize: 11, fontWeight: "700", lineHeight: 15 },
  cardYear:   { color: "rgba(255,255,255,0.38)", fontSize: 10, marginTop: 1 },
});
