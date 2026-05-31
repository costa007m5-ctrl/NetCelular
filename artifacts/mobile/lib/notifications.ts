import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/lib/supabase";

const NOTIF_KEY = "netplay_notif_enabled";

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

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === "web" || !userId) return;
  try {
    const Notifications = require("expo-notifications");
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
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

export async function sendContentAddedNotification(contentTitle: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = require("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎬 Conteúdo disponível!",
        body: `"${contentTitle}" foi adicionado ao NETPLAY. Assista agora!`,
        sound: true,
      },
      trigger: null,
    });
  } catch {}
}

export async function sendPushNotificationsToTokens(
  tokens: string[],
  title: string,
  body: string
): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  try {
    const messages = tokens.map((to) => ({ to, title, body, sound: "default" }));
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
    const data: any[] = Array.isArray(json?.data) ? json.data : [json?.data].filter(Boolean);
    const sent = data.filter((d) => d?.status === "ok").length;
    return { sent, failed: tokens.length - sent };
  } catch {
    return { sent: 0, failed: tokens.length };
  }
}
