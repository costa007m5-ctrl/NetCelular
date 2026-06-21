import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getChangelogForVersion, type ChangelogEntry } from "@/lib/changelog";

const STORAGE_KEY = "@whats_new_seen_version";

export function useWhatsNew() {
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
        const seenVersion = await AsyncStorage.getItem(STORAGE_KEY);
        if (seenVersion === currentVersion) return;
        const changelog = getChangelogForVersion(currentVersion);
        if (!changelog) return;
        setEntry(changelog);
        setVisible(true);
      } catch {}
    }
    const timer = setTimeout(check, 1500);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = async () => {
    setVisible(false);
    try {
      const currentVersion = Constants.expoConfig?.version ?? "0.0.0";
      await AsyncStorage.setItem(STORAGE_KEY, currentVersion);
    } catch {}
  };

  return { visible, entry, dismiss };
}
