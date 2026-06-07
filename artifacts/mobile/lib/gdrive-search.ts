import { listFolder, listFolderAll, DriveItem, isFolder, isVideo, getStreamUrl, parseEpisodeInfo, parseSeasonFolderNumber } from "./gdrive-index";

export type DriveMatch = {
  name: string;
  drive: 0 | 1;
  path: string;
  category: string;
  isFolder: boolean;
  items?: DriveItem[];
  link?: string;
};

const CATEGORIES_D0 = ["Animes", "Desenhos", "Filmes", "Novelas", "Outros"];
const CATEGORIES_D1 = ["Filmes", "Séries"];

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const wordsA = na.split(/\s+/).filter((w) => w.length > 1);
  const wordsB = nb.split(/\s+/).filter((w) => w.length > 1);
  // Count significant words (length > 2) that appear in both
  const common = wordsA.filter((w) => wordsB.includes(w) && w.length > 2);
  if (common.length === 0) return 0;
  // Score against the SHORTER side (folder name is usually shorter)
  return common.length / Math.min(wordsA.length, wordsB.length);
}

export async function searchDriveByTitle(title: string): Promise<DriveMatch[]> {
  if (!title.trim()) return [];
  const matches: DriveMatch[] = [];
  const THRESHOLD = 0.55;

  const checks: { drive: 0 | 1; category: string }[] = [
    ...CATEGORIES_D0.map((c) => ({ drive: 0 as const, category: c })),
    ...CATEGORIES_D1.map((c) => ({ drive: 1 as const, category: c })),
  ];

  await Promise.all(
    checks.map(async ({ drive, category }) => {
      try {
        const listing = await listFolder(drive, category);
        if (!listing) return;
        const all = listing.data.files;

        for (const item of all) {
          const score = similarity(item.name, title);
          if (score >= THRESHOLD) {
            if (isFolder(item)) {
              matches.push({
                name: item.name,
                drive,
                path: `${category}/${item.name}`,
                category,
                isFolder: true,
              });
            } else if (isVideo(item)) {
              matches.push({
                name: item.name,
                drive,
                path: category,
                category,
                isFolder: false,
                link: item.link ?? "",
              });
            }
          }
        }
      } catch {
        // ignore per-category errors
      }
    })
  );

  matches.sort((a, b) => {
    const sa = similarity(a.name, title);
    const sb = similarity(b.name, title);
    return sb - sa;
  });

  return matches.slice(0, 6);
}

export async function getDriveSeasonEpisodes(
  drive: 0 | 1,
  seriesPath: string,
  seasonNumber: number
): Promise<DriveItem[]> {
  const seriesItems = await listFolderAll(drive, seriesPath);

  // Try to find a season subfolder
  const seasonFolder = seriesItems.find((item) => {
    if (!isFolder(item)) return false;
    return parseSeasonFolderNumber(item.name) === seasonNumber;
  });

  if (seasonFolder) {
    const seasonPath = `${seriesPath}/${seasonFolder.name}`;
    const episodeItems = await listFolderAll(drive, seasonPath);
    return episodeItems.filter(isVideo);
  }

  // No season folder — look for episodes directly in the series folder
  // Filter by season number embedded in filename; if season is undefined fall back to season 1
  const videos = seriesItems.filter(isVideo);
  return videos.filter((item) => {
    const info = parseEpisodeInfo(item.name);
    return info.season === seasonNumber || (info.season === undefined && seasonNumber === 1);
  });
}

export async function checkDriveApi(): Promise<{
  online: boolean;
  latencyMs: number;
  folderCount: number;
}> {
  const start = Date.now();
  try {
    const res = await listFolder(0, "Animes");
    const latencyMs = Date.now() - start;
    if (!res) return { online: false, latencyMs, folderCount: 0 };
    return {
      online: true,
      latencyMs,
      folderCount: res.data.files.length,
    };
  } catch {
    return { online: false, latencyMs: Date.now() - start, folderCount: 0 };
  }
}
