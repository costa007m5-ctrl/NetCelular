import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

let FileSystem: any = null;
try { FileSystem = require("expo-file-system"); } catch {}

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
  localUri?: string;
}

export interface ActiveDownload {
  key: string;
  title: string;
  poster_path: string;
  progress: number;
  size_mb: number;
  speed_mb: number;
  cancelled: boolean;
  isReal?: boolean;
}

const STORAGE_KEY = "netplay_downloads_v1";
const EXPIRY_DAYS = 7;
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

function makeKey(type: "movie" | "tv", tmdb_id: number, season?: number, episode?: number) {
  if (season != null && episode != null) return `${type}_${tmdb_id}_s${season}e${episode}`;
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

function getLocalPath(key: string, streamUrl: string): string | null {
  if (!FileSystem?.documentDirectory) return null;
  const ext = (streamUrl.split("?")[0].split(".").pop() ?? "mp4").toLowerCase();
  const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${FileSystem.documentDirectory}netplay_dl_${safeKey}.${ext}`;
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
      streamUrl?: string;
    },
    onProgress?: (pct: number) => void
  ): Promise<{ error?: string }> {
    const quality = content.quality ?? "Boa (720p)";
    const key = makeKey(content.type, content.tmdb_id, content.season, content.episode);

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
      isReal: !!(content.streamUrl && (FileSystem && Platform.OS !== "web" || Platform.OS === "web")),
    };
    _active.set(key, active);
    notify();

    let localUri: string | undefined;
    let actualSizeMb = size_mb;

    if (content.streamUrl && Platform.OS === "web") {
      // ── Web: real download via fetch + ReadableStream → Blob → <a download> ──
      // Progress is tracked byte-by-byte. File lands in the device's Downloads folder.

      // Request notification permission (must be in user-gesture context)
      let _dlNotif: Notification | null = null;
      if (typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          Notification.requestPermission().catch(() => {});
        }
        if (Notification.permission === "granted") {
          try {
            _dlNotif = new Notification("⬇️ Baixando conteúdo...", {
              body: content.title,
              tag: `netplay-dl-${key}`,
              silent: true,
            });
          } catch {}
        }
      }

      try {
        const response = await fetch(content.streamUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Detect HLS streams — cannot be downloaded as a single file
        const ct = response.headers.get("content-type") ?? "";
        if (ct.includes("mpegurl") || ct.includes("x-mpegURL")) {
          throw new Error("Streams HLS não podem ser baixados como arquivo único. Use um player.");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream indisponível");

        const contentLength = +(response.headers.get("content-length") || "0");
        const estimatedBytes = contentLength || size_mb * 1024 * 1024;
        const chunks: BlobPart[] = [];
        let received = 0;
        const startTime = Date.now();

        while (true) {
          const curr = _active.get(key);
          if (!curr || curr.cancelled) {
            await reader.cancel();
            _active.delete(key);
            notify();
            return {};
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
            const pct = estimatedBytes > 0
              ? Math.min(Math.round((received / estimatedBytes) * 100), 99)
              : 0;
            const curr2 = _active.get(key)!;
            curr2.progress = pct;
            curr2.size_mb = Math.max(Math.round(received / (1024 * 1024)), 1);
            curr2.speed_mb = Math.round((received / (1024 * 1024)) / elapsed * 10) / 10;
            onProgress?.(pct);
            notify();
          }
        }

        // Trigger browser download — file saved to device's Downloads folder
        if (typeof document !== "undefined") {
          const blob = new Blob(chunks, { type: "video/mp4" });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `${(content.title ?? "video").replace(/[/\\:*?"<>|]/g, "_")}.mp4`;
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          // Revoke after 60s to free memory once browser has picked up the blob
          setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); } catch {} }, 60000);
        }

        actualSizeMb = Math.round(received / (1024 * 1024)) || size_mb;
        localUri = "browser_download";

        const finalCurr = _active.get(key);
        if (finalCurr) { finalCurr.progress = 100; finalCurr.size_mb = actualSizeMb; notify(); }

        // Close "Downloading" notification and show "Done"
        try { _dlNotif?.close(); } catch {}
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("✅ Download concluído!", {
              body: `${content.title} — salvo nos Downloads`,
              tag: `netplay-dl-done-${key}`,
            });
          } catch {}
        }
      } catch (e: any) {
        try { _dlNotif?.close(); } catch {}
        _active.delete(key);
        notify();
        return { error: `Falha no download: ${e?.message ?? "erro desconhecido"}` };
      }
    } else if (content.streamUrl && FileSystem && Platform.OS !== "web") {
      // ── Native: expo-file-system real download ──────────────────────────────
      const localPath = getLocalPath(key, content.streamUrl);
      if (!localPath) {
        _active.delete(key);
        notify();
        return { error: "Sistema de arquivos não disponível" };
      }

      try {
        const startTime = Date.now();
        const dl = FileSystem.createDownloadResumable(
          content.streamUrl,
          localPath,
          {},
          (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
            const curr = _active.get(key);
            if (!curr || curr.cancelled) return;
            const expected = progress.totalBytesExpectedToWrite;
            if (expected > 0) {
              const pct = Math.min(Math.round((progress.totalBytesWritten / expected) * 100), 99);
              curr.progress = pct;
              const estimatedSize = Math.round(expected / (1024 * 1024));
              curr.size_mb = estimatedSize > 0 ? estimatedSize : size_mb;
              curr.speed_mb = Math.round(((progress.totalBytesWritten / (1024 * 1024)) / Math.max(1, (Date.now() - startTime) / 1000)) * 10) / 10;
              onProgress?.(pct);
              notify();
            }
          }
        );

        const result = await new Promise<{ uri: string } | null>((resolve, reject) => {
          const cancelled$ = setInterval(() => {
            const curr = _active.get(key);
            if (curr?.cancelled) {
              clearInterval(cancelled$);
              dl.cancelAsync().catch(() => {});
              resolve(null);
            }
          }, 500);
          dl.downloadAsync()
            .then((r: { uri: string } | null) => { clearInterval(cancelled$); resolve(r ?? null); })
            .catch((e: unknown) => { clearInterval(cancelled$); reject(e); });
        });

        if (!result) {
          _active.delete(key);
          notify();
          return {};
        }
        localUri = result.uri;
      } catch (e: any) {
        _active.delete(key);
        notify();
        return { error: `Falha no download: ${e?.message ?? "erro desconhecido"}` };
      }
    } else {
      // ── Fallback: simulated progress (no downloadable source available) ──────
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
          if (step >= steps) { clearInterval(interval); resolve(); }
        }, stepMs);
      });

      if (_active.get(key)?.cancelled) {
        _active.delete(key);
        notify();
        return {};
      }
    }

    _active.delete(key);
    notify();

    // Use actualSizeMb (set by web/native real download) or read from FileSystem for native
    let finalSizeMb = actualSizeMb;
    if (localUri && localUri !== "browser_download" && FileSystem) {
      try {
        const info = await FileSystem.getInfoAsync(localUri, { size: true });
        const bytes: number = (info as any).size ?? 0;
        if (bytes > 0) finalSizeMb = Math.round(bytes / (1024 * 1024));
      } catch {}
    }

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
      size_mb: finalSizeMb,
      quality,
      season: content.season,
      episode: content.episode,
      localUri,
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
    const item = all.find((i) => i.key === key);
    if (item?.localUri && FileSystem) {
      try {
        const info = await FileSystem.getInfoAsync(item.localUri);
        if (info.exists) await FileSystem.deleteAsync(item.localUri, { idempotent: true });
      } catch {}
    }
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(all.filter((i) => i.key !== key))
    );
  },

  async isDownloaded(type: "movie" | "tv", tmdb_id: number, season?: number, episode?: number): Promise<boolean> {
    const key = makeKey(type, tmdb_id, season, episode);
    if (_active.has(key)) return false;
    const all = await this.getAll();
    return all.some((i) => i.key === key);
  },

  async getDownloadedItem(type: "movie" | "tv", tmdb_id: number, season?: number, episode?: number): Promise<DownloadedContent | null> {
    const key = makeKey(type, tmdb_id, season, episode);
    const all = await this.getAll();
    return all.find((i) => i.key === key) ?? null;
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
