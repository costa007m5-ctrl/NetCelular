import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, db } from "@/lib/supabase";
import { registerPushToken, requestPermissionsAndSetup } from "@/lib/notifications";

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
  setUser: (u: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: async () => {},
});

async function buildAuthUser(supabaseUserId: string, email: string): Promise<AuthUser | null> {
  try {
    // 1. Try to find user by Supabase Auth UUID (new registrations)
    let profile = await db.users.getById(supabaseUserId);

    // 2. If not found by ID, look up by email (old custom-auth users whose UUID differs)
    if (!profile && email) {
      profile = await db.users.getByEmail(email);
    }

    // 3. Still not found — create a new row using the Supabase Auth UUID
    if (!profile) {
      const fallbackName = email.split("@")[0] || "Usuário";
      await db.users.upsertProfile(supabaseUserId, email, fallbackName);
      profile = await db.users.getById(supabaseUserId);
    }

    if (!profile) return null;

    // Block access for blocked users
    if (profile.blocked === true) return null;

    // Use the ID stored in the users table (may be old custom UUID),
    // so existing profiles/watchlist/etc. remain associated correctly.
    return {
      id: profile.id ?? supabaseUserId,
      email: profile.email ?? email,
      name: profile.name,
      role: profile.role,
      avatarLetter: profile.avatar_letter,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = await buildAuthUser(session.user.id, session.user.email ?? "");
        setUserState(u);
        if (u) {
          requestPermissionsAndSetup()
            .then((granted) => { if (granted) registerPushToken(u.id).catch(() => {}); })
            .catch(() => {});
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const u = await buildAuthUser(session.user.id, session.user.email ?? "");
        setUserState(u);
        if (u) {
          requestPermissionsAndSetup()
            .then((granted) => { if (granted) registerPushToken(u.id).catch(() => {}); })
            .catch(() => {});
        }
      } else {
        setUserState(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
