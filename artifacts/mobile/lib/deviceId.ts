import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "netplay_device_id";

let cached: string | null = null;

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const id = generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    cached = id;
    return id;
  } catch {
    if (!cached) cached = generateId();
    return cached;
  }
}
