import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
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
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db, type ShortsCommentRow } from "@/lib/supabase";
import { sendPushViaServer } from "@/lib/notifications";

const { height: H } = Dimensions.get("window");
const SHEET_HEIGHT = H * 0.72;
const RED = "#e50914";
const ACTIVE_PROFILE_KEY = "netplay_active_profile_v2";

export type ShortComment = ShortsCommentRow;

interface MentionCandidate {
  user_id: string;
  user_name: string;
  avatar_letter: string;
  avatar_url?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  postId: string;
  tmdbId: number;
  title: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

const BUBBLE_COLORS = ["#6d28d9", "#0ea5e9", "#f59e0b", "#10b981", "#e50914", "#ec4899"];

// ── Avatar bubble ─────────────────────────────────────────────────────────────
function AvatarBubble({ letter, uri, size = 36 }: { letter: string; uri?: string | null; size?: number }) {
  const color = BUBBLE_COLORS[letter.charCodeAt(0) % BUBBLE_COLORS.length];
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.44, fontWeight: "700" }}>{letter.toUpperCase()}</Text>
    </View>
  );
}

interface UserProfile {
  name: string | null;
  avatar_letter: string | null;
  avatar_url: string | null;
  member_since: string | null;
  comment_count: number;
  watched_count: number;
  total_hours: number;
  watchlist_count: number;
  top_genre: string | null;
  top_watched: Array<{ tmdb_id: number; type: string; title: string; poster_path: string }>;
  visibility: {
    showEstatisticas: boolean;
    showMaisAssistidos: boolean;
    showMinhaLista: boolean;
    showConquistas: boolean;
  };
}

// ── Mini profile bottom panel (replaces Alert for web compat) ─────────────────
function ProfilePanel({
  comment,
  followed,
  onFollow,
  onClose,
}: {
  comment: ShortComment | null;
  followed: boolean;
  onFollow: () => void;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (!comment) return;
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }).start();
    setLoadingProfile(true);
    setProfile(null);
    fetch(`${getApiBase()}/shorts/user-profile/${encodeURIComponent(comment.user_id)}`)
      .then((r) => r.json())
      .then((data: { ok: boolean; profile: UserProfile }) => {
        if (data.ok) setProfile(data.profile);
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));
  }, [comment?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!comment) return null;

  const displayName   = profile?.name ?? comment.user_name;
  const displayAvatar = profile?.avatar_url ?? comment.avatar_url;
  const displayLetter = profile?.avatar_letter ?? comment.avatar_letter;
  const vis           = profile?.visibility ?? { showEstatisticas: true, showMaisAssistidos: true, showMinhaLista: true, showConquistas: true };

  function formatMemberSince(iso: string | null): string {
    if (!iso) return "Membro NETPLAY";
    const d = new Date(iso);
    return `Membro desde ${d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
  }

  function fmtNum(n: number): string {
    return n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  const TMDB_IMG = "https://image.tmdb.org/t/p/w185";

  return (
    <View style={pp.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View style={[pp.card, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)" }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>

          {/* ── Avatar + name ────────────────────────────────────────── */}
          <View style={pp.row}>
            <AvatarBubble letter={displayLetter} uri={displayAvatar} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={pp.name}>{displayName}</Text>
              <Text style={pp.sub}>
                {loadingProfile ? "Carregando…" : formatMemberSince(profile?.member_since ?? null)}
              </Text>
            </View>
            <Pressable style={[pp.followBtn, followed && pp.followBtnActive]} onPress={onFollow}>
              <Text style={[pp.followBtnText, followed && pp.followBtnTextActive]}>
                {followed ? "Seguindo" : "Seguir"}
              </Text>
            </Pressable>
          </View>

          {/* ── Stats ────────────────────────────────────────────────── */}
          {!loadingProfile && profile && vis.showEstatisticas && (
            <View style={pp.statsRow}>
              {profile.watched_count > 0 && (
                <>
                  <View style={pp.statItem}>
                    <Text style={pp.statValue}>{fmtNum(profile.watched_count)}</Text>
                    <Text style={pp.statLabel}>Assistidos</Text>
                  </View>
                  <View style={pp.statDivider} />
                </>
              )}
              {profile.total_hours > 0 && (
                <>
                  <View style={pp.statItem}>
                    <Text style={pp.statValue}>{profile.total_hours}h</Text>
                    <Text style={pp.statLabel}>Horas</Text>
                  </View>
                  <View style={pp.statDivider} />
                </>
              )}
              <View style={pp.statItem}>
                <Text style={pp.statValue}>{fmtNum(profile.comment_count)}</Text>
                <Text style={pp.statLabel}>Comentários</Text>
              </View>
              {profile.top_genre && (
                <>
                  <View style={pp.statDivider} />
                  <View style={pp.statItem}>
                    <Text style={[pp.statValue, { fontSize: 13 }]} numberOfLines={1}>{profile.top_genre}</Text>
                    <Text style={pp.statLabel}>Gênero fav.</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Minha Lista ──────────────────────────────────────────── */}
          {!loadingProfile && profile && vis.showMinhaLista && profile.watchlist_count > 0 && (
            <View style={pp.listRow}>
              <Feather name="bookmark" size={15} color={RED} />
              <Text style={pp.listText}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{profile.watchlist_count}</Text>
                {" título"}{profile.watchlist_count !== 1 ? "s" : ""} na lista
              </Text>
            </View>
          )}

          {/* ── Mais assistidos ──────────────────────────────────────── */}
          {!loadingProfile && profile && vis.showMaisAssistidos && profile.top_watched.length > 0 && (
            <View>
              <Text style={pp.sectionTitle}>Mais assistidos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                {profile.top_watched.map((item) => (
                  <View key={`${item.tmdb_id}-${item.type}`} style={pp.posterWrap}>
                    {item.poster_path ? (
                      <Image
                        source={{ uri: `${TMDB_IMG}${item.poster_path}` }}
                        style={pp.poster}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[pp.poster, { backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center" }]}>
                        <Feather name="film" size={18} color="rgba(255,255,255,0.3)" />
                      </View>
                    )}
                    <Text style={pp.posterTitle} numberOfLines={1}>{item.title}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Loading skeleton */}
          {loadingProfile && (
            <View style={[pp.statsRow, { justifyContent: "center" }]}>
              <Text style={pp.statLabel}>Carregando perfil…</Text>
            </View>
          )}

          {/* ── Close ────────────────────────────────────────────────── */}
          <Pressable style={pp.closeRow} onPress={onClose}>
            <Text style={pp.closeText}>Fechar</Text>
          </Pressable>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── Comment row ───────────────────────────────────────────────────────────────
function CommentItem({
  comment, currentUserId, followed, onDelete, onFollow, onAvatarPress,
}: {
  comment: ShortComment;
  currentUserId?: string;
  followed: boolean;
  onDelete: (id: string) => void;
  onFollow: (comment: ShortComment) => void;
  onAvatarPress: (comment: ShortComment) => void;
}) {
  const isOwn = comment.user_id === currentUserId;
  const parts = comment.content.split(/(@\S+)/g);

  return (
    <View style={cs.row}>
      <Pressable onPress={() => onAvatarPress(comment)} hitSlop={8}>
        <AvatarBubble letter={comment.avatar_letter} uri={comment.avatar_url} />
      </Pressable>

      <View style={cs.bubble}>
        <View style={cs.bubbleHeader}>
          <Pressable onPress={() => onAvatarPress(comment)}>
            <Text style={cs.userName}>{comment.user_name}</Text>
          </Pressable>
          <Text style={cs.timeAgo}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={cs.content}>
          {parts.map((part, i) =>
            part.startsWith("@")
              ? <Text key={i} style={cs.mention}>{part}</Text>
              : <React.Fragment key={i}>{part}</React.Fragment>
          )}
        </Text>
      </View>

      {isOwn ? (
        <Pressable onPress={() => onDelete(comment.id)} hitSlop={8}>
          <Feather name="trash-2" size={14} color="rgba(255,255,255,0.35)" />
        </Pressable>
      ) : (
        <Pressable
          style={[cs.followBtn, followed && cs.followBtnActive]}
          onPress={() => onFollow(comment)}
        >
          <Text style={[cs.followBtnText, followed && cs.followBtnTextActive]}>
            {followed ? "Seguindo" : "Seguir"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Mention dropdown row ──────────────────────────────────────────────────────
function MentionRow({ candidate, onSelect }: { candidate: MentionCandidate; onSelect: (c: MentionCandidate) => void }) {
  return (
    <Pressable style={cs.mentionRow} onPress={() => onSelect(candidate)}>
      <AvatarBubble letter={candidate.avatar_letter} uri={candidate.avatar_url} size={28} />
      <Text style={cs.mentionRowName}>{candidate.user_name}</Text>
      <Feather name="at-sign" size={13} color="rgba(255,255,255,0.35)" />
    </Pressable>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────
export default function ShortsCommentsSheet({ visible, onClose, postId, tmdbId, title }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Active Netplay profile (real avatar source)
  const [activeAvatarUrl, setActiveAvatarUrl] = useState<string | null>(null);
  const [activeAvatarLetter, setActiveAvatarLetter] = useState<string>("U");

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_PROFILE_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw);
        if (p?.avatarUrl) setActiveAvatarUrl(p.avatarUrl);
        if (p?.name) setActiveAvatarLetter(p.name[0]?.toUpperCase() ?? "U");
      })
      .catch(() => {});
  }, [user]);

  // Animations — useNativeDriver:false so we can animate `bottom` for keyboard
  const slideAnim   = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetBottom  = useRef(new Animated.Value(0)).current;

  const [comments, setComments] = useState<ShortComment[]>([]);
  const [loading, setLoading]   = useState(false);
  const [text, setText]         = useState("");
  const textRef                 = useRef("");   // tracks live value without re-render lag
  const [sending, setSending]   = useState(false);
  const [internalVisible, setInternalVisible] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [profileComment, setProfileComment] = useState<ShortComment | null>(null);

  // @mention
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const selectedMentions = useRef<Map<string, MentionCandidate>>(new Map());

  const inputRef = useRef<TextInput>(null);
  const listRef  = useRef<FlatList>(null);

  // ── Keyboard listeners — move sheet up when keyboard opens ──────────────────
  useEffect(() => {
    if (Platform.OS === "web") {
      // Web (Android Chrome): Keyboard API doesn't fire — use visualViewport instead
      const vv = typeof window !== "undefined" ? (window as any).visualViewport : null;
      if (!vv) return;
      const onResize = () => {
        const kbHeight = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop ?? 0));
        Animated.timing(sheetBottom, {
          toValue: kbHeight > 80 ? kbHeight : 0,
          duration: 200,
          useNativeDriver: false,
        }).start();
      };
      vv.addEventListener("resize", onResize);
      vv.addEventListener("scroll", onResize);
      return () => {
        vv.removeEventListener("resize", onResize);
        vv.removeEventListener("scroll", onResize);
      };
    }

    // Native iOS / Android
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(sheetBottom, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === "ios" ? (e.duration || 250) : 250,
        useNativeDriver: false,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(sheetBottom, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Open / close animations ─────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false, tension: 65, friction: 11 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 260, useNativeDriver: false }),
      ]).start();
      fetchComments();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 280, useNativeDriver: false }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 240, useNativeDriver: false }),
      ]).start(() => setInternalVisible(false));
      setMentionQuery(null);
      setText(""); textRef.current = "";
      inputRef.current?.clear();
      sheetBottom.setValue(0);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load follow state from Supabase on open ──────────────────────────────────
  useEffect(() => {
    if (!visible || !user) return;
    db.shorts.follows.getFollowingIds(user.id)
      .then((ids) => setFollowed(ids))
      .catch(() => {});
  }, [visible, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await db.shorts.comments.get(postId);
      setComments(rows);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // ── Mention candidates ──────────────────────────────────────────────────────
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const seen = new Set<string>();
    const result: MentionCandidate[] = [];
    for (const c of comments) {
      if (c.user_id === user?.id || seen.has(c.user_id)) continue;
      seen.add(c.user_id);
      result.push({ user_id: c.user_id, user_name: c.user_name, avatar_letter: c.avatar_letter, avatar_url: c.avatar_url });
    }
    return result;
  }, [comments, user?.id]);

  // ── @mention detection ──────────────────────────────────────────────────────
  const handleTextChange = useCallback((val: string) => {
    textRef.current = val;
    setText(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx === -1) { setMentionQuery(null); return; }
    const afterAt = val.slice(atIdx + 1);
    if (afterAt.includes(" ") && afterAt.trim().length > 0) { setMentionQuery(null); return; }
    setMentionQuery(afterAt.toLowerCase());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionCandidates.filter((c) => c.user_name.toLowerCase().startsWith(mentionQuery)).slice(0, 5);
  }, [mentionCandidates, mentionQuery]);

  const handleSelectMention = useCallback((candidate: MentionCandidate) => {
    const cur = textRef.current;
    const atIdx = cur.lastIndexOf("@");
    const next = cur.slice(0, atIdx) + `@${candidate.user_name} `;
    textRef.current = next;
    setText(next);
    inputRef.current?.setNativeProps({ text: next });
    selectedMentions.current.set(candidate.user_name, candidate);
    setMentionQuery(null);
    inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const currentText = textRef.current;
    if (!currentText.trim() || sending || !user) return;

    const avatarUrl = activeAvatarUrl ?? (user.avatarUrl ?? null);
    const avatarLetter = activeAvatarLetter || user.avatarLetter;

    const newComment: ShortComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      post_id: postId,
      tmdb_id: tmdbId,
      user_id: user.id,
      user_name: user.name,
      avatar_letter: avatarLetter,
      avatar_url: avatarUrl,
      content: currentText.trim(),
      created_at: new Date().toISOString(),
    };

    const contentToSend = currentText.trim();
    setComments((prev) => [newComment, ...prev]);
    textRef.current = "";
    setText("");
    inputRef.current?.clear();
    setMentionQuery(null);
    setSending(true);
    inputRef.current?.blur();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      await db.shorts.comments.add(newComment);

      // Push for @mentions
      const mentionMatches = [...contentToSend.matchAll(/@([^\s@]+(?:\s[^\s@]+)*)/g)];
      if (mentionMatches.length > 0) {
        const mentionedIds = new Set<string>();
        for (const match of mentionMatches) {
          const name = match[1].trim();
          const candidate =
            selectedMentions.current.get(name) ??
            mentionCandidates.find((c) => c.user_name.toLowerCase() === name.toLowerCase());
          if (candidate && candidate.user_id !== user.id) mentionedIds.add(candidate.user_id);
        }
        if (mentionedIds.size > 0) {
          try {
            const tokens = await db.pushTokens.getForUsers([...mentionedIds]);
            if (tokens.length > 0) {
              await sendPushViaServer(
                `${user.name} mencionou você`,
                `"${contentToSend.slice(0, 80)}${contentToSend.length > 80 ? "…" : ""}"`,
                { type: "shorts_mention", tmdbId, title },
                undefined,
                tokens
              );
            }
          } catch {}
        }
      }
      selectedMentions.current.clear();
    } catch {
    } finally {
      setSending(false);
    }
  }, [text, sending, user, postId, tmdbId, title, mentionCandidates, activeAvatarUrl, activeAvatarLetter]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!user) return;
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      await db.shorts.comments.delete(id, user.id);
    } catch {}
  }, [user]);

  // ── Follow ──────────────────────────────────────────────────────────────────
  const handleFollow = useCallback((comment: ShortComment) => {
    if (!user) return;
    const uid = comment.user_id;
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
        db.shorts.follows.unfollow(user.id, uid).catch(() => {});
      } else {
        next.add(uid);
        db.shorts.follows.follow(user.id, uid, comment.user_name, comment.avatar_letter, comment.avatar_url).catch(() => {});
      }
      return next;
    });
  }, [user]);

  if (!internalVisible) return null;

  const currentAvatarUrl = activeAvatarUrl ?? user?.avatarUrl ?? null;
  const currentAvatarLetter = activeAvatarLetter || user?.avatarLetter || "U";

  return (
    <Modal transparent animationType="none" visible={internalVisible} onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop — Pressable so it closes the sheet; pointerEvents="box-none" lets
          scroll events on the sheet pass through on web */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", opacity: backdropAnim }]}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet — bottom animates up when keyboard opens */}
      <Animated.View style={[cs.sheet, { bottom: sheetBottom, transform: [{ translateY: slideAnim }] }]}>
          {/* Handle */}
          <View style={cs.handleWrap} pointerEvents="box-none">
            <View style={cs.handle} />
          </View>

          {/* Header */}
          <View style={cs.header}>
            <View style={{ flex: 1 }}>
              <Text style={cs.headerTitle}>Comentários</Text>
              {comments.length > 0 && (
                <Text style={cs.headerCount}>{comments.length} comentário{comments.length !== 1 ? "s" : ""}</Text>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          {/* Comment list */}
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(c) => c.id}
            style={cs.list}
            contentContainerStyle={cs.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={cs.empty}>
                {loading ? (
                  <Feather name="loader" size={24} color="rgba(255,255,255,0.3)" />
                ) : (
                  <>
                    <Feather name="message-circle" size={32} color="rgba(255,255,255,0.2)" />
                    <Text style={cs.emptyText}>Nenhum comentário ainda{"\n"}Seja o primeiro!</Text>
                  </>
                )}
              </View>
            }
            renderItem={({ item }) => (
              <CommentItem
                comment={item}
                currentUserId={user?.id}
                followed={followed.has(item.user_id)}
                onDelete={handleDelete}
                onFollow={handleFollow}
                onAvatarPress={(c) => setProfileComment(c)}
              />
            )}
            scrollEnabled
            style={[cs.list, Platform.OS === "web" ? ({ overflow: "scroll" } as any) : undefined]}
          />

          {/* @mention dropdown — above the input */}
          {filteredMentions.length > 0 && (
            <View style={cs.mentionDropdown}>
              {filteredMentions.map((c) => (
                <MentionRow key={c.user_id} candidate={c} onSelect={handleSelectMention} />
              ))}
            </View>
          )}

          {/* Input bar — always fixed at bottom */}
          <View style={[cs.inputArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {user ? (
              <>
                <AvatarBubble letter={currentAvatarLetter} uri={currentAvatarUrl} size={34} />
                <TextInput
                  ref={inputRef}
                  style={cs.input}
                  placeholder="Comentar… use @ para mencionar"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  onChangeText={handleTextChange}
                  multiline
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  blurOnSubmit
                />
                <Pressable
                  onPress={handleSend}
                  disabled={!text.trim() || sending}
                  style={[cs.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
                >
                  <Feather name="send" size={20} color={RED} />
                </Pressable>
              </>
            ) : (
              <Text style={cs.loginHint}>Faça login para comentar</Text>
            )}
          </View>
        </Animated.View>

      {/* Profile mini-panel — rendered above the sheet */}
      {profileComment && (
        <ProfilePanel
          comment={profileComment}
          followed={followed.has(profileComment.user_id)}
          onFollow={() => handleFollow(profileComment)}
          onClose={() => setProfileComment(null)}
        />
      )}
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flexDirection: "column",
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.22)" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  headerCount: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 1 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, flexGrow: 1 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { color: "rgba(255,255,255,0.3)", fontSize: 14, textAlign: "center", lineHeight: 22 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 16 },
  bubble: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  userName: { color: "#fff", fontSize: 13, fontWeight: "600" },
  timeAgo: { color: "rgba(255,255,255,0.38)", fontSize: 11 },
  content: { color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 20 },
  mention: { color: "#60a5fa", fontWeight: "600" },
  followBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  followBtnActive: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.12)" },
  followBtnText: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "600" },
  followBtnTextActive: { color: RED },
  mentionDropdown: {
    backgroundColor: "#1a1a1a",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingVertical: 4,
  },
  mentionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  mentionRowName: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "500" },
  inputArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#111",
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    maxHeight: 90,
  },
  sendBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  loginHint: { flex: 1, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14, paddingVertical: 14 },
});

// ── Profile panel styles ──────────────────────────────────────────────────────
const pp = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 99,
  },
  card: {
    backgroundColor: "#1c1c1c",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 4,
    maxHeight: "85%",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sub: { color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 },
  followBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  followBtnActive: { borderColor: RED, backgroundColor: "rgba(229,9,20,0.12)" },
  followBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  followBtnTextActive: { color: RED },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statLabel: { color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.12)" },
  sectionTitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(229,9,20,0.08)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  listText: { color: "rgba(255,255,255,0.6)", fontSize: 13 },
  posterWrap: { width: 76, alignItems: "center", gap: 4 },
  poster: { width: 76, height: 108, borderRadius: 8 },
  posterTitle: { color: "rgba(255,255,255,0.5)", fontSize: 10, textAlign: "center" },
  closeRow: { alignItems: "center", paddingVertical: 4 },
  closeText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
});
