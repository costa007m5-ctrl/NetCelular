/**
 * shorts-digest.ts — Weekly "Shorts de Amigos" notification digest.
 *
 * Strategy: on app foreground, check if 7+ days have passed since the last
 * digest AND there are unread received Shorts. If so, fire an immediate local
 * notification whose body reflects the real unread count. This avoids static
 * scheduled notifications with stale content.
 *
 * Settings: stored under "netplay_digest_enabled_v1" (boolean, default true).
 * Last sent: stored under "netplay_digest_last_sent_v1" (unix ms timestamp).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { getAllReceivedShorts } from "./shorts-received";

const DIGEST_ENABLED_KEY  = "netplay_digest_enabled_v1";
const DIGEST_LAST_SENT_KEY = "netplay_digest_last_sent_v1";
const DIGEST_INTERVAL_MS   = 7 * 24 * 60 * 60 * 1000; // 7 days
const NOTIFICATION_ID_KEY  = "netplay_digest_notif_id_v1";

// ── Settings helpers ──────────────────────────────────────────────────────────

export async function isDigestEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DIGEST_ENABLED_KEY);
    return raw === null ? true : raw === "true"; // default on
  } catch {
    return true;
  }
}

export async function setDigestEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(DIGEST_ENABLED_KEY, String(enabled));
    if (!enabled) await cancelScheduledDigest();
  } catch {}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function getLastSent(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DIGEST_LAST_SENT_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

async function markSent(): Promise<void> {
  try {
    await AsyncStorage.setItem(DIGEST_LAST_SENT_KEY, String(Date.now()));
  } catch {}
}

async function cancelScheduledDigest(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call this when the app comes to foreground (AppState → active).
 * Fires a local push notification if:
 *   1. Digest is enabled
 *   2. 7+ days have passed since last digest (or never sent)
 *   3. There is at least one unread received Short
 */
export async function maybeSendDigest(): Promise<void> {
  try {
    const enabled = await isDigestEnabled();
    if (!enabled) return;

    const lastSent = await getLastSent();
    if (Date.now() - lastSent < DIGEST_INTERVAL_MS) return;

    const received = await getAllReceivedShorts();
    const unread   = received.filter((s) => !s.reacted);
    if (unread.length === 0) return;

    // Build a human-readable summary
    const count = unread.length;
    const senders = [...new Set(unread.map((s) => s.senderName))];
    const senderStr =
      senders.length === 1
        ? senders[0]
        : senders.length === 2
        ? `${senders[0]} e ${senders[1]}`
        : `${senders[0]} e mais ${senders.length - 1}`;

    const title = count === 1
      ? `🎬 ${senders[0]} enviou um Short para você!`
      : `🎬 ${count} Shorts de amigos esperando!`;

    const body = count === 1
      ? `"${unread[0].title}" — Toque para assistir e reagir!`
      : `${senderStr} recomendar${senders.length > 1 ? "am" : "ou"} conteúdos esta semana. Confira!`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: "shorts_digest" },
        sound: true,
      } as any,
      trigger: null, // fire immediately
    });

    await markSent();
  } catch {}
}

/**
 * Returns a formatted summary for display (used in profile settings preview).
 */
export async function getDigestPreview(): Promise<{ count: number; lastSent: number | null }> {
  try {
    const received = await getAllReceivedShorts();
    const unread   = received.filter((s) => !s.reacted);
    const lastSent = await getLastSent();
    return { count: unread.length, lastSent: lastSent || null };
  } catch {
    return { count: 0, lastSent: null };
  }
}
