import { Platform } from "react-native";

const DRIVE_WORKER = "https://1.animezey23112022.workers.dev";
const DOWNLOAD_DOMAIN = "https://animezey16082023.animezey16082023.workers.dev";

function getDriveProxyBase(): string {
  if (Platform.OS === "web") return "/api/drive";
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api/drive`;
  return DRIVE_WORKER;
}

export type DriveFile = {
  kind: "drive#file";
  name: string;
  id: string;
  driveId: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  link: string | null;
  fileExtension?: string;
};

export type DriveFolder = DriveFile & {
  mimeType: "application/vnd.google-apps.folder";
  link: null;
};

export type DriveItem = DriveFile | DriveFolder;

export type DriveListing = {
  nextPageToken: string | null;
  curPageIndex: number;
  data: { files: DriveItem[] };
};

export type DriveIndex = {
  drive: 0 | 1;
  path: string;
};

export function isFolder(item: DriveItem): item is DriveFolder {
  return item.mimeType === "application/vnd.google-apps.folder";
}

export function isVideo(item: DriveItem): boolean {
  const ext = item.fileExtension?.toLowerCase() ?? "";
  const mime = item.mimeType?.toLowerCase() ?? "";
  return (
    mime.startsWith("video/") ||
    ["mkv", "mp4", "avi", "mov", "webm", "m4v", "ts", "m2ts"].includes(ext)
  );
}

export function getStreamUrl(item: DriveItem): string {
  if (!item.link) return "";
  const rel = item.link.startsWith("/") ? item.link : `/${item.link}`;
  return `${DOWNLOAD_DOMAIN}${rel}`;
}

export function formatSize(bytes?: string): string {
  if (!bytes) return "";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

export function parseEpisodeInfo(name: string): {
  season?: number;
  episode?: number;
  title: string;
} {
  const bare = name.replace(/\.[^.]+$/, "").trim();
  // S01E01 or S01EP01
  const sxe = name.match(/[Ss](\d{1,2})[Ee][Pp]?(\d{1,3})/);
  if (sxe) {
    return { season: parseInt(sxe[1], 10), episode: parseInt(sxe[2], 10), title: bare };
  }
  // 1x01
  const alt = name.match(/(\d{1,2})x(\d{1,3})/i);
  if (alt) {
    return { season: parseInt(alt[1], 10), episode: parseInt(alt[2], 10), title: bare };
  }
  // " - Ep. N "
  const numEp = name.match(/\s-\s[Ee][Pp]?\.?\s?(\d{1,3})[\s.]/);
  if (numEp) {
    return { episode: parseInt(numEp[1], 10), title: bare };
  }
  // Leading zero-padded number e.g. "01 - Title.mkv" or "01.mkv"
  const leading = name.match(/^(\d{1,3})[\s.-]/);
  if (leading) {
    return { episode: parseInt(leading[1], 10), title: bare };
  }
  return { title: bare };
}

export function parseSeasonFolderNumber(name: string): number | null {
  // "Temporada 1", "Temporada 01", "Season 1", "Season 01", "Temp 1"
  const m1 = name.match(/^(?:temporada|season|temp(?:orada)?)\s*(\d+)$/i);
  if (m1) return parseInt(m1[1], 10);
  // "T1", "T01", "S1", "S01" (standalone)
  const m2 = name.match(/^[TS](\d{1,2})$/i);
  if (m2) return parseInt(m2[1], 10);
  // Just a number "1", "01"
  const m3 = name.match(/^(\d{1,2})$/);
  if (m3) return parseInt(m3[1], 10);
  return null;
}

export async function listFolder(
  drive: 0 | 1,
  path: string,
  pageToken = ""
): Promise<DriveListing | null> {
  try {
    const proxyBase = getDriveProxyBase();
    const encodedPath = path
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");

    let url: string;
    let body: object;
    if (proxyBase === DRIVE_WORKER) {
      url = `${DRIVE_WORKER}/${drive}:/${encodedPath}/`;
      body = { pageToken };
    } else {
      url = `${proxyBase}/folder`;
      body = { drive, path, pageToken };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json: DriveListing = await res.json();
    return json;
  } catch {
    return null;
  }
}

export async function listFolderAll(
  drive: 0 | 1,
  path: string
): Promise<DriveItem[]> {
  const all: DriveItem[] = [];
  let token = "";
  let page = 0;
  while (page < 20) {
    const result = await listFolder(drive, path, token);
    if (!result) break;
    all.push(...result.data.files);
    if (!result.nextPageToken) break;
    token = result.nextPageToken;
    page++;
  }
  return all;
}

export const DRIVE_ROOTS = [
  {
    drive: 0 as const,
    name: "AnimeZeY - Animes & Desenhos",
    icon: "🎌",
    folders: ["Animes", "Desenhos", "Filmes", "Novelas", "Outros"],
  },
  {
    drive: 1 as const,
    name: "AnimeZeY - Filmes & Séries",
    icon: "🎬",
    folders: ["Filmes", "Séries", "Livros"],
  },
];
