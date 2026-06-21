import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiBase } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/supabase";
import { sendPushViaServer } from "@/lib/notifications";

const { height: H } = Dimensions.get("window");
const SHEET_HEIGHT = H * 0.72;
const RED = "#e50914";

export interface ShortComment {
  id: string;
  post_id: string;
  tmdb_id: number;
  user_id: string;
  user_name: string;
  avatar_letter: string;
  avatar_url?: string | null;
  content: string;
  created_at: string;
}

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

function AvatarBubble({
  letter,
  uri,
  size = 36,
  onPress,
}: {
  letter: string;
  uri?: string | null;
  size?: number;
  onPress?: () => void;
}) {
  const color = BUBBLE_COLORS[letter.charCodeAt(0) % BUBBLE_COLORS.length];
  const inner = uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
    />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.44, fontWeight: "700" }}>{letter.toUpperCase()}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <>{inner}</>;
}

function CommentItem({
  comment,
  currentUserId,
  followed,
  onDelete,
  onFollow,
  onProfilePress,
}: {
  comment: ShortComment;
  currentUserId?: string;
  followed: boolean;
  onDelete: (id: string) => void;
  onFollow: (userId: string, userName: string) => void;
  onProfilePress: (comment: ShortComment) => void;
}) {
  const isOwn = comment.user_id === currentUserId;

  // Highlight @mentions in comment text
  const parts = comment.content.split(/(@\S+)/g);

  return (
    <View style={cs.row}>
      <AvatarBubble
        letter={comment.avatar_letter}
        uri={comment.avatar_url}
        onPress={() => onProfilePress(comment)}
      />
      <View style={cs.bubble}>
        <View style={cs.bubbleHeader}>
          <TouchableOpacity onPress={() => onProfilePress(comment)} activeOpacity={0.75}>
            <Text style={cs.userName}>{comment.user_name}</Text>
          </TouchableOpacity>
          <Text style={cs.timeAgo}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text style={cs.content}>
          {parts.map((part, i) =>
            part.startsWith("@") ? (
              <Text key={i} style={cs.mention}>{part}</Text>
            ) : (
              <React.Fragment key={i}>{part}</React.Fragment>
            )
          )}
        </Text>
      </View>

      {isOwn ? (
        <TouchableOpacity
          onPress={() => onDelete(comment.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="trash-2" size={14} color="rgba(255,255,255,0.35)" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[cs.followBtn, followed && cs.followBtnActive]}
          onPress={() => onFollow(comment.user_id, comment.user_name)}
          activeOpacity={0.75}
        >
          <Text style={[cs.followBtnText, followed && cs.followBtnTextActive]}>
            {followed ? "Seguindo" : "Seguir"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Mention dropdown row ───────────────────────────────────────────────────────
function MentionRow({ candidate, onSelect }: { candidate: MentionCandidate; onSelect: (c: MentionCandidate) => void }) {
  return (
    <TouchableOpacity style={cs.mentionRow} onPress={() => onSelect(candidate)} activeOpacity={0.7}>
      <AvatarBubble letter={candidate.avatar_letter} uri={candidate.avatar_url} size={28} />
      <Text style={cs.mentionRowName}>{candidate.user_name}</Text>
      <Feather name="at-sign" size={13} color="rgba(255,255,255,0.35)" />
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ShortsCommentsSheet({ visible, onClose, postId, tmdbId, title }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [comments, setComments] = useState<ShortComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [internalVisible, setInternalVisible] = useState(false);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  // @mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Map of userName -> { user_id, avatar_letter, avatar_url } for recently selected mentions
  const selectedMentions = useRef<Map<string, MentionCandidate>>(new Map());

  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  // ── Animate in/out ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setInternalVisible(true);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      fetchComments();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 280, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start(() => setInternalVisible(false));
      setMentionQuery(null);
      setText("");
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch comments ───────────────────────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/shorts/comments?postId=${encodeURIComponent(postId)}&limit=80`);
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; comments: ShortComment[] };
      if (data.ok) setComments(data.comments);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // ── Mention candidates — unique commenters excluding current user ─────────────
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const seen = new Set<string>();
    const result: MentionCandidate[] = [];
    for (const c of comments) {
      if (c.user_id === user?.id) continue;
      if (seen.has(c.user_id)) continue;
      seen.add(c.user_id);
      result.push({ user_id: c.user_id, user_name: c.user_name, avatar_letter: c.avatar_letter, avatar_url: c.avatar_url });
    }
    return result;
  }, [comments, user?.id]);

  // ── @mention detection while typing ─────────────────────────────────────────
  const handleTextChange = useCallback((val: string) => {
    setText(val);

    // Find last @ in the text that hasn't been closed by a space
    const atIdx = val.lastIndexOf("@");
    if (atIdx === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = val.slice(atIdx + 1);
    // If there's a space after the @query, the mention is complete
    if (afterAt.includes(" ") && afterAt.trim().length > 0) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(afterAt.toLowerCase());
  }, []);

  // Filtered mention dropdown list
  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    return mentionCandidates.filter((c) =>
      c.user_name.toLowerCase().startsWith(mentionQuery)
    ).slice(0, 5);
  }, [mentionCandidates, mentionQuery]);

  // ── Insert mention into text ─────────────────────────────────────────────────
  const handleSelectMention = useCallback((candidate: MentionCandidate) => {
    const atIdx = text.lastIndexOf("@");
    const before = text.slice(0, atIdx);
    const mention = `@${candidate.user_name} `;
    setText(before + mention);
    selectedMentions.current.set(candidate.user_name, candidate);
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [text]);

  // ── Send comment ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!text.trim() || sending || !user) return;

    const optimistic: ShortComment = {
      id: `opt-${Date.now()}`,
      post_id: postId,
      tmdb_id: tmdbId,
      user_id: user.id,
      user_name: user.name,
      avatar_letter: user.avatarLetter,
      avatar_url: user.avatarUrl ?? null,
      content: text.trim(),
      created_at: new Date().toISOString(),
    };

    const contentToSend = text.trim();
    setComments((prev) => [optimistic, ...prev]);
    setText("");
    setMentionQuery(null);
    setSending(true);
    inputRef.current?.blur();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      const base = getApiBase();
      const res = await fetch(`${base}/shorts/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          tmdbId,
          userId: user.id,
          userName: user.name,
          avatarLetter: user.avatarLetter,
          avatarUrl: user.avatarUrl ?? null,
          content: contentToSend,
        }),
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; comment: ShortComment };
        if (data.ok) {
          setComments((prev) => prev.map((c) => c.id === optimistic.id ? data.comment : c));
        }
      }

      // ── Send push notifications for @mentions ────────────────────────────────
      const mentionMatches = [...contentToSend.matchAll(/@([^\s@]+(?:\s[^\s@]+)*)/g)];
      if (mentionMatches.length > 0) {
        const mentionedIds = new Set<string>();
        for (const match of mentionMatches) {
          const name = match[1].trim();
          const candidate =
            selectedMentions.current.get(name) ??
            mentionCandidates.find((c) => c.user_name.toLowerCase() === name.toLowerCase());
          if (candidate && candidate.user_id !== user.id) {
            mentionedIds.add(candidate.user_id);
          }
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
  }, [text, sending, user, postId, tmdbId, title, mentionCandidates]);

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!user) return;
    setComments((prev) => prev.filter((c) => c.id !== id));
    try {
      const base = getApiBase();
      await fetch(`${base}/shorts/comments/${id}?userId=${encodeURIComponent(user.id)}`, { method: "DELETE" });
    } catch {}
  }, [user]);

  // ── Follow ───────────────────────────────────────────────────────────────────
  const handleFollow = useCallback((userId: string, _userName: string) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }, []);

  const handleProfilePress = useCallback((comment: ShortComment) => {
    Alert.alert(
      comment.user_name,
      `Perfil de ${comment.user_name}`,
      [
        {
          text: followed.has(comment.user_id) ? "Deixar de seguir" : "Seguir",
          onPress: () => handleFollow(comment.user_id, comment.user_name),
        },
        { text: "Fechar", style: "cancel" },
      ]
    );
  }, [followed, handleFollow]);

  if (!internalVisible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={internalVisible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }}>
        {/* Backdrop */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", opacity: backdropAnim }]} />
        </TouchableWithoutFeedback>

        {/* Sheet */}
        <Animated.View style={[cs.sheet, { transform: [{ translateY: slideAnim }] }]}>
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
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
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
                onProfilePress={handleProfilePress}
              />
            )}
          />

          {/* Input area — always fixed at bottom, lifted by keyboard */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {/* @mention dropdown — rendered above the input */}
            {filteredMentions.length > 0 && (
              <View style={cs.mentionDropdown}>
                {filteredMentions.map((c) => (
                  <MentionRow key={c.user_id} candidate={c} onSelect={handleSelectMention} />
                ))}
              </View>
            )}

            <View style={[cs.inputArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
              {user ? (
                <>
                  <AvatarBubble letter={user.avatarLetter} uri={user.avatarUrl} size={34} />
                  <TextInput
                    ref={inputRef}
                    style={cs.input}
                    placeholder="Comentar… use @ para mencionar"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    value={text}
                    onChangeText={handleTextChange}
                    multiline
                    maxLength={500}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                    blurOnSubmit
                  />
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={!text.trim() || sending}
                    style={[cs.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
                  >
                    <Feather name="send" size={20} color={RED} />
                  </TouchableOpacity>
                </>
              ) : (
                <Text style={cs.loginHint}>Faça login para comentar</Text>
              )}
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const cs = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flexDirection: "column",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  headerCount: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    marginTop: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexGrow: 1,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
  },
  bubble: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  userName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  timeAgo: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 11,
  },
  content: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    lineHeight: 20,
  },
  mention: {
    color: "#60a5fa",
    fontWeight: "600",
  },
  followBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  followBtnActive: {
    borderColor: RED,
    backgroundColor: "rgba(229,9,20,0.12)",
  },
  followBtnText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "600",
  },
  followBtnTextActive: {
    color: RED,
  },
  // @mention dropdown
  mentionDropdown: {
    backgroundColor: "#1a1a1a",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingVertical: 4,
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  mentionRowName: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  // Input bar
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
  sendBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  loginHint: {
    flex: 1,
    textAlign: "center",
    color: "rgba(255,255,255,0.35)",
    fontSize: 14,
    paddingVertical: 14,
  },
});
