import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: Platform.OS !== "web" ? AsyncStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export type WatchlistItem = {
  id?: string;
  device_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string;
  backdrop_path?: string;
  added_at?: string;
};

export type WatchProgress = {
  id?: string;
  device_id: string;
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

export const db = {
  watchlist: {
    getAll: async (deviceId: string): Promise<WatchlistItem[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("watchlist")
        .select("*")
        .eq("device_id", deviceId)
        .order("added_at", { ascending: false });
      if (error) console.warn("Supabase watchlist error:", error.message);
      return (data ?? []) as WatchlistItem[];
    },

    add: async (item: WatchlistItem): Promise<boolean> => {
      if (!supabase) return false;
      const { error } = await supabase.from("watchlist").upsert(item, {
        onConflict: "device_id,tmdb_id,type",
      });
      if (error) console.warn("Supabase add watchlist error:", error.message);
      return !error;
    },

    remove: async (deviceId: string, tmdbId: number, type: "movie" | "tv"): Promise<boolean> => {
      if (!supabase) return false;
      const { error } = await supabase
        .from("watchlist")
        .delete()
        .eq("device_id", deviceId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type);
      if (error) console.warn("Supabase remove watchlist error:", error.message);
      return !error;
    },

    isAdded: async (deviceId: string, tmdbId: number, type: "movie" | "tv"): Promise<boolean> => {
      if (!supabase) return false;
      const { data } = await supabase
        .from("watchlist")
        .select("id")
        .eq("device_id", deviceId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type)
        .maybeSingle();
      return !!data;
    },
  },

  progress: {
    getAll: async (deviceId: string): Promise<WatchProgress[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("watch_progress")
        .select("*")
        .eq("device_id", deviceId)
        .order("updated_at", { ascending: false });
      if (error) console.warn("Supabase progress error:", error.message);
      return (data ?? []) as WatchProgress[];
    },

    upsert: async (item: WatchProgress): Promise<boolean> => {
      if (!supabase) return false;
      const { error } = await supabase.from("watch_progress").upsert(
        { ...item, updated_at: new Date().toISOString() },
        { onConflict: "device_id,tmdb_id,type" }
      );
      if (error) console.warn("Supabase progress upsert error:", error.message);
      return !error;
    },
  },
};
