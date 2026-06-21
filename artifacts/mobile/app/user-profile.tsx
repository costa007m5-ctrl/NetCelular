import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/lib/auth-context";
import { db, supabase, type DbProfile } from "@/lib/supabase";

const RED = "#e50914";
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const { width: W } = Dimensions.get("window");

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// ── Avatar bubble ─────────────────────────────────────────────────────────────
function AvatarBubble({ letter, uri, size = 40 }: { letter: string; uri?: string | null; size?: number }) {
  const safeLetter = (letter || "U").toUpperCase();
  const hue = (safeLetter.charCodeAt(0) * 37) % 360;
  return (
    <View style={[ab.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,38%)` }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
      ) : (
        <Text style={[ab.letter, { fontSize: size * 0.42 }]}>{safeLetter}</Text>
      )}
    </View>
  );
}
const ab = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  letter: { color: "#fff", fontWeight: "700" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function UserProfileScreen() {
  const { userId, userName, avatarLetter, avatarUrl } = useLocalSearchParams<{
    userId: string;
    userName: string;
    avatarLetter: string;
    avatarUrl: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<{
    name: string;
    avatar_letter: string;
    avatar_url?: string | null;
    profile_banner?: string | null;
    created_at?: string | null;
    member_since?: string;
  } | null>(null);
  const [profiles, setProfiles] = useState<DbProfile[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [watchedCount, setWatchedCount] = useState(0);
  const [topWatched, setTopWatched] = useState<Array<{ tmdb_id: number; type: string; title: string; poster_path: string }>>([]);
  const [followed, setFollowed] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [userRow, profilesData, commentsCount] = await Promise.all([
        db.users.getById(userId).catch(() => null),
        db.profiles.getAll(userId).catch(() => [] as DbProfile[]),
        supabase
          .from("shorts_comments")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .then(({ count }) => count ?? 0)
          .catch(() => 0),
      ]);

      setUserData({
        name: userRow?.name ?? userName ?? "Usuário",
        avatar_letter: userRow?.avatar_letter ?? avatarLetter ?? "U",
        avatar_url: userRow?.avatar_url ?? (avatarUrl || null),
        profile_banner: userRow?.profile_banner ?? null,
        created_at: userRow?.created_at ?? null,
      });
      setProfiles(profilesData);
      setCommentCount(commentsCount as number);

      // Check if current user follows this profile
      if (user?.id) {
        supabase
          .from("shorts_follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", user.id)
          .eq("followed_id", userId)
          .then(({ count }) => setFollowed((count ?? 0) > 0))
          .catch(() => {});
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [userId, userName, avatarLetter, avatarUrl, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleFollow = async () => {
    if (!user) return;
    if (followed) {
      await db.shorts.follows.unfollow(user.id, userId!);
      setFollowed(false);
    } else {
      await db.shorts.follows.follow(
        user.id, userId!,
        userData?.name ?? userName ?? "Usuário",
        userData?.avatar_letter ?? avatarLetter ?? "U",
        userData?.avatar_url ?? (avatarUrl || null),
      );
      setFollowed(true);
    }
  };

  const handleUseAvatar = async (avatarUri: string, sourceName: string) => {
    if (!user) { Alert.alert("Login necessário", "Entre para usar este avatar."); return; }
    setApplying(avatarUri);
    const { error } = await supabase
      .from("users")
      .update({ avatar_url: avatarUri })
      .eq("id", user.id);
    setApplying(null);
    if (error) {
      Alert.alert("Erro", "Não foi possível aplicar o avatar.");
    } else {
      Alert.alert("Avatar aplicado! ✓", `O avatar de ${sourceName} foi aplicado ao seu perfil.`);
    }
  };

  const handleUseBanner = async (bannerUri: string) => {
    if (!user) { Alert.alert("Login necessário", "Entre para usar este banner."); return; }
    setApplying(bannerUri);
    await db.users.updateBanner(user.id, bannerUri);
    setApplying(null);
    Alert.alert("Banner aplicado! ✓", "O banner foi aplicado ao seu perfil.");
  };

  const displayName = userData?.name ?? userName ?? "Usuário";
  const displayLetter = userData?.avatar_letter ?? avatarLetter ?? "U";
  const displayAvatar = userData?.avatar_url ?? (avatarUrl || null);
  const banner = userData?.profile_banner;

  // All available avatars (account avatar + sub-profiles with avatars)
  const avatarGallery: Array<{ uri: string; label: string }> = [];
  if (displayAvatar) avatarGallery.push({ uri: displayAvatar, label: displayName });
  for (const p of profiles) {
    if (p.avatar_url && !avatarGallery.find((a) => a.uri === p.avatar_url)) {
      avatarGallery.push({ uri: p.avatar_url, label: p.name });
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={s.headerTitle}>Perfil</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>

        {/* Banner */}
        <View style={s.bannerWrap}>
          {banner ? (
            <Image source={{ uri: banner }} style={s.banner} contentFit="cover" />
          ) : (
            <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={s.banner} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={s.bannerGrad} />

          {/* Avatar over banner */}
          <View style={s.avatarOverBanner}>
            <AvatarBubble letter={displayLetter} uri={displayAvatar} size={80} />
          </View>
        </View>

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={RED} size="large" />
          </View>
        ) : (
          <>
            {/* Name + follow */}
            <View style={s.nameRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{displayName}</Text>
                {userData?.created_at && (
                  <Text style={s.memberSince}>Membro desde {timeAgo(userData.created_at)}</Text>
                )}
              </View>
              {user && user.id !== userId && (
                <Pressable style={[s.followBtn, followed && s.followBtnActive]} onPress={handleFollow}>
                  <Text style={[s.followBtnText, followed && s.followBtnTextActive]}>
                    {followed ? "Seguindo" : "Seguir"}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Stats */}
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Text style={s.statValue}>{commentCount}</Text>
                <Text style={s.statLabel}>Comentários</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statValue}>{profiles.length}</Text>
                <Text style={s.statLabel}>Perfis</Text>
              </View>
            </View>

            {/* Banner section */}
            {banner && user && user.id !== userId && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Banner</Text>
                <View style={s.bannerPreviewWrap}>
                  <Image source={{ uri: banner }} style={s.bannerPreview} contentFit="cover" />
                  <Pressable
                    style={[s.useBtn, applying === banner && s.useBtnLoading]}
                    onPress={() => handleUseBanner(banner)}
                    disabled={!!applying}
                  >
                    {applying === banner ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="download" size={13} color="#fff" />
                        <Text style={s.useBtnText}>Usar este banner</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* Avatar gallery */}
            {avatarGallery.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Avatares</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingRight: 8 }}
                  style={{ marginTop: 12 }}
                >
                  {avatarGallery.map((av) => (
                    <View key={av.uri} style={s.avatarCard}>
                      <AvatarBubble letter={displayLetter} uri={av.uri} size={64} />
                      <Text style={s.avatarCardLabel} numberOfLines={1}>{av.label}</Text>
                      {user && user.id !== userId && (
                        <Pressable
                          style={[s.useAvatarBtn, applying === av.uri && s.useBtnLoading]}
                          onPress={() => handleUseAvatar(av.uri, av.label)}
                          disabled={!!applying}
                        >
                          {applying === av.uri ? (
                            <ActivityIndicator color={RED} size="small" />
                          ) : (
                            <Text style={s.useAvatarBtnText}>Usar</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Sub-profiles */}
            {profiles.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Perfis da conta</Text>
                <View style={s.profilesGrid}>
                  {profiles.map((p) => (
                    <View key={p.id} style={s.profileCard}>
                      <AvatarBubble
                        letter={p.name[0]?.toUpperCase() ?? "U"}
                        uri={p.avatar_url}
                        size={52}
                      />
                      <Text style={s.profileCardName} numberOfLines={1}>{p.name}</Text>
                      {p.is_kids && (
                        <View style={s.kidsBadge}>
                          <Text style={s.kidsBadgeText}>Kids</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a0a0a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { flex: 1, color: "#fff", fontSize: 17, fontWeight: "700", textAlign: "center" },
  bannerWrap: { width: W, height: 180, position: "relative" },
  banner: { width: "100%", height: "100%" },
  bannerGrad: { ...StyleSheet.absoluteFillObject },
  avatarOverBanner: {
    position: "absolute",
    bottom: -40,
    left: 20,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#0a0a0a",
  },
  loadingWrap: { alignItems: "center", paddingTop: 60 },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    gap: 12,
  },
  name: { color: "#fff", fontSize: 22, fontWeight: "800" },
  memberSince: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 3 },
  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  followBtnActive: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.12)" },
  followBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  followBtnTextActive: { color: RED },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 16,
    marginHorizontal: 20,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "600" },
  statDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.12)" },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  bannerPreviewWrap: { marginTop: 10, borderRadius: 12, overflow: "hidden" },
  bannerPreview: { width: "100%", height: 100, borderRadius: 12 },
  useBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: RED,
    borderRadius: 10,
    paddingVertical: 11,
  },
  useBtnLoading: { opacity: 0.6 },
  useBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  avatarCard: { alignItems: "center", gap: 6, width: 80 },
  avatarCardLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, textAlign: "center" },
  useAvatarBtn: {
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  useAvatarBtnText: { color: RED, fontSize: 12, fontWeight: "700" },
  profilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 12,
  },
  profileCard: { alignItems: "center", gap: 6, width: 72 },
  profileCardName: { color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center" },
  kidsBadge: {
    backgroundColor: "#2563eb",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kidsBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
