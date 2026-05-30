import { Platform } from "react-native";

function getBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (Platform.OS === "web") return "/api";
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
}

const BASE = getBase();

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

export const liveTvApi = {
  async getChannels(): Promise<ChannelsResponse> {
    const res = await fetch(`${BASE}/live/channels`);
    if (!res.ok) throw new Error(`Failed to fetch channels: ${res.status}`);
    return res.json();
  },
  async getEpgs(): Promise<EpgEntry[]> {
    const res = await fetch(`${BASE}/live/epgs`);
    if (!res.ok) throw new Error(`Failed to fetch EPG: ${res.status}`);
    return res.json();
  },
};

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

export const CATEGORY_LABELS: Record<number, string> = {
  0: "Todos",
  1: "Esportes",
  2: "Infantil",
  3: "Documentários",
  4: "Filmes e Séries",
  5: "Notícias",
  6: "Abertos",
  7: "Variedades",
};

export const MAIN_CATEGORIES = [0, 1, 5, 6, 4, 2, 7];

export const CHANNEL_ACCENTS: Record<string, string> = {
  espn: "#e30000",
  bandsports: "#ff6600",
  globo: "#00aa44",
  sbt: "#0066cc",
  band: "#cc3300",
  record: "#cc0066",
  combate: "#aa0000",
  cnn: "#cc0000",
  sportv: "#006fd4",
  tnt: "#9900cc",
  discovery: "#005baa",
  national: "#ffcc00",
  disney: "#0057e7",
  cartoon: "#ff6600",
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
