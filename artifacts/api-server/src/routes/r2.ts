import { Router } from "express";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tmdb } from "../lib/tmdb";

const router = Router();

// ── S3 client ────────────────────────────────────────────────────────────────

function getClient(): S3Client {
  const accountId = process.env["R2_ACCOUNT_ID"];
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
  if (!accountId || !accessKeyId || !secretAccessKey)
    throw new Error("R2 credentials not configured");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(query: any): string {
  const name = process.env["R2_BUCKET_NAME"] ?? query?.bucket;
  if (!name) throw new Error("bucket required");
  return name;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isVideo(key: string) {
  return /\.(mp4|mkv|mov|avi|webm|m4v|ts|m3u8)$/i.test(key);
}

function isImage(key: string) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(key);
}

function fileType(key: string): "video" | "image" | "other" {
  if (isVideo(key)) return "video";
  if (isImage(key)) return "image";
  return "other";
}

/** Detect "Season 1", "Temporada 2", "S01", "T3" → season number */
function parseSeasonNumber(folderName: string): number | null {
  const m =
    folderName.match(/^(?:season|temporada)\s*(\d+)$/i) ??
    folderName.match(/^s(\d+)$/i) ??
    folderName.match(/^t(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Remove year/quality suffixes: "Série (2021) [4K]" → "Série" */
function cleanTitle(name: string): string {
  return name
    .replace(/\s*\(\d{4}\)\s*/g, " ")
    .replace(/\s*\[\d{4}\]\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
}

// ── Catalog cache ─────────────────────────────────────────────────────────────

interface TmdbMatch {
  id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
}

interface SeasonInfo {
  number: number;
  prefix: string;
  label: string;
}

interface CatalogEntry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  seasons: SeasonInfo[];
  tmdb: TmdbMatch | null;
}

interface CatalogCache {
  entries: CatalogEntry[];
  builtAt: number;
}

let catalogCache: CatalogCache | null = null;
const CATALOG_TTL_MS = 30 * 60 * 1000; // 30 min

async function listPrefixes(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/" });
  const data = await client.send(cmd);
  return (data.CommonPrefixes ?? []).map((p) => p.Prefix!);
}

async function hasVideoFiles(client: S3Client, bucket: string, prefix: string): Promise<boolean> {
  const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: "/", MaxKeys: 50 });
  const data = await client.send(cmd);
  return (data.Contents ?? []).some((o) => isVideo(o.Key ?? ""));
}

async function searchTmdb(name: string, hint?: "movie" | "tv"): Promise<TmdbMatch | null> {
  try {
    const cleaned = cleanTitle(name);
    if (!cleaned) return null;
    if (hint === "tv") {
      const r = await tmdb.search.tv(cleaned, 1);
      const hit = (r as any).results?.[0];
      if (hit) return { id: hit.id, title: hit.name, poster_path: hit.poster_path, backdrop_path: hit.backdrop_path, overview: hit.overview, vote_average: hit.vote_average, first_air_date: hit.first_air_date, media_type: "tv" };
    }
    if (hint === "movie") {
      const r = await tmdb.search.movies(cleaned, 1);
      const hit = (r as any).results?.[0];
      if (hit) return { id: hit.id, title: hit.title, poster_path: hit.poster_path, backdrop_path: hit.backdrop_path, overview: hit.overview, vote_average: hit.vote_average, release_date: hit.release_date, media_type: "movie" };
    }
    // multi search
    const r = await tmdb.search.multi(cleaned, 1);
    const hit = (r as any).results?.find((x: any) => x.media_type === "tv" || x.media_type === "movie");
    if (!hit) return null;
    const isMovie = hit.media_type === "movie";
    return {
      id: hit.id,
      title: isMovie ? hit.title : hit.name,
      poster_path: hit.poster_path,
      backdrop_path: hit.backdrop_path,
      overview: hit.overview,
      vote_average: hit.vote_average,
      release_date: hit.release_date,
      first_air_date: hit.first_air_date,
      media_type: hit.media_type,
    };
  } catch {
    return null;
  }
}

async function buildCatalog(client: S3Client, bucket: string): Promise<CatalogEntry[]> {
  // 1. top-level folders = titles
  const topPrefixes = await listPrefixes(client, bucket, "");
  const entries: CatalogEntry[] = [];

  for (const titlePrefix of topPrefixes) {
    const name = titlePrefix.replace(/\/$/, "");

    // 2. check sub-folders for seasons
    const subPrefixes = await listPrefixes(client, bucket, titlePrefix);
    const seasons: SeasonInfo[] = [];

    for (const sub of subPrefixes) {
      const subName = sub.replace(titlePrefix, "").replace(/\/$/, "");
      const seasonNum = parseSeasonNumber(subName);
      if (seasonNum !== null) {
        seasons.push({ number: seasonNum, prefix: sub, label: subName });
      }
    }
    seasons.sort((a, b) => a.number - b.number);

    const isSeries = seasons.length > 0;
    const type: CatalogEntry["type"] = isSeries ? "tv" : await hasVideoFiles(client, bucket, titlePrefix) ? "movie" : "unknown";

    // 3. TMDB search
    const tmdbMatch = await searchTmdb(name, isSeries ? "tv" : type === "movie" ? "movie" : undefined);

    entries.push({ key: titlePrefix, name, type, seasons, tmdb: tmdbMatch });

    // small delay to avoid TMDB rate limit
    await new Promise((r) => setTimeout(r, 150));
  }

  return entries;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/catalog", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const forceRefresh = req.query["refresh"] === "true";

    if (!forceRefresh && catalogCache && Date.now() - catalogCache.builtAt < CATALOG_TTL_MS) {
      res.json({ catalog: catalogCache.entries, cached: true, builtAt: new Date(catalogCache.builtAt).toISOString() });
      return;
    }

    const entries = await buildCatalog(client, bucket);
    catalogCache = { entries, builtAt: Date.now() };
    res.json({ catalog: entries, cached: false, builtAt: new Date(catalogCache.builtAt).toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/episodes", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const prefix = (req.query["prefix"] as string) ?? "";

    if (!prefix) { res.status(400).json({ error: "prefix required" }); return; }

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 500 });
    const data = await client.send(cmd);

    const episodes = (data.Contents ?? [])
      .filter((o) => isVideo(o.Key ?? "") && o.Key !== prefix)
      .map((o) => {
        const fileName = o.Key!.split("/").pop() ?? o.Key!;
        const ep = parseEpisodeNumber(fileName);
        return {
          key: o.Key!,
          name: fileName,
          size: o.Size ?? 0,
          lastModified: o.LastModified?.toISOString() ?? null,
          episode: ep,
        };
      })
      .sort((a, b) => (a.episode ?? 999) - (b.episode ?? 999));

    res.json({ prefix, episodes });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

function parseEpisodeNumber(name: string): number | null {
  const m =
    name.match(/[Ee](\d+)/) ??
    name.match(/[Ee]pisodio\s*(\d+)/i) ??
    name.match(/[Ee]pisode\s*(\d+)/i) ??
    name.match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

router.get("/buckets", async (req, res) => {
  try {
    const bucket = getBucket(req.query);
    res.json({ buckets: [bucket] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/list", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const prefix = (req.query["prefix"] as string) ?? "";
    const delimiter = (req.query["delimiter"] as string) ?? "/";
    const continuationToken = (req.query["token"] as string) ?? undefined;

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: delimiter, MaxKeys: 200, ContinuationToken: continuationToken });
    const data = await client.send(cmd);

    const folders = (data.CommonPrefixes ?? []).map((p) => ({
      type: "folder" as const,
      key: p.Prefix!,
      name: p.Prefix!.replace(prefix, "").replace(/\/$/, "") || p.Prefix!,
    }));

    const files = (data.Contents ?? [])
      .filter((o) => o.Key !== prefix)
      .map((o) => ({
        type: "file" as const,
        key: o.Key!,
        name: o.Key!.split("/").pop() ?? o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? null,
        fileType: fileType(o.Key!),
        isVideo: isVideo(o.Key!),
      }));

    res.json({ bucket, prefix, folders, files, isTruncated: data.IsTruncated ?? false, nextToken: data.NextContinuationToken ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/signed-url", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const key = req.query["key"] as string;
    if (!key) { res.status(400).json({ error: "key is required" }); return; }
    const expiresIn = Number(req.query["expires"] ?? 3600);
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, cmd, { expiresIn });
    res.json({ url, key, bucket, expiresIn });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const cmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
    const data = await client.send(cmd);
    const contents = data.Contents ?? [];
    const totalSize = contents.reduce((acc, o) => acc + (o.Size ?? 0), 0);
    const videoCount = contents.filter((o) => isVideo(o.Key ?? "")).length;
    res.json({ bucket, objectCount: contents.length, isTruncated: data.IsTruncated ?? false, totalSizeBytes: totalSize, videoCount });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

export default router;
