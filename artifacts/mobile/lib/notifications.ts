import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
