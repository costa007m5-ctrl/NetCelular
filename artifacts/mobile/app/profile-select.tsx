import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/supabase";

const PROFILES_KEY = "netplay_profiles_v2";
const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
const MAX_PROFILES = 4;

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
  try {
    const remote = await db.profiles.getAll(userId);
    if (remote.length > 0) {
      const profiles = remote.map(dbToProfile);
      await cacheProfiles(profiles);
      return profiles;
    }
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const all: NetplayProfile[] = JSON.parse(raw);
    return all.filter((p) => p.userId === userId);
  } catch {
    return [];
  }
}

export async function saveProfile(profile: NetplayProfile): Promise<void> {
  try {
    await db.profiles.upsert({
      id: profile.id,
      user_id: profile.userId,
      name: profile.name,
      avatar_url: profile.avatarUrl ?? null,
      is_kids: profile.isKids ?? false,
    });
  } catch {}
  try {
    const raw = await AsyncStorage.getItem(PROFILES_KEY);
    const all: NetplayProfile[] = raw ? JSON.parse(raw) : [];
    const idx = all.findIndex((p) => p.id === profile.id);
    if (idx >= 0) all[idx] = profile;
    else all.push(profile);
    await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(all));
  } catch {}
}

export async function deleteProfile(profileId: string): Promise<void> {
  try {
    await db.profiles.delete(profileId);
  } catch {}
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
  } catch {
    return null;
  }
}

export async function setActiveProfile(profile: NetplayProfile | null): Promise<void> {
  try {
    if (profile) await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile));
    else await AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch {}
}

function ProfileAvatar({ profile, size = 72 }: { profile: NetplayProfile; size?: number }) {
  if (profile.avatarUrl) {
    return (
      <Image
        source={{ uri: profile.avatarUrl }}
        style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
      />
    );
  }
  const av = AVATARS[(profile.avatarIndex ?? 0) % AVATARS.length];
  return (
    <View style={[styles.avatarCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: av.bg }]}>
      <Text style={{ fontSize: size * 0.45 }}>{av.emoji}</Text>
    </View>
  );
}

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
        if (currentTab === "atores") {
          setItems(results.filter((p: any) => p.profile_path).slice(0, 24));
        } else if (currentTab === "filmes") {
          setItems(results.filter((m: any) => m.poster_path).slice(0, 24));
        } else {
          setItems(results.filter((s: any) => s.poster_path).slice(0, 24));
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSearchQ("");
    loadItems("", tab);
  }, [tab]);

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
            tab === "atores"
              ? "Buscar ator ou personagem..."
              : tab === "filmes"
              ? "Buscar filme..."
              : "Buscar série..."
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
            const url = getImageUrl(item, tab);
            const label = getLabel(item, tab);
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
    flexDirection: "row",
    backgroundColor: "#0d0d0d",
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    gap: 2,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingVertical: 8, borderRadius: 10,
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

interface EditModalProps {
  visible: boolean;
  initial?: NetplayProfile | null;
  onSave: (name: string, avatarUrl: string, isKids: boolean) => void;
  onClose: () => void;
}

function EditProfileModal({ visible, initial, onSave, onClose }: EditModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? "");
  const [isKids, setIsKids] = useState(initial?.isKids ?? false);

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? "");
      setAvatarUrl(initial?.avatarUrl ?? "");
      setIsKids(initial?.isKids ?? false);
    }
  }, [visible, initial]);

  const previewProfile: NetplayProfile = {
    id: "preview", name, avatarUrl, userId: "", avatarIndex: 0,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalBg}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.editSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{initial ? "Editar Perfil" : "Novo Perfil"}</Text>

          <View style={styles.editAvatarRow}>
            <ProfileAvatar profile={previewProfile} size={80} />
          </View>

          <Text style={styles.fieldLabel}>FOTO DO PERFIL</Text>
          <Text style={styles.fieldSubLabel}>Escolha entre atores, filmes ou séries</Text>
          <TmdbAvatarPicker selectedUrl={avatarUrl} onSelect={setAvatarUrl} />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>NOME</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Nome do perfil"
            placeholderTextColor="#555"
            maxLength={20}
            autoCorrect={false}
          />

          <Pressable style={styles.kidsRow} onPress={() => setIsKids((v) => !v)}>
            <View style={[styles.kidsCheck, isKids && styles.kidsCheckOn]}>
              {isKids && <Feather name="check" size={14} color="#fff" />}
            </View>
            <View>
              <Text style={styles.kidsLabel}>Perfil Kids</Text>
              <Text style={styles.kidsSub}>Conteúdo adequado para crianças</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.saveBtn, !name.trim() && { opacity: 0.4 }]}
            onPress={() => { if (name.trim()) onSave(name.trim(), avatarUrl, isKids); }}
            disabled={!name.trim()}
          >
            <LinearGradient colors={["#e50914", "#8b0000"]} style={StyleSheet.absoluteFill} />
            <Text style={styles.saveBtnText}>SALVAR PERFIL</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileSelectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<NetplayProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<NetplayProfile | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const list = await getProfiles(user.id);
    setProfiles(list);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = async (profile: NetplayProfile) => {
    await setActiveProfile(profile);
    router.replace("/(tabs)");
  };

  const handleAdd = () => { setEditTarget(null); setEditModal(true); };
  const handleEdit = (profile: NetplayProfile) => { setEditTarget(profile); setEditModal(true); };

  const handleSave = async (name: string, avatarUrl: string, isKids: boolean) => {
    if (!user?.id) return;
    const profile: NetplayProfile = {
      id: editTarget?.id ?? generateUUID(),
      name, avatarUrl,
      avatarIndex: editTarget?.avatarIndex ?? 0,
      userId: user.id, isKids,
    };
    await saveProfile(profile);
    setEditModal(false);
    load();
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

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color="#e50914" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0a0000", "#000000"]} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}>
          <Text style={styles.logo}><Text style={styles.logoRed}>NET</Text>PLAY</Text>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeTxt}>PREMIUM</Text>
          </View>
        </View>
        <Text style={styles.heading}>Quem vai assistir?</Text>
        <Text style={styles.sub}>Escolha ou crie um perfil para continuar</Text>

        <View style={styles.grid}>
          {profiles.map((profile) => (
            <Pressable
              key={profile.id}
              style={({ pressed }) => [styles.profileCard, { opacity: pressed ? 0.85 : 1 }]}
              onPress={() => handleSelect(profile)}
              onLongPress={() => handleEdit(profile)}
            >
              <ProfileAvatar profile={profile} size={76} />
              {profile.isKids && (
                <View style={styles.kidsBadge}>
                  <Text style={styles.kidsBadgeTxt}>KIDS</Text>
                </View>
              )}
              <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
              <Pressable style={styles.editIconBtn} onPress={() => handleEdit(profile)}>
                <Feather name="edit-2" size={13} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </Pressable>
          ))}

          {profiles.length < MAX_PROFILES && (
            <Pressable style={styles.addCard} onPress={handleAdd}>
              <View style={styles.addCircle}>
                <Feather name="plus" size={28} color="rgba(255,255,255,0.6)" />
              </View>
              <Text style={styles.addLabel}>Adicionar</Text>
            </Pressable>
          )}
        </View>

        {profiles.length > 0 && (
          <View style={styles.deleteTip}>
            <Feather name="info" size={12} color="rgba(255,255,255,0.25)" />
            <Text style={styles.deleteTipTxt}>Toque longo para editar · ✏️ para editar · 🗑 para excluir</Text>
          </View>
        )}

        {profiles.length > 0 && (
          <View style={styles.deleteRow}>
            {profiles.map((p) => (
              <Pressable key={`del-${p.id}`} style={styles.deleteBtn} onPress={() => handleDelete(p)}>
                <Feather name="trash-2" size={13} color="rgba(255,70,70,0.6)" />
                <Text style={styles.deleteTxt}>Excluir "{p.name}"</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <EditProfileModal
        visible={editModal}
        initial={editTarget}
        onSave={handleSave}
        onClose={() => setEditModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 80, paddingBottom: 48 },

  logoWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 36 },
  logo: { fontSize: 32, fontWeight: "900", color: "#fff", letterSpacing: 6 },
  logoRed: { color: "#e50914" },
  logoBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: "rgba(229,9,20,0.2)", borderWidth: 1, borderColor: "rgba(229,9,20,0.4)",
  },
  logoBadgeTxt: { color: "#e50914", fontSize: 9, fontWeight: "800", letterSpacing: 1.5 },

  heading: { fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 8 },
  sub: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", marginBottom: 44 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 20, marginBottom: 32 },
  profileCard: { alignItems: "center", gap: 10, width: 100, position: "relative" },
  avatarCircle: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  profileName: { color: "#fff", fontSize: 13, fontWeight: "600", textAlign: "center", maxWidth: 96 },
  editIconBtn: {
    position: "absolute", top: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  kidsBadge: {
    position: "absolute", top: 54, backgroundColor: "#e50914",
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  kidsBadgeTxt: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  addCard: { alignItems: "center", gap: 10, width: 100 },
  addCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed", alignItems: "center", justifyContent: "center",
  },
  addLabel: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600" },
  deleteTip: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  deleteTipTxt: { color: "rgba(255,255,255,0.25)", fontSize: 11 },
  deleteRow: { gap: 8, width: "100%", alignItems: "center" },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    backgroundColor: "rgba(255,50,50,0.07)",
    borderWidth: 1, borderColor: "rgba(255,50,50,0.12)",
  },
  deleteTxt: { color: "rgba(255,80,80,0.6)", fontSize: 12, fontWeight: "600" },

  modalBg: { flex: 1, justifyContent: "flex-end" },
  editSheet: {
    backgroundColor: "#111", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 48,
    borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    maxHeight: "90%",
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center", marginTop: 12, marginBottom: 20,
  },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 20, textAlign: "center" },
  editAvatarRow: { alignItems: "center", marginBottom: 20 },
  fieldLabel: {
    color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: "700",
    letterSpacing: 1.5, marginBottom: 4,
  },
  fieldSubLabel: {
    color: "rgba(255,255,255,0.25)", fontSize: 11,
    marginBottom: 10,
  },
  nameInput: {
    backgroundColor: "#1a1a1a", borderRadius: 12, borderWidth: 1, borderColor: "#2a2a2a",
    paddingHorizontal: 16, paddingVertical: 14,
    color: "#fff", fontSize: 16, marginBottom: 20,
  },
  kidsRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 24,
  },
  kidsCheck: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center",
  },
  kidsCheckOn: { backgroundColor: "#e50914", borderColor: "#e50914" },
  kidsLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
  kidsSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 16, alignItems: "center",
    overflow: "hidden", flexDirection: "row", justifyContent: "center", gap: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 1 },
});
