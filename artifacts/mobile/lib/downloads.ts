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
  season?: number;
  episode?: number;
}

const STORAGE_KEY = "netplay_downloads_v1";
const EXPIRY_DAYS = 20;

function makeKey(type: "movie" | "tv", tmdb_id: number) {
  return `${type}_${tmdb_id}`;
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

  async download(content: {
    tmdb_id: number;
    type: "movie" | "tv";
    title: string;
    poster_path: string;
    backdrop_path?: string;
    season?: number;
    episode?: number;
  }): Promise<void> {
    const all = await this.getAll();
    const key = makeKey(content.type, content.tmdb_id);
    const now = new Date();
    const expiry = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const size_mb =
      content.type === "movie"
        ? Math.floor(Math.random() * 2800 + 1200)
        : Math.floor(Math.random() * 500 + 200);
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
      season: content.season,
      episode: content.episode,
    };
    const filtered = all.filter((i) => i.key !== key);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...filtered]));
  },

  async remove(key: string): Promise<void> {
    const all = await this.getAll();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(all.filter((i) => i.key !== key))
    );
  },

  async isDownloaded(type: "movie" | "tv", tmdb_id: number): Promise<boolean> {
    const all = await this.getAll();
    return all.some((i) => i.key === makeKey(type, tmdb_id));
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
