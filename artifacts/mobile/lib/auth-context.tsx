import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_KEY = "netplay_user_v1";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  avatarLetter: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY)
      .then((raw) => {
        if (raw) setUserState(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setUser = useCallback(async (u: AuthUser | null) => {
    setUserState(u);
    if (u) {
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(u));
    } else {
      await AsyncStorage.removeItem(AUTH_KEY);
    }
  }, []);

  const logout = useCallback(async () => {
    await setUser(null);
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = "netplay_salt_2024_v1";
  const msg = password + salt;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(msg);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return simpleHashPassword(password);
}

export function simpleHashPassword(password: string): string {
  const salt = "netplay_salt_2024_v1";
  const msg = password + salt;
  let hash = 0;
  for (let i = 0; i < msg.length; i++) {
    hash = (hash << 5) - hash + msg.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
