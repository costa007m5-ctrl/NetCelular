import { Platform } from "react-native";
import Constants from "expo-constants";

const EMBEDTV_DIRECT = "https://embedtv.lat/api";

function getBase(): string {
  if (Platform.OS === "web") return "/api";
  const domain =
    process.env.EXPO_PUBLIC_DOMAIN ||
    (Constants.expoConfig?.extra as any)?.apiDomain ||
    null;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
}

const BASE = getBase();

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LiveChannel {
  id: string;
  image: string;
  name: string;
  categories: number[];
  preview: string;
  url: string;
}

export interface LiveCategory {
  id: number;
  name: string;
}

export interface EpgEntry {
  id: string;
  epg: {
    title: string;
    desc: string;
    start_date: string;
  };
}

export interface ChannelsResponse {
  categories: LiveCategory[];
  channels: LiveChannel[];
}

export interface JogoTimer {
  day: string;
  start: number;
  end: number;
}

export interface JogoTeam {
  name: string;
  image: string;
}

export interface JogoEntry {
  title: string;
  image: string;
  data: {
    league: string;
    timer: JogoTimer;
    teams: {
      home: JogoTeam;
      away: JogoTeam;
    };
  };
  players: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mkSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

async function fetchWithFallback(apiPath: string, directPath: string): Promise<any> {
  try {
    const res = await fetch(`${BASE}${apiPath}`, { signal: mkSignal(12000) });
    if (res.ok) {
      const data = await res.json();
      const valid = Array.isArray(data) ? data.length > 0 : data?.channels?.length > 0;
      if (valid) return data;
    }
  } catch {}

  if (Platform.OS !== "web") {
    const res = await fetch(`${EMBEDTV_DIRECT}${directPath}`);
    if (!res.ok) throw new Error(`embedtv error ${res.status}`);
    return res.json();
  }

  throw new Error("Failed to fetch live TV data");
}

async function fetchDirect(directPath: string): Promise<any> {
  const res = await fetch(`${EMBEDTV_DIRECT}${directPath}`, {
    signal: mkSignal(15000),
  });
  if (!res.ok) throw new Error(`embedtv error ${res.status}`);
  return res.json();
}

// ─── API ───────────────────────────────────────────────────────────────────────

export const liveTvApi = {
  async getChannels(): Promise<ChannelsResponse> {
    return fetchWithFallback("/live/channels", "/channels");
  },

  async getEpgs(): Promise<EpgEntry[]> {
    return fetchWithFallback("/live/epgs", "/epgs_full")
      .then((d) => Array.isArray(d) ? d : [])
      .catch(() => []);
  },

  async getJogos(): Promise<JogoEntry[]> {
    try {
      const r = await fetch(`${BASE}/live/jogos`, { signal: mkSignal(10000) });
      if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) return d; }
    } catch {}
    return fetchDirect("/jogos").then((d) => Array.isArray(d) ? d : []).catch(() => []);
  },
};

// ─── Match status helpers ──────────────────────────────────────────────────────

export type JogoStatus = "live" | "upcoming" | "ended";

export function jogoStatus(timer: JogoTimer): JogoStatus {
  const now = Math.floor(Date.now() / 1000);
  if (now < timer.start) return "upcoming";
  if (now > timer.end)   return "ended";
  return "live";
}

export function formatJogoTime(timer: JogoTimer): string {
  const d = new Date(timer.start * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function jogoElapsedMin(timer: JogoTimer): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, Math.floor((now - timer.start) / 60));
}

// ─── EPG helpers ──────────────────────────────────────────────────────────────

export function calcProgress(startDateStr: string): number {
  try {
    const start = new Date(startDateStr).getTime();
    const now = Date.now();
    const elapsed = now - start;
    const assumedDuration = 60 * 60 * 1000;
    return Math.min(Math.max((elapsed / assumedDuration) * 100, 5), 94);
  } catch {
    return 45;
  }
}

export function calcRemaining(startDateStr: string): string {
  try {
    const start = new Date(startDateStr).getTime();
    const now = Date.now();
    const elapsedMin = Math.floor((now - start) / 60000);
    const remaining = Math.max(60 - elapsedMin, 0);
    if (remaining <= 0) return "AO VIVO";
    return `${remaining} min restantes`;
  } catch {
    return "AO VIVO";
  }
}

export function fakeViewers(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h * 31 + id.charCodeAt(i)) | 0);
  const n = (Math.abs(h) % 18000) + 800;
  return n >= 1000 ? `${(n / 1000).toFixed(1)} mil` : String(n);
}

// ─── Category config ──────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<number, string> = {
  0: "Todos",
  1: "Esportes",
  2: "Infantil",
  3: "Documentários",
  4: "Filmes e Séries",
  5: "Notícias",
  6: "Abertos",
  7: "Variedades",
  9: "Portugal",
};

export const MAIN_CATEGORIES = [0, 1, 6, 5, 4, 2, 7, 3, 9];

export const CHANNEL_ACCENTS: Record<string, string> = {
  espn:       "#e30000",
  bandsports: "#ff6600",
  globo:      "#00aa44",
  sbt:        "#0066cc",
  band:       "#cc3300",
  record:     "#cc0066",
  combate:    "#aa0000",
  cnn:        "#cc0000",
  sportv:     "#006fd4",
  tnt:        "#9900cc",
  discovery:  "#005baa",
  national:   "#ffcc00",
  disney:     "#0057e7",
  cartoon:    "#ff6600",
  max:        "#002bff",
  premiere:   "#00a8e8",
  hbo:        "#00a0dc",
  telecine:   "#c8a600",
  paramount:  "#0062e0",
  prime:      "#00a8e8",
};

export function getAccent(channelId: string): string {
  const lower = channelId.toLowerCase();
  for (const [key, color] of Object.entries(CHANNEL_ACCENTS)) {
    if (lower.includes(key)) return color;
  }
  let h = 0;
  for (let i = 0; i < channelId.length; i++) h = ((h * 31 + channelId.charCodeAt(i)) | 0);
  const hues = ["#e30000", "#0066cc", "#ff6600", "#00aa44", "#9900cc", "#006fd4", "#cc3300"];
  return hues[Math.abs(h) % hues.length];
}
