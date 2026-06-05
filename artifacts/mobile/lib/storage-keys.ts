/** Centralized storage keys to avoid collisions across the app */
export const STORAGE_KEYS = {
  ACTIVE_PROFILE: "netplay_active_profile_v2",
  PROFILE_BANNER: "netplay_profile_banner",
  USER_SETTINGS: "netplay_settings_v2",
  RECENT_SEARCHES: "netplay_recent_searches",
  WATCH_HISTORY: "netplay_watch_history_v2",
  ANALYTICS_EVENTS: "netplay_analytics_events",
  NOTIFICATION_COUNT: "netplay_unread_notif_count",
  LEARN_PREFS: "netplay_learned_prefs_v1",
  MANUAL_PREFS: "netplay_manual_prefs_v1",
  FAVORITES: "netplay_favorites_v2",
  DOWNLOAD_QUEUE: "netplay_downloads_v1",
  THEME: "netplay_theme_v2",
  ONBOARDING_DONE: "netplay_onboarding_done",
  DEVICE_ID: "netplay_device_id",
  PUSH_TOKEN: "netplay_push_token",
  CATALOG_CACHE: "netplay_catalog_cache_v3",
  API_CACHE_PREFIX: "netplay_api_cache_",
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
