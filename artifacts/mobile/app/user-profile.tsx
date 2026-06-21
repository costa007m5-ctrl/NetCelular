import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/auth-context";
import { db, supabase, type DbProfile, type WatchProgress, type WatchlistItem } from "@/lib/supabase";

const RED = "#e50914";
const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const { width: W } = Dimensions.get("window");
const VISIBILITY_KEY = "netplay_profile_visibility_v1";

type Visibility = {
  showEstatisticas: boolean;
  showMaisAssistidos: boolean;
  showMinhaLista: boolean;
  showConquistas: boolean;
};
const DEFAULT_VIS: Visibility = {
  showEstatisticas: true,
  showMaisAssistidos: true,
  showMinhaLista: true,
  showConquistas: true,
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function fmtHours(h: number) {
  if (h < 1) return "< 1h";
  return `${h}h`;
}

// ── Avatar bubble ─────────────────────────────────────────────────────────────
function AvatarBubble({ letter, uri, size = 40 }: { letter: string; uri?: string | null; size?: number }) {
  const safe = (letter || "U").toUpperCase();
  const hue = (safe.charCodeAt(0) * 37) % 360;
  return (
    <View style={[ab.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue},55%,38%)` }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
      ) : (
        <Text style={[ab.letter, { fontSize: size * 0.42 }]}>{safe}</Text>
      )}
    </View>
  );
}
const ab = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  letter: { color: "#fff", fontWeight: "700" },
});

// ── Section header ────────────────────────────────────────────────────────────
function SectionTitle({ icon, label, color = "rgba(255,255,255,0.45)", action, onAction }: {
  icon?: string; label: string; color?: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
      {icon && (
        <View style={{ marginRight: 8, backgroundColor: `${RED}22`, borderRadius: 8, width: 28, height: 28, alignItems: "center", justifyContent: "center" }}>
          <Feather name={icon as any} size={13} color={RED} />
        </View>
      )}
      <Text style={{ color, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, flex: 1 }}>{label}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: RED, fontSize: 12, fontWeight: "600" }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Poster card ───────────────────────────────────────────────────────────────
function PosterCard({ item, onPress }: { item: WatchProgress | WatchlistItem; onPress: () => void }) {
  const pct = "progress" in item ? Math.round((item.progress ?? 0) * 100) : null;
  const imgUri = item.poster_path
    ? (item.poster_path.startsWith("http") ? item.poster_path : `${TMDB_IMG}${item.poster_path}`)
    : null;
  return (
    <Pressable onPress={onPress} style={pc.card}>
      <View style={pc.inner}>
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }]}>
            <Feather name="film" size={18} color="rgba(255,255,255,0.2)" />
          </View>
        )}
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.92)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
        <View style={pc.bottom}>
          <Text style={pc.title} numberOfLines={2}>{item.title}</Text>
          {pct !== null && (
            <>
              <View style={pc.bar}>
                <View style={[pc.barFill, { width: `${pct}%` as any }]} />
              </View>
              <Text style={pc.pct}>{pct}% assistido</Text>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}
const pc = StyleSheet.create({
  card: { width: 108, marginRight: 10 },
  inner: { width: 108, height: 156, borderRadius: 10, overflow: "hidden" },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 7 },
  title: { color: "#fff", fontSize: 10, fontWeight: "700", lineHeight: 14 },
  bar: { height: 3, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, marginTop: 5 },
  barFill: { height: 3, backgroundColor: RED, borderRadius: 2 },
  pct: { color: "rgba(255,255,255,0.5)", fontSize: 8, marginTop: 2 },
});

// ── Privacy toggle row ────────────────────────────────────────────────────────
function PrivacyRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <View style={pr.row}>
      <Text style={pr.label}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: value ? "#4ade80" : "rgba(255,255,255,0.35)", fontSize: 12 }}>
          {value ? "Visível" : "Oculto"}
        </Text>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: "rgba(255,255,255,0.1)", true: `${RED}80` }}
          thumbColor={value ? RED : "rgba(255,255,255,0.5)"}
        />
      </View>
    </View>
  );
}
const pr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.07)" },
  label: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
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

  const isOwnProfile = !!user?.id && user.id === userId;

  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<{
    name: string;
    avatar_letter: string;
    avatar_url?: string | null;
    profile_banner?: string | null;
    created_at?: string | null;
  } | null>(null);
  const [profiles, setProfiles] = useState<DbProfile[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [followed, setFollowed] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  // Own-profile only data
  const [watchHistory, setWatchHistory] = useState<WatchProgress[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VIS);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // ── Computed stats (own profile) ─────────────────────────────────────────
  const watchedCount = watchHistory.length;
  const movieCount = watchHistory.filter((h) => h.type === "movie").length;
  const tvCount = watchHistory.filter((h) => h.type === "tv").length;
  const totalHours = Math.round((watchedCount * 92) / 60);
  const avgPerWeek = watchedCount > 0 ? Math.max(1, Math.round(watchedCount / 4)) : 0;
  const topWatched = useMemo(
    () => [...watchHistory].sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0)).slice(0, 12),
    [watchHistory]
  );

  // ── Fetch ────────────────────────────────────────────────────────────────
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

      if (user?.id) {
        supabase
          .from("shorts_follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", user.id)
          .eq("followed_id", userId)
          .then(({ count }) => setFollowed((count ?? 0) > 0))
          .catch(() => {});
      }

      // For own profile: load watch history, watchlist, visibility prefs
      if (isOwnProfile && user?.id) {
        const [progress, wl, vis] = await Promise.all([
          db.progress.getAll(user.id).catch(() => [] as WatchProgress[]),
          db.watchlist.getAll(user.id).catch(() => [] as WatchlistItem[]),
          AsyncStorage.getItem(VISIBILITY_KEY).catch(() => null),
        ]);
        setWatchHistory(progress);
        setWatchlist(wl);
        if (vis) {
          try { setVisibility((prev) => ({ ...prev, ...JSON.parse(vis) })); } catch {}
        }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [userId, userName, avatarLetter, avatarUrl, user?.id, isOwnProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveVisibility = async (next: Visibility) => {
    setVisibility(next);
    try { await AsyncStorage.setItem(VISIBILITY_KEY, JSON.stringify(next)); } catch {}
    if (user?.id) {
      db.userSettings.upsert(user.id, { profile_visibility: JSON.stringify(next) }).catch(() => {});
    }
  };

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
    const { error } = await supabase.from("users").update({ avatar_url: avatarUri }).eq("id", user.id);
    setApplying(null);
    if (error) Alert.alert("Erro", "Não foi possível aplicar o avatar.");
    else Alert.alert("Avatar aplicado! ✓", `O avatar de ${sourceName} foi aplicado ao seu perfil.`);
  };

  const handleUseBanner = async (bannerUri: string) => {
    if (!user) { Alert.alert("Login necessário", "Entre para usar este banner."); return; }
    setApplying(bannerUri);
    await db.users.updateBanner(user.id, bannerUri);
    setApplying(null);
    Alert.alert("Banner aplicado! ✓", "O banner foi aplicado ao seu perfil.");
  };

  const navigateToDetail = (id: number, type: "movie" | "tv", title: string) => {
    router.push({ pathname: "/detail", params: { type, id: String(id), title } });
  };

  const displayName = userData?.name ?? userName ?? "Usuário";
  const displayLetter = userData?.avatar_letter ?? avatarLetter ?? "U";
  const displayAvatar = userData?.avatar_url ?? (avatarUrl || null);
  const banner = userData?.profile_banner;

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
        <Text style={s.headerTitle}>{isOwnProfile ? "Meu Perfil" : "Perfil"}</Text>
        {isOwnProfile ? (
          <Pressable onPress={() => setShowPrivacy((v) => !v)} hitSlop={8} style={s.privacyBtn}>
            <Feather name="eye" size={18} color={showPrivacy ? RED : "rgba(255,255,255,0.5)"} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>

        {/* Banner */}
        <View style={s.bannerWrap}>
          {banner ? (
            <Image source={{ uri: banner }} style={s.banner} contentFit="cover" />
          ) : (
            <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={s.banner} />
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={s.bannerGrad} />
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
              {user && !isOwnProfile && (
                <Pressable style={[s.followBtn, followed && s.followBtnActive]} onPress={handleFollow}>
                  <Text style={[s.followBtnText, followed && s.followBtnTextActive]}>
                    {followed ? "Seguindo" : "Seguir"}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Text style={s.statValue}>{commentCount}</Text>
                <Text style={s.statLabel}>Comentários</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statValue}>{watchedCount || profiles.length}</Text>
                <Text style={s.statLabel}>{isOwnProfile ? "Assistidos" : "Perfis"}</Text>
              </View>
              {isOwnProfile && (
                <>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text style={s.statValue}>{watchlist.length}</Text>
                    <Text style={s.statLabel}>Na lista</Text>
                  </View>
                </>
              )}
            </View>

            {/* ── PRIVACY PANEL (own profile only) ─────────────────────────── */}
            {isOwnProfile && showPrivacy && (
              <View style={s.section}>
                <SectionTitle icon="eye" label="Privacidade do Perfil" />
                <View style={s.card}>
                  <Text style={s.cardNote}>Controle o que outras pessoas podem ver no seu perfil.</Text>
                  <PrivacyRow
                    label="Estatísticas"
                    value={visibility.showEstatisticas}
                    onToggle={(v) => saveVisibility({ ...visibility, showEstatisticas: v })}
                  />
                  <PrivacyRow
                    label="Mais Assistidos"
                    value={visibility.showMaisAssistidos}
                    onToggle={(v) => saveVisibility({ ...visibility, showMaisAssistidos: v })}
                  />
                  <PrivacyRow
                    label="Minha Lista"
                    value={visibility.showMinhaLista}
                    onToggle={(v) => saveVisibility({ ...visibility, showMinhaLista: v })}
                  />
                  <View style={[pr.row, { borderBottomWidth: 0 }]}>
                    <Text style={pr.label}>Conquistas</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: visibility.showConquistas ? "#4ade80" : "rgba(255,255,255,0.35)", fontSize: 12 }}>
                        {visibility.showConquistas ? "Visível" : "Oculto"}
                      </Text>
                      <Switch
                        value={visibility.showConquistas}
                        onValueChange={(v) => saveVisibility({ ...visibility, showConquistas: v })}
                        trackColor={{ false: "rgba(255,255,255,0.1)", true: `${RED}80` }}
                        thumbColor={visibility.showConquistas ? RED : "rgba(255,255,255,0.5)"}
                      />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ── ESTATÍSTICAS (own profile) ───────────────────────────────── */}
            {isOwnProfile && visibility.showEstatisticas && watchedCount > 0 && (
              <View style={s.section}>
                <SectionTitle icon="bar-chart-2" label="Estatísticas" />
                <View style={s.statsGrid}>
                  {[
                    { icon: "film", label: "Filmes", val: String(movieCount), color: "#f59e0b" },
                    { icon: "tv", label: "Séries", val: String(tvCount), color: "#a78bfa" },
                    { icon: "clock", label: "Assistidas", val: fmtHours(totalHours), color: "#0ea5e9" },
                    { icon: "trending-up", label: "Por semana", val: `~${avgPerWeek}`, color: "#4ade80" },
                  ].map((item) => (
                    <View key={item.label} style={[s.statCard, { borderColor: item.color + "30" }]}>
                      <View style={[s.statCardIcon, { backgroundColor: item.color + "20" }]}>
                        <Feather name={item.icon as any} size={14} color={item.color} />
                      </View>
                      <Text style={[s.statCardVal, { color: item.color }]}>{item.val}</Text>
                      <Text style={s.statCardLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
                {/* Most watched genre indicator */}
                {topWatched[0] && (
                  <View style={s.featuredCard}>
                    {topWatched[0].poster_path ? (
                      <Image
                        source={{ uri: topWatched[0].poster_path.startsWith("http") ? topWatched[0].poster_path : `${TMDB_IMG}${topWatched[0].poster_path}` }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                    ) : null}
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.9)"]} style={StyleSheet.absoluteFill} />
                    <View style={s.featuredInner}>
                      <Text style={s.featuredLabel}>🏆 Mais assistido</Text>
                      <Text style={s.featuredTitle}>{topWatched[0].title}</Text>
                      <View style={{ height: 3, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, marginTop: 6 }}>
                        <View style={{ width: `${Math.round((topWatched[0].progress ?? 0) * 100)}%` as any, height: 3, backgroundColor: RED, borderRadius: 2 }} />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── MAIS ASSISTIDOS (own profile) ───────────────────────────── */}
            {isOwnProfile && visibility.showMaisAssistidos && topWatched.length > 0 && (
              <View style={s.section}>
                <SectionTitle icon="play-circle" label="Mais Assistidos" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
                  {topWatched.map((item) => (
                    <PosterCard
                      key={`${item.tmdb_id}-${item.type}`}
                      item={item}
                      onPress={() => navigateToDetail(item.tmdb_id, item.type, item.title)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── MINHA LISTA / FAVORITOS (own profile) ───────────────────── */}
            {isOwnProfile && visibility.showMinhaLista && watchlist.length > 0 && (
              <View style={s.section}>
                <SectionTitle icon="bookmark" label="Minha Lista" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
                  {watchlist.map((item) => (
                    <PosterCard
                      key={`${item.tmdb_id}-${item.type}`}
                      item={item}
                      onPress={() => navigateToDetail(item.tmdb_id, item.type, item.title)}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ── EMPTY STATE (own profile, no content yet) ────────────────── */}
            {isOwnProfile && watchedCount === 0 && watchlist.length === 0 && (
              <View style={s.emptyWrap}>
                <Feather name="tv" size={36} color="rgba(255,255,255,0.15)" />
                <Text style={s.emptyTitle}>Nenhum conteúdo ainda</Text>
                <Text style={s.emptyText}>Comece a assistir para que seu histórico apareça aqui.</Text>
              </View>
            )}

            {/* ── BANNER (outros usuários) ─────────────────────────────────── */}
            {banner && user && !isOwnProfile && (
              <View style={s.section}>
                <SectionTitle label="Banner" />
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

            {/* ── AVATARES ─────────────────────────────────────────────────── */}
            {avatarGallery.length > 0 && (
              <View style={s.section}>
                <SectionTitle label="Avatares" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
                  {avatarGallery.map((av) => (
                    <View key={av.uri} style={s.avatarCard}>
                      <AvatarBubble letter={displayLetter} uri={av.uri} size={64} />
                      <Text style={s.avatarCardLabel} numberOfLines={1}>{av.label}</Text>
                      {user && !isOwnProfile && (
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

            {/* ── PERFIS DA CONTA ──────────────────────────────────────────── */}
            {profiles.length > 0 && (
              <View style={s.section}>
                <SectionTitle label="Perfis da conta" />
                <View style={s.profilesGrid}>
                  {profiles.map((p) => (
                    <View key={p.id} style={s.profileCard}>
                      <AvatarBubble letter={p.name[0]?.toUpperCase() ?? "U"} uri={p.avatar_url} size={52} />
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
  privacyBtn: { width: 40, alignItems: "flex-end" },
  bannerWrap: { width: W, height: 180, position: "relative" },
  banner: { width: "100%", height: "100%" },
  bannerGrad: { ...StyleSheet.absoluteFillObject },
  avatarOverBanner: {
    position: "absolute", bottom: -40, left: 20,
    borderRadius: 44, borderWidth: 3, borderColor: "#0a0a0a",
  },
  loadingWrap: { alignItems: "center", paddingTop: 60 },
  nameRow: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, gap: 12,
  },
  name: { color: "#fff", fontSize: 22, fontWeight: "800" },
  memberSince: { color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 3 },
  followBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.35)",
  },
  followBtnActive: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.12)" },
  followBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  followBtnTextActive: { color: RED },
  statsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 20, paddingVertical: 16, marginHorizontal: 20, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)", marginBottom: 8,
  },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "800" },
  statLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "600" },
  statDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.12)" },
  section: { paddingHorizontal: 20, marginTop: 24 },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)",
  },
  cardNote: { color: "rgba(255,255,255,0.4)", fontSize: 12, paddingVertical: 12, lineHeight: 18 },
  statsGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginBottom: 14 },
  statCard: {
    flex: 1, minWidth: "45%", backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14, borderWidth: 1, alignItems: "center", paddingVertical: 14, gap: 4,
  },
  statCardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statCardVal: { fontSize: 22, fontWeight: "900" },
  statCardLabel: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  featuredCard: {
    width: "100%", height: 120, borderRadius: 14, overflow: "hidden",
    backgroundColor: "#1a1a1a", marginBottom: 4,
  },
  featuredInner: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14 },
  featuredLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginBottom: 2 },
  featuredTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  emptyWrap: { alignItems: "center", paddingTop: 32, paddingHorizontal: 40, gap: 10 },
  emptyTitle: { color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: "700" },
  emptyText: { color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", lineHeight: 20 },
  bannerPreviewWrap: { marginTop: 10, borderRadius: 12, overflow: "hidden" },
  bannerPreview: { width: "100%", height: 100, borderRadius: 12 },
  useBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: 10, backgroundColor: RED, borderRadius: 10, paddingVertical: 11,
  },
  useBtnLoading: { opacity: 0.6 },
  useBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  avatarCard: { alignItems: "center", gap: 6, width: 80 },
  avatarCardLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, textAlign: "center" },
  useAvatarBtn: { borderWidth: 1, borderColor: RED, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 5 },
  useAvatarBtnText: { color: RED, fontSize: 12, fontWeight: "700" },
  profilesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 4 },
  profileCard: { alignItems: "center", gap: 6, width: 72 },
  profileCardName: { color: "rgba(255,255,255,0.7)", fontSize: 12, textAlign: "center" },
  kidsBadge: { backgroundColor: "#2563eb", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  kidsBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
