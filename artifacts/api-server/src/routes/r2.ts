import { Router } from "express";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable, PassThrough } from "stream";
import { tmdb } from "../lib/tmdb";
import multer from "multer";
import crypto from "crypto";
import { notifyNewContent, notifyNewEpisode } from "../lib/push-notifications.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: {} });

// ── TeraBox URL normalizer ─────────────────────────────────────────────────────
// Many alternative domains exist (1024terabox.com, 1024tera.com, teraboxapp.com…)
// but the xAPIverse API only accepts www.terabox.com links.
function normalizeTeraboxUrl(url: string): string {
  const TERABOX_ALIASES = [
    "1024terabox.com",
    "1024tera.com",
    "teraboxapp.com",
    "terasharelink.com",
    "4funbox.com",
    "momerybox.com",
    "tibibox.com",
    "terabox.app",
    "gibibox.com",
    "nephobox.com",
  ];
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (TERABOX_ALIASES.includes(host)) {
      u.hostname = "www.terabox.com";
      return u.toString();
    }
  } catch {}
  return url;
}

// ── S3 client ─────────────────────────────────────────────────────────────────

function getClient(): S3Client {
  const accountId = process.env["R2_ACCOUNT_ID"] ?? "9827b92a6b3a621e8c6f50274e68f37b";
  const accessKeyId = process.env["R2_ACCESS_KEY_ID"] ?? "9e96806804e8815dfd9580ec062fa0c5";
  const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"] ?? "854a8ee198112f783b99b870ac9f3299340a88176d5a8c198e35269e8cd3cd3a";
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(query?: any): string {
  const name = process.env["R2_BUCKET_NAME"] ?? query?.bucket ?? "netplay-media-storage";
  if (!name) throw new Error("bucket required");
  return name;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isVideo(key: string) {
  return /\.(mp4|mkv|mov|avi|webm|m4v|ts|m3u8)$/i.test(key);
}

function isLikelyVideo(key: string, size: number): boolean {
  if (isVideo(key)) return true;
  const name = (key.split("/").pop() ?? key).toLowerCase();
  const hasKnownNonVideoExt = /\.(jpg|jpeg|png|gif|webp|txt|json|pdf|doc|docx|html|css|js|xml|zip|rar|keep)$/i.test(name);
  return !hasKnownNonVideoExt && size > 5_000_000;
}

function isImage(key: string) {
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(key);
}

function fileType(key: string): "video" | "image" | "other" {
  if (isVideo(key)) return "video";
  if (isImage(key)) return "image";
  return "other";
}

function parseSeasonNumber(folderName: string): number | null {
  const m =
    folderName.match(/^(?:season|temporada)\s*(\d+)$/i) ??
    folderName.match(/^(\d+)\s*(?:season|temporada)$/i) ??
    folderName.match(/^s(\d+)$/i) ??
    folderName.match(/^t(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

function cleanTitle(name: string): string {
  return name
    .replace(/\s*\(\d{4}\)\s*/g, " ")
    .replace(/\s*\[\d{4}\]\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
}

function parseEpisodeNumber(name: string): number | null {
  const m =
    name.match(/[Ee](\d+)/) ??
    name.match(/[Ee]pisodio\s*(\d+)/i) ??
    name.match(/[Ee]pisode\s*(\d+)/i) ??
    name.match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Background jobs ───────────────────────────────────────────────────────────

interface Job {
  status: "queued" | "downloading" | "uploading" | "done" | "error";
  progress: number; // 0-100
  downloaded: number;
  total: number;
  key?: string;
  error?: string;
  startedAt: number;
}

const jobs = new Map<string, Job>();

// Clean up old jobs (> 1hr)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.startedAt > 3_600_000) jobs.delete(id);
  }
}, 300_000);

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

interface SeasonInfo { number: number; prefix: string; label: string }

interface CatalogEntry {
  key: string;
  name: string;
  type: "movie" | "tv" | "unknown";
  seasons: SeasonInfo[];
  tmdb: TmdbMatch | null;
}

interface CatalogCache { entries: CatalogEntry[]; builtAt: number }
let catalogCache: CatalogCache | null = null;
const CATALOG_TTL_MS = 30 * 60 * 1000;

// ── Registry (stored in R2 as __registry.json) ────────────────────────────────

export interface RegistryItem {
  id: string;
  r2Key: string;
  teraboxUrl?: string;
  driveUrl?: string;
  driveDirectUrl?: string;
  driveResolvedAt?: string;
  driveNum?: number; // 0 or 1 — which Drive account
  driveFilePath?: string; // full path inside Drive, e.g. "Séries/Show/ep01.mkv"
  flix2Url?: string; // direct MP4 URL from Flix 2.0 (nixplay.lat)
  fileIndex?: number;
  fileName?: string;
  tmdbId: number;
  tmdbType: "movie" | "tv";
  title: string;
  label: string;
  season: number | null;
  episode: number | null;
  r2Folder?: string;
  quality?: string;
  addedAt: string;
}

interface Registry { version: number; items: RegistryItem[] }

// ── Catalog Meta (TMDB overrides + folder display names, stored in R2) ────────

interface CatalogMetaEntry {
  tmdbId?: number;
  tmdbType?: "movie" | "tv";
  displayName?: string;
}
interface CatalogMeta { version: number; overrides: Record<string, CatalogMetaEntry> }

async function readCatalogMeta(client: S3Client, bucket: string): Promise<CatalogMeta> {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: "__catalog-meta.json" });
    const data = await client.send(cmd);
    const body = data.Body;
    if (!body) return { version: 1, overrides: {} };
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as any) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf-8");
    return JSON.parse(text) as CatalogMeta;
  } catch {
    return { version: 1, overrides: {} };
  }
}

async function writeCatalogMeta(client: S3Client, bucket: string, meta: CatalogMeta): Promise<void> {
  const body = JSON.stringify(meta, null, 2);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: "__catalog-meta.json",
    Body: body,
    ContentType: "application/json",
  }));
}

async function readRegistry(client: S3Client, bucket: string): Promise<Registry> {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: "__registry.json" });
    const data = await client.send(cmd);
    const body = data.Body;
    if (!body) return { version: 1, items: [] };
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as any) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf-8");
    return JSON.parse(text) as Registry;
  } catch {
    return { version: 1, items: [] };
  }
}

async function writeRegistry(client: S3Client, bucket: string, registry: Registry): Promise<void> {
  const body = JSON.stringify(registry, null, 2);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: "__registry.json",
    Body: body,
    ContentType: "application/json",
  }));
}

// ── Remap History (stored in R2 as __remap-history.json) ─────────────────────

interface RemapEntry {
  id: string;
  doneAt: string;
  fromIds: number[];
  toId: number;
  toType: "movie" | "tv";
  titles: string[];
  updated: number;
}
interface RemapHistory { version: number; entries: RemapEntry[] }

async function readRemapHistory(client: S3Client, bucket: string): Promise<RemapHistory> {
  try {
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: "__remap-history.json" });
    const data = await client.send(cmd);
    const chunks: Uint8Array[] = [];
    for await (const chunk of data.Body as any) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as RemapHistory;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeRemapHistory(client: S3Client, bucket: string, history: RemapHistory): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: "__remap-history.json",
    Body: JSON.stringify(history, null, 2),
    ContentType: "application/json",
  }));
}

// ── TMDB search ───────────────────────────────────────────────────────────────

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

async function buildEntriesFromPrefixes(
  client: S3Client,
  bucket: string,
  prefixes: string[],
  catalogMeta: CatalogMeta,
  depth = 0,
): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const MAX_DEPTH = 4;

  for (const titlePrefix of prefixes) {
    // Last segment of path = folder display name
    const segments = titlePrefix.replace(/\/$/, "").split("/");
    const name = segments[segments.length - 1] ?? titlePrefix.replace(/\/$/, "");

    // Skip internal system keys
    if (name.startsWith("__")) continue;

    const subPrefixes = await listPrefixes(client, bucket, titlePrefix);
    const seasons: SeasonInfo[] = [];
    const nonSeasonSubs: string[] = [];

    for (const sub of subPrefixes) {
      const subName = sub.replace(titlePrefix, "").replace(/\/$/, "");
      const seasonNum = parseSeasonNumber(subName);
      if (seasonNum !== null) {
        seasons.push({ number: seasonNum, prefix: sub, label: subName });
      } else {
        nonSeasonSubs.push(sub);
      }
    }
    seasons.sort((a, b) => a.number - b.number);

    const hasVideos = seasons.length === 0 && await hasVideoFiles(client, bucket, titlePrefix);

    // Container detection: no seasons, no direct videos, has non-season subfolders
    // → recurse into children (e.g. a "Séries/" or "Filmes/" parent folder)
    if (seasons.length === 0 && !hasVideos && nonSeasonSubs.length > 0 && depth < MAX_DEPTH) {
      const childEntries = await buildEntriesFromPrefixes(client, bucket, nonSeasonSubs, catalogMeta, depth + 1);
      entries.push(...childEntries);
      continue;
    }

    const isSeries = seasons.length > 0;

    // Check for saved TMDB override in catalog-meta
    const override = catalogMeta.overrides[titlePrefix];
    let tmdbMatch: TmdbMatch | null = null;

    if (override?.tmdbId) {
      try {
        const type = override.tmdbType ?? (isSeries ? "tv" : "movie");
        if (type === "tv") {
          const r = await (tmdb as any).tv.details(override.tmdbId);
          tmdbMatch = { id: r.id, title: r.name, poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview, vote_average: r.vote_average, first_air_date: r.first_air_date, media_type: "tv" };
        } else {
          const r = await (tmdb as any).movies.details(override.tmdbId);
          tmdbMatch = { id: r.id, title: r.title, poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview, vote_average: r.vote_average, release_date: r.release_date, media_type: "movie" };
        }
      } catch {
        tmdbMatch = await searchTmdb(override.displayName ?? name, override.tmdbType ?? (isSeries ? "tv" : undefined));
      }
    } else {
      tmdbMatch = await searchTmdb(override?.displayName ?? name, isSeries ? "tv" : hasVideos ? "movie" : undefined);
    }

    const type: CatalogEntry["type"] = isSeries ? "tv"
      : (override?.tmdbType === "tv" || tmdbMatch?.media_type === "tv") ? "tv"
      : (override?.tmdbType === "movie" || tmdbMatch?.media_type === "movie" || hasVideos) ? "movie"
      : "unknown";

    entries.push({ key: titlePrefix, name: override?.displayName ?? name, type, seasons, tmdb: tmdbMatch });
    await new Promise((r) => setTimeout(r, 150));
  }

  return entries;
}

async function buildCatalog(client: S3Client, bucket: string): Promise<CatalogEntry[]> {
  const [topPrefixes, catalogMeta] = await Promise.all([
    listPrefixes(client, bucket, ""),
    readCatalogMeta(client, bucket),
  ]);
  return buildEntriesFromPrefixes(client, bucket, topPrefixes, catalogMeta, 0);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /catalog
router.get("/catalog", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const forceRefresh = req.query["refresh"] === "true";

    if (!forceRefresh && catalogCache && Date.now() - catalogCache.builtAt < CATALOG_TTL_MS) {
      res.json({ catalog: catalogCache.entries, cached: true, builtAt: new Date(catalogCache.builtAt).toISOString() });
      return;
    }

    const [entries, registry] = await Promise.all([
      buildCatalog(client, bucket),
      readRegistry(client, bucket),
    ]);

    // Merge registry items (TeraBox / Drive) into catalog
    // Group by tmdbId + tmdbType to deduplicate
    const byTmdb = new Map<string, RegistryItem[]>();
    for (const item of registry.items) {
      if (!item.tmdbId) continue;
      const k = `${item.tmdbType ?? "movie"}__${item.tmdbId}`;
      if (!byTmdb.has(k)) byTmdb.set(k, []);
      byTmdb.get(k)!.push(item);
    }

    for (const [, items] of byTmdb) {
      const first = items[0];
      // Skip if this tmdbId is already covered by an R2 folder entry
      if (entries.some((e) => e.tmdb?.id === first.tmdbId)) continue;

      const isSeries = first.tmdbType === "tv";
      const seasons: SeasonInfo[] = [];
      if (isSeries) {
        const seasonNums = [...new Set(items.filter((i) => i.season != null).map((i) => i.season!))].sort((a, b) => a - b);
        for (const sn of seasonNums) {
          seasons.push({ number: sn, prefix: `__tb__/${first.tmdbId}/S${sn}/`, label: `Temporada ${sn}` });
        }
      }

      let tmdbMatch: TmdbMatch | null = null;
      try {
        if (isSeries) {
          const r = await (tmdb as any).tv.details(first.tmdbId);
          tmdbMatch = { id: r.id, title: r.name, poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview, vote_average: r.vote_average, first_air_date: r.first_air_date, media_type: "tv" };
        } else {
          const r = await (tmdb as any).movies.details(first.tmdbId);
          tmdbMatch = { id: r.id, title: r.title, poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview, vote_average: r.vote_average, release_date: r.release_date, media_type: "movie" };
        }
      } catch { tmdbMatch = null; }

      entries.push({
        key: `__tb__/${first.tmdbId}`,
        name: tmdbMatch?.title ?? first.title ?? "Desconhecido",
        type: isSeries ? "tv" : "movie",
        seasons,
        tmdb: tmdbMatch,
      });
    }

    catalogCache = { entries, builtAt: Date.now() };
    res.json({ catalog: entries, cached: false, builtAt: new Date(catalogCache.builtAt).toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// GET /episodes
router.get("/episodes", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const prefix = (req.query["prefix"] as string) ?? "";
    if (!prefix) { res.status(400).json({ error: "prefix required" }); return; }

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 500 });
    const data = await client.send(cmd);

    const episodes = (data.Contents ?? [])
      .filter((o) => {
        if (!o.Key || o.Key === prefix) return false;
        const size = o.Size ?? 0;
        return isLikelyVideo(o.Key, size);
      })
      .map((o) => {
        const fileName = o.Key!.split("/").pop() ?? o.Key!;
        return {
          key: o.Key!,
          name: fileName,
          size: o.Size ?? 0,
          lastModified: o.LastModified?.toISOString() ?? null,
          episode: parseEpisodeNumber(fileName),
        };
      })
      .sort((a, b) => (a.episode ?? 999) - (b.episode ?? 999));

    res.json({ prefix, episodes });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// GET /list
router.get("/list", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const prefix = (req.query["prefix"] as string) ?? "";
    const rawDelimiter = req.query["delimiter"] as string | undefined;
    // Empty string = recursive listing (no grouping); undefined = default "/"
    const delimiter = rawDelimiter === "" ? undefined : (rawDelimiter ?? "/");
    const continuationToken = (req.query["token"] as string) ?? undefined;
    // noFallback=true → never do recursive fallback (used by file browsers / ManagePanel)
    const noFallback = req.query["noFallback"] === "true";

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: delimiter, MaxKeys: 1000, ContinuationToken: continuationToken });
    const data = await client.send(cmd);

    const folders = (data.CommonPrefixes ?? []).map((p) => ({
      type: "folder" as const,
      key: p.Prefix!,
      name: p.Prefix!.replace(prefix, "").replace(/\/$/, "") || p.Prefix!,
    }));

    let files = (data.Contents ?? [])
      .filter((o) => o.Key !== prefix && !o.Key?.endsWith("__registry.json") && !o.Key?.endsWith("__catalog-meta.json"))
      .map((o) => ({
        type: "file" as const,
        key: o.Key!,
        name: o.Key!.split("/").pop() ?? o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified?.toISOString() ?? null,
        fileType: fileType(o.Key!),
        isVideo: isLikelyVideo(o.Key!, o.Size ?? 0),
      }));

    // Fallback: if delimiter was used and no video found at this level,
    // do a recursive search so older clients (APK) can still find nested videos.
    // DISABLED when noFallback=true (file browsers must only show current-level contents).
    if (!noFallback && delimiter && !files.some((f) => f.isVideo) && folders.length > 0) {
      const recCmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000 });
      const recData = await client.send(recCmd);
      const recFiles = (recData.Contents ?? [])
        .filter((o) => o.Key !== prefix && !o.Key?.endsWith("__registry.json") && !o.Key?.endsWith("__catalog-meta.json"))
        .map((o) => ({
          type: "file" as const,
          key: o.Key!,
          name: o.Key!.split("/").pop() ?? o.Key!,
          size: o.Size ?? 0,
          lastModified: o.LastModified?.toISOString() ?? null,
          fileType: fileType(o.Key!),
          isVideo: isLikelyVideo(o.Key!, o.Size ?? 0),
        }));
      if (recFiles.some((f) => f.isVideo)) files = recFiles;
    }

    res.json({ bucket, prefix, folders, files, isTruncated: data.IsTruncated ?? false, nextToken: data.NextContinuationToken ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// GET /signed-url
// If key ends with "/" it is treated as a folder — server finds first video recursively
router.get("/signed-url", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    let key = req.query["key"] as string;
    if (!key) { res.status(400).json({ error: "key is required" }); return; }
    const expiresIn = Number(req.query["expires"] ?? 3600);

    // Resolve folder → first video file (recursive, no delimiter)
    if (key.endsWith("/")) {
      const listCmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: key, MaxKeys: 1000 });
      const listData = await client.send(listCmd);
      const contents = listData.Contents ?? [];
      const video = contents.find((o) => o.Key && isLikelyVideo(o.Key, o.Size ?? 0));
      if (!video?.Key) {
        res.status(404).json({ error: "Nenhum vídeo encontrado na pasta" });
        return;
      }
      key = video.Key;
    }

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(client, cmd, { expiresIn });
    res.json({ url, key, bucket, expiresIn });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// OPTIONS /stream — CORS preflight
router.options("/stream", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.sendStatus(204);
});

// GET /stream?key=<r2-key>
// Proxy de vídeo do R2 com suporte a Range requests (busca em vídeo no browser).
// Adiciona cabeçalhos CORS para que <video> no browser consiga carregar sem erro.
router.get("/stream", async (req, res) => {
  try {
    let key = req.query["key"] as string;
    if (!key) { res.status(400).json({ error: "key required" }); return; }
    const client = getClient();
    const bucket = getBucket(req.query);

    // Se a chave for uma pasta, resolve o vídeo correto (com suporte a episódio)
    if (key.endsWith("/")) {
      const episodeParam = req.query["episode"];
      const episodeNum = episodeParam != null && episodeParam !== "" ? Number(episodeParam) : null;
      const listCmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: key, MaxKeys: 1000 });
      const listData = await client.send(listCmd);
      const videos = (listData.Contents ?? []).filter((o) => o.Key && isLikelyVideo(o.Key, o.Size ?? 0));
      if (videos.length === 0) { res.status(404).json({ error: "Nenhum vídeo encontrado na pasta" }); return; }
      let resolved = videos[0];
      if (episodeNum != null) {
        const n = episodeNum;
        const pats = [
          new RegExp(`[Ee]p?0*${n}(?!\\d)`, "i"),
          new RegExp(`[Ee]p?\\s*0*${n}[^\\d]`, "i"),
          new RegExp(`[-_.\\s]0*${n}[-_.\\s]`),
          new RegExp(`\\b0*${n}\\b`),
        ];
        for (const pat of pats) {
          const hit = videos.find((o) => pat.test((o.Key ?? "").split("/").pop() ?? ""));
          if (hit) { resolved = hit; break; }
        }
      } else {
        const sorted = [...videos].sort((a, b) => (a.Key ?? "").localeCompare(b.Key ?? ""));
        resolved = sorted[0];
      }
      key = resolved.Key!;
    }

    // HEAD para obter tamanho e content-type
    const headCmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const headData = await client.send(headCmd);
    const totalSize = headData.ContentLength ?? 0;
    const contentType = headData.ContentType ?? "video/mp4";

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");

    const rangeHeader = req.headers["range"];
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) { res.status(416).end(); return; }
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : Math.max(0, totalSize - 1);
      const chunkSize = end - start + 1;
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${end}` });
      const data = await client.send(getCmd);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      res.setHeader("Content-Length", chunkSize);
      (data.Body as Readable).pipe(res);
    } else {
      const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
      const data = await client.send(getCmd);
      res.status(200);
      if (totalSize > 0) res.setHeader("Content-Length", totalSize);
      (data.Body as Readable).pipe(res);
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message ?? "error" });
    }
  }
});

// GET /stats
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

// ── NEW: Download from URL ────────────────────────────────────────────────────
// POST /download-url  { url, key }
router.post("/download-url", async (req, res) => {
  try {
    const { url, key } = req.body as { url: string; key: string };
    if (!url || !key) { res.status(400).json({ error: "url and key are required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const jobId = crypto.randomUUID();

    const job: Job = { status: "downloading", progress: 0, downloaded: 0, total: 0, key, startedAt: Date.now() };
    jobs.set(jobId, job);
    res.json({ jobId, key });

    // Background: download + upload
    (async () => {
      try {
        // Retry on transient DNS/network errors (EAI_AGAIN, ENOTFOUND)
        let response: Response | null = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
            break;
          } catch (e: any) {
            const isTransient = e?.code === "EAI_AGAIN" || e?.code === "ENOTFOUND" || e?.code === "ECONNRESET";
            if (!isTransient || attempt === 4) throw e;
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
        if (!response) throw new Error("Falha ao conectar à URL de origem");
        if (!response.ok) throw new Error(`HTTP ${response.status} from source URL`);

        const contentLength = Number(response.headers.get("content-length") ?? 0);
        job.total = contentLength;
        job.status = "uploading";

        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        const contentDisp = response.headers.get("content-disposition") ?? "";

        // Extract filename from Content-Disposition: attachment; filename="..."
        const dispFilename = (() => {
          const m = contentDisp.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
          if (!m) return null;
          try { return decodeURIComponent(m[1].trim()); } catch { return m[1].trim(); }
        })();

        // Auto-fix destination key:
        // 1. If key has no video extension + Content-Disposition has a filename → use that filename
        // 2. Else if key has no video extension + content-type is video → append correct ext from mime
        const VIDEO_EXTS = /\.(mp4|mkv|mov|avi|webm|m4v|ts|m2ts|wmv|flv|ogv)$/i;
        let finalKey = key;
        if (!VIDEO_EXTS.test(key)) {
          const folder = key.replace(/[^/]*$/, ""); // strip any trailing non-slash filename
          if (dispFilename && VIDEO_EXTS.test(dispFilename)) {
            finalKey = `${folder}${dispFilename}`;
          } else if (contentType.startsWith("video/")) {
            const rawExt = contentType.split("/")[1]?.split(";")[0]?.trim() ?? "mp4";
            const ext = rawExt === "quicktime" ? "mov" : rawExt === "x-matroska" ? "mkv" : rawExt === "x-msvideo" ? "avi" : rawExt;
            const base = key.endsWith("/") ? key : `${key}.`;
            finalKey = `${base}${ext}`;
          }
          job.key = finalKey;
        }

        // Convert WHATWG ReadableStream → Node Readable
        const webStream = response.body!;
        const nodeStream = Readable.fromWeb(webStream as any);

        // Track progress via PassThrough
        const passThrough = new PassThrough();
        nodeStream.on("data", (chunk: Buffer) => {
          job.downloaded += chunk.length;
          if (contentLength > 0) {
            job.progress = Math.min(99, Math.round((job.downloaded / contentLength) * 100));
          }
        });
        nodeStream.pipe(passThrough);

        const uploader = new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: finalKey,
            Body: passThrough,
            ContentType: contentType,
          },
          queueSize: 4,
          partSize: 1024 * 1024 * 64, // 64 MB parts — no size limit
        });

        await uploader.done();
        job.status = "done";
        job.progress = 100;
        // Invalidate catalog cache so new content appears
        catalogCache = null;
        // Notify users of new content added via URL download
        notifyNewContent(1, null).catch(() => {});
      } catch (e: any) {
        job.status = "error";
        job.error = e?.message ?? "download failed";
      }
    })();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// GET /job/:id
router.get("/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) { res.status(404).json({ error: "job not found" }); return; }
  res.json(job);
});

// ── NEW: Upload file from device ──────────────────────────────────────────────
// POST /upload  (multipart/form-data: file + key)
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const key = req.body?.key as string;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!key || !file) { res.status(400).json({ error: "file and key are required" }); return; }

    const client = getClient();
    const bucket = getBucket();

    const uploader = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      },
      queueSize: 4,
      partSize: 1024 * 1024 * 64,
    });

    await uploader.done();
    catalogCache = null;
    res.json({ ok: true, key, size: file.size });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Move/rename ─────────────────────────────────────────────────────────
// POST /move  { src, dst }
router.post("/move", async (req, res) => {
  try {
    const { src, dst } = req.body as { src: string; dst: string };
    if (!src || !dst) { res.status(400).json({ error: "src and dst are required" }); return; }

    const client = getClient();
    const bucket = getBucket();

    // Copy to new key
    await client.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${src}`,
      Key: dst,
    }));

    // Delete original
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: src }));
    catalogCache = null;
    res.json({ ok: true, src, dst });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Delete ───────────────────────────────────────────────────────────────
// DELETE /delete  { key }
router.delete("/delete", async (req, res) => {
  try {
    const key = (req.query["key"] as string) ?? (req.body?.key as string);
    if (!key) { res.status(400).json({ error: "key is required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    catalogCache = null;
    res.json({ ok: true, key });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// DELETE /catalog-entry?prefix=<prefix>&tmdbId=<id>
// Deletes all objects under a folder prefix (R2 entry) or removes registry items (TeraBox entry)
router.delete("/catalog-entry", async (req, res) => {
  try {
    const prefix = req.query["prefix"] as string;
    const tmdbId = req.query["tmdbId"] ? Number(req.query["tmdbId"]) : null;
    if (!prefix) { res.status(400).json({ error: "prefix required" }); return; }

    const client = getClient();
    const bucket = getBucket();

    // TeraBox virtual entry: remove all registry items with matching tmdbId
    if (prefix.startsWith("__tb__/") && tmdbId != null) {
      const registry = await readRegistry(client, bucket);
      const before = registry.items.length;
      registry.items = registry.items.filter((i) => i.tmdbId !== tmdbId);
      await writeRegistry(client, bucket, registry);
      catalogCache = null;
      res.json({ ok: true, deleted: before - registry.items.length, type: "registry" });
      return;
    }

    // R2 folder entry: list all objects under prefix and delete each
    let deleted = 0;
    let token: string | undefined;
    do {
      const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000, ContinuationToken: token });
      const data = await client.send(cmd);
      for (const obj of data.Contents ?? []) {
        if (obj.Key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key })); deleted++; }
      }
      token = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (token);

    // Remove catalog-meta override if present
    try {
      const meta = await readCatalogMeta(client, bucket);
      if (meta.overrides[prefix]) {
        delete meta.overrides[prefix];
        await writeCatalogMeta(client, bucket, meta);
      }
    } catch {}

    // Remove registry entries that reference this prefix
    try {
      const registry = await readRegistry(client, bucket);
      const before = registry.items.length;
      registry.items = registry.items.filter((i) =>
        !i.r2Key || (!i.r2Key.startsWith(prefix) && i.r2Key !== prefix.replace(/\/$/, ""))
      );
      if (registry.items.length !== before) {
        await writeRegistry(client, bucket, registry);
      }
    } catch {}

    catalogCache = null;
    res.json({ ok: true, deleted, type: "r2" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Create folder ────────────────────────────────────────────────────────
// POST /mkdir  { prefix }   (creates a zero-byte placeholder)
router.post("/mkdir", async (req, res) => {
  try {
    const { prefix } = req.body as { prefix: string };
    if (!prefix) { res.status(400).json({ error: "prefix is required" }); return; }
    const key = prefix.endsWith("/") ? `${prefix}.keep` : `${prefix}/.keep`;

    const client = getClient();
    const bucket = getBucket();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "", ContentType: "text/plain" }));
    catalogCache = null;
    res.json({ ok: true, key });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Catalog Meta — save TMDB override for a folder ──────────────────────
// POST /catalog-meta  { prefix, tmdbId, tmdbType, displayName }
router.post("/catalog-meta", async (req, res) => {
  try {
    const { prefix, tmdbId, tmdbType, displayName } = req.body as {
      prefix: string; tmdbId?: number; tmdbType?: "movie" | "tv"; displayName?: string;
    };
    if (!prefix) { res.status(400).json({ error: "prefix required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const meta = await readCatalogMeta(client, bucket);
    meta.overrides[prefix] = { ...(meta.overrides[prefix] ?? {}), tmdbId, tmdbType, displayName };
    await writeCatalogMeta(client, bucket, meta);
    catalogCache = null;
    res.json({ ok: true, prefix, override: meta.overrides[prefix] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Rename folder ────────────────────────────────────────────────────────
// POST /rename-folder  { oldPrefix, newPrefix }
// Moves ALL objects under oldPrefix to newPrefix, updates catalog-meta if needed
router.post("/rename-folder", async (req, res) => {
  try {
    const { oldPrefix, newPrefix } = req.body as { oldPrefix: string; newPrefix: string };
    if (!oldPrefix || !newPrefix) { res.status(400).json({ error: "oldPrefix and newPrefix required" }); return; }

    const src = oldPrefix.endsWith("/") ? oldPrefix : `${oldPrefix}/`;
    const dst = newPrefix.endsWith("/") ? newPrefix : `${newPrefix}/`;
    if (src === dst) { res.json({ ok: true, moved: 0 }); return; }

    const client = getClient();
    const bucket = getBucket();

    // List all objects under old prefix (paginate)
    let token: string | undefined;
    const keys: string[] = [];
    do {
      const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: src, MaxKeys: 1000, ContinuationToken: token });
      const data = await client.send(cmd);
      for (const obj of data.Contents ?? []) { if (obj.Key) keys.push(obj.Key); }
      token = data.IsTruncated ? data.NextContinuationToken : undefined;
    } while (token);

    if (keys.length === 0) { res.status(404).json({ error: "No objects found under prefix" }); return; }

    // Copy each object to new prefix, then delete original
    for (const key of keys) {
      const newKey = dst + key.slice(src.length);
      await client.send(new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: newKey,
      }));
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }

    // Update catalog-meta overrides key if it existed
    const meta = await readCatalogMeta(client, bucket);
    if (meta.overrides[src]) {
      meta.overrides[dst] = meta.overrides[src];
      delete meta.overrides[src];
      await writeCatalogMeta(client, bucket, meta);
    }

    catalogCache = null;
    res.json({ ok: true, moved: keys.length, src, dst });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Registry CRUD ────────────────────────────────────────────────────────

// GET /registry
router.get("/registry", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    res.json(registry);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// POST /registry/add  { item: RegistryItem }
router.post("/registry/add", async (req, res) => {
  try {
    const { item } = req.body as { item: Omit<RegistryItem, "id" | "addedAt"> };
    if ((!item?.r2Key && !item?.teraboxUrl) || !item?.tmdbId) { res.status(400).json({ error: "item with r2Key or teraboxUrl and tmdbId required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const newItem: RegistryItem = {
      ...item,
      id: crypto.randomUUID(),
      addedAt: new Date().toISOString(),
    };
    registry.items.push(newItem);
    await writeRegistry(client, bucket, registry);
    res.json({ ok: true, item: newItem });

    // Fire push notification for new content (non-blocking)
    try {
      if (newItem.episode != null && newItem.season != null && newItem.tmdbType === "tv") {
        notifyNewEpisode(
          newItem.tmdbId,
          newItem.title,
          newItem.season,
          newItem.episode,
          newItem.label ?? "",
          null
        ).catch(() => {});
      } else {
        notifyNewContent(1, newItem.title).catch(() => {});
      }
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// PUT /registry/:id  { item: Partial<RegistryItem> }
router.put("/registry/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body as Partial<RegistryItem>;

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const idx = registry.items.findIndex((i) => i.id === id);
    if (idx < 0) { res.status(404).json({ error: "item not found" }); return; }
    registry.items[idx] = { ...registry.items[idx], ...update, id };
    await writeRegistry(client, bucket, registry);
    res.json({ ok: true, item: registry.items[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// POST /registry/remap-tmdb  { fromIds: number[], toId: number, toType: "movie"|"tv" }
// Batch-updates all registry items whose tmdbId is in fromIds → toId + toType
router.post("/registry/remap-tmdb", async (req, res) => {
  try {
    const { fromIds, toId, toType } = req.body as { fromIds: number[]; toId: number; toType: "movie" | "tv" };
    if (!Array.isArray(fromIds) || fromIds.length === 0 || !toId || !toType) {
      res.status(400).json({ error: "fromIds (array), toId, toType required" }); return;
    }
    const fromSet = new Set(fromIds.map(Number));
    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    let updated = 0;
    const affectedTitles = new Set<string>();
    registry.items = registry.items.map((item) => {
      if (fromSet.has(Number(item.tmdbId))) {
        updated++;
        if (item.title) affectedTitles.add(item.title);
        return { ...item, tmdbId: Number(toId), tmdbType: toType };
      }
      return item;
    });
    await writeRegistry(client, bucket, registry);

    // Save to remap history (non-blocking on failure)
    try {
      const history = await readRemapHistory(client, bucket);
      history.entries.unshift({
        id: crypto.randomUUID(),
        doneAt: new Date().toISOString(),
        fromIds: fromIds.map(Number),
        toId: Number(toId),
        toType,
        titles: [...affectedTitles].slice(0, 5),
        updated,
      });
      if (history.entries.length > 100) history.entries = history.entries.slice(0, 100);
      await writeRemapHistory(client, bucket, history);
    } catch {}

    res.json({ ok: true, updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// GET /registry/remap-history
router.get("/registry/remap-history", async (_req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket();
    const history = await readRemapHistory(client, bucket);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// DELETE /registry/:id
router.delete("/registry/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const before = registry.items.length;
    registry.items = registry.items.filter((i) => i.id !== id);
    if (registry.items.length === before) { res.status(404).json({ error: "item not found" }); return; }
    await writeRegistry(client, bucket, registry);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: TeraBox play (resolve on-the-fly from registry) ─────────────────────
// GET /terabox/play?id=<registryItemId>
router.get("/terabox/play", async (req, res) => {
  try {
    const { id } = req.query as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const item = registry.items.find((i) => i.id === id);
    if (!item) { res.status(404).json({ error: "Registry item not found" }); return; }
    if (!item.teraboxUrl) { res.status(400).json({ error: "Item does not have a teraboxUrl" }); return; }

    const normalizedUrl = normalizeTeraboxUrl(item.teraboxUrl);

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 60_000);
    let r: Response;
    try {
      r = await fetch("https://xapiverse.com/api/terabox-pro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xAPIverse-Key": "sk_6d7363a619840df0a07afe194613bf9a",
        },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(tid); }

    const data = await r.json() as any;
    if (!r.ok || data.status !== "success") {
      res.status(400).json({ error: data.message ?? data.error ?? "TeraBox API error" });
      return;
    }

    const list: any[] = data.list ?? [];
    if (list.length === 0) { res.status(404).json({ error: "Nenhum arquivo encontrado no link TeraBox" }); return; }

    // Try to find file by stored fileName first (stable), then fall back to fileIndex
    let file: any;
    if (item.fileName) {
      file = list.find((f: any) => f.name === item.fileName);
    }
    if (!file) {
      const idx = typeof item.fileIndex === "number" && item.fileIndex < list.length ? item.fileIndex : 0;
      file = list[idx];
    }
    const streamUrl = file.fast_dlink ?? file.stream_url ?? null;
    if (!streamUrl) { res.status(404).json({ error: "URL de stream não disponível" }); return; }

    res.json({
      url: streamUrl,
      name: file.name,
      quality: file.quality,
      duration: file.duration,
      size: file.size_formatted,
      fast_stream_url: file.fast_stream_url ?? {},
      thumbnail: file.thumbnail ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: TeraBox register (save link to registry without downloading) ──────────
// POST /terabox/register { teraboxUrl, fileIndex?, fileName?, tmdbId, tmdbType, title, label, season?, episode?, r2Folder? }
router.post("/terabox/register", async (req, res) => {
  try {
    const { teraboxUrl, fileIndex, fileName, tmdbId, tmdbType, title, label, season, episode, r2Folder } = req.body as {
      teraboxUrl: string;
      fileIndex?: number;
      fileName?: string;
      tmdbId: number;
      tmdbType: "movie" | "tv";
      title: string;
      label: string;
      season?: number | null;
      episode?: number | null;
      r2Folder?: string;
    };
    if (!teraboxUrl || !tmdbId || !tmdbType) {
      res.status(400).json({ error: "teraboxUrl, tmdbId and tmdbType are required" });
      return;
    }

    const normalizedTeraboxUrl = normalizeTeraboxUrl(teraboxUrl.trim());

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);

    // Deduplicate: if an item with same teraboxUrl + fileIndex already exists, update it
    const existingIdx = registry.items.findIndex(
      (i) => i.teraboxUrl === normalizedTeraboxUrl && i.fileIndex === fileIndex && i.tmdbId === tmdbId
    );

    const newItem: RegistryItem = {
      id: existingIdx >= 0 ? registry.items[existingIdx].id : crypto.randomUUID(),
      r2Key: "",
      teraboxUrl: normalizedTeraboxUrl,
      fileIndex: typeof fileIndex === "number" ? fileIndex : undefined,
      fileName: fileName || undefined,
      tmdbId,
      tmdbType,
      title: title ?? "",
      label: label ?? title ?? "",
      season: season ?? null,
      episode: episode ?? null,
      r2Folder: r2Folder || undefined,
      addedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      registry.items[existingIdx] = newItem;
    } else {
      registry.items.push(newItem);
    }

    await writeRegistry(client, bucket, registry);
    res.json({ ok: true, item: newItem });

    // Fire push notification for new content (non-blocking)
    try {
      if (newItem.episode != null && newItem.season != null && newItem.tmdbType === "tv") {
        notifyNewEpisode(
          newItem.tmdbId,
          newItem.title,
          newItem.season,
          newItem.episode,
          newItem.label ?? "",
          null
        ).catch(() => {});
      } else {
        notifyNewContent(1, newItem.title).catch(() => {});
      }
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: TeraBox resolve (xAPIverse) ──────────────────────────────────────────
// POST /terabox-resolve  { url }
router.post("/terabox-resolve", async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    if (!url) { res.status(400).json({ error: "url required" }); return; }

    const normalizedUrl = normalizeTeraboxUrl(url.trim());

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 30_000);
    let r: Response;
    try {
      r = await fetch("https://xapiverse.com/api/terabox-pro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xAPIverse-Key": "sk_6d7363a619840df0a07afe194613bf9a",
        },
        body: JSON.stringify({ url: normalizedUrl }),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(tid); }

    const data = await r.json() as any;
    if (!r.ok || data.status !== "success") {
      res.status(400).json({ error: data.message ?? data.error ?? "TeraBox API error" });
      return;
    }
    res.json({ list: data.list ?? [], total_files: data.total_files ?? 0, total_folders: data.total_folders ?? 0 });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── NEW: Google Drive resolve ──────────────────────────────────────────────────
// POST /gdrive-resolve  { url }
router.post("/gdrive-resolve", async (req, res) => {
  try {
    const { url } = req.body as { url: string };
    if (!url) { res.status(400).json({ error: "url required" }); return; }

    const idMatch =
      url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ??
      url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (!idMatch) {
      res.status(400).json({ error: "URL do Google Drive inválida. Use o link de compartilhamento (ex: drive.google.com/file/d/ID/view)." });
      return;
    }
    const fileId = idMatch[1];
    const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;

    let name = `gdrive_${fileId}.mp4`;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10_000);
      let head: Response;
      try {
        head = await fetch(directUrl, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
      } finally { clearTimeout(tid); }
      const disp = head.headers.get("content-disposition") ?? "";
      const m = disp.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i);
      if (m) { try { name = decodeURIComponent(m[1].trim()); } catch { name = m[1].trim(); } }
    } catch {}

    res.json({ directUrl, fileId, name });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// Removes quality/codec/audio tags from a filename/folder name, returning the clean title
function cleanTmdbQuery(raw: string): string {
  let s = raw;
  // Remove extensão
  s = s.replace(/\.[a-zA-Z0-9]{2,5}$/, "");
  // Remove tudo entre colchetes: [1080p][Dublado][BluRay]...
  s = s.replace(/\[[^\]]*\]/g, " ");
  // Remove tudo entre parênteses que seja ano ou tag: (2006), (4K), (Dublado)
  s = s.replace(/\(\s*(?:\d{4}|[A-Z\d][^)]{0,25})\s*\)/gi, " ");
  // Remove tags de qualidade e codec soltos
  s = s.replace(/\b(?:4K|UHD|2160p|1080p|720p|480p|360p|BluRay|BDRip|WEBRip|WEB-DL|HDRip|HDTV|DVDRip|Blu-Ray|H\.?264|H\.?265|HEVC|AVC|XVID|x265|x264|AAC|AC3|DTS|DDP5|EAC3|OPUS|FLAC|Remux|Rip|BR)\b/gi, " ");
  // Remove tags de idioma/legenda
  s = s.replace(/\b(?:Dublado|Dub|Legendado|Leg|PT[-\s]?BR|PTBR|Portuguese|English|Español|Spanish|Multi|Audio)\b/gi, " ");
  // Remove separadores comuns de filenames
  s = s.replace(/[._]/g, " ");
  // Remove múltiplos espaços e trim
  s = s.replace(/\s{2,}/g, " ").trim();
  // Remove sufixo de tamanho: "2,15 GB", "700 MB", etc.
  s = s.replace(/[\d,.]+ (?:GB|MB|TB)/gi, " ").trim();
  // Remove traço isolado no início/fim
  s = s.replace(/^[-\s]+|[-\s]+$/g, "").trim();
  return s;
}

// ── NEW: TMDB search proxy ─────────────────────────────────────────────────────
// GET /tmdb-search?q=...&type=multi|movie|tv
router.get("/tmdb-search", async (req, res) => {
  try {
    const rawQ = (req.query["q"] as string ?? "").trim();
    const type = (req.query["type"] as string) ?? "multi";
    if (!rawQ) { res.status(400).json({ error: "q required" }); return; }

    // Limpa o título automaticamente (remove tags de qualidade, ano, etc.)
    const q = cleanTmdbQuery(rawQ);

    const TMDB_KEY = process.env.TMDB_API_KEY ?? "8f0beb08cf016ec8de49e454e09879ec";
    const TMDB_BASE = "https://api.themoviedb.org/3";
    const TMDB_LANG = "pt-BR";

    async function tmdbFetch(endpoint: string): Promise<any> {
      const params = new URLSearchParams({ api_key: TMDB_KEY, language: TMDB_LANG, query: q, page: "1" });
      const r = await fetch(`${TMDB_BASE}${endpoint}?${params}`);
      if (!r.ok) throw new Error(`TMDB ${r.status}`);
      return r.json();
    }

    let results: any[] = [];

    if (type === "movie") {
      const d = await tmdbFetch("/search/movie");
      results = (d.results ?? []).slice(0, 10).map((x: any) => ({ ...x, media_type: "movie" }));
    } else if (type === "tv") {
      const d = await tmdbFetch("/search/tv");
      results = (d.results ?? []).slice(0, 10).map((x: any) => ({ ...x, title: x.name, media_type: "tv" }));
    } else {
      const d = await tmdbFetch("/search/multi");
      results = (d.results ?? [])
        .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
        .slice(0, 10)
        .map((x: any) => ({ ...x, title: x.title ?? x.name }));
    }
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── Drive helpers ─────────────────────────────────────────────────────────────

function extractDriveFileId(url: string): string | null {
  const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function buildDriveDirectUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

// ── Drive: registrar link (sem fazer upload do vídeo — economiza espaço no R2) ──
// POST /drive/register  { driveUrl?, tmdbId, tmdbType, title, label, season?, episode?, driveNum?, driveFilePath? }
// Aceita driveUrl (link compartilhável do Drive) OU (driveFilePath + driveNum) — para registro via navegador de pastas.
router.post("/drive/register", async (req, res) => {
  try {
    const { driveUrl, tmdbId, tmdbType, title, label, season, episode, driveNum, driveFilePath } = req.body;

    if (!tmdbId || !tmdbType) {
      res.status(400).json({ error: "tmdbId e tmdbType são obrigatórios" }); return;
    }
    const hasPathSource = driveFilePath != null && driveNum != null;
    const rawUrl = driveUrl ? String(driveUrl).trim() : "";
    const hasUrlSource = rawUrl !== "";
    if (!hasPathSource && !hasUrlSource) {
      res.status(400).json({ error: "Forneça driveUrl ou (driveNum + driveFilePath)" }); return;
    }

    let fileId: string | null = null;
    if (hasUrlSource) {
      fileId = extractDriveFileId(rawUrl);
      if (!fileId) {
        res.status(400).json({ error: "URL do Google Drive inválida. Use o link de compartilhamento (ex: drive.google.com/file/d/ID/view)." }); return;
      }
    }

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);

    const existingIdx = registry.items.findIndex((i) => {
      const sameEp = (i.season ?? null) === (season != null ? Number(season) : null)
        && (i.episode ?? null) === (episode != null ? Number(episode) : null)
        && i.tmdbId === Number(tmdbId);
      if (!sameEp) return false;
      if (hasPathSource && i.driveFilePath === String(driveFilePath)) return true;
      if (hasUrlSource && i.driveUrl === rawUrl) return true;
      return false;
    });

    const newItem: RegistryItem = {
      id: existingIdx >= 0 ? registry.items[existingIdx].id : crypto.randomUUID(),
      r2Key: "",
      driveUrl: hasUrlSource ? rawUrl : undefined,
      driveNum: driveNum != null ? Number(driveNum) : undefined,
      driveFilePath: driveFilePath ? String(driveFilePath) : undefined,
      tmdbId: Number(tmdbId),
      tmdbType,
      title: title ?? "",
      label: label ?? title ?? "Drive",
      season: season != null ? Number(season) : null,
      episode: episode != null ? Number(episode) : null,
      addedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      registry.items[existingIdx] = { ...registry.items[existingIdx], ...newItem };
    } else {
      registry.items.push(newItem);
    }
    await writeRegistry(client, bucket, registry);
    res.json({ ok: true, item: newItem });

    try {
      if (newItem.episode != null && newItem.season != null && newItem.tmdbType === "tv") {
        notifyNewEpisode(newItem.tmdbId, newItem.title, newItem.season, newItem.episode, newItem.label ?? "", null).catch(() => {});
      } else {
        notifyNewContent(1, newItem.title).catch(() => {});
      }
    } catch {}
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── Drive: resolver URL para reprodução nativa ─────────────────────────────────
// GET /drive/play?id=<registryItemId>
// Se o item tem driveNum + driveFilePath → busca link assinado via API de listagem
// e retorna URL de download direta (download.aspx?file=...&expiry=...&mac=...)
// que suporta Range requests (HTTP 206) nativamente — sem proxy necessário.
const DRIVE_WORKER_URL = "https://1.animezey23112022.workers.dev";
const DRIVE_DOWNLOAD_URL = "https://animezey16082023.animezey16082023.workers.dev";

/**
 * Busca o link assinado de um arquivo na API de listagem do Worker.
 * O Worker retorna um JSON com files[].link = "/download.aspx?file=...&expiry=...&mac=..."
 * Este link combinado com DRIVE_DOWNLOAD_URL produz uma URL que suporta Range requests (HTTP 206).
 */
async function resolveSignedDriveLink(
  driveNum: number,
  driveFilePath: string,
  signal: AbortSignal
): Promise<string | null> {
  const parts = driveFilePath.split("/");
  const fileName = parts[parts.length - 1];
  const folderParts = parts.slice(0, -1);

  const encodedFolder = folderParts.map((s) => encodeURIComponent(s)).join("/");
  const listUrl = `${DRIVE_WORKER_URL}/${driveNum}:/${encodedFolder ? encodedFolder + "/" : ""}`;

  let pageToken = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const listResp = await fetch(listUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageToken }),
      signal,
    });
    if (!listResp.ok) break;

    const listData = (await listResp.json()) as any;
    const files: any[] = listData?.data?.files ?? [];

    const found = files.find((f) => f.name === fileName && f.link);
    if (found) return found.link as string;

    pageToken = listData?.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return null;
}

router.get("/drive/play", async (req, res) => {
  try {
    const { id } = req.query as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const item = registry.items.find((i) => i.id === id);
    if (!item) { res.status(404).json({ error: "Item não encontrado no registry" }); return; }

    // ── Flix 2.0: URL direta (nixplay.lat) — retorna imediatamente ──
    if (item.flix2Url) {
      res.json({ url: item.flix2Url, cached: false, via: "flix2" });
      return;
    }

    if (!item.driveUrl && item.driveNum == null) {
      res.status(400).json({ error: "Item não possui link do Drive" }); return;
    }

    // ── Prioridade 1: Link assinado via API de listagem (suporta Range requests) ──
    // Itens registrados via navegador de pastas têm driveNum + driveFilePath.
    // A API de listagem retorna um link /download.aspx?file=...&expiry=...&mac=...
    // que quando combinado com o DOWNLOAD_DOMAIN serve o vídeo com HTTP 206.
    if (item.driveNum != null && item.driveFilePath) {
      const ctrl = new AbortController();
      // Worker bloqueia IPs de servidor (erro 1102) — timeout curto para falhar rápido
      const tid = setTimeout(() => ctrl.abort(), 6000);
      try {
        const signedLink = await resolveSignedDriveLink(item.driveNum, item.driveFilePath, ctrl.signal);
        clearTimeout(tid);

        if (signedLink) {
          const rel = signedLink.startsWith("/") ? signedLink : `/${signedLink}`;
          const downloadUrl = `${DRIVE_DOWNLOAD_URL}${rel}`;
          res.json({ url: downloadUrl, cached: false, via: "signed" });
          return;
        }
      } catch (e: any) {
        clearTimeout(tid);
        // timeout or network error — fall through to legacy path
      }

      // Fallback: usar download domain com o path direto
      const encoded = item.driveFilePath
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
      const fallbackUrl = `${DRIVE_DOWNLOAD_URL}/${item.driveNum}:/${encoded}`;
      res.json({ url: fallbackUrl, cached: false, via: "path-fallback" });
      return;
    }

    // ── Prioridade 2: itens legados (só têm driveUrl / file ID) ──
    // Tenta resolver via redirect chain do Drive — funciona apenas para arquivos públicos
    if (!item.driveUrl) { res.status(400).json({ error: "Item sem link do Drive" }); return; }
    const fileId = extractDriveFileId(item.driveUrl);
    if (!fileId) { res.status(400).json({ error: "URL do Drive inválida" }); return; }

    // Tenta seguir o redirect do Drive para obter URL do CDN (funciona para arquivos públicos)
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 25000);
    try {
      const resp = await fetch(downloadUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const finalUrl = resp.url;

      // Se acabamos em uma página do Google (auth/virus-scan), o arquivo é privado
      if (finalUrl.includes("accounts.google.com") || finalUrl.includes("ServiceLogin")) {
        res.status(403).json({ error: "Arquivo privado — compartilhe como 'Qualquer pessoa com o link' no Google Drive, ou registre novamente via navegador de pastas." });
        return;
      }

      // Salva a URL resolvida no cache (só para arquivos públicos — expira em 2h)
      const idx = registry.items.findIndex((i) => i.id === id);
      if (idx >= 0) {
        registry.items[idx].driveDirectUrl = finalUrl;
        registry.items[idx].driveResolvedAt = new Date().toISOString();
        writeRegistry(client, bucket, registry).catch(() => {});
      }

      res.json({ url: finalUrl, cached: false, via: "redirect" });
    } catch (fetchErr: any) {
      clearTimeout(tid);
      if (fetchErr?.name === "AbortError") {
        res.status(504).json({ error: "Timeout ao resolver URL do Drive" });
        return;
      }
      throw fetchErr;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── Drive: extrair todos (job em background — continua mesmo após fechar o app) ──
// POST /drive/extract-all
router.post("/drive/extract-all", async (req, res) => {
  try {
    const jobId = crypto.randomUUID();
    const job: Job = { status: "queued", progress: 0, downloaded: 0, total: 0, startedAt: Date.now() };
    jobs.set(jobId, job);
    res.json({ jobId });

    // Job server-side: não depende do app estar aberto
    (async () => {
      try {
        const client = getClient();
        const bucket = getBucket();
        const registry = await readRegistry(client, bucket);

        const driveItems = registry.items.filter((i) => i.driveUrl);
        job.total = driveItems.length;
        job.status = "downloading";

        if (driveItems.length === 0) {
          job.status = "done";
          job.progress = 100;
          job.key = "Nenhum link do Drive encontrado no registry";
          return;
        }

        let processed = 0;
        let successCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const item of driveItems) {
          // Pular itens que já foram resolvidos — evita duplicatas e retrabalho
          if (item.driveDirectUrl && item.driveResolvedAt) {
            skippedCount++;
            processed++;
            job.downloaded = processed;
            job.progress = Math.round((processed / driveItems.length) * 95);
            job.key = `[já extraído] ${item.title || item.driveUrl || ""}`;
            continue;
          }

          try {
            const fileId = extractDriveFileId(item.driveUrl!);
            if (!fileId) { errorCount++; processed++; continue; }

            const directUrl = buildDriveDirectUrl(fileId);

            const idx = registry.items.findIndex((i) => i.id === item.id);
            if (idx >= 0) {
              registry.items[idx].driveDirectUrl = directUrl;
              registry.items[idx].driveResolvedAt = new Date().toISOString();
            }
            successCount++;
          } catch {
            errorCount++;
          }
          processed++;
          job.downloaded = processed;
          job.progress = Math.round((processed / driveItems.length) * 95);
          job.key = item.title || item.driveUrl || "";
          // Pequeno delay para não sobrecarregar
          await new Promise<void>((r) => setTimeout(r, 120));
        }

        // Persiste o registry atualizado no R2 (somente se algo novo foi resolvido)
        if (successCount > 0) {
          await writeRegistry(client, bucket, registry);
        }

        job.status = "done";
        job.progress = 100;
        job.key = `${successCount} resolvidos · ${skippedCount} já extraídos · ${errorCount} erros`;
      } catch (e: any) {
        const j = jobs.get(jobId);
        if (j) { j.status = "error"; j.error = e?.message ?? "Erro na extração do Drive"; }
      }
    })();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── Drive: escanear pasta e retornar vídeos com metadados ──────────────────────
// POST /drive/scan-folder  { drive: 0|1, path: string, type: "movie"|"series" }
// Para "series": detecta subpastas de temporada e episódios automaticamente.
// Para "movie": retorna lista plana de vídeos na pasta.
router.post("/drive/scan-folder", async (req, res) => {
  const { drive, path, type } = req.body as { drive: 0 | 1; path: string; type: "movie" | "series" };
  if (drive == null || !path || !type) {
    res.status(400).json({ error: "drive, path e type são obrigatórios" }); return;
  }

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 45_000);

  const VIDEO_EXTS = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v", ".ts", ".m2ts", ".flv"]);
  function isVid(f: any): boolean {
    const mime = (f.mimeType ?? "").toLowerCase();
    if (mime.startsWith("video/")) return true;
    const ext = (f.name ?? "").match(/\.[^.]+$/)?.[0]?.toLowerCase();
    return ext ? VIDEO_EXTS.has(ext) : false;
  }

  async function listAll(folderPath: string, pageToken = ""): Promise<any[]> {
    const encoded = folderPath.split("/").map(encodeURIComponent).join("/");
    const url = `${DRIVE_WORKER_URL}/${drive}:/${encoded}/`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageToken }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as any;
    const files: any[] = data?.data?.files ?? [];
    if (data?.nextPageToken) {
      const more = await listAll(folderPath, data.nextPageToken);
      return [...files, ...more];
    }
    return files;
  }

  function detectSeason(name: string): number | null {
    const m1 = name.match(/^(?:temporada|season|temp(?:orada)?)\s*(\d+)$/i);
    if (m1) return parseInt(m1[1], 10);
    const m2 = name.match(/^[TS](\d{1,2})$/i);
    if (m2) return parseInt(m2[1], 10);
    const m3 = name.match(/^(\d{1,2})$/);
    if (m3) return parseInt(m3[1], 10);
    return null;
  }

  function detectEp(fileName: string): { season?: number; episode?: number } {
    const bare = fileName.replace(/\.[^.]+$/, "");
    const sxe = bare.match(/[Ss](\d{1,2})[Ee][Pp]?(\d{1,3})/);
    if (sxe) return { season: parseInt(sxe[1], 10), episode: parseInt(sxe[2], 10) };
    const alt = bare.match(/(\d{1,2})x(\d{1,3})/i);
    if (alt) return { season: parseInt(alt[1], 10), episode: parseInt(alt[2], 10) };
    const ep = bare.match(/[Ee][Pp]?\.?\s*(\d{1,3})/);
    if (ep) return { episode: parseInt(ep[1], 10) };
    const lead = bare.match(/^(\d{1,3})[\s.\-_]/);
    if (lead) return { episode: parseInt(lead[1], 10) };
    return {};
  }

  function fmtSize(s?: string): string | undefined {
    if (!s) return undefined;
    const n = parseInt(s, 10);
    if (isNaN(n)) return undefined;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
    if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
    return `${Math.round(n / 1e3)} KB`;
  }

  type ScanResult = { filePath: string; fileName: string; size?: string; season?: number; episode?: number };

  try {
    const results: ScanResult[] = [];

    if (type === "movie") {
      const items = await listAll(path);
      for (const f of items) {
        if (isVid(f) && f.link) {
          results.push({ filePath: `${path}/${f.name}`, fileName: f.name, size: fmtSize(f.size) });
        }
      }
    } else {
      const rootItems = await listAll(path);
      const seasonFolders = rootItems
        .filter((f) => f.mimeType === "application/vnd.google-apps.folder" && detectSeason(f.name) !== null)
        .sort((a, b) => (detectSeason(a.name) ?? 0) - (detectSeason(b.name) ?? 0));

      if (seasonFolders.length > 0) {
        for (const sf of seasonFolders) {
          const seasonNum = detectSeason(sf.name)!;
          const seasonPath = `${path}/${sf.name}`;
          const eps = await listAll(seasonPath);
          for (const ep of eps) {
            if (isVid(ep) && ep.link) {
              const info = detectEp(ep.name);
              results.push({
                filePath: `${seasonPath}/${ep.name}`,
                fileName: ep.name,
                size: fmtSize(ep.size),
                season: info.season ?? seasonNum,
                episode: info.episode,
              });
            }
          }
        }
      } else {
        // Sem subpastas de temporada — detecta pelo nome do arquivo
        for (const f of rootItems) {
          if (isVid(f) && f.link) {
            const info = detectEp(f.name);
            results.push({
              filePath: `${path}/${f.name}`,
              fileName: f.name,
              size: fmtSize(f.size),
              season: info.season ?? 1,
              episode: info.episode,
            });
          }
        }
      }
    }

    clearTimeout(tid);
    results.sort((a, b) => {
      if ((a.season ?? 0) !== (b.season ?? 0)) return (a.season ?? 0) - (b.season ?? 0);
      return (a.episode ?? 0) - (b.episode ?? 0);
    });
    res.json({ items: results, total: results.length });
  } catch (err: any) {
    clearTimeout(tid);
    if (err?.name === "AbortError") { res.status(504).json({ error: "Timeout ao escanear pasta" }); return; }
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── POST /flix2/register — save Flix 2.0 content to registry ─────────────────
// Body: { flix2Url, tmdbId, tmdbType, title, label, season?, episode? }
router.post("/flix2/register", async (req, res) => {
  try {
    const { flix2Url, tmdbId, tmdbType, title, label, season, episode } = req.body ?? {};
    if (!flix2Url || !tmdbId || !tmdbType || !title) {
      res.status(400).json({ error: "flix2Url, tmdbId, tmdbType e title são obrigatórios" }); return;
    }
    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);

    // Deduplicate: same flix2Url
    const existingIdx = registry.items.findIndex((i) => i.flix2Url === String(flix2Url));
    const newItem: RegistryItem = {
      id: existingIdx >= 0 ? registry.items[existingIdx].id : crypto.randomUUID(),
      r2Key: "",
      flix2Url: String(flix2Url),
      tmdbId: Number(tmdbId),
      tmdbType: tmdbType as "movie" | "tv",
      title: String(title),
      label: String(label ?? "HD"),
      season: season != null ? Number(season) : null,
      episode: episode != null ? Number(episode) : null,
      addedAt: existingIdx >= 0 ? registry.items[existingIdx].addedAt : new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      registry.items[existingIdx] = newItem;
    } else {
      registry.items.push(newItem);
    }
    await writeRegistry(client, bucket, registry);

    // Push notification for new content
    try {
      if (existingIdx < 0) {
        if (tmdbType === "tv" && season != null && episode != null) {
          await notifyNewEpisode(title, Number(season), Number(episode));
        } else if (tmdbType === "movie") {
          await notifyNewContent(title, "movie");
        }
      }
    } catch {}

    res.json({ ok: true, id: newItem.id, item: newItem });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── Source Settings (global on/off per source, stored in R2) ─────────────────

interface SourceSettings {
  r2: boolean;
  drive: boolean;
  flix2: boolean;
  gstream: boolean;
  regular: boolean;
}

const SOURCE_SETTINGS_KEY = "__source-settings.json";
const DEFAULT_SOURCE_SETTINGS: SourceSettings = {
  r2: true, drive: true, flix2: true, gstream: true, regular: true,
};

async function readSourceSettings(client: S3Client, bucket: string): Promise<SourceSettings> {
  try {
    const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: SOURCE_SETTINGS_KEY }));
    const body = await (resp.Body as any).transformToString();
    return { ...DEFAULT_SOURCE_SETTINGS, ...JSON.parse(body) };
  } catch {
    return { ...DEFAULT_SOURCE_SETTINGS };
  }
}

async function writeSourceSettings(client: S3Client, bucket: string, settings: SourceSettings): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: SOURCE_SETTINGS_KEY,
    Body: JSON.stringify(settings),
    ContentType: "application/json",
  }));
}

router.get("/source-settings", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const settings = await readSourceSettings(client, bucket);
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

router.post("/source-settings", async (req, res) => {
  try {
    const client = getClient();
    const bucket = getBucket(req.query);
    const current = await readSourceSettings(client, bucket);
    const updated: SourceSettings = { ...current, ...req.body };
    await writeSourceSettings(client, bucket, updated);
    res.json({ ok: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── Flix2 helpers ──────────────────────────────────────────────────────────────

function normalizeTitleForSearch(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FLIX2_USER = "Reis007-vods";
const FLIX2_PASS = encodeURIComponent("Reis12@@");

async function flix2FetchPage(type: string, page: number): Promise<{ success: boolean; pagination: any; data: any[] }> {
  const url = `https://nixplay.lat/api/catalog.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&type=${type}&page=${page}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    return await r.json();
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ── GET /flix2/catalog — proxy to nixplay.lat API (avoids CORS on mobile) ─────
router.get("/flix2/catalog", async (req, res) => {
  try {
    const { type = "movies", page = "1" } = req.query as Record<string, string>;
    const data = await flix2FetchPage(type, Number(page));
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

// ── In-memory cache for full catalog fetches ───────────────────────────────────
const FULL_CATALOG_CACHE = new Map<string, { data: any[]; cachedAt: number }>();
const FULL_CATALOG_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Populates FULL_CATALOG_CACHE for the given type by fetching all pages.
// Safe to call multiple times — skips if already fresh in cache.
async function warmCatalogType(type: string): Promise<void> {
  const cached = FULL_CATALOG_CACHE.get(type);
  if (cached && Date.now() - cached.cachedAt < FULL_CATALOG_TTL_MS) return;

  try {
    const first = await flix2FetchPage(type, 1);
    if (!first.success) return;
    const totalPages: number = first.pagination?.total_pages ?? 1;
    const allItems: any[] = [...(first.data ?? [])];
    const BATCH = 15;
    for (let start = 2; start <= totalPages; start += BATCH) {
      const batch = Array.from(
        { length: Math.min(BATCH, totalPages - start + 1) },
        (_, i) => flix2FetchPage(type, start + i)
      );
      const results = await Promise.allSettled(batch);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) allItems.push(...(r.value.data ?? []));
      }
    }
    const seenTmdb = new Set<number>();
    const seenFlix2 = new Set<string>();
    const deduped = allItems.filter((item) => {
      const id = Number(item.tmdb_id);
      if (id > 0) {
        if (seenTmdb.has(id)) return false;
        seenTmdb.add(id);
        return true;
      }
      const key = item.id != null ? String(item.id) : String(item.title ?? "");
      if (!key || seenFlix2.has(key)) return false;
      seenFlix2.add(key);
      return true;
    });
    FULL_CATALOG_CACHE.set(type, { data: deduped, cachedAt: Date.now() });
    console.log(`[flix2] cache warm: type=${type} items=${deduped.length}`);
  } catch (e: any) {
    console.warn(`[flix2] cache warm failed for ${type}:`, e?.message ?? e);
  }
}

// Exported so index.ts can trigger startup warm-up (non-blocking).
export async function warmAllCatalogCaches(): Promise<void> {
  // Warm series and animes first (fewer pages), then movies (821 pages).
  await warmCatalogType("series");
  await warmCatalogType("animes");
  await warmCatalogType("movies");
}

// ── GET /flix2/catalog-full — fetches ALL pages for a type in parallel batches ─
// Returns the complete catalog for a type so mobile only makes one request.
router.get("/flix2/catalog-full", async (req, res) => {
  try {
    const { type = "movies" } = req.query as Record<string, string>;

    // Serve from cache if fresh
    const cached = FULL_CATALOG_CACHE.get(type);
    if (cached && Date.now() - cached.cachedAt < FULL_CATALOG_TTL_MS) {
      res.json({ success: true, type, total: cached.data.length, data: cached.data, fromCache: true });
      return;
    }

    // Fetch page 1 to discover total_pages
    const first = await flix2FetchPage(type, 1);
    if (!first.success) {
      res.status(502).json({ error: "catalog unavailable", type });
      return;
    }

    const totalPages: number = first.pagination?.total_pages ?? 1;
    const allItems: any[] = [...(first.data ?? [])];

    // Fetch remaining pages in parallel batches of 15
    const BATCH = 15;
    for (let start = 2; start <= totalPages; start += BATCH) {
      const batch = Array.from(
        { length: Math.min(BATCH, totalPages - start + 1) },
        (_, i) => flix2FetchPage(type, start + i)
      );
      const results = await Promise.allSettled(batch);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) {
          allItems.push(...(r.value.data ?? []));
        }
      }
    }

    // Deduplicate by tmdb_id (when valid > 0) or by flix2 item id as fallback.
    // Items with tmdb_id=0/null are kept — they are real content, just without TMDB mapping.
    const seenTmdb = new Set<number>();
    const seenFlix2 = new Set<string>();
    const deduped = allItems.filter((item) => {
      const tmdbId = Number(item.tmdb_id);
      if (tmdbId > 0) {
        if (seenTmdb.has(tmdbId)) return false;
        seenTmdb.add(tmdbId);
        return true;
      }
      // No valid TMDB ID — deduplicate by flix2 item id or title to avoid exact duplicates
      const fallbackKey = item.id != null ? String(item.id) : String(item.title ?? "");
      if (!fallbackKey || seenFlix2.has(fallbackKey)) return false;
      seenFlix2.add(fallbackKey);
      return true;
    });

    FULL_CATALOG_CACHE.set(type, { data: deduped, cachedAt: Date.now() });

    console.log(`[flix2/catalog-full] type=${type} pages=${totalPages} items=${deduped.length}`);
    res.json({ success: true, type, total: deduped.length, data: deduped, fromCache: false });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

// ── GET /flix2/search — cache-first title search with live page scan fallback ──
// 1st path: if FULL_CATALOG_CACHE is warm, filter instantly from the in-memory
//           full catalog (covers ALL pages, no page limit).
// 2nd path: live parallel page scan up to maxPages (slower, limited coverage).
// Supports type=all to search movies, series and animes simultaneously.
async function searchFlix2ByTitle(type: string, query: string, limit: number, maxPages: number): Promise<any[]> {
  // ── Fast path: use in-memory full catalog cache if available ─────────────
  const cached = FULL_CATALOG_CACHE.get(type);
  if (cached && Date.now() - cached.cachedAt < FULL_CATALOG_TTL_MS) {
    return cached.data
      .filter((i: any) => i.title?.toLowerCase().includes(query))
      .slice(0, limit);
  }

  // Cache is cold — trigger background warm-up so next search is instant.
  // This runs asynchronously and does NOT block the current search response.
  (async () => {
    try {
      if (FULL_CATALOG_CACHE.has(type)) return; // already being populated
      const first = await flix2FetchPage(type, 1);
      if (!first.success) return;
      const totalPages: number = first.pagination?.total_pages ?? 1;
      const allItems: any[] = [...(first.data ?? [])];
      const BATCH = 15;
      for (let start = 2; start <= totalPages; start += BATCH) {
        const batch = Array.from(
          { length: Math.min(BATCH, totalPages - start + 1) },
          (_, i) => flix2FetchPage(type, start + i)
        );
        const results = await Promise.allSettled(batch);
        for (const r of results) {
          if (r.status === "fulfilled" && r.value.success) allItems.push(...(r.value.data ?? []));
        }
      }
      const seenTmdb = new Set<number>(); const seenFlix2 = new Set<string>();
      const deduped = allItems.filter((item) => {
        const id = Number(item.tmdb_id);
        if (id > 0) { if (seenTmdb.has(id)) return false; seenTmdb.add(id); return true; }
        const key = item.id != null ? String(item.id) : String(item.title ?? "");
        if (!key || seenFlix2.has(key)) return false; seenFlix2.add(key); return true;
      });
      FULL_CATALOG_CACHE.set(type, { data: deduped, cachedAt: Date.now() });
    } catch {}
  })();

  // ── Slow path: live parallel page scan (limited coverage) ───────────────
  const first = await flix2FetchPage(type, 1);
  if (!first.success) return [];

  const totalPages = Math.min(first.pagination?.total_pages ?? 1, maxPages);
  const results: any[] = first.data.filter((i: any) =>
    i.title?.toLowerCase().includes(query)
  );

  if (results.length >= limit || totalPages <= 1) return results.slice(0, limit);

  const BATCH = 10;
  for (let startPage = 2; startPage <= totalPages && results.length < limit; startPage += BATCH) {
    const batch = Array.from(
      { length: Math.min(BATCH, totalPages - startPage + 1) },
      (_, i) => flix2FetchPage(type, startPage + i)
    );
    const pages = await Promise.allSettled(batch);
    for (const p of pages) {
      if (p.status === "fulfilled" && p.value.success) {
        const matches = p.value.data.filter((i: any) =>
          i.title?.toLowerCase().includes(query)
        );
        results.push(...matches);
        if (results.length >= limit) break;
      }
    }
  }
  return results.slice(0, limit);
}

router.get("/flix2/search", async (req, res) => {
  try {
    const {
      q = "",
      type = "movies",
      limit: limitStr = "60",
      maxPages: maxPagesStr = "120",
    } = req.query as Record<string, string>;

    const query = q.trim().toLowerCase();
    if (!query) { res.json({ results: [], total: 0, pagesScanned: 0 }); return; }

    const limit = Math.min(Number(limitStr) || 60, 200);
    const maxPages = Math.min(Number(maxPagesStr) || 120, 821);

    if (type === "all") {
      // Search all catalog types in parallel, capped at smaller page limits per type
      const perTypeLimit = Math.ceil(limit / 3);
      const perTypePages = Math.min(maxPages, 60);
      const [moviesRes, seriesRes, animesRes] = await Promise.allSettled([
        searchFlix2ByTitle("movies", query, perTypeLimit, perTypePages),
        searchFlix2ByTitle("series", query, perTypeLimit, perTypePages),
        searchFlix2ByTitle("animes", query, perTypeLimit, perTypePages),
      ]);
      const combined: any[] = [];
      if (moviesRes.status === "fulfilled") combined.push(...moviesRes.value.map((i: any) => ({ ...i, _type: "movie" })));
      if (seriesRes.status === "fulfilled") combined.push(...seriesRes.value.map((i: any) => ({ ...i, _type: "series" })));
      if (animesRes.status === "fulfilled") combined.push(...animesRes.value.map((i: any) => ({ ...i, _type: "anime" })));
      res.json({ results: combined.slice(0, limit), total: combined.length });
      return;
    }

    const results = await searchFlix2ByTitle(type, query, limit, maxPages);
    res.json({ results: results.slice(0, limit), total: results.length });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

// ── GET /flix2/lookup?tmdbId=X&type=movies|series|animes|all&title=Y ──────────
// Find a Flix 2.0 catalog item by TMDB ID, falling back to title match.
// Checks a pre-built R2 index file first (fast), falls back to live page scan.
router.get("/flix2/lookup", async (req, res) => {
  const { tmdbId, type = "all", title = "" } = req.query as Record<string, string>;
  const id = Number(tmdbId);
  const normTitle = title ? normalizeTitleForSearch(title) : "";

  // Require at least a valid tmdbId OR a title to search by
  if (!id && !normTitle) { res.json({ found: false, item: null }); return; }

  function matchItem(i: any): boolean {
    // TMDB ID match (only when id > 0)
    if (id > 0 && Number(i.tmdb_id) === id) return true;
    // Title match (normalized) — used as fallback or primary when id=0
    if (normTitle) {
      const iNorm = normalizeTitleForSearch(i.title ?? i.name ?? "");
      if (iNorm && iNorm === normTitle) return true;
    }
    return false;
  }

  const typesToCheck = type === "all" ? ["movies", "series", "animes"] : [type];
  const client = getClient();
  const bucket = getBucket();

  for (const t of typesToCheck) {
    // Fast path: check pre-built index
    // Index keys: numeric tmdb_id (as string) for items with TMDB ID,
    //             "title:<normalized>" for items without TMDB ID.
    try {
      const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `__flix2-index-${t}.json` }));
      const raw = await resp.Body?.transformToString();
      if (raw) {
        const index: Record<string, string> = JSON.parse(raw);
        // Check by tmdb_id key first (when id > 0)
        const byId = id > 0 ? index[String(id)] : undefined;
        // Check by title key as fallback (or primary when id=0)
        const byTitle = normTitle ? index[`title:${normTitle}`] : undefined;
        const entry = byId ?? byTitle;
        // Only shortcut for movies with direct stream URLs. "flix2id:X" entries need slow path.
        if (entry && !entry.startsWith("flix2id:")) {
          res.json({ found: true, item: { tmdb_id: id, stream_url: entry, type: t, title: title || undefined } });
          return;
        }
      }
    } catch {}

    // Slow path: live page scan (up to 200 pages for series/animes, 50 for movies)
    // Matches by TMDB ID or by normalized title as fallback.
    try {
      const first = await flix2FetchPage(t, 1);
      if (!first.success) continue;
      const found = first.data.find((i: any) => matchItem(i));
      if (found) { res.json({ found: true, item: found }); return; }

      const totalPages = Math.min(first.pagination?.total_pages ?? 1, t === "movies" ? 50 : 200);
      const BATCH = 10;
      for (let start = 2; start <= totalPages; start += BATCH) {
        const batch = Array.from(
          { length: Math.min(BATCH, totalPages - start + 1) },
          (_, i) => flix2FetchPage(t, start + i)
        );
        const pages = await Promise.allSettled(batch);
        for (const p of pages) {
          if (p.status === "fulfilled" && p.value.success) {
            const item = p.value.data.find((i: any) => matchItem(i));
            if (item) { res.json({ found: true, item }); return; }
          }
        }
      }
    } catch {}
  }

  res.json({ found: false, item: null });
});

// ── GET /flix2/stream-url?streamUrl=<encoded> ─────────────────────────────────
// Follows the 302 redirect from nixplay.lat and returns the final signed CDN URL.
// The nixplay stream_url redirects to vod99.cineveo.lat with a time-limited signed URL.
// React Native video players may not follow redirects, so we resolve server-side.
// If the final URL is TeraBox, resolves via xAPIverse to get a direct download link.
function isTeraboxUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const TB_HOSTS = [
      "terabox.com", "1024terabox.com", "1024tera.com", "teraboxapp.com",
      "terasharelink.com", "4funbox.com", "momerybox.com", "tibibox.com",
      "terabox.app", "gibibox.com", "nephobox.com",
    ];
    return TB_HOSTS.includes(host);
  } catch { return false; }
}

async function resolveTeraboxDirect(shareUrl: string): Promise<string | null> {
  const normalized = normalizeTeraboxUrl(shareUrl);
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch("https://xapiverse.com/api/terabox-pro", {
      method: "POST",
      headers: { "Content-Type": "application/json", "xAPIverse-Key": "sk_6d7363a619840df0a07afe194613bf9a" },
      body: JSON.stringify({ url: normalized }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    const data = await r.json() as any;
    if (r.ok && data.status === "success") {
      // Pick the best quality direct link
      const list: any[] = data.list ?? [];
      const best = list.find((f: any) => f.direct_link && f.size) ?? list.find((f: any) => f.direct_link);
      return best?.direct_link ?? null;
    }
    return null;
  } catch { clearTimeout(tid); return null; }
}

router.get("/flix2/stream-url", async (req, res) => {
  const streamUrl = String(req.query.streamUrl ?? "");
  if (!streamUrl) { res.status(400).json({ error: "streamUrl é obrigatório" }); return; }
  try {
    // Step 1: if the raw URL is already TeraBox, resolve directly
    if (isTeraboxUrl(streamUrl)) {
      const direct = await resolveTeraboxDirect(streamUrl);
      if (direct) { res.json({ url: direct, via: "terabox" }); return; }
      // xAPIverse failed — link is dead/expired
      res.json({ url: streamUrl, via: "terabox-fallback", error: "Link expirado no TeraBox. Tente outro episódio." }); return;
    }

    // Step 2: follow the redirect chain from nixplay
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(streamUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
    } finally { clearTimeout(timer); }
    const finalUrl = response!.url || streamUrl;

    // Step 3: if the redirect landed on TeraBox, resolve via xAPIverse
    if (isTeraboxUrl(finalUrl)) {
      const direct = await resolveTeraboxDirect(finalUrl);
      if (direct) { res.json({ url: direct, via: "terabox" }); return; }
      // xAPIverse failed — link is dead/expired
      res.json({ url: finalUrl, via: "terabox-fallback", error: "Link expirado no TeraBox. Tente outro episódio." }); return;
    }

    res.json({ url: finalUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /flix2/series-episodes?seriesId=<id> ──────────────────────────────────
// Fetches per-episode stream URLs for a series from nixplay.lat.
// Uses the Xtream Codes compatible endpoint: get_series_info.php?series_id=<id>
// Episode stream URL format: https://nixplay.lat/series/<user>/<pass>/<episode_id>.<ext>
router.get("/flix2/series-episodes", async (req, res) => {
  const { seriesId } = req.query as Record<string, string>;
  if (!seriesId) { res.status(400).json({ error: "seriesId obrigatório" }); return; }

  try {
    const pass = decodeURIComponent(FLIX2_PASS);
    const url = `https://nixplay.lat/api/get_series_info.php?username=${FLIX2_USER}&password=${encodeURIComponent(pass)}&series_id=${seriesId}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    let r: Response;
    try {
      r = await fetch(url, { signal: ctrl.signal });
    } finally { clearTimeout(tid); }

    const data = await r.json() as any;

    // Xtream episodes response: { info: {...}, episodes: { "1": [ {id, title, season, episode_num, container_extension} ] } }
    const allEpisodes: Array<{ season: number; episode: number; stream_url: string; title?: string }> = [];

    if (data?.episodes && typeof data.episodes === "object") {
      for (const [seasonStr, eps] of Object.entries(data.episodes as Record<string, any[]>)) {
        if (!Array.isArray(eps)) continue;
        const season = Number(seasonStr);
        for (const ep of eps) {
          if (!ep?.id) continue;
          const ext = ep.container_extension || "mp4";
          const streamUrl = `https://nixplay.lat/series/${FLIX2_USER}/${pass}/${ep.id}.${ext}`;
          allEpisodes.push({
            season,
            episode: Number(ep.episode_num ?? ep.episode ?? 1),
            stream_url: streamUrl,
            title: ep.title ?? ep.name ?? undefined,
          });
        }
      }
    }

    // Sort by season then episode
    allEpisodes.sort((a, b) => a.season - b.season || a.episode - b.episode);

    res.json({ found: allEpisodes.length > 0, episodes: allEpisodes, info: data?.info ?? null });
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

// ── In-memory job tracker for async index builds ─────────────────────────────

interface BuildJob {
  jobId: string;
  startedAt: number;
  status: "running" | "done" | "error";
  currentType: string;
  typesDone: string[];
  pagesScanned: number;
  totalPages: number;
  summary: Record<string, number>;
  error?: string;
}

const buildJobs = new Map<string, BuildJob>();

// Clean up old jobs after 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, job] of buildJobs) {
    if (job.startedAt < cutoff) buildJobs.delete(id);
  }
}, 300_000);

// ── GET /flix2/index-status ────────────────────────────────────────────────────
// Returns metadata about existing R2 index files (count + last modified age).
router.get("/flix2/index-status", async (req, res) => {
  const client = getClient();
  const bucket = getBucket();
  const types = ["movies", "series", "animes"];
  const result: Record<string, { exists: boolean; count: number; ageMs: number | null }> = {};

  await Promise.all(types.map(async (t) => {
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: `__flix2-index-${t}.json` }));
      const ageMs = head.LastModified ? Date.now() - head.LastModified.getTime() : null;
      // Also fetch count from the object
      const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `__flix2-index-${t}.json` }));
      const raw = await obj.Body?.transformToString();
      const count = raw ? Object.keys(JSON.parse(raw)).length : 0;
      result[t] = { exists: true, count, ageMs };
    } catch {
      result[t] = { exists: false, count: 0, ageMs: null };
    }
  }));

  res.json({ ok: true, status: result });
});

// ── GET /flix2/build-progress?jobId=X ────────────────────────────────────────
router.get("/flix2/build-progress", (req, res) => {
  const { jobId } = req.query as Record<string, string>;
  const job = buildJobs.get(jobId);
  if (!job) { res.status(404).json({ error: "Job not found" }); return; }
  res.json(job);
});

// ── POST /flix2/build-index?type=movies|series|animes|all ─────────────────────
// Starts an async background job. Returns jobId immediately for progress polling.
// Client polls GET /flix2/build-progress?jobId=X every 2s.
router.post("/flix2/build-index", async (req, res) => {
  const { type = "movies" } = req.query as Record<string, string>;
  const typesToIndex = type === "all" ? ["movies", "series", "animes"] : [type];
  const jobId = crypto.randomUUID();

  const job: BuildJob = {
    jobId,
    startedAt: Date.now(),
    status: "running",
    currentType: typesToIndex[0],
    typesDone: [],
    pagesScanned: 0,
    totalPages: 0,
    summary: {},
  };
  buildJobs.set(jobId, job);

  // Respond immediately so the client can start polling
  res.json({ ok: true, jobId });

  // Run the build in the background
  (async () => {
    const client = getClient();
    const bucket = getBucket();
    const BATCH = 15;

    for (const t of typesToIndex) {
      job.currentType = t;
      job.pagesScanned = 0;
      job.totalPages = 0;
      // Record<string, string>: tmdb_id (as string number) for normal items,
      // "title:<normalized>" for items that have no valid TMDB ID.
      const index: Record<string, string> = {};

      try {
        const first = await flix2FetchPage(t, 1);
        if (!first.success) { job.summary[t] = -1; job.typesDone.push(t); continue; }

        const indexItem = (item: any) => {
          const tmdbId = Number(item?.tmdb_id);
          if (tmdbId > 0) {
            // Items with valid TMDB ID — key = tmdb_id
            if (item.stream_url) {
              index[String(tmdbId)] = item.stream_url;
            } else if (item.id) {
              index[String(tmdbId)] = `flix2id:${item.id}`;
            }
          } else if (item?.title) {
            // Items without TMDB ID — key = "title:<normalized>" for searchability
            const titleKey = `title:${normalizeTitleForSearch(item.title)}`;
            if (titleKey !== "title:" && !index[titleKey]) {
              const val = item.stream_url || (item.id ? `flix2id:${item.id}` : "");
              if (val) index[titleKey] = val;
            }
          }
        };

        for (const item of first.data) { indexItem(item); }
        const totalPages = first.pagination?.total_pages ?? 1;
        job.totalPages = totalPages;
        job.pagesScanned = 1;

        for (let start = 2; start <= totalPages; start += BATCH) {
          const batch = Array.from(
            { length: Math.min(BATCH, totalPages - start + 1) },
            (_, i) => flix2FetchPage(t, start + i)
          );
          const pages = await Promise.allSettled(batch);
          for (const p of pages) {
            if (p.status === "fulfilled" && p.value.success) {
              for (const item of p.value.data) { indexItem(item); }
            }
          }
          job.pagesScanned = Math.min(start + BATCH - 1, totalPages);
        }

        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: `__flix2-index-${t}.json`,
          Body: JSON.stringify(index),
          ContentType: "application/json",
        }));

        job.summary[t] = Object.keys(index).length;
        job.typesDone.push(t);
      } catch (e: any) {
        job.summary[t] = -1;
        job.typesDone.push(t);
      }
    }

    job.status = "done";
    job.pagesScanned = job.totalPages;
  })().catch((e) => {
    job.status = "error";
    job.error = e?.message ?? "Unknown error";
  });
});

export default router;
