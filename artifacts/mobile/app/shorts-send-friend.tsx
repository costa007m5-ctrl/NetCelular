import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { sendPushViaServer } from "@/lib/notifications";

const ACCENT = "#e50914";

interface UserResult {
  id: string;
  name: string;
  email: string;
  avatar_letter: string;
  avatar_url?: string | null;
}

function UserRow({
  user,
  onSend,
  sending,
  sent,
}: {
  user: UserResult;
  onSend: () => void;
  sending: boolean;
  sent: boolean;
}) {
  return (
    <View style={s.userRow}>
      {/* Avatar */}
      <View style={s.avatarWrap}>
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={s.avatar} contentFit="cover" />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarLetter}>{user.avatar_letter}</Text>
          </View>
        )}
      </View>

      {/* Name + email */}
      <View style={s.userInfo}>
        <Text style={s.userName} numberOfLines={1}>{user.name}</Text>
        <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>
      </View>

      {/* Send button */}
      <TouchableOpacity
        style={[s.sendBtn, sent && s.sendBtnSent]}
        onPress={onSend}
        disabled={sending || sent}
        activeOpacity={0.75}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : sent ? (
          <Feather name="check" size={16} color="#fff" />
        ) : (
          <Feather name="send" size={15} color="#fff" />
        )}
        <Text style={s.sendBtnText}>{sent ? "Enviado!" : "Enviar"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ShortsSendFriendScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const { user } = useAuth();

  const params = useLocalSearchParams<{
    tmdbId: string;
    type: string;
    title: string;
    poster?: string;
    overview?: string;
    year?: string;
    rating?: string;
    genre?: string;
  }>();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchUsers = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const { data, error: sbErr } = await supabase
        .from("users")
        .select("id, name, email, avatar_letter, avatar_url")
        .or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
        .neq("id", user?.id ?? "")      // exclude self
        .limit(20);

      if (sbErr) throw sbErr;
      setResults((data ?? []) as UserResult[]);
    } catch {
      setError("Erro ao buscar usuários. Tente novamente.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [user?.id]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchUsers(query), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchUsers]);

  const handleSend = useCallback(async (recipient: UserResult) => {
    if (sendingId) return;
    setSendingId(recipient.id);

    try {
      // Get push token for this user
      const { data: tokenRows } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("user_id", recipient.id)
        .limit(1);

      const token: string | null = (tokenRows?.[0] as any)?.token ?? null;

      if (!token) {
        setError(`${recipient.name} não possui notificações ativas.`);
        setSendingId(null);
        return;
      }

      const senderName = user?.name ?? user?.email ?? "Alguém";
      const title = params.title ?? "um Short";
      const typeLabel = params.type === "tv" ? "série" : "filme";

      await sendPushViaServer(
        `🎬 ${senderName} indicou um Short!`,
        `"${title}" — ${typeLabel} no NETPLAY. Abra para assistir!`,
        {
          type: "shorts_friend",
          contentType: params.type ?? "movie",
          tmdbId: params.tmdbId ? Number(params.tmdbId) : null,
          title: params.title ?? "",
          senderName,
          genre: params.genre ?? "",
          year: params.year ? Number(params.year) : null,
        },
        params.poster || undefined,
        [token],
      );

      setSentIds((prev) => new Set([...prev, recipient.id]));
    } catch {
      setError("Falha ao enviar. Verifique sua conexão.");
    } finally {
      setSendingId(null);
    }
  }, [sendingId, user, params]);

  const starCount = Math.round((Number(params.rating) || 0) / 2);

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>
          Enviar para Amigo
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Short preview card */}
      <View style={s.previewCard}>
        {params.poster ? (
          <Image source={{ uri: params.poster }} style={s.previewPoster} contentFit="cover" />
        ) : (
          <View style={[s.previewPoster, s.previewPosterFallback]}>
            <Feather name="film" size={20} color="rgba(255,255,255,0.3)" />
          </View>
        )}
        <View style={s.previewInfo}>
          <Text style={s.previewTitle} numberOfLines={2}>{params.title ?? "—"}</Text>
          <View style={s.previewMeta}>
            {params.year ? <Text style={s.previewMetaText}>{params.year}</Text> : null}
            {starCount > 0 && (
              <Text style={s.previewMetaText}>{"⭐".repeat(Math.min(starCount, 5))}</Text>
            )}
          </View>
          {params.overview ? (
            <Text style={s.previewOverview} numberOfLines={2}>{params.overview}</Text>
          ) : null}
        </View>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Feather name="search" size={16} color="rgba(255,255,255,0.4)" style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder="Buscar por nome ou e-mail…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(""); setResults([]); }} hitSlop={8}>
            <Feather name="x" size={15} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Error banner */}
      {error && (
        <View style={s.errorBanner}>
          <Feather name="alert-circle" size={14} color="#fca5a5" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} hitSlop={8}>
            <Feather name="x" size={14} color="#fca5a5" />
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {searching && (
        <View style={s.centered}>
          <ActivityIndicator color={ACCENT} />
        </View>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
        <View style={s.centered}>
          <Feather name="users" size={32} color="rgba(255,255,255,0.15)" />
          <Text style={s.emptyText}>Nenhum usuário encontrado</Text>
        </View>
      )}

      {!searching && query.trim().length < 2 && (
        <View style={s.hint}>
          <Feather name="search" size={28} color="rgba(255,255,255,0.1)" />
          <Text style={s.hintText}>
            Digite o nome ou e-mail de um amigo no NETPLAY para enviar este Short
          </Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => (
          <UserRow
            user={item}
            onSend={() => handleSend(item)}
            sending={sendingId === item.id}
            sent={sentIds.has(item.id)}
          />
        )}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },

  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(229,9,20,0.3)",
  },
  previewPoster: { width: 52, height: 78, borderRadius: 8 },
  previewPosterFallback: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewInfo: { flex: 1 },
  previewTitle: { color: "#fff", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  previewMeta: { flexDirection: "row", gap: 8, marginBottom: 4 },
  previewMetaText: { color: "rgba(255,255,255,0.5)", fontSize: 11 },
  previewOverview: { color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 16 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    padding: 0,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    padding: 10,
  },
  errorText: { flex: 1, color: "#fca5a5", fontSize: 12 },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  avatarWrap: {},
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { color: "#fff", fontSize: 18, fontWeight: "800" },
  userInfo: { flex: 1 },
  userName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  userEmail: { color: "rgba(255,255,255,0.4)", fontSize: 12 },

  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: ACCENT,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 82,
    justifyContent: "center",
  },
  sendBtnSent: { backgroundColor: "#16a34a" },
  sendBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    gap: 12,
  },
  emptyText: { color: "rgba(255,255,255,0.35)", fontSize: 14 },

  hint: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 40,
    gap: 14,
  },
  hintText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
