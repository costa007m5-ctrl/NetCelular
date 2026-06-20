import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { sendPushViaServer } from "@/lib/notifications";
import { markReacted } from "@/lib/shorts-received";
import { useRef } from "react";

const ACCENT = "#e50914";

const REACTIONS = [
  { emoji: "❤️",  label: "Amei"    },
  { emoji: "🔥",  label: "Incrível" },
  { emoji: "😂",  label: "Hilário"  },
  { emoji: "😱",  label: "Chocante" },
  { emoji: "🤩",  label: "Épico"    },
  { emoji: "😢",  label: "Emocionante" },
];

function ReactionButton({
  emoji,
  label,
  onPress,
  disabled,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, tension: 300, friction: 5 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, tension: 300, friction: 7 }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} disabled={disabled} activeOpacity={0.75} style={s.reactionWrap}>
      <Animated.View style={[s.reactionBtn, { transform: [{ scale }] }]}>
        <Text style={s.reactionEmoji}>{emoji}</Text>
      </Animated.View>
      <Text style={s.reactionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ShortsReactionScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const { user } = useAuth();

  const params = useLocalSearchParams<{
    tmdbId: string;
    contentType: string;
    title: string;
    poster?: string;
    senderId: string;
    senderName: string;
    genre?: string;
    year?: string;
  }>();

  const [sending, setSending] = useState(false);
  const [sentEmoji, setSentEmoji] = useState<string | null>(null);
  const successOp = useRef(new Animated.Value(0)).current;

  const goToDetail = useCallback(() => {
    if (!params.tmdbId || !params.contentType) { router.back(); return; }
    router.replace({
      pathname: "/detail",
      params: { type: params.contentType, id: params.tmdbId, title: params.title ?? "" },
    });
  }, [router, params]);

  const handleReact = useCallback(async (emoji: string) => {
    if (sending || sentEmoji) return;
    setSending(true);

    try {
      // Mark as reacted locally so we don't ask again
      if (params.tmdbId) await markReacted(Number(params.tmdbId));

      // Get sender push token
      const { data: tokenRows } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("user_id", params.senderId)
        .limit(1);

      const token: string | null = (tokenRows?.[0] as any)?.token ?? null;

      const reactorName = user?.name ?? user?.email ?? "Seu amigo";
      const shortTitle = params.title ?? "o Short";

      if (token) {
        await sendPushViaServer(
          `${emoji} ${reactorName} reagiu ao seu Short!`,
          `"${shortTitle}" — ${reactorName} reagiu com ${emoji}`,
          {
            type: "shorts_reaction",
            emoji,
            contentType: params.contentType ?? "movie",
            tmdbId: params.tmdbId ? Number(params.tmdbId) : null,
            title: params.title ?? "",
            reactorName,
          },
          params.poster || undefined,
          [token],
        );
      }

      setSentEmoji(emoji);
      Animated.timing(successOp, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } catch {
      // Even if push fails, mark as reacted and show success
      setSentEmoji(emoji);
      Animated.timing(successOp, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } finally {
      setSending(false);
    }
  }, [sending, sentEmoji, params, user, successOp]);

  const starCount = Math.round((Number(params.year) || 0) / 2); // year is reused here - let's not
  const yearStr = params.year ?? "";
  const genreStr = params.genre ?? "";

  return (
    <View style={[s.root, { backgroundColor: "#000" }]}>

      {/* Background poster blur */}
      {params.poster ? (
        <Image
          source={{ uri: params.poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={22}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.72)" }]} />

      {/* Close button */}
      <TouchableOpacity
        style={[s.closeBtn, { top: topPad + 8 }]}
        onPress={goToDetail}
        hitSlop={12}
        activeOpacity={0.75}
      >
        <Feather name="x" size={22} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* Content */}
      <View style={[s.content, { paddingTop: topPad + 60, paddingBottom: bottomPad + 24 }]}>

        {/* "Sent by" banner */}
        <View style={s.sentByBanner}>
          <Feather name="send" size={13} color={ACCENT} />
          <Text style={s.sentByText}>
            <Text style={s.sentByName}>{params.senderName ?? "Um amigo"}</Text>
            {" indicou este conteúdo para você"}
          </Text>
        </View>

        {/* Poster + info */}
        <View style={s.posterRow}>
          {params.poster ? (
            <Image source={{ uri: params.poster }} style={s.poster} contentFit="cover" />
          ) : (
            <View style={[s.poster, s.posterFallback]}>
              <Feather name="film" size={28} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          <View style={s.info}>
            <Text style={s.title} numberOfLines={3}>{params.title ?? "—"}</Text>
            <View style={s.metaRow}>
              {genreStr ? (
                <View style={s.genrePill}>
                  <Text style={s.genrePillText}>{genreStr}</Text>
                </View>
              ) : null}
              {yearStr ? <Text style={s.metaText}>{yearStr}</Text> : null}
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* Reaction section */}
        {!sentEmoji ? (
          <>
            <Text style={s.reactPrompt}>Como você se sentiu com este conteúdo?</Text>
            <Text style={s.reactSub}>Sua reação será enviada para {params.senderName ?? "seu amigo"}</Text>

            <View style={s.reactGrid}>
              {REACTIONS.map(({ emoji, label }) => (
                <ReactionButton
                  key={emoji}
                  emoji={emoji}
                  label={label}
                  onPress={() => handleReact(emoji)}
                  disabled={sending}
                />
              ))}
            </View>

            {sending && (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 16 }} />
            )}

            <TouchableOpacity style={s.skipBtn} onPress={goToDetail} activeOpacity={0.7}>
              <Text style={s.skipText}>Ver detalhes sem reagir</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Animated.View style={[s.successBox, { opacity: successOp }]}>
            <Text style={s.successEmoji}>{sentEmoji}</Text>
            <Text style={s.successTitle}>Reação enviada!</Text>
            <Text style={s.successBody}>
              {params.senderName ?? "Seu amigo"} receberá sua reação em breve.
            </Text>
            <TouchableOpacity style={s.detailBtn} onPress={goToDetail} activeOpacity={0.85}>
              <Feather name="play-circle" size={16} color="#fff" />
              <Text style={s.detailBtnText}>Ver conteúdo completo</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  closeBtn: {
    position: "absolute",
    right: 18,
    zIndex: 10,
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },

  sentByBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(229,9,20,0.15)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(229,9,20,0.4)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    alignSelf: "center",
  },
  sentByText: { color: "rgba(255,255,255,0.75)", fontSize: 13 },
  sentByName: { color: "#fff", fontWeight: "700" },

  posterRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 20,
    alignItems: "center",
  },
  poster: { width: 88, height: 130, borderRadius: 12 },
  posterFallback: {
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1 },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", lineHeight: 26, marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  genrePill: {
    backgroundColor: "rgba(229,9,20,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  genrePillText: { color: ACCENT, fontSize: 11, fontWeight: "700" },
  metaText: { color: "rgba(255,255,255,0.5)", fontSize: 12 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginBottom: 24,
  },

  reactPrompt: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  reactSub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 24,
  },

  reactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 24,
  },
  reactionWrap: { alignItems: "center", gap: 6, width: 76 },
  reactionBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.15)",
  },
  reactionEmoji: { fontSize: 30 },
  reactionLabel: { color: "rgba(255,255,255,0.55)", fontSize: 11 },

  skipBtn: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
  skipText: { color: "rgba(255,255,255,0.35)", fontSize: 13 },

  successBox: { alignItems: "center", paddingVertical: 16 },
  successEmoji: { fontSize: 72, marginBottom: 12 },
  successTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  successBody: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  detailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  detailBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
