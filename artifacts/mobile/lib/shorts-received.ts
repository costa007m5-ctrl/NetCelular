import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "netplay_received_short_v1:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ReceivedShort {
  tmdbId: number;
  contentType: string;
  title: string;
  poster?: string;
  senderId: string;
  senderName: string;
  receivedAt: number;
  reacted?: boolean; // true once the user has already reacted
}

export async function saveReceivedShort(data: ReceivedShort): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + data.tmdbId, JSON.stringify(data));
  } catch {}
}

export async function getReceivedShort(tmdbId: number): Promise<ReceivedShort | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + tmdbId);
    if (!raw) return null;
    const data: ReceivedShort = JSON.parse(raw);
    // Expire after 7 days
    if (Date.now() - data.receivedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(KEY_PREFIX + tmdbId);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function markReacted(tmdbId: number): Promise<void> {
  try {
    const existing = await getReceivedShort(tmdbId);
    if (!existing) return;
    await AsyncStorage.setItem(KEY_PREFIX + tmdbId, JSON.stringify({ ...existing, reacted: true }));
  } catch {}
}
