import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, db } from "@/lib/supabase";

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
  const profile = await db.users.getById(supabaseUserId);
  if (!profile) return null;
  return {
    id: supabaseUserId,
    email,
    name: profile.name,
    role: profile.role,
    avatarLetter: profile.avatar_letter,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = await buildAuthUser(session.user.id, session.user.email ?? "");
        setUserState(u);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const u = await buildAuthUser(session.user.id, session.user.email ?? "");
        setUserState(u);
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
