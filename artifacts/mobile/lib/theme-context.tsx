import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppTheme = "dark" | "light";

const THEME_KEY = "netplay_theme_v1";

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (t: AppTheme) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: async () => {},
  toggleTheme: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("dark");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((raw) => {
        if (raw === "light" || raw === "dark") setThemeState(raw);
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback(async (t: AppTheme) => {
    setThemeState(t);
    await AsyncStorage.setItem(THEME_KEY, t);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: AppTheme = theme === "dark" ? "light" : "dark";
    await setTheme(next);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
