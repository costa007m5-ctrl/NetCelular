import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && key);

const _url = url || "https://placeholder.supabase.co";
const _key = key || "placeholder-key";

export const supabase = createClient(_url, _key, {
  auth: {
    storage: Platform.OS !== "web" ? AsyncStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type DbUser = {
  id?: string;
  email: string;
  name: string;
  password_hash: string;
  role: "user" | "admin";
  avatar_letter: string;
  created_at?: string;
};

export type WatchlistItem = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string;
  backdrop_path?: string;
  added_at?: string;
};

export type WatchProgress = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string;
  backdrop_path?: string;
  progress: number;
  season?: number;
  episode?: number;
  updated_at?: string;
};

export type RatingItem = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  liked: boolean;
};

export const db = {
  users: {
    register: async (email: string, name: string, passwordHash: string) => {
      const emailLower = email.toLowerCase().trim();
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();
      if (existing) return { error: "Email já cadastrado" };

      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      const role = (count ?? 0) === 0 ? "admin" : "user";
      const avatarLetter = name.trim()[0]?.toUpperCase() ?? "U";

      const { data, error } = await supabase
        .from("users")
        .insert({ email: emailLower, name: name.trim(), password_hash: passwordHash, role, avatar_letter: avatarLetter })
        .select()
        .single();
      if (error) return { error: error.message };
      return { id: data.id, email: data.email, name: data.name, role: data.role, avatarLetter: data.avatar_letter };
    },

    login: async (email: string, passwordHash: string, fallbackHash?: string) => {
      const emailLower = email.toLowerCase().trim();
      let { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", emailLower)
        .eq("password_hash", passwordHash)
        .maybeSingle();

      if ((error || !data) && fallbackHash) {
        const res = await supabase
          .from("users")
          .select("*")
          .eq("email", emailLower)
          .eq("password_hash", fallbackHash)
          .maybeSingle();
        if (!res.error && res.data) {
          data = res.data;
          error = null;
          await supabase
            .from("users")
            .update({ password_hash: passwordHash })
            .eq("id", res.data.id);
        }
      }

      if (error || !data) return { error: "Email ou senha incorretos" };
      return { id: data.id, email: data.email, name: data.name, role: data.role, avatarLetter: data.avatar_letter };
    },

    countAll: async (): Promise<number> => {
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  },

  watchlist: {
    getAll: async (userId: string): Promise<WatchlistItem[]> => {
      const { data } = await supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", userId)
        .order("added_at", { ascending: false });
      return (data ?? []) as WatchlistItem[];
    },

    add: async (item: WatchlistItem): Promise<boolean> => {
      const { error } = await supabase.from("watchlist").upsert(item, { onConflict: "user_id,tmdb_id,type" });
      return !error;
    },

    remove: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<boolean> => {
      const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("user_id", userId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type);
      return !error;
    },

    isAdded: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<boolean> => {
      const { data } = await supabase
        .from("watchlist")
        .select("id")
        .eq("user_id", userId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type)
        .maybeSingle();
      return !!data;
    },

    countAll: async (): Promise<number> => {
      const { count } = await supabase.from("watchlist").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  },

  progress: {
    getAll: async (userId: string): Promise<WatchProgress[]> => {
      const { data } = await supabase
        .from("watch_progress")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      return (data ?? []) as WatchProgress[];
    },

    getForShow: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<WatchProgress | null> => {
      const { data } = await supabase
        .from("watch_progress")
        .select("*")
        .eq("user_id", userId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type)
        .maybeSingle();
      return data as WatchProgress | null;
    },

    upsert: async (item: WatchProgress): Promise<boolean> => {
      const { error } = await supabase
        .from("watch_progress")
        .upsert({ ...item, updated_at: new Date().toISOString() }, { onConflict: "user_id,tmdb_id,type" });
      return !error;
    },
  },

  ratings: {
    get: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<RatingItem | null> => {
      const { data } = await supabase
        .from("ratings")
        .select("*")
        .eq("user_id", userId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type)
        .maybeSingle();
      return data as RatingItem | null;
    },

    set: async (userId: string, tmdbId: number, type: "movie" | "tv", liked: boolean): Promise<boolean> => {
      const { error } = await supabase
        .from("ratings")
        .upsert({ user_id: userId, tmdb_id: tmdbId, type, liked }, { onConflict: "user_id,tmdb_id,type" });
      return !error;
    },

    countAll: async (): Promise<number> => {
      const { count } = await supabase.from("ratings").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  },
};
