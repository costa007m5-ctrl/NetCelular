import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/lib/supabase";

const NOTIF_KEY = "netplay_notif_enabled";
const HISTORY_KEY = "netplay_notif_history";
const UNREAD_KEY = "netplay_notif_unread";
const CONTINUE_NOTIF_ID_KEY = "netplay_continue_notif_id";
const MAX_HISTORY = 50;

export type NotifHistoryItem = {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  receivedAt: string;
  data?: Record<string, unknown>;
};

export async function saveNotificationToHistory(item: Omit<NotifHistoryItem, "id">): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const current: NotifHistoryItem[] = raw ? JSON.parse(raw) : [];
    const newItem: NotifHistoryItem = { ...item, id: `${Date.now()}-${Math.random()}` };
    const updated = [newItem, ...current].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    const unreadRaw = await AsyncStorage.getItem(UNREAD_KEY);
    const unread = parseInt(unreadRaw ?? "0", 10);
    await AsyncStorage.setItem(UNREAD_KEY, String(unread + 1));
  } catch {}
}

export async function getNotificationHistory(): Promise<NotifHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearNotificationHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
    await AsyncStorage.setItem(UNREAD_KEY, "0");
  } catch {}
}

export async function getUnreadCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(UNREAD_KEY);
    return parseInt(raw ?? "0", 10);
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(): Promise<void> {
  try {
    await AsyncStorage.setItem(UNREAD_KEY, "0");
  } catch {}
}

export async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIF_KEY);
    return val !== "false";
  } catch {
    return true;
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_KEY, enabled ? "true" : "false");
  } catch {}
}

export async function requestPermissionsAndSetup(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === "granted";
  } catch {
    return false;
  }
}

const EXPO_PROJECT_ID = "aa86cc57-e8c0-4ce7-806c-0d1e5e345991";

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === "web" || !userId) return;
  try {
    const Notifications = require("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    }).catch(() => Notifications.getExpoPushTokenAsync());
    const token: string = tokenData?.data;
    if (token && token.startsWith("ExponentPushToken")) {
      await db.pushTokens.upsert(userId, token);
    }
  } catch {}
}

export async function scheduleWelcomeNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎬 Bem-vindo ao NETPLAY!",
        body: "Seu catálogo premium de filmes e séries está pronto.",
        sound: true,
      },
      trigger: { seconds: 2 } as any,
    });
  } catch {}
}

export async function scheduleNewContentNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔥 Novidades no NETPLAY",
        body: "Novos filmes e séries foram adicionados ao catálogo hoje!",
        sound: true,
      },
      trigger: {
        hour: 20,
        minute: 0,
        repeats: true,
      } as any,
    });
  } catch {}
}

export async function sendTestNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎬 NETPLAY",
        body: "Notificações ativadas! Você receberá novidades em primeira mão.",
        sound: true,
      },
      trigger: null,
    });
  } catch {}
}

export async function sendContentAddedNotification(contentTitle: string, posterUrl?: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    const content: any = {
      title: "🎬 Conteúdo disponível!",
      body: `"${contentTitle}" foi adicionado ao NETPLAY. Assista agora!`,
      sound: true,
    };
    if (posterUrl) {
      content.attachments = [{ url: posterUrl, identifier: "poster" }];
    }
    await Notifications.scheduleNotificationAsync({ content, trigger: null });
  } catch {}
}

/* ── Continue Watching: 15-min background reminder ── */

export async function scheduleContinueWatchingReminder(
  contentTitle: string,
  posterUrl?: string
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await cancelContinueWatchingReminder();
    const content: any = {
      title: "⏸ Conteúdo aguardando você",
      body: `"${contentTitle}" está pausado. Continue de onde parou!`,
      sound: true,
      data: { type: "continue_watching", title: contentTitle },
    };
    if (posterUrl) {
      content.attachments = [{ url: posterUrl, identifier: "poster" }];
    }
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { seconds: 900 } as any,
    });
    await AsyncStorage.setItem(CONTINUE_NOTIF_ID_KEY, id);
  } catch {}
}

export async function cancelContinueWatchingReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    const id = await AsyncStorage.getItem(CONTINUE_NOTIF_ID_KEY);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await AsyncStorage.removeItem(CONTINUE_NOTIF_ID_KEY);
    }
  } catch {}
}

/* ── Auto notifications by profile type ── */

export async function scheduleGuestUpgradeNotification(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "⭐ Desbloqueie o NETPLAY completo",
        body: "Você está usando como convidado. Assine e acesse todo o catálogo sem limites!",
        sound: true,
        data: { type: "guest_upgrade" },
      },
      trigger: { seconds: 86400 * 2 } as any,
    });
  } catch {}
}

export async function schedulePlanReminderNotification(daysLeft: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📅 Seu plano está expirando",
        body: daysLeft <= 1
          ? "Seu plano NETPLAY expira hoje! Renove agora para não perder o acesso."
          : `Faltam ${daysLeft} dias para seu plano expirar. Renove e continue assistindo!`,
        sound: true,
        data: { type: "plan_expiry", daysLeft },
      },
      trigger: null,
    });
  } catch {}
}

export async function scheduleWeeklyContentReminder(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎬 Novidades esta semana no NETPLAY",
        body: "Filmes e séries novos te esperando. Veja o que tem de novo!",
        sound: true,
        data: { type: "weekly_digest" },
      },
      trigger: {
        weekday: 6,
        hour: 19,
        minute: 0,
        repeats: true,
      } as any,
    });
  } catch {}
}

/* ── Push (remote) notifications via Expo API ── */

export async function sendPushNotificationsToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>,
  imageUrl?: string
): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  try {
    const messages = tokens.map((to) => {
      const msg: Record<string, any> = {
        to,
        title,
        body,
        sound: "default",
        data: data ?? {},
      };
      if (imageUrl) {
        msg.attachments = [{ url: imageUrl }];
      }
      return msg;
    });
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { sent: 0, failed: tokens.length };
    const json = await res.json();
    const resultData: any[] = Array.isArray(json?.data) ? json.data : [json?.data].filter(Boolean);
    const sent = resultData.filter((d) => d?.status === "ok").length;
    return { sent, failed: tokens.length - sent };
  } catch {
    return { sent: 0, failed: tokens.length };
  }
}
