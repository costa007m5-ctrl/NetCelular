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

export type ContentRequest = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path?: string;
  status: "pending" | "added";
  created_at?: string;
};

export type PushToken = {
  id?: string;
  user_id: string;
  token: string;
  created_at?: string;
};

export type DbSubscription = {
  id?: string;
  user_id: string;
  plan: "trial" | "basic" | "normal" | "premium";
  screen_limit: number;
  trial_started_at?: string | null;
  plan_activated_at?: string | null;
  plan_expires_at?: string | null;
  selected_plan?: string | null;
  created_at?: string;
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
    upsertProfile: async (id: string, email: string, name: string): Promise<{ error?: string }> => {
      const emailLower = email.toLowerCase().trim();
      const { count } = await supabase.from("users").select("*", { count: "exact", head: true });
      const role = (count ?? 0) === 0 ? "admin" : "user";
      const avatarLetter = name.trim()[0]?.toUpperCase() ?? "U";
      const { error } = await supabase
        .from("users")
        .upsert(
          { id, email: emailLower, name: name.trim(), role, avatar_letter: avatarLetter },
          { onConflict: "id" }
        );
      return error ? { error: error.message } : {};
    },

    getById: async (id: string): Promise<DbUser | null> => {
      const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
      return data as DbUser | null;
    },

    getByEmail: async (email: string): Promise<DbUser | null> => {
      const { data } = await supabase.from("users").select("*").eq("email", email.toLowerCase().trim()).maybeSingle();
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

    updateBanner: async (id: string, bannerUrl: string | null): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("users")
        .update({ profile_banner: bannerUrl })
        .eq("id", id);
      return error ? { error: error.message } : {};
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
        .select();
      if (error) return { error: error.message };
      return { data: (data?.[0] ?? undefined) as DbProfile | undefined };
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

  contentRequests: {
    add: async (req: Omit<ContentRequest, "id" | "created_at" | "status">): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("content_requests")
        .upsert(
          { ...req, status: "pending", created_at: new Date().toISOString() },
          { onConflict: "user_id,tmdb_id,type" }
        );
      return error ? { error: error.message } : {};
    },

    getAll: async (): Promise<ContentRequest[]> => {
      const { data } = await supabase
        .from("content_requests")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as ContentRequest[];
    },

    getByUser: async (userId: string): Promise<ContentRequest[]> => {
      const { data } = await supabase
        .from("content_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return (data ?? []) as ContentRequest[];
    },

    getUserIdsForContent: async (tmdbId: number, type: "movie" | "tv"): Promise<string[]> => {
      const { data } = await supabase
        .from("content_requests")
        .select("user_id")
        .eq("tmdb_id", tmdbId)
        .eq("type", type)
        .eq("status", "pending");
      return (data ?? []).map((r: any) => r.user_id);
    },

    markAdded: async (tmdbId: number, type: "movie" | "tv"): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("content_requests")
        .update({ status: "added" })
        .eq("tmdb_id", tmdbId)
        .eq("type", type);
      return error ? { error: error.message } : {};
    },

    countPending: async (): Promise<number> => {
      const { count } = await supabase
        .from("content_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  },

  pushTokens: {
    upsert: async (userId: string, token: string): Promise<void> => {
      await supabase
        .from("push_tokens")
        .upsert({ user_id: userId, token, created_at: new Date().toISOString() }, { onConflict: "user_id" });
    },

    getForUsers: async (userIds: string[]): Promise<string[]> => {
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("push_tokens")
        .select("token")
        .in("user_id", userIds);
      return (data ?? []).map((r: any) => r.token).filter(Boolean);
    },

    getAll: async (): Promise<string[]> => {
      const { data } = await supabase.from("push_tokens").select("token");
      return (data ?? []).map((r: any) => r.token).filter(Boolean);
    },
  },

  subscriptions: {
    get: async (userId: string): Promise<DbSubscription | null> => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return data as DbSubscription | null;
    },

    create: async (userId: string, selectedPlan = "trial"): Promise<void> => {
      const { error } = await supabase.from("user_subscriptions").upsert(
        {
          user_id: userId,
          plan: "trial",
          screen_limit: 1,
          trial_started_at: new Date().toISOString(),
          selected_plan: selectedPlan,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw new Error(error.message);
    },

    activate: async (userId: string, plan: string, days: number): Promise<{ error?: string }> => {
      const screenLimits: Record<string, number> = { trial: 1, basic: 1, normal: 2, premium: 4 };
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from("user_subscriptions").upsert(
        {
          user_id: userId,
          plan,
          screen_limit: screenLimits[plan] ?? 1,
          plan_activated_at: new Date().toISOString(),
          plan_expires_at: expiresAt,
        },
        { onConflict: "user_id" }
      );
      return error ? { error: error.message } : {};
    },

    getAllWithUsers: async (): Promise<Array<{ user: DbUser; sub: DbSubscription | null }>> => {
      const { data: users } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });
      const { data: subs } = await supabase.from("user_subscriptions").select("*");
      const subsMap = new Map((subs ?? []).map((s: any) => [s.user_id, s]));
      return (users ?? []).map((u: any) => ({
        user: u as DbUser,
        sub: (subsMap.get(u.id) ?? null) as DbSubscription | null,
      }));
    },
  },

  sessions: {
    start: async (
      userId: string,
      deviceId: string,
      screenLimit: number
    ): Promise<{ token: string; allowed: boolean }> => {
      const staleThreshold = new Date(Date.now() - 60 * 1000).toISOString();
      await supabase
        .from("active_sessions")
        .delete()
        .eq("user_id", userId)
        .lt("last_heartbeat", staleThreshold);

      const { count } = await supabase
        .from("active_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      if ((count ?? 0) >= screenLimit) {
        return { token: "", allowed: false };
      }

      const token = `${userId}-${deviceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await supabase.from("active_sessions").insert({
        user_id: userId,
        device_id: deviceId,
        session_token: token,
        started_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      });
      return { token, allowed: true };
    },

    heartbeat: async (token: string): Promise<void> => {
      await supabase
        .from("active_sessions")
        .update({ last_heartbeat: new Date().toISOString() })
        .eq("session_token", token);
    },

    end: async (token: string): Promise<void> => {
      await supabase.from("active_sessions").delete().eq("session_token", token);
    },

    countActive: async (userId: string): Promise<number> => {
      const staleThreshold = new Date(Date.now() - 60 * 1000).toISOString();
      const { count } = await supabase
        .from("active_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gt("last_heartbeat", staleThreshold);
      return count ?? 0;
    },
  },
};
