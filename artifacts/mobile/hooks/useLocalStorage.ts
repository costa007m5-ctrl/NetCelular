import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** React hook to persist state in AsyncStorage */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => Promise<void>, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (raw !== null) {
          try {
            setValue(JSON.parse(raw));
          } catch {
            setValue(defaultValue);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [key]);

  const set = useCallback(
    async (next: T | ((prev: T) => T)) => {
      const nextValue = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      setValue(nextValue);
      try {
        await AsyncStorage.setItem(key, JSON.stringify(nextValue));
      } catch {}
    },
    [key, value]
  );

  return [value, set, loading];
}
