import AsyncStorage from "@react-native-async-storage/async-storage";

const ANALYTICS_KEY = "netplay_analytics_events";
const MAX_EVENTS = 200;

export interface AnalyticsEvent {
  event: string;
  properties?: Record<string, any>;
  timestamp: number;
}

async function track(event: string, properties?: Record<string, any>) {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    const events: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    events.push({ event, properties, timestamp: Date.now() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(events));
  } catch {}
}

async function getEvents(): Promise<AnalyticsEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function clearEvents() {
  try {
    await AsyncStorage.removeItem(ANALYTICS_KEY);
  } catch {}
}

export const analytics = { track, getEvents, clearEvents };

// Helpers
export function trackView(contentId: string | number, title: string, type: "movie" | "tv") {
  return analytics.track("content_view", { contentId, title, type });
}

export function trackPlay(contentId: string | number, title: string, type: "movie" | "tv", source: string) {
  return analytics.track("content_play", { contentId, title, type, source });
}

export function trackSearch(query: string, resultCount: number) {
  return analytics.track("search", { query, resultCount });
}

export function trackWatchlistToggle(contentId: string | number, title: string, added: boolean) {
  return analytics.track(added ? "watchlist_add" : "watchlist_remove", { contentId, title });
}

export function trackProfileSwitch(profileName: string) {
  return analytics.track("profile_switch", { profileName });
}
