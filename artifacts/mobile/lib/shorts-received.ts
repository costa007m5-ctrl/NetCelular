import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX  = "netplay_received_short_v1:";
const INDEX_KEY   = "netplay_received_shorts_index_v1";
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_INDEX   = 30; // keep at most 30 entries in index

export interface ReceivedShort {
  tmdbId: number;
  contentType: string;
  title: string;
  poster?: string;
  senderId: string;
  senderName: string;
  receivedAt: number;
  reacted?: boolean;
  reactedEmoji?: string;
}

// ── internal helpers ──────────────────────────────────────────────────────────

async function _readIndex(): Promise<ReceivedShort[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReceivedShort[];
  } catch {
    return [];
  }
}

async function _writeIndex(items: ReceivedShort[]): Promise<void> {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(items));
  } catch {}
}

// ── public API ────────────────────────────────────────────────────────────────

export async function saveReceivedShort(data: ReceivedShort): Promise<void> {
  try {
    // Write individual key
    await AsyncStorage.setItem(KEY_PREFIX + data.tmdbId, JSON.stringify(data));
    // Update index (deduplicate by tmdbId, newest first)
    const index = await _readIndex();
    const filtered = index.filter((i) => i.tmdbId !== data.tmdbId);
    const updated  = [data, ...filtered].slice(0, MAX_INDEX);
    await _writeIndex(updated);
  } catch {}
}

export async function getReceivedShort(tmdbId: number): Promise<ReceivedShort | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + tmdbId);
    if (!raw) return null;
    const data: ReceivedShort = JSON.parse(raw);
    if (Date.now() - data.receivedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(KEY_PREFIX + tmdbId);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function getAllReceivedShorts(): Promise<ReceivedShort[]> {
  try {
    const index = await _readIndex();
    const now   = Date.now();
    // Filter out expired, return newest first
    return index.filter((i) => now - i.receivedAt <= MAX_AGE_MS);
  } catch {
    return [];
  }
}

export async function markReacted(tmdbId: number, emoji?: string): Promise<void> {
  try {
    // Update individual key
    const existing = await getReceivedShort(tmdbId);
    if (existing) {
      const updated = { ...existing, reacted: true, ...(emoji ? { reactedEmoji: emoji } : {}) };
      await AsyncStorage.setItem(KEY_PREFIX + tmdbId, JSON.stringify(updated));
    }
    // Update index entry
    const index   = await _readIndex();
    const updated = index.map((i) =>
      i.tmdbId === tmdbId ? { ...i, reacted: true, ...(emoji ? { reactedEmoji: emoji } : {}) } : i
    );
    await _writeIndex(updated);
  } catch {}
}
