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

const PROFILES_KEY = "netplay_profiles_v2";
const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";
const MAX_PROFILES = 4;

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

export async function getProfiles(userId: string): Promise<NetplayProfile[]> {
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

function TmdbAvatarPicker({ selectedUrl, onSelect }: { selectedUrl: string; onSelect: (url: string) => void }) {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const debRef = useRef<any>(null);

  const loadPeople = (q: string) => {
    setLoading(true);
    const url = q.trim()
      ? `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&include_adult=false`
      : `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_KEY}`;
    fetch(url)
      .then(r => r.json())
      .then(d => setPeople((d.results ?? []).filter((p: any) => p.profile_path).slice(0, 20)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPeople(""); }, []);

  const handleSearch = (q: string) => {
    setSearchQ(q);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => loadPeople(q), 450);
  };

  return (
    <View>
      <View style={ap.searchRow}>
        <Feather name="search" size={14} color="#555" />
        <TextInput
          value={searchQ}
          onChangeText={handleSearch}
          placeholder="Buscar ator ou personagem..."
          placeholderTextColor="#555"
          style={ap.searchInput}
          autoCorrect={false}
        />
        {searchQ.length > 0 && (
          <Pressable onPress={() => { setSearchQ(""); loadPeople(""); }}>
            <Feather name="x" size={14} color="#555" />
          </Pressable>
        )}
      </View>
      {loading ? (
        <ActivityIndicator color="#e50914" style={{ marginVertical: 12 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ap.grid}>
          {people.map((person) => {
            const url = `https://image.tmdb.org/t/p/w185${person.profile_path}`;
            const selected = selectedUrl === url;
            return (
              <Pressable key={person.id} onPress={() => onSelect(url)} style={[ap.item, selected && ap.itemSelected]}>
                <Image source={{ uri: url }} style={ap.photo} contentFit="cover" />
                {selected && (
                  <View style={ap.checkBadge}>
                    <Feather name="check" size={10} color="#fff" />
                  </View>
                )}
                <Text style={ap.name} numberOfLines={1}>{person.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const ap = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#2a2a2a",
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 13 },
  grid: { gap: 10, paddingVertical: 4 },
  item: { alignItems: "center", gap: 4, width: 60, borderRadius: 8, borderWidth: 2, borderColor: "transparent", padding: 2 },
  itemSelected: { borderColor: "#e50914" },
  photo: { width: 52, height: 52, borderRadius: 26 },
  checkBadge: {
    position: "absolute", top: 2, right: 2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#e50914", alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 9, color: "rgba(255,255,255,0.55)", textAlign: "center", width: 56 },
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

          <Pressable
            style={styles.kidsRow}
            onPress={() => setIsKids((v) => !v)}
          >
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
            <Text style={styles.saveBtnText}>SALVAR</Text>
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

  const handleAdd = () => {
    setEditTarget(null);
    setEditModal(true);
  };

  const handleEdit = (profile: NetplayProfile) => {
    setEditTarget(profile);
    setEditModal(true);
  };

  const handleSave = async (name: string, avatarUrl: string, isKids: boolean) => {
    if (!user?.id) return;
    const profile: NetplayProfile = {
      id: editTarget?.id ?? `${user.id}_${Date.now()}`,
      name,
      avatarUrl,
      avatarIndex: editTarget?.avatarIndex ?? 0,
      userId: user.id,
      isKids,
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
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deleteProfile(profile.id);
            load();
          },
        },
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
        <Text style={styles.logo}><Text style={styles.logoRed}>NET</Text>PLAY</Text>
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
            <Text style={styles.deleteTipTxt}>Pressione o ✏️ para editar ou excluir um perfil</Text>
          </View>
        )}

        {profiles.map((p) => null)}
        {profiles.length > 0 && profiles.some((p) => true) && (
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

  logo: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: 5, marginBottom: 36 },
  logoRed: { color: "#e50914" },
  heading: { fontSize: 26, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 8 },
  sub: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", marginBottom: 44 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 20,
    marginBottom: 32,
  },
  profileCard: {
    alignItems: "center",
    gap: 10,
    width: 100,
    position: "relative",
  },
  avatarCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  profileName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 96,
  },
  editIconBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  kidsBadge: {
    position: "absolute",
    top: 54,
    backgroundColor: "#e50914",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  kidsBadgeTxt: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },

  addCard: { alignItems: "center", gap: 10, width: 100 },
  addCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addLabel: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600" },

  deleteTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  deleteTipTxt: { color: "rgba(255,255,255,0.25)", fontSize: 11 },
  deleteRow: { gap: 8, width: "100%", alignItems: "center" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,50,50,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,50,50,0.12)",
  },
  deleteTxt: { color: "rgba(255,80,80,0.6)", fontSize: 12, fontWeight: "600" },

  modalBg: { flex: 1, justifyContent: "flex-end" },
  editSheet: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  sheetTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 24, textAlign: "center" },

  editAvatarRow: { alignItems: "center", marginBottom: 24 },
  avatarPicker: { paddingVertical: 8, gap: 10, paddingHorizontal: 4, marginBottom: 16 },
  avatarOption: { borderRadius: 30, borderWidth: 2, borderColor: "transparent" },
  avatarOptionActive: { borderColor: "#e50914" },
  avatarOptionInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  fieldLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 16,
    marginBottom: 20,
  },
  kidsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 24,
  },
  kidsCheck: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  kidsCheckOn: { backgroundColor: "#e50914", borderColor: "#e50914" },
  kidsLabel: { color: "#fff", fontSize: 14, fontWeight: "600" },
  kidsSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 },

  saveBtn: {
    backgroundColor: "#e50914",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 1 },
});
