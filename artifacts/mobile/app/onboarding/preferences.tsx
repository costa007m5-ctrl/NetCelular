import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

const TMDB_IMG = (path: string) => `https://image.tmdb.org/t/p/w342${path}`;

const CONTENT_TYPES = ["Filmes", "Séries", "Anime", "Documentários"];

const DECADES = ["Anos 80", "Anos 90", "Anos 2000", "Anos 2010", "Anos 2020"];

const GENRES = [
  { id: 28, name: "Ação" }, { id: 12, name: "Aventura" }, { id: 16, name: "Animação" },
  { id: 35, name: "Comédia" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentário" },
  { id: 18, name: "Drama" }, { id: 10751, name: "Família" }, { id: 14, name: "Fantasia" },
  { id: 36, name: "História" }, { id: 27, name: "Terror" }, { id: 10402, name: "Música" },
  { id: 9648, name: "Mistério" }, { id: 10749, name: "Romance" }, { id: 878, name: "Ficção Científica" },
  { id: 10770, name: "TV Movie" }, { id: 53, name: "Suspense" }, { id: 10752, name: "Guerra" },
  { id: 37, name: "Faroeste" }, { id: 10759, name: "Ação & Aventura" },
];

const MOVIES = [
  { id: 299534, title: "Vingadores: Ultimato", poster: "/or06FN3Dka5tukK1e9sl16pB3iy.jpg" },
  { id: 634649, title: "Homem-Aranha: Sem Volta", poster: "/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg" },
  { id: 27205, title: "A Origem", poster: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg" },
  { id: 157336, title: "Interestelar", poster: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg" },
  { id: 155, title: "O Cavaleiro das Trevas", poster: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg" },
  { id: 597, title: "Titanic", poster: "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg" },
  { id: 13, title: "Forrest Gump", poster: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg" },
  { id: 680, title: "Pulp Fiction", poster: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg" },
  { id: 238, title: "O Poderoso Chefão", poster: "/3bhkrj58Vtu7enYsLegHnDmIGMX.jpg" },
  { id: 550, title: "Clube da Luta", poster: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg" },
  { id: 496243, title: "Parasita", poster: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg" },
  { id: 98, title: "Gladiador", poster: "/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg" },
  { id: 19995, title: "Avatar", poster: "/jRXYjXNq0Cs2TcJjLkki24MLp7u.jpg" },
  { id: 76341, title: "Mad Max: Estrada da Fúria", poster: "/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg" },
  { id: 1726, title: "Homem de Ferro", poster: "/78lPtwv72eTNqFW9COBV8efykqh.jpg" },
];

const SERIES = [
  { id: 1396, title: "Breaking Bad", poster: "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg" },
  { id: 1399, title: "Game of Thrones", poster: "/7WUHnWGx5OO145IRxPDUkQSh4C7.jpg" },
  { id: 66732, title: "Stranger Things", poster: "/49WJfeN0moxb9IPfGn8AIqMGskD.jpg" },
  { id: 71446, title: "La Casa de Papel", poster: "/reEMJA1uzscCbkpeRJeTT2bjqUp.jpg" },
  { id: 93405, title: "Round 6", poster: "/dDlEmu3EZ0Pgg93K2SVNLCjCSvE.jpg" },
  { id: 60574, title: "Peaky Blinders", poster: "/vUUqzWa2LnHIVqkaKVlVGkVcZIW.jpg" },
  { id: 65733, title: "Ozark", poster: "/pCGyPEPZaFMGzuHHubB1b0FbMON.jpg" },
  { id: 76479, title: "The Boys", poster: "/mY7SeH4HFFxW1hiI6cWuwCRKptN.jpg" },
  { id: 2316, title: "The Office", poster: "/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg" },
  { id: 65494, title: "The Crown", poster: "/7TXjEiB1hDZHXkx8WRjqS7LlLEe.jpg" },
  { id: 63351, title: "Narcos", poster: "/rTmal9fDbwh5F0waol2hq35U4ah.jpg" },
  { id: 46533, title: "True Detective", poster: "/tB7OVyAd5whubGBkTnLUohNODPz.jpg" },
  { id: 71912, title: "The Witcher", poster: "/cZ0d3rtvXPVvuiX22sP79K3Hmjz.jpg" },
  { id: 1668, title: "Friends", poster: "/f496cm9enuEsZkSPzCwnTESEK5s.jpg" },
  { id: 70523, title: "Dark", poster: "/apbrbWs5eSelecti9mLdkOEOgGgi.jpg" },
];

const MIN_GENRES = 3;
const MIN_MOVIES = 3;
const MIN_SERIES = 3;

export default function OnboardingPreferencesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [decades, setDecades] = useState<string[]>([]);
  const [genres, setGenres] = useState<number[]>([]);
  const [movies, setMovies] = useState<number[]>([]);
  const [series, setSeries] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], val: T, set: (a: T[]) => void) => {
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const canProceed =
    genres.length >= MIN_GENRES &&
    movies.length >= MIN_MOVIES &&
    series.length >= MIN_SERIES;

  const handleStart = async () => {
    setSaving(true);
    try {
      const prefs = { contentTypes, decades, genres, movies, series };
      await AsyncStorage.setItem("netplay_preferences", JSON.stringify(prefs));
      await AsyncStorage.setItem("netplay_onboarding_completed", "true");
      if (user?.id) {
        await supabase.from("users").update({ preferences: prefs }).eq("id", user.id).throwOnError();
      }
    } catch {}
    setSaving(false);
    router.replace("/profile-select");
  };

  const missing = [];
  if (genres.length < MIN_GENRES) missing.push(`${MIN_GENRES - genres.length} gênero${MIN_GENRES - genres.length > 1 ? "s" : ""}`);
  if (movies.length < MIN_MOVIES) missing.push(`${MIN_MOVIES - movies.length} filme${MIN_MOVIES - movies.length > 1 ? "s" : ""}`);
  if (series.length < MIN_SERIES) missing.push(`${MIN_SERIES - series.length} série${MIN_SERIES - series.length > 1 ? "s" : ""}`);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.logo}>NET<Text style={styles.logoRed}>PLAY</Text></Text>
        <Text style={styles.stepLabel}>2 de 2</Text>
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressDot} />
        <View style={styles.progressLine} />
        <View style={[styles.progressDot, styles.progressDotActive]} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Personalize seu NETPLAY</Text>
        <Text style={styles.subtitle}>Escolha o que você mais gosta para montarmos sua lista personalizada.</Text>

        <Text style={styles.sectionLabel}>Tipo de conteúdo</Text>
        <View style={styles.chipRow}>
          {CONTENT_TYPES.map((ct) => (
            <Pressable
              key={ct}
              onPress={() => toggle(contentTypes, ct, setContentTypes)}
              style={[styles.chip, contentTypes.includes(ct) && styles.chipActive]}
            >
              <Text style={[styles.chipText, contentTypes.includes(ct) && styles.chipTextActive]}>{ct}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Décadas favoritas</Text>
        <View style={styles.chipRow}>
          {DECADES.map((d) => (
            <Pressable
              key={d}
              onPress={() => toggle(decades, d, setDecades)}
              style={[styles.chip, decades.includes(d) && styles.chipActive]}
            >
              <Text style={[styles.chipText, decades.includes(d) && styles.chipTextActive]}>{d}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Gêneros favoritos</Text>
          <Text style={styles.minLabel}>{genres.length}/{MIN_GENRES} mínimo</Text>
        </View>
        <View style={styles.chipRow}>
          {GENRES.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => toggle(genres, g.id, setGenres)}
              style={[styles.chip, genres.includes(g.id) && styles.chipActive]}
            >
              <Text style={[styles.chipText, genres.includes(g.id) && styles.chipTextActive]}>{g.name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Filmes favoritos</Text>
          <Text style={styles.minLabel}>{movies.length}/{MIN_MOVIES} mínimo</Text>
        </View>
        <View style={styles.posterGrid}>
          {MOVIES.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => toggle(movies, m.id, setMovies)}
              style={[styles.posterWrap, movies.includes(m.id) && styles.posterSelected]}
            >
              <Image source={{ uri: TMDB_IMG(m.poster) }} style={styles.poster} resizeMode="cover" />
              {movies.includes(m.id) && (
                <View style={styles.posterCheck}>
                  <Feather name="check" size={14} color="#fff" />
                </View>
              )}
              {!movies.includes(m.id) && <View style={styles.posterOverlay} />}
              <Text style={styles.posterTitle} numberOfLines={2}>{m.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Séries favoritas</Text>
          <Text style={styles.minLabel}>{series.length}/{MIN_SERIES} mínimo</Text>
        </View>
        <View style={styles.posterGrid}>
          {SERIES.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => toggle(series, s.id, setSeries)}
              style={[styles.posterWrap, series.includes(s.id) && styles.posterSelected]}
            >
              <Image source={{ uri: TMDB_IMG(s.poster) }} style={styles.poster} resizeMode="cover" />
              {series.includes(s.id) && (
                <View style={styles.posterCheck}>
                  <Feather name="check" size={14} color="#fff" />
                </View>
              )}
              {!series.includes(s.id) && <View style={styles.posterOverlay} />}
              <Text style={styles.posterTitle} numberOfLines={2}>{s.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        {!canProceed && missing.length > 0 && (
          <Text style={styles.missingText}>
            Selecione mais {missing.join(", ")}
          </Text>
        )}
        <Pressable
          style={[styles.startBtn, (!canProceed || saving) && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={!canProceed || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : (
              <View style={styles.startBtnInner}>
                <Text style={styles.startBtnText}>Começar no NETPLAY</Text>
                <Feather name="play" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </View>
            )
          }
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 56, paddingHorizontal: 24, paddingBottom: 8,
  },
  backBtn: { marginRight: 12, padding: 4 },
  logo: { flex: 1, fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  logoRed: { color: "#e50914" },
  stepLabel: { fontSize: 13, color: "#555", fontWeight: "600" },
  progressRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 24, marginBottom: 20,
  },
  progressDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "#2a2a2a", borderWidth: 2, borderColor: "#333",
  },
  progressDotActive: { backgroundColor: "#e50914", borderColor: "#e50914" },
  progressLine: { flex: 1, height: 2, backgroundColor: "#e50914", marginHorizontal: 8 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { fontSize: 24, fontWeight: "800", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#888", lineHeight: 21, marginBottom: 28 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionLabel: { fontSize: 12, color: "#666", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  minLabel: { fontSize: 12, color: "#e50914", fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: "#141414",
    borderWidth: 1, borderColor: "#2a2a2a",
  },
  chipActive: { backgroundColor: "#e50914", borderColor: "#e50914" },
  chipText: { color: "#888", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  posterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 },
  posterWrap: {
    width: "30%", borderRadius: 10, overflow: "hidden",
    borderWidth: 2, borderColor: "transparent", backgroundColor: "#141414",
  },
  posterSelected: { borderColor: "#e50914" },
  poster: { width: "100%", aspectRatio: 2 / 3 },
  posterOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  posterCheck: {
    position: "absolute", top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#e50914", alignItems: "center", justifyContent: "center",
  },
  posterTitle: { color: "#aaa", fontSize: 10, padding: 6, fontWeight: "600" },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#000", borderTopWidth: 1, borderTopColor: "#1a1a1a",
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32,
  },
  missingText: { color: "#666", fontSize: 12, textAlign: "center", marginBottom: 8 },
  startBtn: {
    backgroundColor: "#e50914", borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnInner: { flexDirection: "row", alignItems: "center" },
  startBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
