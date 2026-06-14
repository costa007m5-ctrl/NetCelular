import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/supabase";
import { getApiBase } from "@/lib/api";

const { width: SW, height: SH } = Dimensions.get("window");

const PROFILES_KEY = "netplay_profiles_v2";
const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
const MAX_PROFILES = 4;

const TMDB_BACKDROP = "https://image.tmdb.org/t/p/original";

interface Banner { title: string; backdrop: string; rank: number; type: string; logoPath?: string; tmdbId?: number; mediaType?: "movie" | "tv" }

const FALLBACK_BANNERS: Banner[] = [
  { title: "Oppenheimer",   backdrop: `${TMDB_BACKDROP}/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg`, rank: 1, type: "filmes",  tmdbId: 872585, mediaType: "movie" },
  { title: "Duna: Parte 2", backdrop: `${TMDB_BACKDROP}/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg`, rank: 2, type: "filmes",  tmdbId: 693134, mediaType: "movie" },
  { title: "The Last of Us",backdrop: `${TMDB_BACKDROP}/uDgy6hyPd82kOHh6I95kkZaEKc.jpg`,  rank: 1, type: "séries",  tmdbId: 100088, mediaType: "tv"    },
  { title: "Dune",          backdrop: `${TMDB_BACKDROP}/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg`, rank: 3, type: "filmes",  tmdbId: 438631, mediaType: "movie" },
  { title: "Extraction 2",  backdrop: `${TMDB_BACKDROP}/56v2KjBlU4XaOv9rVYEQypROD7P.jpg`, rank: 5, type: "filmes",  tmdbId: 697843, mediaType: "movie" },
];

const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w500";

async function fetchLogo(base: string, type: "movie" | "tv", id: number): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`${base}/tmdb/franchise-logo?type=${type}&id=${id}`, { signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!r.ok) return undefined;
    const d = await r.json();
    return d.logo_path ? `${TMDB_LOGO_BASE}${d.logo_path}` : undefined;
  } catch { return undefined; }
}

async function fetchTrendingBanners(): Promise<Banner[]> {
  try {
    const base = getApiBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/tmdb/trending`, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      // Still try to fetch logos for fallback banners
      const withLogos = await Promise.all(
        FALLBACK_BANNERS.map(async (b) => ({
          ...b,
          logoPath: b.tmdbId ? await fetchLogo(base, b.mediaType!, b.tmdbId) : undefined,
        }))
      );
      return withLogos;
    }
    const data = await res.json();
    const items: any[] = [...(data.movies ?? []), ...(data.tv ?? [])];
    const withBackdrop = items.filter((i: any) => i.backdrop_path);
    if (withBackdrop.length < 3) return FALLBACK_BANNERS;
    const shuffled = withBackdrop.sort(() => Math.random() - 0.5).slice(0, 8);
    const base_banners = shuffled.map((item: any, idx: number) => ({
      title: item.title ?? item.name ?? "",
      backdrop: `${TMDB_BACKDROP}${item.backdrop_path}`,
      rank: idx + 1,
      type: (item.media_type === "tv" || item.name) ? "séries" : "filmes",
      tmdbId: item.id as number,
      mediaType: (item.media_type === "tv" ? "tv" : "movie") as "movie" | "tv",
      logoPath: undefined as string | undefined,
    }));
    // Fetch logos in parallel (best-effort)
    const withLogos = await Promise.all(
      base_banners.map(async (b) => ({
        ...b,
        logoPath: b.tmdbId ? await fetchLogo(base, b.mediaType, b.tmdbId) : undefined,
      }))
    );
    return withLogos;
  } catch {
    return FALLBACK_BANNERS;
  }
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface NetplayProfile {
  id: string;
  name: string;
  avatarIndex?: number;
  avatarUrl?: string;
  userId: string;
  isKids?: boolean;
}

export const AVATARS = [
  { emoji: "⚡", bg: "#e50914" },
  { emoji: "🎬", bg: "#1d4ed8" },
  { emoji: "🏆", bg: "#d97706" },
  { emoji: "🎮", bg: "#7c3aed" },
  { emoji: "🎵", bg: "#059669" },
  { emoji: "🚀", bg: "#0891b2" },
  { emoji: "🦊", bg: "#ea580c" },
  { emoji: "🐺", bg: "#4b5563" },
  { emoji: "🐉", bg: "#dc2626" },
  { emoji: "🦁", bg: "#b45309" },
  { emoji: "🎭", bg: "#7c3aed" },
  { emoji: "🌙", bg: "#4f46e5" },
  { emoji: "⭐", bg: "#ca8a04" },
  { emoji: "🔥", bg: "#dc2626" },
  { emoji: "🌊", bg: "#0284c7" },
  { emoji: "🎯", bg: "#16a34a" },
  { emoji: "💎", bg: "#0891b2" },
  { emoji: "👑", bg: "#d97706" },
  { emoji: "🎲", bg: "#7c3aed" },
  { emoji: "🌺", bg: "#e11d48" },
  { emoji: "🦋", bg: "#0ea5e9" },
  { emoji: "🎸", bg: "#65a30d" },
  { emoji: "🍿", bg: "#e50914" },
  { emoji: "🧙", bg: "#7c3aed" },
];

function dbToProfile(p: { id: string; user_id: string; name: string; avatar_url?: string | null; is_kids: boolean }): NetplayProfile {
  return { id: p.id, name: p.name, avatarUrl: p.avatar_url ?? undefined, userId: p.user_id, isKids: p.is_kids };
}

async function cacheProfiles(profiles: NetplayProfile[]): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    const all: NetplayProfile[] = raw ? JSON.parse(raw) : [];
    const otherUsers = all.filter((p) => p.userId !== profiles[0]?.userId);
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify([...otherUsers, ...profiles]));
  } catch {}
}

export async function getProfiles(userId: string): Promise<NetplayProfile[]> {
  let dbProfiles: NetplayProfile[] = [];
  try {
    const remote = await db.profiles.getAll(userId);
    dbProfiles = remote.map(dbToProfile);
  } catch (e: any) {
    console.error("[profiles] getAll error:", String(e?.message ?? e));
  }
  if (dbProfiles.length > 0) {
    await cacheProfiles(dbProfiles);
    return dbProfiles;
  }
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const all: NetplayProfile[] = JSON.parse(raw);
    return all.filter((p) => p.userId === userId);
  } catch {
    return [];
  }
}

export async function saveProfile(profile: NetplayProfile): Promise<{ dbError?: string }> {
  let dbError: string | undefined;
  try {
    const result = await db.profiles.upsert({
      id: profile.id,
      user_id: profile.userId,
      name: profile.name,
      avatar_url: profile.avatarUrl ?? null,
      is_kids: profile.isKids ?? false,
    });
    if (result.error) { dbError = result.error; }
  } catch (e: any) {
    dbError = String(e?.message ?? e);
  }
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    const all: NetplayProfile[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex((p) => p.id === profile.id);
    if (idx >= 0) all[idx] = profile;
    else all.push(profile);
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(all));
  } catch {}
  return dbError ? { dbError } : {};
}

export async function deleteProfile(profileId: string): Promise<void> {
  try { await db.profiles.delete(profileId); } catch {}
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    const all: NetplayProfile[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(all.filter((p) => p.id !== profileId)));
  } catch {}
}

export async function getActiveProfile(): Promise<NetplayProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export async function setActiveProfile(profile: NetplayProfile | null): Promise<void> {
  try {
    if (profile) await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile));
    else await AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch {}
}

// ── Profile Avatar — rounded square ──────────────────────────────────────────
function ProfileAvatar({ profile, size = 72, editMode = false }: { profile: NetplayProfile; size?: number; editMode?: boolean }) {
  const radius = Math.round(size * 0.18);
  if (profile.avatarUrl) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden" }}>
        <Image source={{ uri: profile.avatarUrl }} style={{ width: size, height: size }} contentFit="cover" />
        {editMode && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderRadius: radius }]}>
            <Feather name="edit-2" size={size * 0.28} color="#fff" />
          </View>
        )}
      </View>
    );
  }
  const av = AVATARS[(profile.avatarIndex ?? 0) % AVATARS.length];
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: av.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <Text style={{ fontSize: size * 0.45 }}>{av.emoji}</Text>
      {editMode && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }]}>
          <Feather name="edit-2" size={size * 0.28} color="#fff" />
        </View>
      )}
    </View>
  );
}

// ── TMDB Avatar Picker ────────────────────────────────────────────────────────
const TMDB_KEY = "8f0beb08cf016ec8de49e454e09879ec";
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
      .then(r => r.json())
      .then(d => {
        const results = d.results ?? [];
        if (currentTab === "atores") setItems(results.filter((p: any) => p.profile_path).slice(0, 24));
        else if (currentTab === "filmes") setItems(results.filter((m: any) => m.poster_path).slice(0, 24));
        else setItems(results.filter((s: any) => s.poster_path).slice(0, 24));
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

  const getImageUrl = (item: any, currentTab: PickerTab) => {
    if (currentTab === "atores") return `https://image.tmdb.org/t/p/w185${item.profile_path}`;
    return `https://image.tmdb.org/t/p/w185${item.poster_path}`;
  };

  const getLabel = (item: any, currentTab: PickerTab) => {
    if (currentTab === "atores") return item.name;
    return item.title ?? item.name ?? "";
  };

  const TAB_DATA: { key: PickerTab; label: string; icon: string }[] = [
    { key: "atores", label: "Atores", icon: "user" },
    { key: "filmes", label: "Filmes", icon: "film" },
    { key: "series", label: "Séries", icon: "tv" },
  ];

  return (
    <View>
      <View style={ap.tabRow}>
        {TAB_DATA.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[ap.tabBtn, tab === t.key && ap.tabBtnActive]}>
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
          placeholder={tab === "atores" ? "Buscar ator..." : tab === "filmes" ? "Buscar filme..." : "Buscar série..."}
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
            const url = getImageUrl(item, tab);
            const label = getLabel(item, tab);
            const selected = selectedUrl === url;
            return (
              <Pressable key={item.id} onPress={() => onSelect(url)} style={[ap.item, selected && ap.itemSelected]}>
                <Image source={{ uri: url }} style={ap.photo} contentFit="cover" />
                {selected && (
                  <View style={ap.checkBadge}><Feather name="check" size={10} color="#fff" /></View>
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
  tabRow: { flexDirection: "row", backgroundColor: "#0d0d0d", borderRadius: 12, padding: 3, marginBottom: 12, gap: 2 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 10 },
  tabBtnActive: { backgroundColor: "#e50914" },
  tabLabel: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.4)" },
  tabLabelActive: { color: "#fff" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#2a2a2a", paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  searchInput: { flex: 1, color: "#fff", fontSize: 13 },
  grid: { gap: 10, paddingVertical: 4 },
  item: { alignItems: "center", gap: 4, width: 68, borderRadius: 10, borderWidth: 2, borderColor: "transparent", padding: 2 },
  itemSelected: { borderColor: "#e50914" },
  photo: { width: 60, height: 60, borderRadius: 10 },
  checkBadge: { position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#e50914", alignItems: "center", justifyContent: "center" },
  name: { fontSize: 9, color: "rgba(255,255,255,0.55)", textAlign: "center", width: 64, lineHeight: 12 },
  emptyWrap: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyText: { color: "rgba(255,255,255,0.25)", fontSize: 13 },
});

// ── Edit Profile Modal ────────────────────────────────────────────────────────
interface EditModalProps {
  visible: boolean;
  initial?: NetplayProfile | null;
  saving?: boolean;
  onSave: (name: string, avatarUrl: string, isKids: boolean) => void;
  onClose: () => void;
}

function EditProfileModal({ visible, initial, saving, onSave, onClose }: EditModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? "");
  const [isKids, setIsKids] = useState(initial?.isKids ?? false);

  useEffect(() => {
    if (visible) { setName(initial?.name ?? ""); setAvatarUrl(initial?.avatarUrl ?? ""); setIsKids(initial?.isKids ?? false); }
  }, [visible, initial]);

  const previewProfile: NetplayProfile = { id: "preview", name, avatarUrl, userId: "", avatarIndex: 0 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={ms.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={ms.editSheet}>
          <View style={ms.sheetHandle} />
          <Text style={ms.sheetTitle}>{initial ? "Editar Perfil" : "Novo Perfil"}</Text>
          <View style={ms.editAvatarRow}>
            <ProfileAvatar profile={previewProfile} size={80} />
          </View>
          <Text style={ms.fieldLabel}>FOTO DO PERFIL</Text>
          <Text style={ms.fieldSubLabel}>Escolha entre atores, filmes ou séries</Text>
          <TmdbAvatarPicker selectedUrl={avatarUrl} onSelect={setAvatarUrl} />
          <Text style={[ms.fieldLabel, { marginTop: 16 }]}>NOME</Text>
          <TextInput
            style={ms.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Nome do perfil"
            placeholderTextColor="#555"
            maxLength={20}
            autoCorrect={false}
          />
          <Pressable style={ms.kidsRow} onPress={() => setIsKids((v) => !v)}>
            <View style={[ms.kidsCheck, isKids && ms.kidsCheckOn]}>
              {isKids && <Feather name="check" size={14} color="#fff" />}
            </View>
            <View>
              <Text style={ms.kidsLabel}>Perfil Kids</Text>
              <Text style={ms.kidsSub}>Conteúdo adequado para crianças</Text>
            </View>
          </Pressable>
          <Pressable
            style={[ms.saveBtn, (!name.trim() || saving) && { opacity: 0.6 }]}
            onPress={() => { if (name.trim() && !saving) onSave(name.trim(), avatarUrl, isKids); }}
            disabled={!name.trim() || saving}
          >
            <LinearGradient colors={["#e50914", "#8b0000"]} style={[StyleSheet.absoluteFill, { pointerEvents: "none" } as any]} />
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={ms.saveBtnText}>SALVAR PERFIL</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ms = StyleSheet.create({
  modalBg: { flex: 1, justifyContent: "flex-end" },
  editSheet: { backgroundColor: "#111", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 48, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)", maxHeight: "90%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center", marginTop: 12, marginBottom: 20 },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 20, textAlign: "center" },
  editAvatarRow: { alignItems: "center", marginBottom: 20 },
  fieldLabel: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  fieldSubLabel: { color: "rgba(255,255,255,0.25)", fontSize: 11, marginBottom: 10 },
  nameInput: { backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 1, borderColor: "#2a2a2a", paddingHorizontal: 16, paddingVertical: 14, color: "#fff", fontSize: 16, marginBottom: 20 },
  kidsRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 24 },
  kidsCheck: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  kidsCheckOn: { backgroundColor: "#e50914", borderColor: "#e50914" },
  kidsLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
  kidsSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center", overflow: "hidden", flexDirection: "row", justifyContent: "center", gap: 8 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ProfileSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<NetplayProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<NetplayProfile | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [banners, setBanners] = useState<Banner[]>(FALLBACK_BANNERS);

  // ── Fetch live TMDB trending banners ────────────────────────────────────────
  useEffect(() => {
    fetchTrendingBanners().then((result) => {
      setBanners(result);
    });
  }, []);

  // ── Banner slideshow ────────────────────────────────────────────────────────
  const bannerIdxRef = useRef(0);
  const [displayIdx, setDisplayIdx] = useState(0);
  const [nextDisplayIdx, setNextDisplayIdx] = useState(1);
  const crossFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      const next = (bannerIdxRef.current + 1) % banners.length;
      setNextDisplayIdx(next);
      crossFade.setValue(0);
      Animated.timing(crossFade, { toValue: 1, duration: 1200, useNativeDriver: true }).start(() => {
        bannerIdxRef.current = next;
        setDisplayIdx(next);
        crossFade.setValue(0);
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [banners]);

  const currentBanner = banners[displayIdx] ?? FALLBACK_BANNERS[0];
  const nextBanner = banners[nextDisplayIdx] ?? FALLBACK_BANNERS[1];

  // ── Profile data ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      // Race against a 4-second timeout so a slow/missing Supabase never hangs
      const list = await Promise.race<NetplayProfile[]>([
        getProfiles(user.id),
        new Promise<NetplayProfile[]>((resolve) => setTimeout(() => resolve([]), 4000)),
      ]);
      setProfiles(list);
    } catch (e) {
      console.error("[profile-select] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const handleSelect = async (profile: NetplayProfile) => {
    if (editMode) { setEditTarget(profile); setEditModal(true); return; }
    await setActiveProfile(profile);
    router.replace("/(tabs)");
  };

  const handleAdd = () => { setEditTarget(null); setEditModal(true); };

  const handleSave = async (name: string, avatarUrl: string, isKids: boolean) => {
    if (!user?.id) { Alert.alert("Erro", "Usuário não autenticado. Faça login novamente."); return; }
    setSaving(true);
    try {
      const profile: NetplayProfile = {
        id: editTarget?.id ?? generateUUID(),
        name, avatarUrl,
        avatarIndex: editTarget?.avatarIndex ?? 0,
        userId: user.id, isKids,
      };
      const result = await saveProfile(profile);
      if (result.dbError) console.warn("[profile-select] Salvo localmente, falha no banco:", result.dbError);
      setEditModal(false);
      await load();
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Não foi possível salvar o perfil. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (profile: NetplayProfile) => {
    Alert.alert(
      "Excluir Perfil",
      `Deseja excluir o perfil "${profile.name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: async () => { await deleteProfile(profile.id); load(); } },
      ]
    );
  };

  // No full-screen block — render the animated background immediately
  // and show a small inline spinner inside the profiles row while loading.

  const AVATAR_SIZE = Math.min(68, Math.floor((SW - 80) / Math.max(profiles.length + 1, 3)) - 8);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      {/* ── Full-screen banners with crossfade ─────────────────────────────── */}
      <View style={StyleSheet.absoluteFill}>
        {/* Current banner (bottom layer) */}
        <Image
          source={{ uri: currentBanner.backdrop }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        {/* Next banner fading in (top layer) */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: crossFade }]}>
          <Image
            source={{ uri: nextBanner.backdrop }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        </Animated.View>
      </View>

      {/* ── Gradient overlay — transparent top → solid black bottom ───────── */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.15)", "rgba(0,0,0,0.72)", "#000"]}
        locations={[0, 0.38, 0.62, 0.82]}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Content info in the middle of the screen ───────────────────────── */}
      <View style={s.contentInfo}>
        {currentBanner.logoPath ? (
          <Image
            source={{ uri: currentBanner.logoPath }}
            style={s.contentLogo}
            contentFit="contain"
            contentPosition="left"
          />
        ) : (
          <Text style={s.contentTitle} numberOfLines={2}>{currentBanner.title}</Text>
        )}
        <View style={s.rankRow}>
          <View style={s.rankBadge}>
            <Text style={s.rankTop}>TOP</Text>
            <Text style={s.rankNum}>10</Text>
          </View>
          <Text style={s.rankLabel}>
            Top {currentBanner.rank} em {currentBanner.type} hoje
          </Text>
        </View>
      </View>

      {/* ── Profile panel ──────────────────────────────────────────────────── */}
      <View style={[s.panel, { paddingBottom: insets.bottom + 20 }]}>

        {/* Title */}
        <Text style={[s.panelTitle, { zIndex: 1 }]}>Escolha o seu perfil</Text>

        {/* Profiles row */}
        {loading ? (
          <View style={{ height: AVATAR_SIZE + 28, justifyContent: "center", alignItems: "center", zIndex: 1, marginBottom: 20 }}>
            <ActivityIndicator color="#e50914" size="large" />
          </View>
        ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.profilesRow}
          style={{ zIndex: 1 }}
        >
          {profiles.map((profile) => (
            <Pressable
              key={profile.id}
              style={({ pressed }) => [s.profileCard, { opacity: pressed ? 0.8 : 1 }]}
              onPress={() => handleSelect(profile)}
              onLongPress={() => { setEditTarget(profile); setEditModal(true); }}
            >
              <ProfileAvatar profile={profile} size={AVATAR_SIZE} editMode={editMode} />
              {profile.isKids && (
                <View style={s.kidsBadge}><Text style={s.kidsBadgeTxt}>KIDS</Text></View>
              )}
              {/* Delete button in edit mode */}
              {editMode && (
                <Pressable
                  style={s.deleteOverlay}
                  onPress={() => handleDelete(profile)}
                >
                  <Feather name="trash-2" size={13} color="#ff6060" />
                </Pressable>
              )}
              <Text style={s.profileName} numberOfLines={1}>{profile.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        )}

        {/* Action buttons */}
        <View style={[s.actionsRow, { zIndex: 1 }]}>
          {profiles.length < MAX_PROFILES && (
            <Pressable style={s.actionBtn} onPress={handleAdd}>
              <View style={[s.actionIcon, { width: AVATAR_SIZE, height: AVATAR_SIZE }]}>
                <Feather name="plus" size={26} color="rgba(255,255,255,0.8)" />
              </View>
              <Text style={s.actionLabel}>Adicionar</Text>
            </Pressable>
          )}
          {profiles.length > 0 && (
            <Pressable style={s.actionBtn} onPress={() => setEditMode(v => !v)}>
              <View style={[s.actionIcon, { width: AVATAR_SIZE, height: AVATAR_SIZE }, editMode && s.actionIconActive]}>
                <Feather name={editMode ? "check" : "edit-2"} size={22} color={editMode ? "#e50914" : "rgba(255,255,255,0.8)"} />
              </View>
              <Text style={[s.actionLabel, editMode && { color: "#e50914" }]}>
                {editMode ? "Pronto" : "Editar"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <EditProfileModal
        visible={editModal}
        initial={editTarget}
        saving={saving}
        onSave={handleSave}
        onClose={() => setEditModal(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  contentInfo: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: SH * 0.47,
  },
  contentLogo: {
    width: SW * 0.55,
    height: 80,
    marginBottom: 10,
  },
  contentTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rankBadge: {
    backgroundColor: "#e50914",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: "center",
  },
  rankTop: { color: "#fff", fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  rankNum: { color: "#fff", fontSize: 12, fontWeight: "900", lineHeight: 13 },
  rankLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 10,
    backgroundColor: "rgba(20, 3, 2, 0.94)",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: "hidden",
  },
  panelTitle: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  profilesRow: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 18,
    marginBottom: 10,
  },
  profileCard: {
    alignItems: "center",
    gap: 8,
    position: "relative",
    overflow: "visible",
  },
  profileName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    maxWidth: 80,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  kidsBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#e50914",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  kidsBadgeTxt: { color: "#fff", fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  deleteOverlay: {
    position: "absolute",
    bottom: 24,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,60,60,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },

  actionsRow: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 4,
  },
  actionBtn: {
    alignItems: "center",
    gap: 8,
  },
  actionIcon: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconActive: {
    backgroundColor: "rgba(229,9,20,0.12)",
    borderColor: "rgba(229,9,20,0.3)",
  },
  actionLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "500",
  },
});
