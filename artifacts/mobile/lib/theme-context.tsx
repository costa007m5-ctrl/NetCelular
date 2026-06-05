import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppTheme = "dark" | "light" | "system";

const THEME_KEY = "netplay_theme_v2";

interface ThemeContextValue {
  theme: AppTheme;
  resolvedTheme: "dark" | "light";
  setTheme: (t: AppTheme) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: async () => {},
  toggleTheme: async () => {},
});

function resolveTheme(pref: AppTheme, system: ColorSchemeName): "dark" | "light" {
  if (pref === "system") return system === "light" ? "light" : "dark";
  return pref;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("dark");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme()
  );

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((raw) => {
        if (raw === "light" || raw === "dark" || raw === "system") {
          setThemeState(raw);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setTheme = useCallback(async (t: AppTheme) => {
    setThemeState(t);
    await AsyncStorage.setItem(THEME_KEY, t);
  }, []);

  const toggleTheme = useCallback(async () => {
    const order: AppTheme[] = ["dark", "light", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    await setTheme(next);
  }, [theme, setTheme]);

  const resolvedTheme = resolveTheme(theme, systemScheme);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
