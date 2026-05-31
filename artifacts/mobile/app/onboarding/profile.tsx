import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/supabase";

const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const BANNERS: { colors: [string, string]; label: string }[] = [
  { colors: ["#4a0000", "#000000"], label: "Vermelho" },
  { colors: ["#001040", "#000000"], label: "Azul" },
  { colors: ["#001a00", "#000000"], label: "Verde" },
  { colors: ["#1a0030", "#000000"], label: "Roxo" },
  { colors: ["#2a1000", "#000000"], label: "Laranja" },
  { colors: ["#001a1a", "#000000"], label: "Teal" },
  { colors: ["#1a1a00", "#000000"], label: "Ouro" },
  { colors: ["#151515", "#000000"], label: "Cinza" },
];

type PickerTab = "atores" | "filmes" | "series";

function TmdbAvatarPicker({ selectedUrl, onSelect }: { selectedUrl: string; onSelect: (url: string) => void }) {
  const [tab, setTab] = useState<PickerTab>("atores");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const debRef = useRef<any>(null);

  const loadItems = (q: string, currentTab: PickerTab) => {
    setLoading(true);
    let url = "";
    if (currentTab === "atores") {
      url = q.trim()
        ? `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&include_adult=false&language=pt-BR`
        : `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_KEY}&language=pt-BR`;
    } else if (currentTab === "filmes") {
      url = q.trim()
        ? `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&include_adult=false&language=pt-BR`
        : `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pt-BR`;
    } else {
      url = q.trim()
        ? `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&include_adult=false&language=pt-BR`
        : `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=pt-BR`;
    }
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const results = d.results ?? [];
        if (currentTab === "atores") {
          setItems(results.filter((p: any) => p.profile_path).slice(0, 24));
        } else {
          setItems(results.filter((m: any) => m.poster_path).slice(0, 24));
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setSearchQ(""); loadItems("", tab); }, [tab]);

  const handleSearch = (q: string) => {
    setSearchQ(q);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => loadItems(q, tab), 450);
  };

  const getImageUrl = (item: any) =>
    tab === "atores"
      ? `https://image.tmdb.org/t/p/w185${item.profile_path}`
      : `https://image.tmdb.org/t/p/w185${item.poster_path}`;

  const getLabel = (item: any) =>
    tab === "atores" ? item.name : (item.title ?? item.name ?? "");

  const TABS: { key: PickerTab; label: string; icon: string }[] = [
    { key: "atores", label: "Atores", icon: "user" },
    { key: "filmes", label: "Filmes", icon: "film" },
    { key: "series", label: "Séries", icon: "tv" },
  ];

  return (
    <View>
      <View style={ap.tabRow}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[ap.tabBtn, tab === t.key && ap.tabBtnActive]}
          >
            <Feather name={t.icon as any} size={12} color={tab === t.key ? "#fff" : "rgba(255,255,255,0.4)"} />
            <Text style={[ap.tabLabel, tab === t.key && ap.tabLabelActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={ap.searchRow}>
        <Feather name="search" size={14} color="#555" />
        <TextInput
          value={searchQ}
          onChangeText={handleSearch}
          placeholder={
            tab === "atores" ? "Buscar ator ou personagem..." :
            tab === "filmes" ? "Buscar filme..." : "Buscar série..."
          }
          placeholderTextColor="#555"
          style={ap.searchInput}
          autoCorrect={false}
        />
        {searchQ.length > 0 && (
          <Pressable onPress={() => { setSearchQ(""); loadItems("", tab); }}>
            <Feather name="x" size={14} color="#555" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#e50914" style={{ marginVertical: 16 }} />
      ) : items.length === 0 ? (
        <View style={ap.emptyWrap}>
          <Feather name="search" size={28} color="rgba(255,255,255,0.15)" />
          <Text style={ap.emptyText}>Nenhum resultado encontrado</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ap.grid}>
          {items.map((item) => {
            const url = getImageUrl(item);
            const label = getLabel(item);
            const selected = selectedUrl === url;
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(url)}
                style={[ap.item, selected && ap.itemSelected]}
              >
                <Image source={{ uri: url }} style={ap.photo} contentFit="cover" />
                {selected && (
                  <View style={ap.checkBadge}>
                    <Feather name="check" size={10} color="#fff" />
                  </View>
                )}
                <Text style={ap.name} numberOfLines={2}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const ap = StyleSheet.create({
  tabRow: {
    flexDirection: "row", backgroundColor: "#0d0d0d", borderRadius: 12,
    padding: 3, marginBottom: 12, gap: 2,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 8, borderRadius: 10,
  },
  tabBtnActive: { backgroundColor: "#e50914" },
  tabLabel: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#fff" },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#2a2a2a",
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 13 },
  grid: { gap: 10, paddingVertical: 4 },
  item: {
    alignItems: "center", gap: 4, width: 68,
    borderRadius: 10, borderWidth: 2, borderColor: "transparent", padding: 2,
  },
  itemSelected: { borderColor: "#e50914" },
  photo: { width: 60, height: 60, borderRadius: 10 },
  checkBadge: {
    position: "absolute", top: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#e50914", alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 9, color: "rgba(255,255,255,0.55)", textAlign: "center", width: 64, lineHeight: 12 },
  emptyWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { color: "rgba(255,255,255,0.25)", fontSize: 13 },
});

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [selectedBanner, setSelectedBanner] = useState(1);
  const [saving, setSaving] = useState(false);

  const previewLetter = (name || user?.name || "N")[0]?.toUpperCase() ?? "N";

  const handleNext = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const profileId = generateUUID();
      const profile = {
        id: profileId,
        name: name.trim(),
        avatarUrl: avatarUrl || undefined,
        userId: user?.id ?? "",
        avatarIndex: 0,
        isKids: false,
      };

      const PROFILES_KEY = "netplay_profiles_v2";
      const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
      const raw = await AsyncStorage.getItem(PROFILES_KEY).catch(() => null);
      const all = raw ? JSON.parse(raw) : [];
      all.push(profile);
      await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(all));
      await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile));

      if (user?.id) {
        await db.profiles.upsert({
          id: profileId,
          user_id: user.id,
          name: name.trim(),
          avatar_url: avatarUrl || null,
          is_kids: false,
        }).catch(() => {});
      }
    } catch {}
    setSaving(false);
    router.push("/onboarding/preferences");
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#1a0000", "#000000"]} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <Text style={styles.logo}>NET<Text style={styles.logoRed}>PLAY</Text></Text>
        <Text style={styles.stepLabel}>1 de 2</Text>
      </View>

      <View style={styles.progressRow}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressLine} />
        <View style={styles.progressDot} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Crie seu perfil</Text>
          <Text style={styles.subtitle}>Escolha uma foto e personalize seu perfil no NETPLAY.</Text>

          <View style={styles.previewCard}>
            <LinearGradient
              colors={BANNERS[selectedBanner].colors}
              style={styles.bannerPreview}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            />
            <View style={styles.previewAvatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.previewAvatarImg} contentFit="cover" />
              ) : (
                <View style={[styles.previewAvatarCircle, { backgroundColor: "#e50914" }]}>
                  <Text style={styles.previewAvatarLetter}>{previewLetter}</Text>
                </View>
              )}
            </View>
            <Text style={styles.previewName}>{name || user?.name || "Seu nome"}</Text>
          </View>

          <Text style={styles.fieldLabel}>NOME DO PERFIL</Text>
          <View style={styles.inputWrap}>
            <Feather name="user" size={16} color="#555" style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nome do perfil"
              placeholderTextColor="#555"
              maxLength={20}
              autoCorrect={false}
            />
          </View>

          <Text style={styles.fieldLabel}>FOTO DO PERFIL</Text>
          <Text style={styles.fieldSubLabel}>Escolha entre atores, personagens, filmes ou séries</Text>
          <TmdbAvatarPicker selectedUrl={avatarUrl} onSelect={setAvatarUrl} />

          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>COR DO BANNER</Text>
          <View style={styles.bannerGrid}>
            {BANNERS.map((banner, idx) => (
              <Pressable
                key={idx}
                onPress={() => setSelectedBanner(idx)}
                style={[styles.bannerOption, selectedBanner === idx && styles.bannerOptionSelected]}
              >
                <LinearGradient
                  colors={banner.colors}
                  style={styles.bannerGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                />
                {selectedBanner === idx && (
                  <View style={styles.bannerCheck}>
                    <Feather name="check" size={12} color="#fff" />
                  </View>
                )}
                <Text style={styles.bannerLabel}>{banner.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.nextBtn, (!name.trim() || saving) && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!name.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>Próximo</Text>
                <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 56 : 40, paddingHorizontal: 24, paddingBottom: 8,
  },
  logo: { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -1 },
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
  progressLine: { flex: 1, height: 2, backgroundColor: "#1e1e1e", marginHorizontal: 8 },
  scroll: { paddingHorizontal: 24, paddingBottom: 56 },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#888", lineHeight: 22, marginBottom: 24 },
  previewCard: {
    borderRadius: 16, overflow: "hidden", backgroundColor: "#141414",
    marginBottom: 28, alignItems: "center", paddingBottom: 20,
  },
  bannerPreview: { width: "100%", height: 80 },
  previewAvatarWrap: { marginTop: -36, borderWidth: 3, borderColor: "#000", borderRadius: 36 },
  previewAvatarImg: { width: 72, height: 72, borderRadius: 36 },
  previewAvatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: "center", justifyContent: "center",
  },
  previewAvatarLetter: { fontSize: 30, fontWeight: "900", color: "#fff" },
  previewName: { color: "#fff", fontSize: 15, fontWeight: "700", marginTop: 10 },
  fieldLabel: { fontSize: 12, color: "#666", fontWeight: "700", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  fieldSubLabel: { fontSize: 12, color: "#555", marginBottom: 10, marginTop: -4 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141414", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 24, borderWidth: 1, borderColor: "#2a2a2a",
  },
  input: { flex: 1, color: "#fff", fontSize: 16 },
  bannerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 32 },
  bannerOption: { width: "22%", borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  bannerOptionSelected: { borderColor: "#fff" },
  bannerGradient: { height: 44, width: "100%" },
  bannerCheck: {
    position: "absolute", top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#e50914", alignItems: "center", justifyContent: "center",
  },
  bannerLabel: { color: "#666", fontSize: 10, textAlign: "center", paddingVertical: 4, fontWeight: "600" },
  nextBtn: {
    backgroundColor: "#e50914", borderRadius: 14,
    paddingVertical: 17, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
  },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
