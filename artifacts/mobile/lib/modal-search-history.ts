import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "netplay_modal_searches_";
const MAX = 8;

function storageKey(title: string) {
  return PREFIX + title.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export async function getModalHistory(title: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(title));
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

export async function addToModalHistory(title: string, query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    const prev = await getModalHistory(title);
    const next = [q, ...prev.filter((h) => h !== q)].slice(0, MAX);
    await AsyncStorage.setItem(storageKey(title), JSON.stringify(next));
  } catch {}
}

export async function clearModalHistory(title: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(title));
  } catch {}
}
