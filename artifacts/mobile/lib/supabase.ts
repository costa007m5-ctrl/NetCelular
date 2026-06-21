import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const SUPABASE_URL = "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemZzYmRjanloY29wdGJybGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTA4MjUsImV4cCI6MjA5NTY2NjgyNX0.SB-NiDEKp4RtVr9MSv255IPWoU2rp7td7b5ejccBG8Q";

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? SUPABASE_URL).replace(/\/+$/, "");
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

const webLocalStorage =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? {
        getItem: (key: string) => Promise.resolve(window.localStorage.getItem(key)),
        setItem: (key: string, value: string) => {
          window.localStorage.setItem(key, value);
          return Promise.resolve();
        },
        removeItem: (key: string) => {
          window.localStorage.removeItem(key);
          return Promise.resolve();
        },
      }
    : undefined;

export const supabase = createClient(url, key, {
  auth: {
    storage: Platform.OS !== "web" ? AsyncStorage : webLocalStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type ContentOverride = {
  id?: string;
  content_key: string;
  tmdb_id?: number | null;
  tmdb_type?: "movie" | "tv" | null;
  imdb_id?: string | null;
  custom_title?: string | null;
  custom_overview?: string | null;
  overview_mode: "auto" | "manual";
  poster_path?: string | null;
  backdrop_path?: string | null;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  vote_average?: number | null;
  updated_by?: string | null;
  updated_at?: string;
};

export type ShortsCommentReaction = {
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at?: string;
};

export type ShortsCommentRow = {
  id: string;
  post_id: string;
  tmdb_id: number;
  user_id: string;
  user_name: string;
  avatar_letter: string;
  avatar_url?: string | null;
  content: string;
  created_at: string;
};

export type ShortsFollow = {
  follower_id: string;
  followed_id: string;
  followed_name: string;
  followed_avatar_letter: string;
  followed_avatar_url?: string | null;
  created_at?: string;
};

export type DbUser = {
  id?: string;
  email: string;
  name: string;
  role: "user" | "admin";
  avatar_letter: string;
  avatar_url?: string;
  profile_banner?: string;
  created_at?: string;
  blocked?: boolean;
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
  profile_visibility?: string;
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

export type DbAiProfile = {
  user_id: string;
  top_genres: number[];
  top_titles: string[];
  recent_searches: string[];
  prefers_movies: boolean;
  prefers_series: boolean;
  prefers_anime: boolean;
  liked_ids: number[];
  disliked_ids: number[];
  watched_ids: number[];
  tab_frequency: Record<string, number>;
  total_events: number;
  updated_at?: string;
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

export type ContentReport = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path?: string;
  reason: "wrong_content" | "not_working" | "wrong_audio_sub" | "other";
  reason_label: string;
  status: "pending" | "resolved";
  created_at?: string;
};

export type PushToken = {
  id?: string;
  user_id: string;
  token: string;
  created_at?: string;
};

export type ReleaseReminder = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path?: string;
  release_date?: string;
  notif_id?: string;
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

    setBlocked: async (id: string, blocked: boolean): Promise<{ error?: string }> => {
      const { error } = await supabase.from("users").update({ blocked }).eq("id", id);
      return error ? { error: error.message } : {};
    },

    deleteAccount: async (id: string): Promise<{ error?: string }> => {
      const { error } = await supabase.from("users").delete().eq("id", id);
      return error ? { error: error.message } : {};
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

  contentReports: {
    add: async (report: Omit<ContentReport, "id" | "created_at" | "status">): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("content_reports")
        .insert({ ...report, status: "pending", created_at: new Date().toISOString() });
      return error ? { error: error.message } : {};
    },

    getAll: async (): Promise<ContentReport[]> => {
      const { data } = await supabase
        .from("content_reports")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as ContentReport[];
    },

    countPending: async (): Promise<number> => {
      const { count } = await supabase
        .from("content_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },

    markResolved: async (id: string): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("content_reports")
        .update({ status: "resolved" })
        .eq("id", id);
      return error ? { error: error.message } : {};
    },
  },

  newEpisodes: {
    get: async (tmdbId: number): Promise<{ season: number; episode: number; episode_title: string | null; air_date: string | null; poster_path: string | null; expires_at: string } | null> => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("new_episodes")
        .select("season,episode,episode_title,air_date,poster_path,expires_at")
        .eq("tmdb_id", tmdbId)
        .gt("expires_at", now)
        .order("notified_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any ?? null;
    },
    add: async (ep: { tmdb_id: number; season: number; episode: number; episode_title?: string | null; air_date?: string | null; poster_path?: string | null; expires_at: string }): Promise<void> => {
      await supabase
        .from("new_episodes")
        .upsert({ ...ep, notified_at: new Date().toISOString() }, { onConflict: "tmdb_id,season,episode" });
    },
  },

  reminders: {
    list: async (userId: string): Promise<ReleaseReminder[]> => {
      const { data } = await supabase
        .from("release_reminders")
        .select("*")
        .eq("user_id", userId)
        .order("release_date", { ascending: true });
      return (data ?? []) as ReleaseReminder[];
    },

    add: async (reminder: Omit<ReleaseReminder, "id" | "created_at">): Promise<ReleaseReminder | null> => {
      const { data, error } = await supabase
        .from("release_reminders")
        .upsert(reminder, { onConflict: "user_id,tmdb_id,type" })
        .select()
        .maybeSingle();
      if (error) return null;
      return data as ReleaseReminder | null;
    },

    remove: async (userId: string, tmdbId: number, type: "movie" | "tv"): Promise<void> => {
      await supabase
        .from("release_reminders")
        .delete()
        .eq("user_id", userId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type);
    },

    updateNotifId: async (userId: string, tmdbId: number, type: "movie" | "tv", notifId: string): Promise<void> => {
      await supabase
        .from("release_reminders")
        .update({ notif_id: notifId })
        .eq("user_id", userId)
        .eq("tmdb_id", tmdbId)
        .eq("type", type);
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

  tickets: {
    getByUser: async (userId: string): Promise<any[]> => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },

    create: async (userId: string, subject: string, message: string): Promise<{ error?: string }> => {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: userId,
        subject,
        message,
        status: "open",
        created_at: new Date().toISOString(),
      });
      return error ? { error: error.message } : {};
    },

    adminReply: async (ticketId: string, reply: string): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ admin_reply: reply })
        .eq("id", ticketId);
      return error ? { error: error.message } : {};
    },

    closeTicket: async (ticketId: string): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed" })
        .eq("id", ticketId);
      return error ? { error: error.message } : {};
    },

    getAll: async (): Promise<any[]> => {
      const { data } = await supabase
        .from("support_tickets")
        .select("*, users(name, email, avatar_letter)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  },

  contentOverrides: {
    get: async (contentKey: string): Promise<ContentOverride | null> => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token ?? key;
        const res = await fetch(
          `${url}/rest/v1/content_overrides?content_key=eq.${encodeURIComponent(contentKey)}&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: "application/json" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return (data?.[0] as ContentOverride) ?? null;
      } catch {
        return null;
      }
    },

    upsert: async (
      contentKey: string,
      override: Partial<Omit<ContentOverride, "content_key" | "id">>,
      userId: string
    ): Promise<{ error?: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? key;
      const payload = {
        content_key: contentKey,
        ...override,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(`${url}/rest/v1/content_overrides?on_conflict=content_key`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${token}`,
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok || res.status === 201 || res.status === 204) return {};
        const errData = await res.json().catch(() => null);
        return { error: errData?.message ?? errData?.details ?? `HTTP ${res.status}` };
      } catch (e: any) {
        clearTimeout(timer);
        if (e?.name === "AbortError") return { error: "Conexão demorou demais. Verifique sua internet." };
        return { error: e?.message ?? "Erro desconhecido ao salvar." };
      }
    },

    remove: async (contentKey: string): Promise<{ error?: string }> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? key;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(
          `${url}/rest/v1/content_overrides?content_key=eq.${encodeURIComponent(contentKey)}`,
          {
            method: "DELETE",
            headers: {
              apikey: key,
              Authorization: `Bearer ${token}`,
              Prefer: "return=minimal",
            },
            signal: controller.signal,
          }
        );
        clearTimeout(timer);
        if (res.ok || res.status === 204) return {};
        const errData = await res.json().catch(() => null);
        return { error: errData?.message ?? `HTTP ${res.status}` };
      } catch (e: any) {
        clearTimeout(timer);
        return { error: e?.message ?? "Erro ao remover." };
      }
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

  aiProfile: {
    get: async (userId: string): Promise<DbAiProfile | null> => {
      const { data } = await supabase
        .from("user_ai_profile")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return data as DbAiProfile | null;
    },

    upsert: async (userId: string, profile: Omit<DbAiProfile, "user_id" | "updated_at">): Promise<{ error?: string }> => {
      const { error } = await supabase
        .from("user_ai_profile")
        .upsert(
          {
            user_id: userId,
            ...profile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      return error ? { error: error.message } : {};
    },

    delete: async (userId: string): Promise<void> => {
      await supabase.from("user_ai_profile").delete().eq("user_id", userId);
    },
  },

  shorts: {
    comments: {
      get: async (postId: string, limit = 80): Promise<ShortsCommentRow[]> => {
        const { data } = await supabase
          .from("shorts_comments")
          .select("*")
          .eq("post_id", postId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return (data ?? []) as ShortsCommentRow[];
      },
      add: async (comment: ShortsCommentRow): Promise<{ error?: string }> => {
        const { error } = await supabase.from("shorts_comments").insert(comment);
        return error ? { error: error.message } : {};
      },
      delete: async (id: string, userId: string): Promise<{ error?: string }> => {
        const { error } = await supabase
          .from("shorts_comments")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);
        return error ? { error: error.message } : {};
      },
      countByUser: async (userId: string): Promise<number> => {
        const { count } = await supabase
          .from("shorts_comments")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);
        return count ?? 0;
      },
    },
    reactions: {
      getForComments: async (commentIds: string[]): Promise<ShortsCommentReaction[]> => {
        if (!commentIds.length) return [];
        const { data } = await supabase
          .from("shorts_comment_reactions")
          .select("*")
          .in("comment_id", commentIds);
        return (data ?? []) as ShortsCommentReaction[];
      },
      toggle: async (commentId: string, userId: string, emoji: string): Promise<{ added: boolean; error?: string }> => {
        const { data: existing } = await supabase
          .from("shorts_comment_reactions")
          .select("comment_id")
          .eq("comment_id", commentId)
          .eq("user_id", userId)
          .eq("emoji", emoji)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("shorts_comment_reactions")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", userId)
            .eq("emoji", emoji);
          return error ? { added: false, error: error.message } : { added: false };
        } else {
          const { error } = await supabase
            .from("shorts_comment_reactions")
            .insert({ comment_id: commentId, user_id: userId, emoji, created_at: new Date().toISOString() });
          return error ? { added: false, error: error.message } : { added: true };
        }
      },
    },
    follows: {
      follow: async (
        followerId: string, followedId: string,
        followedName: string, followedAvatarLetter: string,
        followedAvatarUrl?: string | null,
      ): Promise<{ error?: string }> => {
        const { error } = await supabase
          .from("shorts_follows")
          .upsert(
            {
              follower_id: followerId,
              followed_id: followedId,
              followed_name: followedName,
              followed_avatar_letter: followedAvatarLetter,
              followed_avatar_url: followedAvatarUrl ?? null,
              created_at: new Date().toISOString(),
            },
            { onConflict: "follower_id,followed_id" }
          );
        return error ? { error: error.message } : {};
      },
      unfollow: async (followerId: string, followedId: string): Promise<{ error?: string }> => {
        const { error } = await supabase
          .from("shorts_follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("followed_id", followedId);
        return error ? { error: error.message } : {};
      },
      getFollowing: async (followerId: string): Promise<ShortsFollow[]> => {
        const { data } = await supabase
          .from("shorts_follows")
          .select("*")
          .eq("follower_id", followerId)
          .order("created_at", { ascending: false });
        return (data ?? []) as ShortsFollow[];
      },
      getFollowingIds: async (followerId: string): Promise<Set<string>> => {
        const { data } = await supabase
          .from("shorts_follows")
          .select("followed_id")
          .eq("follower_id", followerId);
        return new Set(((data ?? []) as { followed_id: string }[]).map((r) => r.followed_id));
      },
      followerCount: async (followedId: string): Promise<number> => {
        const { count } = await supabase
          .from("shorts_follows")
          .select("*", { count: "exact", head: true })
          .eq("followed_id", followedId);
        return count ?? 0;
      },
      followingCount: async (followerId: string): Promise<number> => {
        const { count } = await supabase
          .from("shorts_follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", followerId);
        return count ?? 0;
      },
    },
  },
};
