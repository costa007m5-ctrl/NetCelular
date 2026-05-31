import AsyncStorage from "@react-native-async-storage/async-storage";

export interface DownloadedContent {
  key: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string;
  backdrop_path: string;
  download_date: string;
  expiry_date: string;
  size_mb: number;
  quality: string;
  season?: number;
  episode?: number;
}

export interface ActiveDownload {
  key: string;
  title: string;
  poster_path: string;
  progress: number;
  size_mb: number;
  speed_mb: number;
  cancelled: boolean;
}

const STORAGE_KEY = "netplay_downloads_v1";
const EXPIRY_DAYS = 20;
export const MAX_STORAGE_MB = 10240;

const _active = new Map<string, ActiveDownload>();
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function subscribeDownloads(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getActiveDownloads(): ActiveDownload[] {
  return Array.from(_active.values());
}

function makeKey(type: "movie" | "tv", tmdb_id: number) {
  return `${type}_${tmdb_id}`;
}

function sizeForQuality(type: "movie" | "tv", quality: string): number {
  if (type === "movie") {
    if (quality.includes("1080")) return Math.floor(Math.random() * 600 + 3500);
    if (quality.includes("720")) return Math.floor(Math.random() * 500 + 1800);
    return Math.floor(Math.random() * 300 + 800);
  } else {
    if (quality.includes("1080")) return Math.floor(Math.random() * 200 + 700);
    if (quality.includes("720")) return Math.floor(Math.random() * 150 + 350);
    return Math.floor(Math.random() * 100 + 150);
  }
}

function durationMs(size_mb: number, quality: string): number {
  if (quality.includes("1080")) return Math.min(size_mb * 3, 12000);
  if (quality.includes("720")) return Math.min(size_mb * 2, 8000);
  return Math.min(size_mb * 1.2, 5000);
}

export const downloadsManager = {
  async getAll(): Promise<DownloadedContent[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const items: DownloadedContent[] = JSON.parse(raw);
      const now = Date.now();
      return items.filter((i) => new Date(i.expiry_date).getTime() > now);
    } catch {
      return [];
    }
  },

  async getTotalMb(): Promise<number> {
    const all = await this.getAll();
    return all.reduce((s, i) => s + i.size_mb, 0);
  },

  async download(
    content: {
      tmdb_id: number;
      type: "movie" | "tv";
      title: string;
      poster_path: string;
      backdrop_path?: string;
      season?: number;
      episode?: number;
      quality?: string;
    },
    onProgress?: (pct: number) => void
  ): Promise<{ error?: string }> {
    const quality = content.quality ?? "Boa (720p)";
    const key = makeKey(content.type, content.tmdb_id);

    if (_active.has(key)) return { error: "Já está sendo baixado" };

    const existing = await this.getAll();
    const size_mb = sizeForQuality(content.type, quality);
    const totalUsed = existing.reduce((s, i) => s + i.size_mb, 0);
    if (totalUsed + size_mb > MAX_STORAGE_MB) {
      return { error: "Armazenamento cheio. Remova downloads para liberar espaço." };
    }

    const active: ActiveDownload = {
      key,
      title: content.title,
      poster_path: content.poster_path,
      progress: 0,
      size_mb,
      speed_mb: 0,
      cancelled: false,
    };
    _active.set(key, active);
    notify();

    const totalMs = durationMs(size_mb, quality);
    const steps = 50;
    const stepMs = totalMs / steps;

    await new Promise<void>((resolve) => {
      let step = 0;
      const interval = setInterval(() => {
        const curr = _active.get(key);
        if (!curr || curr.cancelled) {
          clearInterval(interval);
          _active.delete(key);
          notify();
          resolve();
          return;
        }
        step++;
        const pct = Math.min(Math.round((step / steps) * 100), 100);
        const speed = Math.round((size_mb / (totalMs / 1000)) * (0.8 + Math.random() * 0.4) * 10) / 10;
        curr.progress = pct;
        curr.speed_mb = speed;
        onProgress?.(pct);
        notify();

        if (step >= steps) {
          clearInterval(interval);
          resolve();
        }
      }, stepMs);
    });

    if (_active.get(key)?.cancelled) {
      _active.delete(key);
      notify();
      return {};
    }

    _active.delete(key);
    notify();

    const now = new Date();
    const expiry = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const entry: DownloadedContent = {
      key,
      tmdb_id: content.tmdb_id,
      type: content.type,
      title: content.title,
      poster_path: content.poster_path,
      backdrop_path: content.backdrop_path ?? "",
      download_date: now.toISOString(),
      expiry_date: expiry.toISOString(),
      size_mb,
      quality,
      season: content.season,
      episode: content.episode,
    };
    const filtered = existing.filter((i) => i.key !== key);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...filtered]));
    return {};
  },

  cancelDownload(key: string): void {
    const curr = _active.get(key);
    if (curr) {
      curr.cancelled = true;
      notify();
    }
  },

  async remove(key: string): Promise<void> {
    const all = await this.getAll();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(all.filter((i) => i.key !== key))
    );
  },

  async isDownloaded(type: "movie" | "tv", tmdb_id: number): Promise<boolean> {
    const key = makeKey(type, tmdb_id);
    if (_active.has(key)) return false;
    const all = await this.getAll();
    return all.some((i) => i.key === key);
  },

  isActivelyDownloading(type: "movie" | "tv", tmdb_id: number): boolean {
    return _active.has(makeKey(type, tmdb_id));
  },

  daysRemaining(item: DownloadedContent): number {
    const ms = new Date(item.expiry_date).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  },

  formatSize(mb: number): string {
    if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
    return `${mb} MB`;
  },
};
