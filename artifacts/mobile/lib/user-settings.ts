import AsyncStorage from "@react-native-async-storage/async-storage";

const SETTINGS_KEY = "netplay_user_settings_v2";

export interface UserSettings {
  autoPlay: boolean;
  streamQuality: string;
  audioLang: string;
  subtitleLang: string;
  pip: boolean;
  wifiOnly: boolean;
  smartDownload: boolean;
  notifPush: boolean;
  notifLancamentos: boolean;
  notifContinue: boolean;
  notifPromo: boolean;
  parentalControl: boolean;
  contentRating: string;
  downloadQuality: string;
  theme: "dark" | "light";
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoPlay: true,
  streamQuality: "Auto",
  audioLang: "Português (BR)",
  subtitleLang: "Desativado",
  pip: false,
  wifiOnly: true,
  smartDownload: true,
  notifPush: true,
  notifLancamentos: true,
  notifContinue: false,
  notifPromo: false,
  parentalControl: false,
  contentRating: "16+",
  downloadQuality: "Boa (720p)",
  theme: "dark",
};

export async function getSettings(): Promise<UserSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  try {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch {}
}

export async function updateSetting<K extends keyof UserSettings>(
  key: K,
  value: UserSettings[K]
): Promise<void> {
  return saveSettings({ [key]: value } as Partial<UserSettings>);
}
