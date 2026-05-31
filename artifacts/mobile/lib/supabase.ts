import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const SUPABASE_URL = "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemZzYmRjanloY29wdGJybGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTA4MjUsImV4cCI6MjA5NTY2NjgyNX0.SB-NiDEKp4RtVr9MSv255IPWoU2rp7td7b5ejccBG8Q";

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? SUPABASE_URL).replace(/\/+$/, "");
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = createClient(url, key, {
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
  avatar_url?: string;
  profile_banner?: string;
  created_at?: string;
};

export type DbUserSettings = {
  id?: string;
  user_id: string;
  parental_control?: boolean;
  content_rating?: string;
  stream_quality?: string;
  audio_lang?: string;
  subtitle_lang?: string;
  auto_play?: boolean;
  pip?: boolean;
  notif_push?: boolean;
  notif_lancamentos?: boolean;
  notif_continue?: boolean;
  notif_promo?: boolean;
  wifi_only?: boolean;
  smart_download?: boolean;
  download_quality?: string;
  theme?: string;
  updated_at?: string;
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

export type DbProfile = {
  id: string;
  user_id: string;
  name: string;
  avatar_url?: string | null;
  is_kids: boolean;
  created_at?: string;
};

export const db = {
  users: {
    register: async (email: string, name: string, passwordHash: string) => {
      const emailLower = email.toLowerCase().trim();
      const { data: existing } = await supabase.from("users").select("id").eq("email", emailLower).maybeSingle();
      if (existing) return { error: "Email já cadastrado" };
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      const role = (count ?? 0) === 0 ? "admin" : "user";
      const avatarLetter = name.trim()[0]?.toUpperCase() ?? "U";
      const { data, error } = await supabase
        .from("users")
        .insert({ email: emailLower, name: name.trim(), password_hash: passwordHash, role, avatar_letter: avatarLetter })
        .select().single();
      if (error) return { error: error.message };
      return { id: data.id, email: data.email, name: data.name, role: data.role, avatarLetter: data.avatar_letter };
    },

    login: async (email: string, passwordHash: string, fallbackHash?: string) => {
      const emailLower = email.toLowerCase().trim();

      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("email", emailLower)
        .maybeSingle();

      if (userError || !userData) return { error: "Email ou senha incorretos" };

      const stored = userData.password_hash as string;
      const hashesToTry = [passwordHash];
      if (fallbackHash && fallbackHash !== passwordHash) hashesToTry.push(fallbackHash);

      const matched = hashesToTry.find((h) => h === stored);

      if (!matched) return { error: "Email ou senha incorretos" };

      if (matched !== passwordHash) {
        try {
          await supabase.from("users").update({ password_hash: passwordHash }).eq("id", userData.id);
        } catch {}
      }

      return {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        avatarLetter: userData.avatar_letter,
        profileBanner: userData.profile_banner ?? null,
      };
    },

    getById: async (id: string): Promise<DbUser | null> => {
      const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
      return data as DbUser | null;
    },

    updateName: async (id: string, name: string): Promise<{ error?: string }> => {
      const avatarLetter = name.trim()[0]?.toUpperCase() ?? "U";
      const { error } = await supabase
        .from("users")
        .update({ name: name.trim(), avatar_letter: avatarLetter })
        .eq("id", id);
      return error ? { error: error.message } : {};
    },

    updatePassword: async (id: string, passwordHash: string): Promise<{ error?: string }> => {
      const { error } = await supabase.from("users").update({ password_hash: passwordHash }).eq("id", id);
      return error ? { error: error.message } : {};
    },

    updateBanner: async (id: string, bannerUrl: string | null): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("users")
        .update({ profile_banner: bannerUrl })
        .eq("id", id);
      return error ? { error: error.message } : {};
    },

    verifyPassword: async (id: string, passwordHash: string, fallbackHash?: string): Promise<boolean> => {
      const { data } = await supabase.from("users").select("password_hash").eq("id", id).maybeSingle();
      if (!data) return false;
      const stored = data.password_hash as string;
      return stored === passwordHash || (!!fallbackHash && stored === fallbackHash);
    },

    countAll: async (): Promise<number> => {
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  },

  userSettings: {
    get: async (userId: string): Promise<DbUserSettings | null> => {
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
      return data as DbUserSettings | null;
    },

    upsert: async (userId: string, settings: Partial<DbUserSettings>): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      return error ? { error: error.message } : {};
    },
  },

  watchlist: {
    getAll: async (userId: string): Promise<WatchlistItem[]> => {
      const { data } = await supabase.from("watchlist").select("*").eq("user_id", userId).order("added_at", { ascending: false });
      return (data ?? []) as WatchlistItem[];
    },

    add: async (item: WatchlistItem): Promise<boolean> => {
      const { error } = await supabase.from("watchlist").upsert(item, { onConflict: "user_id,tmdb_id,type" });
      return !error;
    },

    remove: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<boolean> => {
      const { error } = await supabase.from("watchlist").delete().eq("user_id", userId).eq("tmdb_id", tmdbId).eq("type", type);
      return !error;
    },

    isAdded: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<boolean> => {
      const { data } = await supabase.from("watchlist").select("id").eq("user_id", userId).eq("tmdb_id", tmdbId).eq("type", type).maybeSingle();
      return !!data;
    },

    countAll: async (): Promise<number> => {
      const { count } = await supabase.from("watchlist").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  },

  progress: {
    getAll: async (userId: string): Promise<WatchProgress[]> => {
      const { data } = await supabase.from("watch_progress").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
      return (data ?? []) as WatchProgress[];
    },

    getForShow: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<WatchProgress | null> => {
      const { data } = await supabase.from("watch_progress").select("*").eq("user_id", userId).eq("tmdb_id", tmdbId).eq("type", type).maybeSingle();
      return data as WatchProgress | null;
    },

    upsert: async (item: WatchProgress): Promise<boolean> => {
      const { error } = await supabase.from("watch_progress").upsert({ ...item, updated_at: new Date().toISOString() }, { onConflict: "user_id,tmdb_id,type" });
      return !error;
    },

    deleteAll: async (userId: string): Promise<boolean> => {
      const { error } = await supabase.from("watch_progress").delete().eq("user_id", userId);
      return !error;
    },
  },

  profiles: {
    getAll: async (userId: string): Promise<DbProfile[]> => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      return (data ?? []) as DbProfile[];
    },

    upsert: async (profile: Omit<DbProfile, "created_at">): Promise<{ data?: DbProfile; error?: string }> => {
      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          { id: profile.id, user_id: profile.user_id, name: profile.name, avatar_url: profile.avatar_url ?? null, is_kids: profile.is_kids },
          { onConflict: "id" }
        )
        .select()
        .single();
      if (error) return { error: error.message };
      return { data: data as DbProfile };
    },

    delete: async (profileId: string): Promise<boolean> => {
      const { error } = await supabase.from("profiles").delete().eq("id", profileId);
      return !error;
    },
  },

  ratings: {
    get: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<RatingItem | null> => {
      const { data } = await supabase.from("ratings").select("*").eq("user_id", userId).eq("tmdb_id", tmdbId).eq("type", type).maybeSingle();
      return data as RatingItem | null;
    },

    set: async (userId: string, tmdbId: number, type: "movie" | "tv", liked: boolean): Promise<boolean> => {
      const { error } = await supabase.from("ratings").upsert({ user_id: userId, tmdb_id: tmdbId, type, liked }, { onConflict: "user_id,tmdb_id,type" });
      return !error;
    },

    countAll: async (): Promise<number> => {
      const { count } = await supabase.from("ratings").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  },
};
