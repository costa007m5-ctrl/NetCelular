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
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function getNotifIcon(data?: Record<string, unknown>): string {
  if (!data) return "bell";
  if (data.type === "new_content") return "zap";
  if (data.tmdbId) return "film";
  return "bell";
}

function getNotifAccent(data?: Record<string, unknown>): string {
  if (!data) return RED;
  if (data.type === "new_content") return "#f59e0b";
  if (data.tmdbId) return "#3b82f6";
  return RED;
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

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Header */}
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 8 }}
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
          <View style={[s.list, { borderColor: colors.border }]}>
            {history.map((item, idx) => {
              const accent = getNotifAccent(item.data);
              const icon = getNotifIcon(item.data);
              const isLast = idx === history.length - 1;
              return (
                <View
                  key={item.id}
                  style={[
                    s.item,
                    { backgroundColor: colors.card, borderBottomColor: isLast ? "transparent" : colors.border },
                  ]}
                >
                  <View style={[s.iconWrap, { backgroundColor: accent + "18" }]}>
                    <Feather name={icon as any} size={18} color={accent} />
                  </View>
                  <View style={s.itemBody}>
                    <View style={s.itemTop}>
                      <Text style={[s.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[s.itemTime, { color: colors.mutedForeground }]}>
                        {formatDate(item.receivedAt)}
                      </Text>
                    </View>
                    <Text style={[s.itemBody2, { color: colors.mutedForeground }]} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                </View>
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
  list: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  itemBody: { flex: 1, gap: 4 },
  itemTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  itemTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  itemTime: { fontSize: 11, flexShrink: 0 },
  itemBody2: { fontSize: 13, lineHeight: 18 },
  count: { textAlign: "center", fontSize: 12, marginTop: 16 },
});
