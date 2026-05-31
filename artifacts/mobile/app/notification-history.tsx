import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import {
  getNotificationHistory,
  clearNotificationHistory,
  markNotificationsRead,
  type NotifHistoryItem,
} from "@/lib/notifications";

const RED = "#e50914";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);
    if (diffMin < 1) return "Agora mesmo";
    if (diffMin < 60) return `Há ${diffMin} min`;
    if (diffH < 24) return `Há ${diffH}h`;
    if (diffD === 1) return "Ontem";
    if (diffD < 7) return `Há ${diffD} dias`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

type NotifMeta = {
  icon: string;
  accent: string;
  label: string;
  canNavigate: boolean;
};

function getNotifMeta(item: NotifHistoryItem): NotifMeta {
  const data = item.data ?? {};
  const notifType = String(data.type ?? "");
  const contentType = String(data.contentType ?? "");
  const tmdbId = data.tmdbId;

  const hasContent =
    !!tmdbId &&
    (contentType === "movie" || contentType === "tv" ||
      notifType === "movie" || notifType === "tv");

  if (notifType === "continue_watching") {
    return { icon: "play-circle", accent: "#f59e0b", label: "Continue assistindo", canNavigate: hasContent };
  }
  if (hasContent || notifType === "movie" || notifType === "tv") {
    return { icon: "film", accent: "#3b82f6", label: notifType === "tv" || contentType === "tv" ? "Série" : "Filme", canNavigate: true };
  }
  if (notifType === "new_content" || notifType === "weekly_digest") {
    return { icon: "zap", accent: "#10b981", label: "Novidades", canNavigate: true };
  }
  if (notifType === "plan_expiry") {
    return { icon: "calendar", accent: "#ef4444", label: "Plano", canNavigate: true };
  }
  if (notifType === "guest_upgrade") {
    return { icon: "star", accent: "#8b5cf6", label: "Plano", canNavigate: true };
  }
  return { icon: "bell", accent: RED, label: "NETPLAY", canNavigate: false };
}

export default function NotificationHistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [history, setHistory] = useState<NotifHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const items = await getNotificationHistory();
    setHistory(items);
    await markNotificationsRead();
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClear = () => {
    Alert.alert(
      "Limpar histórico",
      "Deseja apagar todas as notificações do histórico?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpar",
          style: "destructive",
          onPress: async () => {
            await clearNotificationHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  const handleItemPress = (item: NotifHistoryItem) => {
    const data = item.data ?? {};
    const notifType = String(data.type ?? "");
    const contentType = String(data.contentType ?? "");
    const tmdbId = data.tmdbId ? Number(data.tmdbId) : null;
    const title = String(data.title ?? item.title ?? "");

    const resolvedContentType =
      contentType === "movie" || contentType === "tv"
        ? contentType
        : notifType === "movie" || notifType === "tv"
        ? notifType
        : null;

    if (tmdbId && resolvedContentType) {
      router.push({
        pathname: "/detail",
        params: { type: resolvedContentType, id: String(tmdbId), title },
      });
      return;
    }
    if (notifType === "continue_watching" && tmdbId && resolvedContentType) {
      router.push({
        pathname: "/detail",
        params: { type: resolvedContentType, id: String(tmdbId), title },
      });
      return;
    }
    if (notifType === "new_content" || notifType === "weekly_digest") {
      router.push("/(tabs)/novidades");
      return;
    }
    if (notifType === "plan_expiry" || notifType === "guest_upgrade") {
      router.push("/(tabs)/profile");
      return;
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[s.title, { color: colors.foreground }]}>Notificações</Text>
        {history.length > 0 ? (
          <Pressable onPress={handleClear} style={s.clearBtn} hitSlop={12}>
            <Feather name="trash-2" size={18} color={RED} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: colors.card }]}>
              <Feather name="bell" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[s.emptyTxt, { color: colors.mutedForeground }]}>Carregando...</Text>
          </View>
        ) : history.length === 0 ? (
          <View style={s.empty}>
            <View style={[s.emptyIcon, { backgroundColor: colors.card }]}>
              <Feather name="bell-off" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>Nenhuma notificação</Text>
            <Text style={[s.emptyTxt, { color: colors.mutedForeground }]}>
              Quando você receber notificações do NETPLAY, elas aparecerão aqui.
            </Text>
          </View>
        ) : (
          <View style={s.listWrap}>
            {history.map((item, idx) => {
              const meta = getNotifMeta(item);
              const isLast = idx === history.length - 1;
              const posterUrl = item.imageUrl ?? (item.data?.posterUrl as string | undefined);

              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleItemPress(item)}
                  style={({ pressed }) => [
                    s.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      marginBottom: isLast ? 0 : 10,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  {/* Poster / thumbnail */}
                  {posterUrl ? (
                    <View style={s.posterWrap}>
                      <Image
                        source={{ uri: posterUrl }}
                        style={s.poster}
                        contentFit="cover"
                      />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.55)"]}
                        style={StyleSheet.absoluteFillObject}
                      />
                    </View>
                  ) : (
                    <View style={[s.posterWrap, { backgroundColor: meta.accent + "18", alignItems: "center", justifyContent: "center" }]}>
                      <Feather name={meta.icon as any} size={22} color={meta.accent} />
                    </View>
                  )}

                  {/* Content */}
                  <View style={s.cardBody}>
                    <View style={s.cardTop}>
                      <View style={[s.typeBadge, { backgroundColor: meta.accent + "20", borderColor: meta.accent + "40" }]}>
                        <Text style={[s.typeTxt, { color: meta.accent }]}>{meta.label}</Text>
                      </View>
                      <Text style={[s.timeText, { color: colors.mutedForeground }]}>
                        {formatDate(item.receivedAt)}
                      </Text>
                    </View>
                    <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[s.cardBody2, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>

                  {/* Arrow if navigable */}
                  {meta.canNavigate && (
                    <View style={s.arrowWrap}>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {history.length > 0 && (
          <Text style={[s.count, { color: colors.mutedForeground }]}>
            {history.length} notificação{history.length !== 1 ? "ões" : ""} · últimas 50 salvas
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  clearBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "flex-end" },
  title: { flex: 1, fontSize: 18, fontWeight: "700", textAlign: "center" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 17, fontWeight: "600", marginTop: 4 },
  emptyTxt: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  listWrap: { paddingHorizontal: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    gap: 12,
  },
  posterWrap: {
    width: 72,
    height: 90,
    flexShrink: 0,
    overflow: "hidden",
  },
  poster: {
    width: "100%",
    height: "100%",
  },
  cardBody: { flex: 1, paddingVertical: 12, paddingRight: 4, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeBadge: {
    borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2,
  },
  typeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  timeText: { fontSize: 11, marginLeft: "auto" },
  cardTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  cardBody2: { fontSize: 12, lineHeight: 17 },
  arrowWrap: { paddingRight: 12, paddingLeft: 4 },
  count: { textAlign: "center", fontSize: 12, marginTop: 16 },
});
