import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
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

const { width: SW } = Dimensions.get("window");
const BG = "#050505";
const RED = "#e50914";
const GLASS = "rgba(255,255,255,0.05)";
const GLASS_B = "rgba(255,255,255,0.09)";
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
const IMG = (p: string | null, s = "w500") =>
  p ? `https://image.tmdb.org/t/p/${s}${p}` : null;

const MOODS = [
  { label: "🔥 Ação", color: "#ef4444", genre: "28", type: "movie" },
  { label: "😂 Comédia", color: "#f59e0b", genre: "35", type: "movie" },
  { label: "👻 Terror", color: "#7c3aed", genre: "27", type: "movie" },
  { label: "💞 Romance", color: "#ec4899", genre: "10749", type: "movie" },
  { label: "🚀 Sci-Fi", color: "#06b6d4", genre: "878", type: "movie" },
  { label: "🎭 Drama", color: "#64748b", genre: "18", type: "movie" },
  { label: "🎌 Anime", color: "#f97316", genre: "16", type: "tv" },
  { label: "🏆 Esportes", color: "#22c55e", genre: "10770", type: "tv" },
  { label: "📺 Docs", color: "#a78bfa", genre: "99", type: "movie" },
  { label: "🧒 Kids", color: "#34d399", genre: "10751", type: "movie" },
];

const UNIVERSES = [
  { label: "Marvel", emoji: "⚡", color: "#e50914", bg: "#300000", collectionId: 131292 },
  { label: "DC", emoji: "🦇", color: "#1a56db", bg: "#000030", collectionId: 263 },
  { label: "Star Wars", emoji: "⚔️", color: "#22d3ee", bg: "#001520", collectionId: 10 },
  { label: "Harry Potter", emoji: "🧙", color: "#d97706", bg: "#201000", collectionId: 1241 },
  { label: "Fast & Furious", emoji: "🏎️", color: "#f97316", bg: "#201000", collectionId: 9485 },
  { label: "Disney", emoji: "✨", color: "#a78bfa", bg: "#150020", collectionId: 294272 },
  { label: "Pixar", emoji: "🎈", color: "#34d399", bg: "#001a10", collectionId: 194566 },
  { label: "James Bond", emoji: "🔫", color: "#64748b", bg: "#101010", collectionId: 645 },
];

const CURATED = [
  { label: "Oscar 2025", icon: "award", color: "#f59e0b", tmdbId: 278, type: "movie" },
  { label: "Netflix Originais", icon: "play-circle", color: "#e50914", tmdbId: 496243, type: "movie" },
  { label: "Série do Momento", icon: "tv", color: "#7c3aed", tmdbId: 1396, type: "tv" },
  { label: "Clássicos", icon: "clock", color: "#06b6d4", tmdbId: 238, type: "movie" },
  { label: "Populares", icon: "trending-up", color: "#22c55e", tmdbId: 550, type: "movie" },
  { label: "Premiados", icon: "star", color: "#ec4899", tmdbId: 389, type: "movie" },
];

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {subtitle && <Text style={s.sectionSub}>{subtitle}</Text>}
    </View>
  );
}

function MoodPill({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.moodPill, { borderColor: color + "55", opacity: pressed ? 0.75 : 1 }]}
    >
      <LinearGradient
        colors={[color + "20", color + "08"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <Text style={[s.moodLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function UniverseCard({ label, emoji, color, bg }: { label: string; emoji: string; color: string; bg: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/detail", params: { type: "movie", id: "299536", title: label } })}
      style={({ pressed }) => [s.universeCard, { borderColor: color + "44", opacity: pressed ? 0.8 : 1 }]}
    >
      <LinearGradient colors={[color + "25", bg]} style={StyleSheet.absoluteFill} />
      <Text style={s.universeEmoji}>{emoji}</Text>
      <Text style={[s.universeLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function TrendingCard({ item }: { item: any }) {
  const router = useRouter();
  const isMovie = item.media_type === "movie" || !!item.title;
  const title = item.title ?? item.name ?? "";
  const year = (item.release_date ?? item.first_air_date ?? "").slice(0, 4);
  const poster = IMG(item.poster_path);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/detail", params: { type: isMovie ? "movie" : "tv", id: String(item.id), title } })}
      style={({ pressed }) => [s.trendingCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <Image source={{ uri: poster ?? "" }} style={s.trendingPoster} contentFit="cover" />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={s.trendingGrad} />
      <View style={s.trendingInfo}>
        <Text style={s.trendingTitle} numberOfLines={2}>{title}</Text>
        <Text style={s.trendingMeta}>{isMovie ? "Filme" : "Série"} · {year}</Text>
      </View>
    </Pressable>
  );
}

function CuratedCard({ item }: { item: typeof CURATED[0] }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/detail", params: { type: item.type, id: String(item.tmdbId), title: item.label } })}
      style={({ pressed }) => [s.curatedCard, { opacity: pressed ? 0.8 : 1 }]}
    >
      <LinearGradient colors={[item.color + "25", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
      <View style={[s.curatedIcon, { backgroundColor: item.color + "22" }]}>
        <Feather name={item.icon as any} size={22} color={item.color} />
      </View>
      <Text style={s.curatedLabel}>{item.label}</Text>
      <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.3)" />
    </Pressable>
  );
}

export default function DescobrirScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [trending, setTrending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;

  useEffect(() => {
    fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_KEY}&language=pt-BR`)
      .then(r => r.json())
      .then(d => setTrending((d.results ?? []).slice(0, 12)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMood = (genre: string, type: string) => {
    router.push({ pathname: "/(tabs)/search", params: { genre, type } });
  };

  return (
    <View style={[s.container]}>
      <StatusBar style="light" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 130 }}
      >
        <View style={{ height: topPad + 10 }} />

        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>Descobrir</Text>
            <Text style={s.headerSub}>Explore por humor, gênero e universo</Text>
          </View>
          <Pressable
            style={s.headerSearch}
            onPress={() => router.push("/(tabs)/search")}
          >
            <Feather name="search" size={20} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>

        <SectionTitle title="🎭 Por Humor" subtitle="Escolha como você está se sentindo" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.moodRow}>
          {MOODS.map(m => (
            <MoodPill key={m.label} label={m.label} color={m.color} onPress={() => handleMood(m.genre, m.type)} />
          ))}
        </ScrollView>

        <SectionTitle title="🌌 Universos & Franquias" subtitle="Mergulhe nos seus universos favoritos" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.universeRow}>
          {UNIVERSES.map(u => (
            <UniverseCard key={u.label} {...u} />
          ))}
        </ScrollView>

        <SectionTitle title="⚡ Coleções em Destaque" subtitle="Seleções especiais para você" />
        <View style={s.curatedList}>
          {CURATED.map(item => (
            <CuratedCard key={item.label} item={item} />
          ))}
        </View>

        <SectionTitle title="📈 Em Alta essa Semana" subtitle="O que o mundo está assistindo" />
        {loading ? (
          <ActivityIndicator color={RED} style={{ marginVertical: 20 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trendingRow}>
            {trending.map(item => (
              <TrendingCard key={item.id} item={item} />
            ))}
          </ScrollView>
        )}

        <SectionTitle title="📡 Canais ao Vivo" subtitle="Transmissões em tempo real" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveRow}>
          {[
            { name: "ESPN", sub: "NBA · Ao Vivo", color: "#ef4444", icon: "radio" },
            { name: "Fox Sports", sub: "Futebol · Ao Vivo", color: "#f59e0b", icon: "radio" },
            { name: "Combate", sub: "UFC · Em breve", color: "#7c3aed", icon: "tv" },
            { name: "Globo News", sub: "Notícias · 24h", color: "#06b6d4", icon: "tv" },
            { name: "Record", sub: "Variedades", color: "#22c55e", icon: "tv" },
            { name: "SBT", sub: "Entretenimento", color: "#ec4899", icon: "tv" },
          ].map(ch => (
            <Pressable
              key={ch.name}
              style={({ pressed }) => [s.liveCard, { borderColor: ch.color + "44", opacity: pressed ? 0.8 : 1 }]}
              onPress={() => router.push("/(tabs)/channels")}
            >
              <LinearGradient colors={[ch.color + "20", "rgba(0,0,0,0.5)"]} style={StyleSheet.absoluteFill} />
              <View style={[s.liveDot, { backgroundColor: ch.color }]} />
              <View style={s.liveIconWrap}>
                <Feather name={ch.icon as any} size={20} color={ch.color} />
              </View>
              <Text style={s.liveName}>{ch.name}</Text>
              <Text style={s.liveSub}>{ch.sub}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "800" },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 2 },
  headerSearch: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B,
    alignItems: "center", justifyContent: "center",
  },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 14, marginTop: 8 },
  sectionTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  sectionSub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 },
  moodRow: { paddingHorizontal: 20, gap: 10, paddingBottom: 4 },
  moodPill: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1, overflow: "hidden",
  },
  moodLabel: { fontSize: 13, fontWeight: "700" },
  universeRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
  universeCard: {
    width: 100, height: 100, borderRadius: 18,
    borderWidth: 1, overflow: "hidden",
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  universeEmoji: { fontSize: 28 },
  universeLabel: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  curatedList: { paddingHorizontal: 20, gap: 10, marginBottom: 8 },
  curatedCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, overflow: "hidden",
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_B,
  },
  curatedIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  curatedLabel: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  trendingRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
  trendingCard: {
    width: (SW - 60) / 2.5,
    height: ((SW - 60) / 2.5) * 1.5,
    borderRadius: 14, overflow: "hidden",
    backgroundColor: "#1a1a1a",
  },
  trendingPoster: { width: "100%", height: "100%" },
  trendingGrad: { ...StyleSheet.absoluteFillObject, top: "40%" },
  trendingInfo: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10 },
  trendingTitle: { color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 15 },
  trendingMeta: { color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 },
  liveRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
  liveCard: {
    width: 120, padding: 14, borderRadius: 16,
    borderWidth: 1, overflow: "hidden",
    backgroundColor: GLASS, alignItems: "center", gap: 8,
  },
  liveDot: { position: "absolute", top: 10, right: 10, width: 7, height: 7, borderRadius: 4 },
  liveIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  liveName: { color: "#fff", fontSize: 13, fontWeight: "700", textAlign: "center" },
  liveSub: { color: "rgba(255,255,255,0.45)", fontSize: 10, textAlign: "center" },
});
