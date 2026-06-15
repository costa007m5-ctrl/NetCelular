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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { tmdb } from "../lib/tmdb";
import multer from "multer";
import crypto from "crypto";
import { notifyNewContent, notifyNewEpisode } from "../lib/push-notifications.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: {} });

// ── TeraBox URL normalizer ─────────────────────────────────────────────────────
// Many alternative domains exist (1024terabox.com, 1024tera.com, teraboxapp.com…)
// xAPIverse only accepts 1024tera.com or teraboxapp.com — NOT www.terabox.com.
function normalizeTeraboxUrl(url: string): string {
  // xAPIverse only accepts 1024tera.com or teraboxapp.com — NOT www.terabox.com.
  // Convert all known TeraBox aliases (including www.terabox.com) to 1024tera.com.
  const TERABOX_ALIASES = [
    "terabox.com",
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
      u.hostname = "1024tera.com";
      return u.toString();
    }
  } catch {}
  return url;
}

// ── TeraBox list cache ────────────────────────────────────────────────────────
// Caches the full xAPIverse list response per TeraBox URL.
// TTL: 8 minutes. In-flight deduplication prevents concurrent episodes from
// triggering multiple simultaneous calls to xAPIverse for the same folder.
const TERABOX_CACHE_TTL_MS = 8 * 60 * 1000;
interface TeraBoxCacheEntry { list: any[]; expiresAt: number; }
const teraboxListCache = new Map<string, TeraBoxCacheEntry>();
const teraboxListInFlight = new Map<string, Promise<any[]>>();

// Retry detection: if the same item ID is requested again within 30s it likely
// means the player failed on the first URL. Force a fresh xAPIverse call.
const TERABOX_RETRY_WINDOW_MS = 30_000;
const teraboxLastRequested = new Map<string, number>(); // itemId → timestamp

async function fetchTeraBoxList(normalizedUrl: string, forceRefresh = false): Promise<any[]> {
  // Cache hit (skip if forceRefresh)
  if (!forceRefresh) {
    const cached = teraboxListCache.get(normalizedUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.list;
  }

  // Deduplicate: if there's already an in-flight request for this URL, reuse it
  const inflight = teraboxListInFlight.get(normalizedUrl);
  if (inflight) return inflight;

  const promise = (async (): Promise<any[]> => {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 60_000);
      let r: Response;
      try {
        r = await fetch("https://xapiverse.com/api/terabox-pro", {
          method: "POST",
          headers: { "Content-Type": "application/json", "xAPIverse-Key": "sk_6d7363a619840df0a07afe194613bf9a" },
          body: JSON.stringify({ url: normalizedUrl }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(tid); }

      const data = await r.json() as any;
      if (!r.ok || data.status !== "success") {
        throw new Error(data.message ?? data.error ?? "TeraBox API error");
      }
      const list: any[] = data.list ?? [];
      teraboxListCache.set(normalizedUrl, { list, expiresAt: Date.now() + TERABOX_CACHE_TTL_MS });
      return list;
    } finally {
      // Always remove from in-flight map, even on error
      teraboxListInFlight.delete(normalizedUrl);
    }
  })();

  teraboxListInFlight.set(normalizedUrl, promise);
  // Suppress unhandled-rejection for the stored promise reference —
  // actual errors still propagate to callers that await it.
  promise.catch(() => {});
  return promise;
}

/** Quick check: fetch first ~200 bytes of an m3u8 URL and verify it has real content */
async function verifyM3u8Url(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4_000);
    let r: Response;
    try {
      r = await fetch(url, { signal: ctrl.signal });
    } finally { clearTimeout(tid); }
    if (!r.ok) return false;
    const text = await r.text();
    return text.startsWith("#EXTM3U") && text.length > 50;
  } catch { return false; }
}

// ── S3 client ─────────────────────────────────────────────────────────────────

function getClient(): S3Client {
  const accountId     = process.env["R2_ACCOUNT_ID"]       ?? "9827b92a6b3a621e8c6f50274e68f37b";
  const accessKeyId   = process.env["R2_ACCESS_KEY_ID"]    ?? "9e96806804e8815dfd9580ec062fa0c5";
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

// ── TeraBox → R2 Fallback jobs ────────────────────────────────────────────────
// When xAPIverse API fails during playback, the server automatically downloads
// the episode via fast_dlink (from cache) and uploads it to R2.
// Key: registryItem.id → fallback job state

interface TeraboxR2FallbackJob {
  jobId: string;
  status: "queued" | "downloading" | "uploading" | "done" | "error";
  progress: number;
  r2Key?: string;
  error?: string;
  startedAt: number;
}

const teraboxR2FallbackJobs = new Map<string, TeraboxR2FallbackJob>(); // itemId → job

// Clean up stale fallback jobs (> 2hr)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of teraboxR2FallbackJobs.entries()) {
    if (now - job.startedAt > 7_200_000) teraboxR2FallbackJobs.delete(id);
  }
}, 600_000);

async function startTeraboxR2Fallback(
  item: RegistryItem,
  downloadUrl: string,
  fileName: string,
  client: S3Client,
  bucket: string
): Promise<string> {
  // Idempotent: if a job is already running/done for this item, return existing jobId
  const existing = teraboxR2FallbackJobs.get(item.id);
  if (existing && existing.status !== "error") return existing.jobId;

  const jobId = crypto.randomUUID();

  // Build R2 key under the item's r2Folder or a dedicated fallback folder
  const safeName = fileName.replace(/[^a-zA-Z0-9._\-()\s]/g, "_").replace(/\s+/g, " ").trim();
  const VIDEO_EXTS = /\.(mp4|mkv|mov|avi|webm|m4v|ts|m2ts)$/i;
  const folder = item.r2Folder ? `${item.r2Folder.replace(/\/$/, "")}/` : `__tb-fallback/${item.tmdbId}/`;
  const episodePart =
    item.season != null && item.episode != null
      ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")}_`
      : "";
  let r2Key = `${folder}${episodePart}${safeName}`;
  if (!VIDEO_EXTS.test(r2Key)) r2Key += ".mp4";

  const fallbackJob: TeraboxR2FallbackJob = {
    jobId,
    status: "queued",
    progress: 0,
    startedAt: Date.now(),
  };
  teraboxR2FallbackJobs.set(item.id, fallbackJob);

  logger.info({ itemId: item.id, r2Key, downloadUrl: downloadUrl.slice(0, 80) }, "[tb-r2-fallback] iniciando download → R2");

  // Background: download from TeraBox fast_dlink → upload to R2 → update registry
  (async () => {
    try {
      fallbackJob.status = "downloading";

      let response: Response | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await fetch(downloadUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Referer": "https://www.terabox.com/",
            },
          });
          break;
        } catch (e: any) {
          const isTransient = ["EAI_AGAIN", "ENOTFOUND", "ECONNRESET"].includes(e?.code ?? "");
          if (!isTransient || attempt === 3) throw e;
          await new Promise((r) => setTimeout(r, 2500 * attempt));
        }
      }

      if (!response || !response.ok) {
        throw new Error(`HTTP ${response?.status ?? "?"} ao baixar do TeraBox`);
      }

      fallbackJob.status = "uploading";
      const contentType = response.headers.get("content-type") ?? "video/mp4";
      const contentLength = Number(response.headers.get("content-length") ?? 0);

      // Fix extension from content-type if needed
      let finalKey = r2Key;
      if (!VIDEO_EXTS.test(finalKey)) {
        const rawExt = contentType.split("/")[1]?.split(";")[0]?.trim() ?? "mp4";
        const ext =
          rawExt === "quicktime" ? "mov" :
          rawExt === "x-matroska" ? "mkv" :
          rawExt === "x-msvideo" ? "avi" : rawExt;
        finalKey = `${finalKey}.${ext}`;
      }

      const webStream = response.body!;
      const nodeStream = Readable.fromWeb(webStream as any);
      const passThrough = new PassThrough();
      let downloaded = 0;

      nodeStream.on("data", (chunk: Buffer) => {
        downloaded += chunk.length;
        if (contentLength > 0) {
          fallbackJob.progress = Math.min(99, Math.round((downloaded / contentLength) * 100));
        }
      });
      nodeStream.pipe(passThrough);

      const uploader = new Upload({
        client,
        params: { Bucket: bucket, Key: finalKey, Body: passThrough, ContentType: contentType },
        queueSize: 4,
        partSize: 1024 * 1024 * 64,
      });

      await uploader.done();

      // Update registry: set r2Key on the item so future /terabox/play calls hit R2 directly
      try {
        const freshReg = await readRegistry(client, bucket);
        const idx = freshReg.items.findIndex((i) => i.id === item.id);
        if (idx >= 0) {
          freshReg.items[idx].r2Key = finalKey;
          await writeRegistry(client, bucket, freshReg);
        }
      } catch (regErr: any) {
        logger.warn({ err: regErr }, "[tb-r2-fallback] falha ao atualizar registry após upload");
      }

      fallbackJob.status = "done";
      fallbackJob.progress = 100;
      fallbackJob.r2Key = finalKey;
      catalogCache = null;

      logger.info({ itemId: item.id, finalKey }, "[tb-r2-fallback] upload concluído ✅");
    } catch (e: any) {
      fallbackJob.status = "error";
      fallbackJob.error = e?.message ?? "Erro desconhecido no fallback R2";
      logger.error({ err: e, itemId: item.id }, "[tb-r2-fallback] falha no upload ❌");
    }
  })();

  return jobId;
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
  exclusive?: boolean;
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
//
// Fallback logic (automatic TeraBox → R2 upload):
// 1. If registry item already has r2Key → serve directly from R2
// 2. Normal flow: resolve via xAPIverse (fast_stream_url → fast_dlink)
// 3. On API failure: use cached fast_dlink to trigger background R2 upload
// 4. On repeated retry: proactively upload to R2 for permanent fix
router.get("/terabox/play", async (req, res) => {
  try {
    const { id } = req.query as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const item = registry.items.find((i) => i.id === id);
    if (!item) { res.status(404).json({ error: "Registry item not found" }); return; }

    // ── Step 0: If item has r2Key, serve from R2 directly ─────────────────────
    if (item.r2Key) {
      try {
        const headCmd = new HeadObjectCommand({ Bucket: bucket, Key: item.r2Key });
        await client.send(headCmd);
        // File exists in R2 → return R2 stream URL
        res.json({
          url: `/api/r2/stream?key=${encodeURIComponent(item.r2Key)}`,
          urlType: "r2",
          needsProxy: false,
          name: item.fileName ?? item.label,
          r2Key: item.r2Key,
          fromR2Fallback: true,
        });
        return;
      } catch {
        // File doesn't exist in R2 anymore — clear key and fall through to TeraBox
        logger.warn({ itemId: id, r2Key: item.r2Key }, "[tb-r2-fallback] r2Key no registry mas arquivo não existe no R2 — limpando");
        const idx = registry.items.findIndex((i) => i.id === id);
        if (idx >= 0) {
          delete registry.items[idx].r2Key;
          await writeRegistry(client, bucket, registry).catch(() => {});
        }
      }
    }

    // ── Step 0b: Check in-progress fallback job ────────────────────────────────
    const existingFallbackJob = teraboxR2FallbackJobs.get(id);
    if (existingFallbackJob) {
      if (existingFallbackJob.status === "done" && existingFallbackJob.r2Key) {
        res.json({
          url: `/api/r2/stream?key=${encodeURIComponent(existingFallbackJob.r2Key)}`,
          urlType: "r2",
          needsProxy: false,
          name: item.fileName ?? item.label,
          r2Key: existingFallbackJob.r2Key,
          fromR2Fallback: true,
        });
        return;
      }
      if (existingFallbackJob.status !== "error") {
        // Upload in progress — return progress info so client can show spinner
        res.status(202).json({
          uploading: true,
          jobId: existingFallbackJob.jobId,
          status: existingFallbackJob.status,
          progress: existingFallbackJob.progress,
          message: "Vídeo sendo enviado para servidor. Aguarde...",
        });
        return;
      }
    }

    if (!item.teraboxUrl) { res.status(400).json({ error: "Item does not have a teraboxUrl" }); return; }

    const normalizedUrl = normalizeTeraboxUrl(item.teraboxUrl);

    // ── Step 1: Try xAPIverse API ──────────────────────────────────────────────
    let list: any[];
    let apiError: string | null = null;
    try {
      list = await fetchTeraBoxList(normalizedUrl);
    } catch (err: any) {
      apiError = err?.message ?? "TeraBox API error";
      list = [];
    }

    // ── Step 2: API failed → try to use cached fast_dlink for R2 fallback ─────
    if (apiError !== null || list.length === 0) {
      // Check if we have a cached list with fast_dlink we can use
      const cached = teraboxListCache.get(normalizedUrl);
      const cachedList = cached?.list ?? [];
      const idx = typeof item.fileIndex === "number" && item.fileIndex < cachedList.length ? item.fileIndex : 0;
      let cachedFile: any = item.fileName ? cachedList.find((f: any) => f.name === item.fileName) : undefined;
      if (!cachedFile && cachedList.length > 0) cachedFile = cachedList[idx];

      const fastDlink: string | null = cachedFile?.fast_dlink ?? null;
      const cachedFileName: string = cachedFile?.name ?? item.fileName ?? `${item.label ?? "video"}.mp4`;

      if (fastDlink) {
        // Have a download URL — trigger background R2 upload
        const jobId = await startTeraboxR2Fallback(item, fastDlink, cachedFileName, client, bucket);
        const job = teraboxR2FallbackJobs.get(id);
        res.status(202).json({
          uploading: true,
          jobId,
          status: job?.status ?? "queued",
          progress: job?.progress ?? 0,
          message: "Link TeraBox expirado. Enviando vídeo para servidor (pode levar alguns minutos)...",
          apiError,
        });
        return;
      }

      // No cached fast_dlink and empty list from API
      if (list.length === 0) {
        if (item.fileName) {
          // Folder-based: fall back to WebView
          res.json({ url: item.teraboxUrl, urlType: "webview", needsWebView: true, name: item.fileName });
          return;
        }
        res.status(502).json({
          error: apiError ?? "Nenhum arquivo encontrado no link TeraBox",
          canRetry: true,
          hint: "A API do TeraBox falhou. Tente novamente em alguns minutos.",
        });
        return;
      }
    }

    // ── Step 3: API succeeded — resolve stream URL ─────────────────────────────
    let file: any;
    if (item.fileName) {
      file = list.find((f: any) => f.name === item.fileName);
    }
    if (!file) {
      const idx = typeof item.fileIndex === "number" && item.fileIndex < list.length ? item.fileIndex : 0;
      file = list[idx];
    }

    // Priority:
    // 1. fast_stream_url HLS (m3u8) via xAPIverse CF Workers proxy — CORS open, no auth needed
    // 2. fast_dlink — direct download link (may need browser-like headers)
    // NOTE: stream_url is the raw TeraBox CDN URL requiring browser cookies ("need verify_v2") — skip it.
    let streamUrl: string | null = null;
    let urlType: "fast_stream_url" | "fast_dlink" = "fast_dlink";

    if (file.fast_stream_url && typeof file.fast_stream_url === "object") {
      const qualityOrder = ["1080p", "720p", "480p", "360p", "240p"];
      for (const q of qualityOrder) {
        if (file.fast_stream_url[q]) { streamUrl = file.fast_stream_url[q]; urlType = "fast_stream_url"; break; }
      }
      if (!streamUrl) {
        const vals = Object.values(file.fast_stream_url) as string[];
        if (vals.length > 0) { streamUrl = vals[0]; urlType = "fast_stream_url"; }
      }
    }

    if (!streamUrl && file.fast_dlink) { streamUrl = file.fast_dlink; urlType = "fast_dlink"; }

    if (!streamUrl) { res.status(404).json({ error: "URL de stream não disponível" }); return; }

    // ── Retry detection: bust cache if player likely failed on last URL ────────
    // CF Worker tokens are single-use. Fetching them server-side to "verify"
    // would consume the token. Instead, detect retries by checking if the same
    // item was requested recently (within 30s = player auto-retry window).
    const now = Date.now();
    const lastReq = teraboxLastRequested.get(id);
    const isRetry = lastReq !== undefined && (now - lastReq) < TERABOX_RETRY_WINDOW_MS;
    teraboxLastRequested.set(id, now);
    // Prune stale entries to avoid unbounded growth
    if (teraboxLastRequested.size > 500) {
      const cutoff = now - TERABOX_RETRY_WINDOW_MS * 2;
      for (const [k, t] of teraboxLastRequested) { if (t < cutoff) teraboxLastRequested.delete(k); }
    }

    if (isRetry) {
      if (urlType === "fast_stream_url") {
        // Player failed on HLS stream — get a fresh list from xAPIverse
        teraboxListCache.delete(normalizedUrl);
        try {
          const freshList = await fetchTeraBoxList(normalizedUrl, true);
          let freshFile: any;
          if (item.fileName) freshFile = freshList.find((f: any) => f.name === item.fileName);
          if (!freshFile) {
            const idx = typeof item.fileIndex === "number" && item.fileIndex < freshList.length ? item.fileIndex : 0;
            freshFile = freshList[idx];
          }
          if (freshFile) {
            file = freshFile;
            streamUrl = null; urlType = "fast_dlink";
            if (file.fast_stream_url && typeof file.fast_stream_url === "object") {
              const qualityOrder = ["1080p", "720p", "480p", "360p", "240p"];
              for (const q of qualityOrder) {
                if (file.fast_stream_url[q]) { streamUrl = file.fast_stream_url[q]; urlType = "fast_stream_url"; break; }
              }
              if (!streamUrl) {
                const vals = Object.values(file.fast_stream_url) as string[];
                if (vals.length > 0) { streamUrl = vals[0]; urlType = "fast_stream_url"; }
              }
            }
            if (!streamUrl && file.fast_dlink) { streamUrl = file.fast_dlink; urlType = "fast_dlink"; }
          }
        } catch {
          // Fresh list failed — fall through with existing streamUrl
        }
      }

      // On retry with fast_dlink available: proactively trigger R2 upload in background
      // so subsequent requests serve from R2 permanently.
      if (file?.fast_dlink && !teraboxR2FallbackJobs.has(id)) {
        const fileName = file.name ?? item.fileName ?? `${item.label ?? "video"}.mp4`;
        startTeraboxR2Fallback(item, file.fast_dlink, fileName, client, bucket).catch(() => {});
        logger.info({ itemId: id }, "[tb-r2-fallback] retry detectado — iniciando upload R2 preventivo");
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!streamUrl) { res.status(404).json({ error: "URL de stream não disponível" }); return; }

    // Build quality list (all available HLS qualities + fast_dlink fallback)
    const qualityMap: Record<string, string> = {};
    if (file.fast_stream_url && typeof file.fast_stream_url === "object") {
      Object.assign(qualityMap, file.fast_stream_url);
    }
    if (file.fast_dlink) qualityMap["download"] = file.fast_dlink;

    // Check if a proactive R2 upload was started (from retry above)
    const r2Job = teraboxR2FallbackJobs.get(id);

    res.json({
      url: streamUrl,
      urlType,
      needsProxy: false,
      name: file.name,
      quality: file.quality,
      duration: file.duration,
      size: file.size_formatted,
      fast_stream_url: qualityMap,
      thumbnail: file.thumbnail ?? null,
      ...(r2Job && r2Job.status !== "error" ? { r2Upload: { jobId: r2Job.jobId, status: r2Job.status, progress: r2Job.progress } } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── GET /terabox/r2-fallback-status?id=<registryItemId> ───────────────────────
// Poll the status of a background TeraBox → R2 upload job.
// Returns { status, progress, r2Url } — client polls until status="done".
router.get("/terabox/r2-fallback-status", async (req, res) => {
  try {
    const { id } = req.query as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }

    const job = teraboxR2FallbackJobs.get(id);
    if (!job) {
      res.status(404).json({ found: false, message: "Nenhum job de fallback em andamento para este item" });
      return;
    }

    res.json({
      found: true,
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      r2Key: job.r2Key ?? null,
      r2Url: job.r2Key ? `/api/r2/stream?key=${encodeURIComponent(job.r2Key)}` : null,
      error: job.error ?? null,
      startedAt: new Date(job.startedAt).toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── POST /terabox/trigger-r2-fallback ─────────────────────────────────────────
// Manually trigger R2 upload for a TeraBox registry item (admin use).
// Body: { id: string }
router.post("/terabox/trigger-r2-fallback", async (req, res) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }

    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const item = registry.items.find((i) => i.id === id);
    if (!item) { res.status(404).json({ error: "Registry item not found" }); return; }
    if (!item.teraboxUrl) { res.status(400).json({ error: "Item não possui teraboxUrl" }); return; }

    // Try to get fast_dlink from cache or fresh API call
    const normalizedUrl = normalizeTeraboxUrl(item.teraboxUrl);
    let fastDlink: string | null = null;
    let fileName: string = item.fileName ?? `${item.label ?? "video"}.mp4`;

    // Check cache first
    const cached = teraboxListCache.get(normalizedUrl);
    const cachedList = cached?.list ?? [];
    const cachedIdx = typeof item.fileIndex === "number" && item.fileIndex < cachedList.length ? item.fileIndex : 0;
    let cachedFile: any = item.fileName ? cachedList.find((f: any) => f.name === item.fileName) : undefined;
    if (!cachedFile && cachedList.length > 0) cachedFile = cachedList[cachedIdx];

    if (cachedFile?.fast_dlink) {
      fastDlink = cachedFile.fast_dlink;
      if (cachedFile.name) fileName = cachedFile.name;
    } else {
      // Try fresh API call
      try {
        const freshList = await fetchTeraBoxList(normalizedUrl, true);
        const freshIdx = typeof item.fileIndex === "number" && item.fileIndex < freshList.length ? item.fileIndex : 0;
        let freshFile: any = item.fileName ? freshList.find((f: any) => f.name === item.fileName) : undefined;
        if (!freshFile && freshList.length > 0) freshFile = freshList[freshIdx];
        if (freshFile?.fast_dlink) {
          fastDlink = freshFile.fast_dlink;
          if (freshFile.name) fileName = freshFile.name;
        }
      } catch (apiErr: any) {
        res.status(502).json({ error: `API TeraBox falhou: ${apiErr?.message ?? "erro"}. Não é possível obter URL de download.` });
        return;
      }
    }

    if (!fastDlink) {
      res.status(404).json({ error: "fast_dlink não disponível para este arquivo. Tente novamente mais tarde." });
      return;
    }

    const jobId = await startTeraboxR2Fallback(item, fastDlink, fileName, client, bucket);
    const job = teraboxR2FallbackJobs.get(id)!;
    res.json({
      ok: true,
      jobId,
      status: job.status,
      message: `Upload para R2 iniciado. Use GET /terabox/r2-fallback-status?id=${id} para acompanhar.`,
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
    const list = await fetchTeraBoxList(normalizedUrl);
    res.json({ list, total_files: list.length, total_folders: 0 });
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
// GET /tmdb-search?q=...&type=multi|movie|tv&lang=pt-BR
router.get("/tmdb-search", async (req, res) => {
  try {
    const rawQ = (req.query["q"] as string ?? "").trim();
    const type = (req.query["type"] as string) ?? "multi";
    if (!rawQ) { res.status(400).json({ error: "q required" }); return; }

    // Limpa o título automaticamente (remove tags de qualidade, ano, etc.)
    const q = cleanTmdbQuery(rawQ);

    const TMDB_KEY = process.env.TMDB_API_KEY ?? "8f0beb08cf016ec8de49e454e09879ec";
    const TMDB_BASE = "https://api.themoviedb.org/3";
    // Optional lang override — caller passes "pt-BR", "en-US", "ja-JP", etc.
    const TMDB_LANG = (req.query["lang"] as string | undefined)?.trim() || "pt-BR";

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

  // Detects season number embedded anywhere in a full folder name:
  // "ShowName.S01.blah" → 1, "ShowName.Season.2...." → 2
  function detectSeasonEmbedded(name: string): number | null {
    const pure = detectSeason(name);
    if (pure !== null) return pure;
    // S01 / S1 preceded by separator
    const m1 = name.match(/[._\-\s]S(\d{1,2})(?:[._\-\s\d]|$)/i);
    if (m1) return parseInt(m1[1], 10);
    // season/temporada anywhere
    const m2 = name.match(/(?:season|temporada|temp)[._\-\s]*(\d{1,2})/i);
    if (m2) return parseInt(m2[1], 10);
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
      // Fallback: se não achou vídeos diretos, desce um nível em cada subpasta
      if (results.length === 0) {
        const subDirs = items.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
        for (const sd of subDirs) {
          const subItems = await listAll(`${path}/${sd.name}`);
          for (const f of subItems) {
            if (isVid(f) && f.link) {
              results.push({ filePath: `${path}/${sd.name}/${f.name}`, fileName: f.name, size: fmtSize(f.size) });
            }
          }
        }
      }
    } else {
      const rootItems = await listAll(path);

      // Passo 1: pastas de temporada com nome puro ("S01", "Temporada 1", "1")
      const pureSeasonFolders = rootItems
        .filter((f) => f.mimeType === "application/vnd.google-apps.folder" && detectSeason(f.name) !== null)
        .sort((a, b) => (detectSeason(a.name) ?? 0) - (detectSeason(b.name) ?? 0));

      if (pureSeasonFolders.length > 0) {
        for (const sf of pureSeasonFolders) {
          const seasonNum = detectSeason(sf.name)!;
          const seasonPath = `${path}/${sf.name}`;
          const eps = await listAll(seasonPath);
          for (const ep of eps) {
            if (isVid(ep) && ep.link) {
              const info = detectEp(ep.name);
              results.push({
                filePath: `${seasonPath}/${ep.name}`, fileName: ep.name,
                size: fmtSize(ep.size), season: info.season ?? seasonNum, episode: info.episode,
              });
            }
          }
        }
      } else {
        // Passo 2: pastas com número de temporada embutido no nome ("ShowName.S01.blah")
        const embeddedSeasonFolders = rootItems
          .filter((f) => f.mimeType === "application/vnd.google-apps.folder" && detectSeasonEmbedded(f.name) !== null)
          .sort((a, b) => (detectSeasonEmbedded(a.name) ?? 0) - (detectSeasonEmbedded(b.name) ?? 0));

        if (embeddedSeasonFolders.length > 0) {
          for (const sf of embeddedSeasonFolders) {
            const seasonNum = detectSeasonEmbedded(sf.name)!;
            const seasonPath = `${path}/${sf.name}`;
            const eps = await listAll(seasonPath);
            for (const ep of eps) {
              if (isVid(ep) && ep.link) {
                const info = detectEp(ep.name);
                results.push({
                  filePath: `${seasonPath}/${ep.name}`, fileName: ep.name,
                  size: fmtSize(ep.size), season: info.season ?? seasonNum, episode: info.episode,
                });
              }
            }
          }
        } else {
          // Passo 3: qualquer subpasta que tenha vídeos (sem detecção de temporada)
          const anySubDirs = rootItems.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
          let seasonCounter = 1;
          let foundInSub = false;
          for (const sf of anySubDirs) {
            const seasonPath = `${path}/${sf.name}`;
            const eps = await listAll(seasonPath);
            const videos = eps.filter((ep) => isVid(ep) && ep.link);
            if (videos.length > 0) {
              foundInSub = true;
              for (const ep of videos) {
                const info = detectEp(ep.name);
                results.push({
                  filePath: `${seasonPath}/${ep.name}`, fileName: ep.name,
                  size: fmtSize(ep.size), season: info.season ?? seasonCounter, episode: info.episode,
                });
              }
              seasonCounter++;
            }
          }

          // Passo 4 (último recurso): vídeos diretamente na raiz
          if (!foundInSub) {
            for (const f of rootItems) {
              if (isVid(f) && f.link) {
                const info = detectEp(f.name);
                results.push({
                  filePath: `${path}/${f.name}`, fileName: f.name,
                  size: fmtSize(f.size), season: info.season ?? 1, episode: info.episode,
                });
              }
            }
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
    if (!flix2Url || tmdbId == null || !tmdbType || !title) {
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
          notifyNewEpisode(Number(tmdbId), String(title), Number(season), Number(episode), "", null).catch(() => {});
        } else if (tmdbType === "movie") {
          notifyNewContent(1, String(title)).catch(() => {});
        }
      }
    } catch {}

    res.json({ ok: true, id: newItem.id, item: newItem });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

// ── GET /flix2/build-url — build a playable flix2Url from a catalog stream ID ─
// Constructs the URL server-side so credentials never leave the server.
// catalogType: "movies" | "series" | "animes"
router.get("/flix2/build-url", (req, res) => {
  const { streamId, catalogType } = req.query as Record<string, string>;
  if (!streamId || !catalogType) {
    res.status(400).json({ error: "streamId e catalogType são obrigatórios" }); return;
  }
  let flix2Url: string;
  if (catalogType === "movies") {
    const ext = (() => {
      const c = FULL_CATALOG_CACHE.get("movies");
      if (c) { const i = c.data.find((x: any) => String(x.id) === streamId); if (i?.container_extension) return i.container_extension; }
      const r = XTREAM_RAW_CACHE.get("movies");
      if (r) { const i = r.items.find((x: any) => String(x.stream_id ?? x.num) === streamId); if (i?.container_extension) return i.container_extension; }
      return "mp4";
    })();
    flix2Url = `${FLIX2_SERVER}/movie/${FLIX2_USER}/${FLIX2_PASS}/${streamId}.${ext}`;
  } else {
    flix2Url = `${FLIX2_SERVER}/player_api.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&action=get_series_info&series_id=${streamId}`;
  }
  res.json({ ok: true, flix2Url });
});

// ── POST /flix2/replace-link — replace all flix2Url entries for a content item ─
// Finds all registry items matching tmdbId+tmdbType with a flix2Url and updates
// the first one to the new URL (removing duplicates). Adds a new entry if none exist.
router.post("/flix2/replace-link", async (req, res) => {
  try {
    const { tmdbId, tmdbType, newFlix2Url, title, label } = req.body ?? {};
    if (!newFlix2Url || !tmdbType || !title) {
      res.status(400).json({ error: "newFlix2Url, tmdbType e title são obrigatórios" }); return;
    }
    const client = getClient();
    const bucket = getBucket();
    const registry = await readRegistry(client, bucket);
    const id = Number(tmdbId) || 0;

    const existingIdxs: number[] = [];
    registry.items.forEach((item, i) => {
      if (item.tmdbId === id && item.tmdbType === tmdbType && !!item.flix2Url) {
        existingIdxs.push(i);
      }
    });

    if (existingIdxs.length > 0) {
      registry.items[existingIdxs[0]] = {
        ...registry.items[existingIdxs[0]],
        flix2Url: String(newFlix2Url),
        title: String(title),
        label: String(label ?? registry.items[existingIdxs[0]].label ?? "HD"),
      };
      const toRemove = new Set(existingIdxs.slice(1));
      registry.items = registry.items.filter((_, i) => !toRemove.has(i));
    } else {
      registry.items.push({
        id: crypto.randomUUID(),
        r2Key: "",
        flix2Url: String(newFlix2Url),
        tmdbId: id,
        tmdbType: tmdbType as "movie" | "tv",
        title: String(title),
        label: String(label ?? "HD"),
        season: null,
        episode: null,
        addedAt: new Date().toISOString(),
      } as any);
    }

    await writeRegistry(client, bucket, registry);
    res.json({ ok: true, updated: existingIdxs.length > 0, newFlix2Url });
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
    .replace(/\s*\[[^\]]*\]/g, "")  // strip [L], [D], [Dub], [Leg] etc. before normalizing
    .replace(/\s*\(\d{4}\)/g, "")   // strip (2025), (2024) year annotations
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Xtream Codes credentials (hubby.cx) ───────────────────────────────────────
const FLIX2_SERVER = process.env["FLIX2_SERVER"] ?? "https://hubby.cx";
const FLIX2_USER   = process.env["FLIX2_USER"]   ?? "wowserver-vods";
const FLIX2_PASS   = process.env["FLIX2_PASS"]   ?? "fUT3Phipaq10huqAPastEmlbr";

// ── Per-page cache (10 min TTL) — populated during warm-up, serves admin + mobile instantly ──
const PAGE_CACHE = new Map<string, { data: any; cachedAt: number }>();
const PAGE_CACHE_TTL_MS = 10 * 60 * 1000;

// ── Xtream Codes raw catalog cache (30 min TTL) ───────────────────────────────
// Xtream Codes returns ALL items in one request (no server-side pagination).
// We fetch once, cache, and simulate pagination in flix2FetchPage().
const XTREAM_RAW_CACHE = new Map<string, { items: any[]; cachedAt: number }>();
const XTREAM_RAW_TTL_MS = 30 * 60 * 1000;
const XTREAM_PAGE_SIZE = 20;

// ── TMDB 2026 title index (for Cinema tab filtering) ─────────────────────────
// Maps normalized title → { date: "YYYY-MM-DD", ptTitle, enTitle }
// Populated by warmTmdb2026() at startup; refreshed every 12 h.
interface Tmdb2026Entry {
  tmdbId: number;
  date: string; ptTitle: string; enTitle: string; vote: number;
  backdropPath: string | null; posterPath: string | null;
  overview: string;     // pt-BR (may be empty for untranslated films)
  overviewEn: string;   // en-US fallback
}
const TMDB_IMG_SRV = (path: string | null, size = "w780") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const TMDB_2026_MAP      = new Map<string, Tmdb2026Entry>();
let   TMDB_2026_WARMED_AT = 0;
let   TMDB_2026_WARMING   = false;
const TMDB_2026_TTL_MS   = 12 * 60 * 60 * 1000; // 12 hours

function normTitle(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ").trim();
}

// ── In-memory Flix2 index (tmdb_id → stream_url mapping) ──────────────────────
// Built by /flix2/build-index and checked by /flix2/lookup before hitting R2.
// R2 is just an optional persistence layer — this works without R2 credentials.
const FLIX2_INDEX_CACHE = new Map<string, { index: Record<string, string>; builtAt: number }>();

// ── Flix2 suppression list ─────────────────────────────────────────────────────
// stream_urls in this map are excluded from /flix2/lookup results.
// Used by admins to hide catalog entries with bad TMDB ID or duplicate URLs.
// Persisted to data/flix2-suppressions.json so suppressions survive server restarts.
interface SuppressionEntry { url: string; reason: string; suppressedAt: string }
const FLIX2_SUPPRESSION_MAP = new Map<string, { reason: string; suppressedAt: string }>();
const SUPPRESSION_FILE = path.resolve(process.cwd(), "data", "flix2-suppressions.json");

function loadSuppressions(): void {
  try {
    if (!existsSync(SUPPRESSION_FILE)) return;
    const arr: SuppressionEntry[] = JSON.parse(readFileSync(SUPPRESSION_FILE, "utf-8"));
    for (const e of arr) FLIX2_SUPPRESSION_MAP.set(e.url, { reason: e.reason, suppressedAt: e.suppressedAt });
    console.log(`[suppress] Loaded ${FLIX2_SUPPRESSION_MAP.size} suppression(s) from file`);
  } catch {}
}

function saveSuppressions(): void {
  try {
    mkdirSync(path.dirname(SUPPRESSION_FILE), { recursive: true });
    const arr: SuppressionEntry[] = [...FLIX2_SUPPRESSION_MAP.entries()].map(([url, v]) => ({ url, ...v }));
    writeFileSync(SUPPRESSION_FILE, JSON.stringify(arr, null, 2), "utf-8");
  } catch {}
}

loadSuppressions();

// Map a Xtream Codes VOD stream item to the existing app format
// Normalize poster/backdrop URLs coming from the Xtream server:
//   • Upgrade http:// → https:// (Android blocks mixed-content images)
//   • Fix double slash //t/p/ → /t/p/ (common TMDB URL malformation from Xtream)
function normalizeXtreamImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/^http:\/\//i, "https://")
    .replace(/\/\/t\/p\//g, "/t/p/");
}

function mapXtreamVod(item: any): any {
  const streamId = item.stream_id ?? item.num;
  const ext = item.container_extension || "mp4";
  const backdropArr: string[] = item.backdrop_path ?? [];
  const poster   = normalizeXtreamImageUrl(item.stream_icon ?? "");
  const backdrop = normalizeXtreamImageUrl(backdropArr[0] ?? item.stream_icon ?? "");
  // `added` is a Unix timestamp (string) from Xtream — when this VOD was added to the server
  const addedTs = item.added ? Number(item.added) : 0;
  const releaseDate: string = item.releaseDate ?? "";
  return {
    id:           String(streamId),
    tmdb_id:      Number(item.tmdb) || 0,
    title:        item.name ?? "",
    type:         "filme",
    year:         releaseDate ? (parseInt(releaseDate) || 0) : 0,
    release_date: releaseDate,   // full "YYYY-MM-DD" string from Xtream/TMDB
    rating:       String(item.rating ?? item.rating_5based ?? "0"),
    poster,
    backdrop,
    synopsis:     item.plot ?? "",
    added_at:     addedTs,
    // Xtream Codes VOD stream format: /movie/{user}/{pass}/{id}.{ext}
    stream_url: `${FLIX2_SERVER}/movie/${FLIX2_USER}/${FLIX2_PASS}/${streamId}.${ext}`,
  };
}

// Map a Xtream Codes series item to the existing app format
function mapXtreamSeries(item: any): any {
  const seriesId = item.series_id ?? item.num;
  const backdropArr: string[] = item.backdrop_path ?? [];
  const poster   = normalizeXtreamImageUrl(item.cover ?? "");
  const backdrop = normalizeXtreamImageUrl(backdropArr[0] ?? item.cover ?? "");
  // `last_modified` changes whenever a new episode is added; fall back to `added`
  const addedTs = item.last_modified ? Number(item.last_modified) : (item.added ? Number(item.added) : 0);
  return {
    id:        String(seriesId),
    tmdb_id:   Number(item.tmdb) || 0,
    title:     item.name ?? "",
    type:      "serie",
    year:      item.releaseDate ? (parseInt(item.releaseDate) || 0) : 0,
    rating:    String(item.rating ?? item.rating_5based ?? "0"),
    poster,
    backdrop,
    synopsis:  item.plot ?? "",
    added_at:  addedTs,
    stream_url: null, // episodes fetched separately via /flix2/series-episodes
  };
}

// Fetch ALL items for a catalog type from Xtream Codes (single request, cached 30 min)
async function xtreamFetchAll(type: string): Promise<any[]> {
  const cached = XTREAM_RAW_CACHE.get(type);
  if (cached && Date.now() - cached.cachedAt < XTREAM_RAW_TTL_MS) {
    return cached.items;
  }

  const isVod = type === "movies";
  const action = isVod ? "get_vod_streams" : "get_series";

  const url = `${FLIX2_SERVER}/player_api.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&action=${action}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    const data = await r.json();
    if (!Array.isArray(data)) return [];

    const items: any[] = isVod
      ? data.map(mapXtreamVod)
      : data.map(mapXtreamSeries);

    XTREAM_RAW_CACHE.set(type, { items, cachedAt: Date.now() });
    // Also populate the "animes" key with the same series list
    // (app deduplication by seenTmdb+seenFlix2 prevents duplicates)
    if (type === "series") {
      const existing = XTREAM_RAW_CACHE.get("animes");
      if (!existing || Date.now() - existing.cachedAt >= XTREAM_RAW_TTL_MS) {
        XTREAM_RAW_CACHE.set("animes", { items, cachedAt: Date.now() });
      }
    }
    console.log(`[flix2/xtream] fetched type=${type} items=${items.length}`);
    return items;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ── Cache hit/miss statistics (reset on server restart) ────────────────────
const SERVER_STARTED_AT = Date.now();
const CACHE_STATS = {
  page:      { hits: 0, misses: 0 },
  full:      { hits: 0, misses: 0 },
  episodes:  { hits: 0, misses: 0 },
  streamUrl: { hits: 0, misses: 0 },
  lookup:    { hits: 0, misses: 0 },
};

// Simulates Nixplay-style paginated responses backed by the Xtream Codes bulk fetch.
async function flix2FetchPage(type: string, page: number): Promise<{ success: boolean; pagination: any; data: any[] }> {
  const cacheKey = `${type}:${page}`;
  const hit = PAGE_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.cachedAt < PAGE_CACHE_TTL_MS) { CACHE_STATS.page.hits++; return hit.data; }
  CACHE_STATS.page.misses++;

  const allItems = await xtreamFetchAll(type);
  const start = (page - 1) * XTREAM_PAGE_SIZE;
  const slice = allItems.slice(start, start + XTREAM_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(allItems.length / XTREAM_PAGE_SIZE));

  const data = {
    success: true,
    pagination: {
      current_page:  page,
      total_pages:   totalPages,
      per_page:      XTREAM_PAGE_SIZE,
      total:         allItems.length,
    },
    data: slice,
  };
  PAGE_CACHE.set(cacheKey, { data, cachedAt: Date.now() });
  return data;
}

// ── GET /flix2/catalog — proxy to nixplay.lat API (avoids CORS on mobile) ─────
router.get("/flix2/catalog", async (req, res) => {
  try {
    const { type = "movies", page = "1" } = req.query as Record<string, string>;

    // Fast path: serve from FULL_CATALOG_CACHE if warm (admin page browser)
    const full = FULL_CATALOG_CACHE.get(type);
    if (full && Date.now() - full.cachedAt < FULL_CATALOG_TTL_MS) {
      const pageNum = Number(page);
      const PAGE_SIZE = 20;
      const start = (pageNum - 1) * PAGE_SIZE;
      const slice = full.data.slice(start, start + PAGE_SIZE);
      const totalPages = Math.ceil(full.data.length / PAGE_SIZE);
      res.json({
        success: true, fromCache: true,
        pagination: { current_page: pageNum, total_pages: totalPages, per_page: PAGE_SIZE, total: full.data.length },
        data: slice,
      });
      return;
    }

    const data = await flix2FetchPage(type, Number(page));
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

// ── In-memory cache for full catalog fetches ───────────────────────────────────
const FULL_CATALOG_CACHE = new Map<string, { data: any[]; cachedAt: number }>();
const FULL_CATALOG_TTL_MS = 30 * 60 * 1000; // 30 minutes

const EXCLUSIVE_CACHE = new Map<string, { data: any[]; cachedAt: number }>();
const EXCLUSIVE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// ── In-memory cache for Drive/R2 registry (for whats-new) ─────────────────────
let registryCacheRef: { items: RegistryItem[]; cachedAt: number } | null = null;
const REGISTRY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

async function getRegistryCached(): Promise<RegistryItem[]> {
  if (registryCacheRef && Date.now() - registryCacheRef.cachedAt < REGISTRY_CACHE_TTL_MS) {
    return registryCacheRef.items;
  }
  try {
    const client = getClient();
    const bucket = process.env["R2_BUCKET_NAME"] ?? "netplay-media-storage";
    const registry = await readRegistry(client, bucket);
    registryCacheRef = { items: registry.items, cachedAt: Date.now() };
    return registry.items;
  } catch {
    return registryCacheRef?.items ?? [];
  }
}

// Cache for TMDB poster paths looked up for registry items
const REGISTRY_TMDB_POSTER = new Map<string, string>(); // `{type}_{tmdbId}` → poster URL

async function getRegistryItemPoster(tmdbId: number, type: "movie" | "tv"): Promise<string> {
  const key = `${type}_${tmdbId}`;
  if (REGISTRY_TMDB_POSTER.has(key)) return REGISTRY_TMDB_POSTER.get(key)!;
  // Try Flix2 catalog first (fast, in-memory)
  const catType = type === "movie" ? "movies" : "series";
  const cat = FULL_CATALOG_CACHE.get(catType);
  if (cat) {
    const match = cat.data.find((i: any) => Number(i.tmdb_id) === tmdbId && i.poster);
    if (match?.poster) {
      REGISTRY_TMDB_POSTER.set(key, match.poster);
      return match.poster;
    }
  }
  // Fallback: TMDB API call
  try {
    let posterPath: string | null = null;
    if (type === "movie") {
      const r = await (tmdb as any).movies.details(tmdbId);
      posterPath = r.poster_path ?? null;
    } else {
      const r = await (tmdb as any).tv.details(tmdbId);
      posterPath = r.poster_path ?? null;
    }
    const url = posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : "";
    REGISTRY_TMDB_POSTER.set(key, url);
    return url;
  } catch {
    REGISTRY_TMDB_POSTER.set(key, "");
    return "";
  }
}

// Accumulates raw (non-deduped) items during warm-up so lookup can search
// even before warm-up finishes. Cleared once FULL_CATALOG_CACHE is set.
const WARM_PARTIAL_CACHE = new Map<string, any[]>();

// ── Warm-up progress tracking ───────────────────────────────────────────────
type WarmStatus = "idle" | "running" | "done" | "error";
interface WarmTypeState {
  status: WarmStatus;
  pagesLoaded: number;
  totalPages: number;
  itemCount: number;
  startedAt: number | null;
  completedAt: number | null;
  errorMsg?: string;
}
const WARM_PROGRESS = new Map<string, WarmTypeState>();
const FLIX2_TYPES = ["series", "animes", "movies"];

function getWarmState(type: string): WarmTypeState {
  return WARM_PROGRESS.get(type) ?? {
    status: "idle", pagesLoaded: 0, totalPages: 0, itemCount: 0,
    startedAt: null, completedAt: null,
  };
}

// Populates FULL_CATALOG_CACHE for the given type by fetching all pages.
// Safe to call multiple times — skips if already fresh in cache.
async function warmCatalogType(type: string): Promise<void> {
  const cached = FULL_CATALOG_CACHE.get(type);
  if (cached && Date.now() - cached.cachedAt < FULL_CATALOG_TTL_MS) {
    WARM_PROGRESS.set(type, {
      status: "done", pagesLoaded: 0, totalPages: 0,
      itemCount: cached.data.length,
      startedAt: null, completedAt: cached.cachedAt,
    });
    return;
  }

  WARM_PROGRESS.set(type, { status: "running", pagesLoaded: 0, totalPages: 0, itemCount: 0, startedAt: Date.now(), completedAt: null });

  try {
    // Use xtreamFetchAll directly — ONE HTTP request brings ALL items at once.
    // This is much faster than iterating through pagination batches, and makes
    // WARM_PARTIAL_CACHE fully populated immediately so lookups work right away.
    const allRaw = await xtreamFetchAll(type);
    if (!allRaw.length) {
      WARM_PROGRESS.set(type, { ...getWarmState(type), status: "error", errorMsg: "catalog unavailable or empty" });
      return;
    }

    // Immediately expose ALL raw items to the partial cache so /flix2/lookup can find anything
    WARM_PARTIAL_CACHE.set(type, allRaw);
    const totalPages = Math.max(1, Math.ceil(allRaw.length / XTREAM_PAGE_SIZE));
    WARM_PROGRESS.set(type, { ...getWarmState(type), pagesLoaded: totalPages, totalPages });

    // Deduplicate by tmdb_id (when > 0) or by flix2 item id
    const seenTmdb = new Set<number>();
    const seenFlix2 = new Set<string>();
    const deduped = allRaw.filter((item) => {
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
    WARM_PARTIAL_CACHE.delete(type);
    WARM_PROGRESS.set(type, {
      status: "done", pagesLoaded: totalPages, totalPages,
      itemCount: deduped.length, startedAt: getWarmState(type).startedAt, completedAt: Date.now(),
    });
    console.log(`[flix2] cache warm: type=${type} items=${deduped.length}`);
    // Snapshot diff: runs after every warm-up to track new/updated content
    try { computeAndSaveDiff(type, deduped); } catch {}

    // ── Auto-build in-memory index (Path 0 fast lookup) from raw cache ────────
    // Runs immediately after warm-up so every subsequent lookup is O(1) instead
    // of scanning thousands of items. No R2 write — purely in-memory.
    try {
      const rawForIndex = XTREAM_RAW_CACHE.get(type);
      if (rawForIndex && rawForIndex.items.length > 0) {
        const index: Record<string, string> = {};
        for (const item of rawForIndex.items) {
          const tId = Number(item?.tmdb_id);
          if (tId > 0) {
            if (!index[String(tId)]) {
              // For series: store flix2id so detail.tsx can fetch episodes
              // For movies: store stream_url directly
              const val = item.stream_url || (item.id ? `flix2id:${item.id}` : "");
              if (val) index[String(tId)] = val;
            }
          } else if (item?.title) {
            const titleKey = `title:${normalizeTitleForSearch(item.title)}`;
            if (titleKey !== "title:") {
              const val = item.stream_url || (item.id ? `flix2id:${item.id}` : "");
              if (val) {
                if (!index[titleKey]) index[titleKey] = val;
                // Year-qualified key: "title:o rei leao:1994" → correct version
                // Allows lookup with &year= to disambiguate same-name different-year titles
                const yr = Number(item.year ?? 0);
                if (yr > 0) {
                  const yearKey = `${titleKey}:${yr}`;
                  if (!index[yearKey]) index[yearKey] = val;
                }
              }
            }
          }
        }
        FLIX2_INDEX_CACHE.set(type, { index, builtAt: Date.now() });
        console.log(`[flix2] auto-built index for ${type}: ${Object.keys(index).length} entries`);
      }
    } catch (e) {
      console.warn(`[flix2] auto-index build failed for ${type}:`, e);
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.warn(`[flix2] cache warm failed for ${type}:`, msg);
    WARM_PROGRESS.set(type, { ...getWarmState(type), status: "error", errorMsg: msg });
    // Auto-retry: schedule up to 3 attempts with increasing delay.
    // This handles transient blocks on the production IP at startup time.
    const maxRetries = 3;
    const attempt = (getWarmState(type) as any)._retryCount ?? 0;
    if (attempt < maxRetries) {
      const delay = (attempt + 1) * 15_000; // 15s, 30s, 45s
      console.log(`[flix2] scheduling warm retry #${attempt + 1} for ${type} in ${delay / 1000}s`);
      WARM_PROGRESS.set(type, { ...getWarmState(type), _retryCount: attempt + 1 } as any);
      setTimeout(() => warmCatalogType(type).catch(() => {}), delay);
    }
  }
}

// ── warmTmdb2026 — builds TMDB_2026_MAP from TMDB Discover API ────────────────
// Fetches up to 200 pages (4000 movies) with pt-BR titles + original titles.
// Safe to call concurrently — guarded by TMDB_2026_WARMING flag.
export async function warmTmdb2026(): Promise<void> {
  // Use env var if set, otherwise fall back to the embedded key (already public in mobile client)
  const TMDB_KEY = process.env.TMDB_API_KEY ?? "8f0beb08cf016ec8de49e454e09879ec";
  if (!TMDB_KEY) return;
  if (TMDB_2026_WARMING) return;
  if (Date.now() - TMDB_2026_WARMED_AT < TMDB_2026_TTL_MS) return;

  TMDB_2026_WARMING = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const base  = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}`
                + `&primary_release_year=2026&language=pt-BR`
                + `&primary_release_date.lte=${today}`
                + `&sort_by=popularity.desc`;

    // Fetch page 1 to learn total_pages
    const first = await fetch(`${base}&page=1`).then((r) => r.json() as any);
    const total  = Math.min(Number(first.total_pages) || 1, 200);

    // temp map by tmdbId so we can back-fill English overviews
    const byId = new Map<number, Tmdb2026Entry>();

    const addPage = (data: any, lang: "pt" | "en") => {
      for (const m of data.results ?? []) {
        const id = Number(m.id ?? 0);
        if (!id) continue;
        const overviewText = String(m.overview ?? "");

        if (lang === "pt") {
          const date         = String(m.release_date ?? "");
          const ptTitle      = String(m.title ?? "");
          const enTitle      = String(m.original_title ?? "");
          const vote         = Number(m.vote_average ?? 0);
          const backdropPath = m.backdrop_path ?? null;
          const posterPath   = m.poster_path ?? null;
          const entry: Tmdb2026Entry = {
            tmdbId: id, date, ptTitle, enTitle, vote,
            backdropPath, posterPath,
            overview: overviewText, overviewEn: "",
          };
          byId.set(id, entry);
          if (ptTitle) TMDB_2026_MAP.set(normTitle(ptTitle), entry);
          if (enTitle && normTitle(enTitle) !== normTitle(ptTitle))
            TMDB_2026_MAP.set(normTitle(enTitle), entry);
        } else {
          // Back-fill English overview for movies that had empty pt-BR overview
          const existing = byId.get(id);
          if (existing && !existing.overview && overviewText) {
            existing.overviewEn = overviewText;
          }
        }
      }
    };
    addPage(first, "pt");

    // Fetch remaining pt-BR pages in batches of 20
    const BATCH = 20;
    for (let s = 2; s <= total; s += BATCH) {
      const pages = Array.from({ length: Math.min(BATCH, total - s + 1) }, (_, i) => s + i);
      await Promise.all(pages.map((p) =>
        fetch(`${base}&page=${p}`).then((r) => r.json()).then((d) => addPage(d, "pt")).catch(() => {})
      ));
    }

    // Second pass: fetch same pages in English to back-fill empty pt-BR overviews
    const baseEn = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}`
                 + `&primary_release_year=2026&language=en-US`
                 + `&primary_release_date.lte=${new Date().toISOString().slice(0, 10)}`
                 + `&sort_by=popularity.desc`;
    const firstEn = await fetch(`${baseEn}&page=1`).then((r) => r.json() as any).catch(() => ({ results: [] }));
    addPage(firstEn, "en");
    const totalEn = Math.min(Number(firstEn.total_pages) || 1, total);
    for (let s = 2; s <= totalEn; s += BATCH) {
      const pages = Array.from({ length: Math.min(BATCH, totalEn - s + 1) }, (_, i) => s + i);
      await Promise.all(pages.map((p) =>
        fetch(`${baseEn}&page=${p}`).then((r) => r.json()).then((d) => addPage(d, "en")).catch(() => {})
      ));
    }

    TMDB_2026_WARMED_AT = Date.now();
    console.log(`[tmdb2026] warmed ${TMDB_2026_MAP.size} title entries (${total} pages, en fallback applied)`);
  } catch (e) {
    console.error("[tmdb2026] warm error:", e);
  } finally {
    TMDB_2026_WARMING = false;
  }
}

// Exported so index.ts can trigger startup warm-up (non-blocking).
export async function warmAllCatalogCaches(): Promise<void> {
  // series and movies in parallel (2 HTTP requests simultaneously).
  // xtreamFetchAll("series") also populates XTREAM_RAW_CACHE["animes"] as a side effect,
  // so warmCatalogType("animes") will be served from cache and complete instantly.
  await Promise.all([
    warmCatalogType("series"),
    warmCatalogType("movies"),
    warmTmdb2026(),
  ]);
  await warmCatalogType("animes");
}

// ── GET /flix2/warm-status — real-time warm-up progress for admin UI ─────────
router.get("/flix2/warm-status", (_req, res) => {
  const types: Record<string, WarmTypeState & { cachedAt: number | null }> = {};
  for (const type of FLIX2_TYPES) {
    const state = getWarmState(type);
    const cached = FULL_CATALOG_CACHE.get(type);
    types[type] = { ...state, cachedAt: cached ? cached.cachedAt : null };
  }
  const allWarm = FLIX2_TYPES.every((t) => {
    const c = FULL_CATALOG_CACHE.get(t);
    return c && Date.now() - c.cachedAt < FULL_CATALOG_TTL_MS;
  });
  const anyRunning = FLIX2_TYPES.some((t) => getWarmState(t).status === "running");
  res.json({ ok: true, types, allWarm, anyRunning });
});

// ── GET /flix2/stats — real-time cache hit/miss metrics ────────────────────────
router.get("/flix2/stats", (_req, res) => {
  function rate(h: number, m: number): number {
    const total = h + m;
    return total > 0 ? Math.round((h / total) * 1000) / 10 : 0;
  }
  const fullTotalItems = FLIX2_TYPES.reduce((s, t) => {
    const c = FULL_CATALOG_CACHE.get(t);
    return s + (c ? c.data.length : 0);
  }, 0);
  res.json({
    ok: true,
    uptime: Date.now() - SERVER_STARTED_AT,
    serverStartedAt: SERVER_STARTED_AT,
    caches: {
      page:      { ...CACHE_STATS.page,      entries: PAGE_CACHE.size,      hitRate: rate(CACHE_STATS.page.hits,      CACHE_STATS.page.misses) },
      full:      { ...CACHE_STATS.full,      entries: FULL_CATALOG_CACHE.size, totalItems: fullTotalItems, hitRate: rate(CACHE_STATS.full.hits, CACHE_STATS.full.misses) },
      episodes:  { ...CACHE_STATS.episodes,  entries: EPISODES_CACHE.size,  hitRate: rate(CACHE_STATS.episodes.hits,  CACHE_STATS.episodes.misses) },
      streamUrl: { ...CACHE_STATS.streamUrl, entries: STREAM_URL_CACHE.size, hitRate: rate(CACHE_STATS.streamUrl.hits, CACHE_STATS.streamUrl.misses) },
      lookup:    { ...CACHE_STATS.lookup,    hitRate: rate(CACHE_STATS.lookup.hits,    CACHE_STATS.lookup.misses) },
    },
  });
});

// ── GET /flix2/catalog-full — fetches ALL pages for a type in parallel batches ─
// Returns the complete catalog for a type so mobile only makes one request.
router.get("/flix2/catalog-full", async (req, res) => {
  try {
    const { type = "movies" } = req.query as Record<string, string>;

    // Serve from cache if fresh
    const cached = FULL_CATALOG_CACHE.get(type);
    if (cached && Date.now() - cached.cachedAt < FULL_CATALOG_TTL_MS) {
      CACHE_STATS.full.hits++;
      res.json({ success: true, type, total: cached.data.length, data: cached.data, fromCache: true });
      return;
    }
    CACHE_STATS.full.misses++;

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

// ── GET /flix2/exclusive — items in NETPLAY not on any BR streaming platform ───
// Strategy: for each flix2 item (which has no tmdb_id), search TMDB by title,
// then check watch/providers for Brazil. Items with no flatrate/ads/free = exclusive.
// Results are cached for 12h — first call is slow (~1-2 min), after that instant.
router.get("/flix2/exclusive", async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 400), 1200);
    const forceRefresh = req.query.refresh === "1";
    const cacheKey = `exclusive_${limit}`;

    if (!forceRefresh) {
      const cached = EXCLUSIVE_CACHE.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < EXCLUSIVE_CACHE_TTL_MS) {
        res.json({ success: true, fromCache: true, total: cached.data.length, data: cached.data });
        return;
      }
    }

    const TMDB_KEY = process.env.TMDB_API_KEY ?? "8f0beb08cf016ec8de49e454e09879ec";

    // Gather items from all cached catalog types, taking top N per type
    // so no single type dominates when timestamps collide.
    const catalogTypes = ["movies", "series", "animes"];
    const perType = Math.ceil(limit / catalogTypes.length);
    let allItems: any[] = [];
    for (const ct of catalogTypes) {
      const c = FULL_CATALOG_CACHE.get(ct);
      if (c) {
        const sorted = c.data
          .filter((i: any) => i.title && i.title.trim().length > 1)
          .sort((a: any, b: any) => (b.added_at ?? 0) - (a.added_at ?? 0))
          .slice(0, perType);
        allItems.push(...sorted.map((i: any) => ({ ...i, _catalogType: ct })));
      }
    }

    // Deduplicate by title (case-insensitive) across catalog types
    const seenTitle = new Set<string>();
    allItems = allItems.filter((i) => {
      const key = i.title.toLowerCase().trim();
      if (seenTitle.has(key)) return false;
      seenTitle.add(key);
      return true;
    });

    if (allItems.length === 0) {
      res.json({ success: true, fromCache: false, total: 0, data: [], note: "catalog cache empty — retry after warm-up" });
      return;
    }

    const exclusive: any[] = [];
    const CONCURRENCY = 6;

    async function processOne(item: any) {
      try {
        const isMovie = item.type === "filme";
        const mediaType = isMovie ? "movie" : "tv";

        // Extract year hint from title (e.g. "Film Name (2024)")
        const yearMatch = item.title.match(/\((\d{4})\)\s*$/);
        const cleanTitle = yearMatch ? item.title.replace(/\s*\(\d{4}\)\s*$/, "").trim() : item.title;
        const yearHint  = yearMatch ? yearMatch[1] : (item.year > 0 ? String(item.year) : "");

        // TMDB search by title
        const searchUrl = isMovie
          ? `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanTitle)}&language=pt-BR${yearHint ? `&year=${yearHint}` : ""}&page=1`
          : `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(cleanTitle)}&language=pt-BR${yearHint ? `&first_air_date_year=${yearHint}` : ""}&page=1`;

        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
        if (!searchRes.ok) return;
        const searchJson = await searchRes.json();
        const match = searchJson?.results?.[0];
        if (!match) return;

        const tmdbId = match.id as number;

        // Check BR watch providers
        const provUrl = isMovie
          ? `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`
          : `https://api.themoviedb.org/3/tv/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`;

        const provRes = await fetch(provUrl, { signal: AbortSignal.timeout(8000) });
        if (!provRes.ok) return;
        const provJson = await provRes.json();
        const br = provJson?.results?.BR;

        // Exclusive = no subscription/ads/free streaming in Brazil
        if (!br || (!br.flatrate?.length && !br.ads?.length && !br.free?.length)) {
          const posterPath   = match.poster_path   ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "";
          const backdropPath = match.backdrop_path ? `https://image.tmdb.org/t/p/w1280${match.backdrop_path}` : "";
          const genreIds: number[] = match.genre_ids ?? [];
          exclusive.push({
            id:        item.id,
            tmdb_id:   tmdbId,
            title:     cleanTitle,
            mediaType,
            year:      item.year > 0 ? item.year
              : (match.release_date    ? parseInt(match.release_date)    : 0)
              || (match.first_air_date ? parseInt(match.first_air_date)  : 0),
            poster:    item.poster   || posterPath,
            backdrop:  item.backdrop || backdropPath,
            synopsis:  item.synopsis || match.overview || "",
            genre_ids: genreIds,
          });
        }
      } catch {
        // silently skip on errors
      }
    }

    for (let i = 0; i < allItems.length; i += CONCURRENCY) {
      await Promise.all(allItems.slice(i, i + CONCURRENCY).map(processOne));
    }

    // Deduplicate output by tmdb_id (same film may appear from multiple catalog types)
    const seenTmdb = new Set<number>();
    const deduped = exclusive.filter((item) => {
      if (seenTmdb.has(item.tmdb_id)) return false;
      seenTmdb.add(item.tmdb_id);
      return true;
    });

    EXCLUSIVE_CACHE.set(cacheKey, { data: deduped, cachedAt: Date.now() });
    console.log(`[flix2/exclusive] checked=${allItems.length} exclusive=${deduped.length}`);
    res.json({ success: true, fromCache: false, total: deduped.length, data: deduped });
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
  const { tmdbId, type = "all", title = "", streamId = "", year = "" } = req.query as Record<string, string>;
  const id = Number(tmdbId);
  // Also normalize hyphens/underscores → spaces so "Spider-Noir" and "Spider Noir" match the same catalog entry
  const titleCleaned = title.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  const normTitle = titleCleaned ? normalizeTitleForSearch(titleCleaned) : "";
  const streamIdNum = streamId ? Number(streamId) : 0;
  // Optional year param — when provided, year-qualified index entries are checked first
  // so same-name different-year titles (e.g. "O Rei Leão" 1994 vs 2019) return the correct version
  const yearParam = year ? Number(year) : 0;

  // Require at least a valid tmdbId, title, OR direct streamId to search by
  if (!id && !normTitle && !streamIdNum) { res.json({ found: false, item: null }); return; }

  // ── Shortcut: direct streamId lookup — find the item whose Xtream stream_id matches ──
  // This is the fastest path for Flix2-only items (tmdbId=0) since we know the exact id.
  if (streamIdNum) {
    const typesToTry = type === "all" ? ["movies", "series", "animes"] : [type];
    for (const t of typesToTry) {
      const raw = XTREAM_RAW_CACHE.get(t);
      if (raw) {
        const hit = raw.items.find((i: any) => Number(i.stream_id ?? i.id) === streamIdNum);
        if (hit) {
          CACHE_STATS.lookup.hits++;
          res.json({ found: true, item: hit });
          return;
        }
      }
      // Also check full catalog cache
      const full = FULL_CATALOG_CACHE.get(t);
      if (full) {
        const hit = full.data.find((i: any) => Number(i.stream_id ?? i.id) === streamIdNum);
        if (hit) {
          CACHE_STATS.lookup.hits++;
          res.json({ found: true, item: hit });
          return;
        }
      }
    }
    // If streamId lookup found nothing (cache not warm yet), fall through to title/tmdbId match
  }

  function matchItem(i: any): boolean {
    // Suppression check — skip items whose stream_url has been admin-suppressed
    if (i.stream_url && FLIX2_SUPPRESSION_MAP.has(i.stream_url)) return false;
    // TMDB ID match (only when id > 0)
    if (id > 0 && Number(i.tmdb_id) === id) return true;
    // Title match — used as fallback or primary when id=0
    if (normTitle) {
      const iNorm = normalizeTitleForSearch(i.title ?? i.name ?? "");
      if (!iNorm) return false;
      // When year param is provided, reject items whose year is known AND doesn't match.
      // year=0 means unknown — don't exclude those (e.g. catalog item has no releaseDate).
      if (yearParam > 0) {
        const iYear = Number(i.year ?? 0);
        if (iYear > 0 && Math.abs(iYear - yearParam) > 1) return false;
      }
      // Exact normalized match
      if (iNorm === normTitle) return true;
      // Fuzzy word match: ≥70% of significant query words (4+ chars) present in item title.
      // REQUIRES at least 2 significant words to avoid false positives on short/common titles.
      // Example: "Spider Noir" → ["spider","noir"] → 2 words → fuzzy ok
      // Example: "O Rei Leão" → ["leao"] → only 1 word → NO fuzzy (would match wrong film)
      const qWords = normTitle.match(/[a-z0-9]{4,}/g) ?? [];
      if (qWords.length >= 2) {
        const iWords = new Set(iNorm.match(/[a-z0-9]{4,}/g) ?? []);
        const hits = qWords.filter((w) => iWords.has(w)).length;
        if (hits >= Math.ceil(qWords.length * 0.7)) return true;
      }
    }
    return false;
  }

  // For "all" type: check series first (most TV content), then animes, then movies.
  // This matters because series cache is warm earlier than movies (377 vs 821 pages).
  const typesToCheck = type === "all" ? ["series", "animes", "movies"] : [type];
  const client = getClient();
  const bucket = getBucket();

  for (const t of typesToCheck) {
    // ── Path 0: in-memory FLIX2_INDEX_CACHE (built by build-index, no R2 needed) ──
    const memIdx = FLIX2_INDEX_CACHE.get(t);
    if (memIdx) {
      const byId = id > 0 ? memIdx.index[String(id)] : undefined;
      // When year is provided, try year-qualified key first so same-name different-year titles
      // (e.g. "O Rei Leão" 1994 vs 2019) return the correct catalog entry
      const byTitle = normTitle
        ? (yearParam > 0
            ? (memIdx.index[`title:${normTitle}:${yearParam}`] ?? memIdx.index[`title:${normTitle}`])
            : memIdx.index[`title:${normTitle}`])
        : undefined;
      const entry = byId ?? byTitle;
      if (entry) {
        if (!entry.startsWith("flix2id:")) {
          // Direct stream URL — movies/VOD
          // Skip if admin-suppressed
          if (FLIX2_SUPPRESSION_MAP.has(entry)) { /* fall through to next type */ }
          else {
            CACHE_STATS.lookup.hits++;
            res.json({ found: true, item: { tmdb_id: id, stream_url: entry, type: t, title: title || undefined } });
            return;
          }
        } else {
          // "flix2id:<seriesId>" — resolve the full catalog item from raw cache
          // This avoids falling through to slower paths (which can fail for certain title formats)
          const seriesId = entry.slice("flix2id:".length);
          const rawCache = XTREAM_RAW_CACHE.get(t);
          const seriesItem = rawCache?.items.find((i: any) => String(i.id ?? i.series_id) === seriesId);
          if (seriesItem) {
            CACHE_STATS.lookup.hits++;
            res.json({ found: true, item: seriesItem });
            return;
          }
          // Raw cache not populated yet — fall through to slower paths
        }
      }
    }

    // ── Path 1: pre-built R2 index (optional persistence — fastest when R2 available) ──
    try {
      const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `__flix2-index-${t}.json` }));
      const raw = await resp.Body?.transformToString();
      if (raw) {
        const index: Record<string, string> = JSON.parse(raw);
        const byId = id > 0 ? index[String(id)] : undefined;
        const byTitle = normTitle ? index[`title:${normTitle}`] : undefined;
        const entry = byId ?? byTitle;
        if (entry && !entry.startsWith("flix2id:") && !FLIX2_SUPPRESSION_MAP.has(entry)) {
          CACHE_STATS.lookup.hits++;
          res.json({ found: true, item: { tmdb_id: id, stream_url: entry, type: t, title: title || undefined } });
          return;
        }
      }
    } catch {}

    // ── Path 2a: full FULL_CATALOG_CACHE (warm-up complete, instant, all pages) ──
    const warm = FULL_CATALOG_CACHE.get(t);
    if (warm && Date.now() - warm.cachedAt < FULL_CATALOG_TTL_MS) {
      const hit = warm.data.find((i: any) => matchItem(i));
      if (hit) { CACHE_STATS.lookup.hits++; res.json({ found: true, item: hit }); return; }
      // Full cache dedup may have dropped duplicate tmdb_ids — check raw cache too
      // before giving up (raw cache has ALL items, including dupes that dedup removed).
      const rawFallback = XTREAM_RAW_CACHE.get(t);
      if (rawFallback && rawFallback.items.length > 0) {
        const rawHit = rawFallback.items.find((i: any) => matchItem(i));
        if (rawHit) { CACHE_STATS.lookup.hits++; res.json({ found: true, item: rawHit }); return; }
      }
      // Both caches searched — item genuinely not in catalog for this type.
      continue;
    }

    // ── Path 2b: partial cache (warm-up in progress, grows page-by-page) ─────
    // Populated every 15-page batch during warm-up so items mid-warm-up are findable.
    const partial = WARM_PARTIAL_CACHE.get(t);
    if (partial && partial.length > 0) {
      const hit = partial.find((i: any) => matchItem(i));
      if (hit) { CACHE_STATS.lookup.hits++; res.json({ found: true, item: hit }); return; }
      // Partial cache scanned but item not yet loaded — fall through to slow scan
      // to check pages not yet in partial cache.
    }

    // ── Path 3: trigger xtreamFetchAll then search entire raw cache ──────────
    // flix2FetchPage(t, 1) internally calls xtreamFetchAll which fetches ALL items
    // in ONE HTTP request and stores them in XTREAM_RAW_CACHE.
    // Once that completes we can search all items directly — no page-limit needed.
    try {
      await flix2FetchPage(t, 1); // triggers xtreamFetchAll → populates XTREAM_RAW_CACHE
      const rawCache = XTREAM_RAW_CACHE.get(t);
      if (rawCache && rawCache.items.length > 0) {
        const hit = rawCache.items.find((i: any) => matchItem(i));
        if (hit) { CACHE_STATS.lookup.hits++; res.json({ found: true, item: hit }); return; }
        // All raw items searched — item genuinely not in catalog for this type
        continue;
      }
    } catch {}
  }

  CACHE_STATS.lookup.misses++;
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
  try {
    const normalized = normalizeTeraboxUrl(shareUrl);
    const list = await fetchTeraBoxList(normalized);
    const best = list.find((f: any) => f.direct_link && f.size) ?? list.find((f: any) => f.direct_link);
    return best?.direct_link ?? null;
  } catch { return null; }
}

// ── Stream URL redirect cache (20s TTL) — CDN signed URLs can expire in ~30-60s ─
// Short TTL ensures retries get a fresh signed URL instead of a stale one.
// Pass ?nocache=1 from the client to bypass the cache immediately (used on retries).
const STREAM_URL_CACHE = new Map<string, { result: any; cachedAt: number }>();
const STREAM_URL_TTL_MS = 20 * 1000;

router.get("/flix2/stream-url", async (req, res) => {
  const streamUrl = String(req.query.streamUrl ?? "");
  if (!streamUrl) { res.status(400).json({ error: "streamUrl é obrigatório" }); return; }

  const noCache = req.query.nocache === "1";

  // Fast path: return cached resolved URL (skip if nocache=1)
  const cached = STREAM_URL_CACHE.get(streamUrl);
  if (!noCache && cached && Date.now() - cached.cachedAt < STREAM_URL_TTL_MS) {
    CACHE_STATS.streamUrl.hits++;
    res.json({ ...cached.result, fromCache: true });
    return;
  }
  CACHE_STATS.streamUrl.misses++;

  try {
    // Step 0: nixplay.lat/movie/ and /series/ URLs redirect (302) to fontedecanais CDN.
    // ExoPlayer blocks cross-scheme HTTPS→HTTP redirects even with usesCleartextTraffic.
    // Fix: resolve the redirect server-side → return the fontedecanais URL so the
    // client can play it DIRECTLY (no cross-scheme redirect, just direct HTTP).
    // If server gets 403 (nixplay blocks some IPs), fall through to HEAD below.
    // Note: nixplay stream URLs have credentials embedded (/movie/user/pass/id.mp4),
    // so the server can follow the redirect with proper auth.

    // Step 1: if the raw URL is already TeraBox, resolve directly
    if (isTeraboxUrl(streamUrl)) {
      const direct = await resolveTeraboxDirect(streamUrl);
      if (direct) {
        const result = { url: direct, via: "terabox" };
        STREAM_URL_CACHE.set(streamUrl, { result, cachedAt: Date.now() });
        res.json(result); return;
      }
      res.json({ url: streamUrl, via: "terabox-fallback", error: "Link expirado no TeraBox. Tente outro episódio." }); return;
    }

    // Step 2: extract redirect location from nixplay WITHOUT following it.
    // Using redirect:"follow" times out because vod99.cineveo.lat (Cloudflare CDN)
    // blocks server IPs on HEAD requests — same root cause as the Drive Worker block.
    // redirect:"manual" returns the 302 response immediately, and we read the Location
    // header to get the CDN URL. The actual streaming is then handled by the proxy
    // (/api/stream/proxy) which the APK calls next, and which sends a browser UA.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(streamUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://nixplay.lat/",
          "Origin": "https://nixplay.lat",
          "Accept": "*/*",
        },
      });
    } finally { clearTimeout(timer); }
    // For redirect:manual, a 3xx response gives us the Location header directly.
    // Fall back to the original streamUrl if no Location header (e.g., 200 direct URL).
    const location = response!.headers.get("location");
    const finalUrl = location || streamUrl;
    const finalHost = (() => { try { return new URL(finalUrl).hostname; } catch { return "unknown"; } })();
    console.log(`[flix2/stream-url] status=${response!.status} location=${location ? finalHost : "none (direct)"} finalUrl="${finalUrl.slice(0, 120)}"`);

    // Step 3: if the redirect landed on TeraBox, resolve via xAPIverse
    if (isTeraboxUrl(finalUrl)) {
      const direct = await resolveTeraboxDirect(finalUrl);
      if (direct) {
        const result = { url: direct, via: "terabox" };
        STREAM_URL_CACHE.set(streamUrl, { result, cachedAt: Date.now() });
        res.json(result); return;
      }
      res.json({ url: finalUrl, via: "terabox-fallback", error: "Link expirado no TeraBox. Tente outro episódio." }); return;
    }

    // Step 4: if the redirect landed on fontedecanais / hubby.cx,
    // return the RESOLVED CDN URL so the client always has the final URL.
    //
    // NOTE (confirmed by live curl tests):
    //   fontedecanais tokens are TIME-BASED, NOT IP-bound — the same token works
    //   from any IP within the same time window. The APK plays fontedecanais DIRECTLY
    //   from the device (no proxy). CF Worker gets 403 because Cloudflare IPs are
    //   blocked by fontedecanais CDN.
    //
    // Why return the resolved URL instead of the nixplay URL?
    //   So the client can detect the CDN type from the hostname (fontedecanais vs
    //   cineveo) and apply the correct routing strategy. The client uses nocache=1
    //   on retry to get a fresh token if it expired.
    const isIpBoundCdn = (() => {
      try {
        const h = new URL(finalUrl).hostname;
        return (
          h.endsWith("72yrci50ppqp71.com") ||
          h.endsWith("fontedecanais.me") ||
          h === "hubby.cx" ||
          h.endsWith(".hubby.cx")
        );
      } catch { return false; }
    })();
    if (isIpBoundCdn) {
      const cdnHost = (() => { try { return new URL(finalUrl).hostname; } catch { return "unknown"; } })();
      console.log(`[flix2/stream-url] ip-bound CDN (${cdnHost}) → returning resolved CDN URL for stable proxy`);
      const result = { url: finalUrl, via: "fontedecanais" };
      STREAM_URL_CACHE.set(streamUrl, { result, cachedAt: Date.now() });
      res.json(result);
      return;
    }

    // Step 5: if no redirect was resolved (finalUrl === streamUrl), nixplay blocked the
    // server IP with a non-3xx response. Route through the CF Worker which runs on
    // Cloudflare edge IPs — those are not blocked by nixplay.
    // The CF Worker already has resolveNixplay() built-in to follow the 302 server-side.
    // This makes the OLD APK (without client-side fetch fix) work without a new build.
    const CF_WORKER = process.env["CF_WORKER_URL"] ?? "https://netplay-stream-proxy.netplay.workers.dev";
    if (finalUrl === streamUrl) {
      const workerUrl = `${CF_WORKER}/?url=${encodeURIComponent(streamUrl)}`;
      console.log(`[flix2/stream-url] nixplay unresolved → routing via CF Worker`);
      const result = { url: workerUrl, via: "cf-worker" };
      STREAM_URL_CACHE.set(streamUrl, { result, cachedAt: Date.now() });
      res.json(result);
      return;
    }

    const result = { url: finalUrl };
    STREAM_URL_CACHE.set(streamUrl, { result, cachedAt: Date.now() });
    res.json(result);
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError" || err?.message?.includes("aborted");
    if (isTimeout) {
      res.status(504).json({ error: "Tempo limite ao resolver URL de streaming. Tente novamente." });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// ── GET /flix2/debug-url?streamUrl=<encoded> ──────────────────────────────────
// Diagnostic endpoint: traces the full chain for any Flix2 stream URL.
// Returns CDN domain, resolved URL, HTTP status, content type (HLS/MP4),
// and whether the proxy can serve it — useful for diagnosing failures without
// needing to rebuild the APK.
router.get("/flix2/debug-url", async (req, res) => {
  const streamUrl = String(req.query.streamUrl ?? "");
  if (!streamUrl) { res.status(400).json({ error: "streamUrl é obrigatório" }); return; }

  const report: Record<string, any> = {
    input: streamUrl,
    inputHost: (() => { try { return new URL(streamUrl).hostname; } catch { return "invalid"; } })(),
    steps: [] as any[],
  };

  // Step 1: resolve redirect from nixplay.lat
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(streamUrl, {
        method: "HEAD", redirect: "manual", signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
    } finally { clearTimeout(timer); }

    const location = response.headers.get("location");
    const resolvedUrl = location || streamUrl;
    const cdnHost = (() => { try { return new URL(resolvedUrl).hostname; } catch { return "unknown"; } })();
    const cdnProtocol = (() => { try { return new URL(resolvedUrl).protocol; } catch { return "unknown"; } })();
    const cdnPort = (() => { try { return new URL(resolvedUrl).port || (cdnProtocol === "https:" ? "443" : "80"); } catch { return "?"; } })();

    report.steps.push({ step: "redirect_resolve", nixplayStatus: response.status, hasRedirect: !!location, cdnHost, cdnProtocol, cdnPort });
    report.resolvedUrl = resolvedUrl;
    report.cdnHost = cdnHost;
    report.cdnProtocol = cdnProtocol;

    // Step 2: probe CDN URL with browser UA + nixplay Referer
    const FLIX2_ROOTS = ["72yrci50ppqp71.com", "fontedecanais.me", "cineveo.lat", "nixplay.lat"];
    const isFlix2 = FLIX2_ROOTS.some(r => cdnHost === r || cdnHost.endsWith(`.${r}`));
    const probeHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Referer": isFlix2 ? "https://nixplay.lat/" : "https://animezey16082023.animezey16082023.workers.dev/",
    };
    if (isFlix2) probeHeaders["Origin"] = "https://nixplay.lat";

    const ctrl2 = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), 8000);
    let probeStatus = 0;
    let probeContentType = "";
    let probeSize = "";
    let probeError = "";
    try {
      const probe = await fetch(resolvedUrl, { method: "HEAD", headers: probeHeaders, redirect: "follow", signal: ctrl2.signal });
      clearTimeout(timer2);
      probeStatus = probe.status;
      probeContentType = probe.headers.get("content-type") ?? "";
      probeSize = probe.headers.get("content-length") ?? "unknown";
    } catch (e: any) {
      clearTimeout(timer2);
      probeError = e.message ?? "error";
    }

    const isHls = probeContentType.toLowerCase().includes("mpegurl") || resolvedUrl.includes(".m3u8");
    const isMp4 = probeContentType.toLowerCase().includes("mp4") || probeContentType.toLowerCase().includes("video");
    const cdnAccessible = probeStatus >= 200 && probeStatus < 300;

    report.steps.push({
      step: "cdn_probe",
      status: probeStatus,
      contentType: probeContentType,
      contentLength: probeSize,
      format: isHls ? "HLS" : isMp4 ? "MP4" : "unknown",
      refererSent: probeHeaders["Referer"],
      cdnAccessible,
      error: probeError || undefined,
    });
    report.format = isHls ? "HLS" : isMp4 ? "MP4" : "unknown";
    report.cdnAccessible = cdnAccessible;

    // Step 3: check if host is whitelisted for proxy
    const ALLOWED_EXACT = ["nixplay.lat", "vod99.cineveo.lat", "cineveo.lat", "drive.usercontent.google.com", "xapiverse.com"];
    const proxyAllowed = ALLOWED_EXACT.includes(cdnHost) ||
      isFlix2 ||
      cdnHost.endsWith(".googleusercontent.com") ||
      cdnHost.endsWith(".terabox.com") ||
      cdnHost.endsWith(".baidupcs.com");
    report.steps.push({ step: "whitelist_check", cdnHost, proxyAllowed });
    report.proxyAllowed = proxyAllowed;

    report.diagnosis = !proxyAllowed
      ? `❌ CDN host "${cdnHost}" não está no whitelist do proxy — adicionar ao ALLOWED_UPSTREAM_HOSTS ou FLIX2_CDN_ROOTS`
      : !cdnAccessible
      ? `❌ CDN retornou ${probeStatus} — bloqueio por IP do servidor ou Referer incorreto`
      : probeError
      ? `❌ Erro ao acessar CDN: ${probeError}`
      : `✅ OK — proxy pode servir este conteúdo (${report.format}, CDN acessível, host permitido)`;

    res.json(report);
  } catch (err: any) {
    report.steps.push({ step: "error", message: err.message });
    report.diagnosis = `❌ Erro interno: ${err.message}`;
    res.status(500).json(report);
  }
});

// ── Per-series episode cache (30 min TTL) — avoids repeated API calls ─────────
const EPISODES_CACHE = new Map<string, { episodes: any[]; cachedAt: number }>();
const EPISODES_CACHE_TTL_MS = 30 * 60 * 1000;

// ── GET /flix2/admin-series-info?seriesId=<id> ────────────────────────────────
// Raw proxy of Xtream Codes get_series_info for the admin panel.
// Returns the full Xtream JSON (episodes keyed by season) so the admin UI
// can build stream URLs using ep.id and ep.container_extension.
router.get("/flix2/admin-series-info", async (req, res) => {
  const { seriesId } = req.query as Record<string, string>;
  if (!seriesId) { res.status(400).json({ error: "seriesId obrigatório" }); return; }
  try {
    const url = `${FLIX2_SERVER}/player_api.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&action=get_series_info&series_id=${seriesId}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    let r: Response;
    try {
      r = await fetch(url, { signal: ctrl.signal });
    } finally { clearTimeout(tid); }
    if (!r.ok) { res.status(502).json({ error: `upstream HTTP ${r.status}` }); return; }
    const data = await r.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

// ── GET /flix2/series-episodes?seriesId=<id> ──────────────────────────────────
// Fetches per-episode stream URLs for a series from nixplay.lat.
// Fast path: if FULL_CATALOG_CACHE is warm, finds episodes inline (0ms).
// Fallback: Xtream Codes get_series_info.php endpoint.
router.get("/flix2/series-episodes", async (req, res) => {
  const { seriesId } = req.query as Record<string, string>;
  if (!seriesId) { res.status(400).json({ error: "seriesId obrigatório" }); return; }

  // ── Path A: serve from episodes cache (instant) ──────────────────────────
  // Only return from cache when episodes are present — an empty cache entry means
  // a previous live-API call also returned nothing, so skip and try live again.
  const epCached = EPISODES_CACHE.get(seriesId);
  if (epCached && epCached.episodes.length > 0 && Date.now() - epCached.cachedAt < EPISODES_CACHE_TTL_MS) {
    CACHE_STATS.episodes.hits++;
    res.json({ found: true, episodes: epCached.episodes, info: null, fromCache: true });
    return;
  }

  // ── Path B: look up in FULL_CATALOG_CACHE (inline episodes, instant) ─────
  // Note: mapXtreamSeries items have stream_url=null and NO episodes array —
  // episodes are fetched separately via get_series_info (Path D).
  // Only return early from this path if the item actually has episode stream_urls;
  // otherwise fall through to the live-API path.
  for (const cType of ["series", "animes"]) {
    const full = FULL_CATALOG_CACHE.get(cType);
    if (!full || Date.now() - full.cachedAt >= FULL_CATALOG_TTL_MS) continue;
    const item = full.data.find((i: any) => String(i.id) === seriesId);
    if (!item) continue;

    const eps: Array<{ season: number; episode: number; stream_url: string; title?: string }> = [];
    if (Array.isArray(item.episodes)) {
      for (const ep of item.episodes) {
        if (!ep?.stream_url) continue;
        eps.push({
          season:   Number(ep.season  ?? 1),
          episode:  Number(ep.episode ?? ep.episode_number ?? 1),
          stream_url: ep.stream_url,
          title:    ep.title ?? ep.name ?? undefined,
        });
      }
    }
    if (eps.length > 0) {
      eps.sort((a, b) => a.season - b.season || a.episode - b.episode);
      EPISODES_CACHE.set(seriesId, { episodes: eps, cachedAt: Date.now() });
      CACHE_STATS.episodes.hits++;
      res.json({ found: true, episodes: eps, info: null, fromCache: true });
      return;
    }
    // Item found but no episodes in cache data — fall through to live API (Path D).
    break;
  }

  // ── Path C: WARM_PARTIAL_CACHE (mid-warm-up) ─────────────────────────────
  for (const cType of ["series", "animes"]) {
    const partial = WARM_PARTIAL_CACHE.get(cType);
    if (!partial || partial.length === 0) continue;
    const item = partial.find((i: any) => String(i.id) === seriesId);
    if (!item || !Array.isArray(item.episodes)) continue;

    const eps: Array<{ season: number; episode: number; stream_url: string; title?: string }> = [];
    for (const ep of item.episodes) {
      if (!ep?.stream_url) continue;
      eps.push({
        season:   Number(ep.season  ?? 1),
        episode:  Number(ep.episode ?? ep.episode_number ?? 1),
        stream_url: ep.stream_url,
        title:    ep.title ?? ep.name ?? undefined,
      });
    }
    eps.sort((a, b) => a.season - b.season || a.episode - b.episode);
    if (eps.length > 0) {
      EPISODES_CACHE.set(seriesId, { episodes: eps, cachedAt: Date.now() });
      CACHE_STATS.episodes.hits++;
      res.json({ found: true, episodes: eps, info: null, fromCache: true });
      return;
    }
  }

  // ── Path D: live API fallback (Xtream Codes player_api.php get_series_info) ──
  try {
    const url = `${FLIX2_SERVER}/player_api.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&action=get_series_info&series_id=${seriesId}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 20000);
    let r: Response;
    try {
      r = await fetch(url, { signal: ctrl.signal });
    } finally { clearTimeout(tid); }

    const data = await r.json() as any;

    const allEpisodes: Array<{ season: number; episode: number; stream_url: string; title?: string }> = [];

    if (data?.episodes && typeof data.episodes === "object") {
      for (const [seasonStr, eps] of Object.entries(data.episodes as Record<string, any[]>)) {
        if (!Array.isArray(eps)) continue;
        const season = Number(seasonStr);
        for (const ep of eps) {
          if (!ep?.id) continue;
          const ext = ep.container_extension || "mp4";
          const streamUrl = `${FLIX2_SERVER}/series/${FLIX2_USER}/${FLIX2_PASS}/${ep.id}.${ext}`;
          allEpisodes.push({
            season,
            episode: Number(ep.episode_num ?? ep.episode ?? 1),
            stream_url: streamUrl,
            title: ep.title ?? ep.name ?? undefined,
          });
        }
      }
    }

    allEpisodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    if (allEpisodes.length > 0) {
      EPISODES_CACHE.set(seriesId, { episodes: allEpisodes, cachedAt: Date.now() });
      CACHE_STATS.episodes.misses++;
      res.json({ found: true, episodes: allEpisodes, info: data?.info ?? null });
      return;
    }

    // Server got a response but it had no episodes (redirect/HTML/blocked).
    // Tell the client to retry directly from the device — residential IPs are
    // not blocked by most Xtream providers while datacenter IPs (Replit) are.
    CACHE_STATS.episodes.misses++;
    const directUrl = `${FLIX2_SERVER}/player_api.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&action=get_series_info&series_id=${seriesId}`;
    const streamBase = `${FLIX2_SERVER}/series/${FLIX2_USER}/${FLIX2_PASS}/`;
    res.json({ found: false, episodes: [], tryClientDirect: true, directUrl, streamBase });
  } catch (err: any) {
    // Timeout, network error, or JSON parse failure — same hint: try from client.
    CACHE_STATS.episodes.misses++;
    const directUrl = `${FLIX2_SERVER}/player_api.php?username=${FLIX2_USER}&password=${FLIX2_PASS}&action=get_series_info&series_id=${seriesId}`;
    const streamBase = `${FLIX2_SERVER}/series/${FLIX2_USER}/${FLIX2_PASS}/`;
    res.json({ found: false, episodes: [], tryClientDirect: true, directUrl, streamBase });
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
// Returns metadata about the Flix2 index (in-memory first, R2 as fallback).
router.get("/flix2/index-status", async (req, res) => {
  const types = ["movies", "series", "animes"];
  const result: Record<string, { exists: boolean; count: number; ageMs: number | null }> = {};

  await Promise.all(types.map(async (t) => {
    // ── In-memory index (no R2 needed) ────────────────────────────────────────
    const mem = FLIX2_INDEX_CACHE.get(t);
    if (mem) {
      result[t] = { exists: true, count: Object.keys(mem.index).length, ageMs: Date.now() - mem.builtAt };
      return;
    }
    // ── R2 fallback (optional) ─────────────────────────────────────────────────
    try {
      const client = getClient();
      const bucket = getBucket();
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: `__flix2-index-${t}.json` }));
      const ageMs = head.LastModified ? Date.now() - head.LastModified.getTime() : null;
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
    for (const t of typesToIndex) {
      job.currentType = t;
      job.pagesScanned = 0;
      job.totalPages = 1;
      // Record<string, string>: tmdb_id (as string number) for normal items,
      // "title:<normalized>" for items that have no valid TMDB ID.
      const index: Record<string, string> = {};

      try {
        // ── Use xtreamFetchAll to get ALL items in one shot (no pagination needed) ──
        const allItems = await xtreamFetchAll(t);

        const indexItem = (item: any) => {
          const tmdbId = Number(item?.tmdb_id);
          if (tmdbId > 0) {
            if (item.stream_url) {
              index[String(tmdbId)] = item.stream_url;
            } else if (item.id) {
              index[String(tmdbId)] = `flix2id:${item.id}`;
            }
          } else if (item?.title) {
            const titleKey = `title:${normalizeTitleForSearch(item.title)}`;
            if (titleKey !== "title:") {
              const val = item.stream_url || (item.id ? `flix2id:${item.id}` : "");
              if (val) {
                if (!index[titleKey]) index[titleKey] = val;
                // Year-qualified key for disambiguation (e.g., "O Rei Leão 1994 vs 2019")
                const yr = Number(item.year ?? 0);
                if (yr > 0) {
                  const yearKey = `${titleKey}:${yr}`;
                  if (!index[yearKey]) index[yearKey] = val;
                }
              }
            }
          }
        };

        for (const item of allItems) { indexItem(item); }
        job.pagesScanned = 1;

        // ── Always store in memory (no R2 required) ──
        FLIX2_INDEX_CACHE.set(t, { index, builtAt: Date.now() });
        job.summary[t] = Object.keys(index).length;
        job.typesDone.push(t);

        // ── Try R2 write (optional — swallow error if not configured) ──
        try {
          const client = getClient();
          const bucket = getBucket();
          await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: `__flix2-index-${t}.json`,
            Body: JSON.stringify(index),
            ContentType: "application/json",
          }));
        } catch { /* R2 not configured — index lives in memory */ }

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

// ─────────────────────────────────────────────────────────────────────────────
// ── WHAT'S NEW / CATALOG DIFF ─────────────────────────────────────────────────
// Detects new and updated content by comparing catalog snapshots across warm-ups.
//
// How it works:
//  1. After every warm-up, a snapshot `{id, title, tmdb_id, added_at}[]` is
//     written to /tmp/flix2-snapshot-{type}.json.
//  2. On the NEXT warm-up the new catalog is diffed against the saved snapshot:
//     - "added"   = ID not present in the previous snapshot.
//     - "updated" = ID present in both but added_at (last_modified) changed.
//  3. The diff result is kept in CATALOG_DIFF_CACHE (in-memory, reset on restart).
//  4. GET /flix2/whats-new  — filter by added_at in the last N days (fast).
//  5. GET /flix2/catalog-diff — returns the snapshot diff (added / updated).
// ─────────────────────────────────────────────────────────────────────────────

interface SnapshotEntry {
  id:       string;
  title:    string;
  tmdb_id:  number;
  added_at: number;
  type:     string;
}

interface CatalogDiff {
  type:        string;
  snapshotAge: number | null; // ms since snapshot was taken
  added:       SnapshotEntry[];
  updated:     SnapshotEntry[];
  computedAt:  number;
}

const CATALOG_DIFF_CACHE = new Map<string, CatalogDiff>();
const SNAPSHOT_DIR = "/tmp";

function snapshotPath(type: string): string {
  return `${SNAPSHOT_DIR}/flix2-snapshot-${type}.json`;
}

function loadSnapshot(type: string): Map<string, SnapshotEntry> {
  try {
    const raw = readFileSync(snapshotPath(type), "utf-8");
    const entries: SnapshotEntry[] = JSON.parse(raw);
    return new Map(entries.map((e) => [e.id, e]));
  } catch {
    return new Map();
  }
}

function saveSnapshot(type: string, entries: SnapshotEntry[]): void {
  try {
    writeFileSync(snapshotPath(type), JSON.stringify(entries), "utf-8");
  } catch {}
}

// Called after warmCatalogType completes with a fresh catalog.
// Loads the previous snapshot, computes diff, saves new snapshot.
function computeAndSaveDiff(type: string, freshItems: any[]): void {
  const prev = loadSnapshot(type);
  const hasPrev = prev.size > 0;

  const added:   SnapshotEntry[] = [];
  const updated: SnapshotEntry[] = [];
  const newSnapshot: SnapshotEntry[] = [];

  for (const item of freshItems) {
    const entry: SnapshotEntry = {
      id:       String(item.id),
      title:    item.title ?? "",
      tmdb_id:  Number(item.tmdb_id) || 0,
      added_at: Number(item.added_at) || 0,
      type,
    };
    newSnapshot.push(entry);

    if (!hasPrev) continue; // no previous snapshot — skip diff on first run

    const old = prev.get(entry.id);
    if (!old) {
      added.push(entry);
    } else if (entry.added_at > 0 && old.added_at > 0 && entry.added_at !== old.added_at) {
      updated.push(entry);
    }
  }

  // Sort newest first
  const byNewest = (a: SnapshotEntry, b: SnapshotEntry) => b.added_at - a.added_at;
  added.sort(byNewest);
  updated.sort(byNewest);

  let snapshotAge: number | null = null;
  try {
    const raw = readFileSync(snapshotPath(type), "utf-8");
    const entries: SnapshotEntry[] = JSON.parse(raw);
    if (entries.length > 0) snapshotAge = Date.now() - (entries[0]?.added_at ?? 0);
  } catch {}

  CATALOG_DIFF_CACHE.set(type, { type, snapshotAge, added, updated, computedAt: Date.now() });
  saveSnapshot(type, newSnapshot);
}

// ── GET /flix2/whats-new ──────────────────────────────────────────────────────
// Returns content added/updated in the last N days, sorted newest-first.
// Query params:
//   days=7        — how many days back to look (default 7, max 90)
//   types=series,movies,animes — comma-separated (default all three)
//   limit=100     — max items per type (default 100)
router.get("/flix2/whats-new", async (req, res) => {
  const {
    days:      daysStr      = "7",
    types:     typesStr     = "movies,series,animes",
    limit:     limitStr     = "100",
    fallback:  fallbackStr  = "true",
  } = req.query as Record<string, string>;

  const days         = Math.min(Math.max(Number(daysStr)  || 7,  1), 365);
  const limit        = Math.min(Math.max(Number(limitStr) || 100, 1), 500);
  const allowFallback = fallbackStr !== "false";
  const types        = typesStr.split(",").map((t) => t.trim()).filter((t) => FLIX2_TYPES.includes(t));
  const since        = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceUnix    = Math.floor(since / 1000);

  const result: Record<string, any[]> = {};
  let total    = 0;
  let warming  = false;
  let isFallback = false;

  const toItem = (i: any) => ({
    id:         i.id,
    title:      i.title,
    tmdb_id:    i.tmdb_id,
    type:       i.type,
    year:       i.year,
    poster:     i.poster,
    backdrop:   i.backdrop || "",
    overview:   i.overview || i.synopsis || "",
    added_at:   i.added_at,
    added_date: i.added_at ? new Date(i.added_at * 1000).toISOString().slice(0, 10) : null,
  });

  const activeTypes = types.length ? types : FLIX2_TYPES;

  for (const type of activeTypes) {
    const cached = FULL_CATALOG_CACHE.get(type);
    // Fallback: if FULL_CATALOG_CACHE is empty, try XTREAM_RAW_CACHE (populated by any
    // catalog-full request or xtreamFetchAll call, even if warmCatalogType failed)
    const rawCached = !cached ? XTREAM_RAW_CACHE.get(type) : null;
    const data = cached?.data ?? rawCached?.items ?? null;
    if (!data) {
      result[type] = [];
      warming = true;
      // Trigger background warm so next request may succeed
      warmCatalogType(type).catch(() => {});
      continue;
    }

    // Primary: filter by date window
    let items = data
      .filter((i: any) => i.added_at && i.added_at >= sinceUnix)
      .sort((a: any, b: any) => b.added_at - a.added_at)
      .slice(0, limit)
      .map(toItem);

    // Fallback level 1: take N most recently added items (if they have added_at)
    if (items.length === 0 && allowFallback) {
      items = data
        .filter((i: any) => i.added_at > 0)
        .sort((a: any, b: any) => b.added_at - a.added_at)
        .slice(0, limit)
        .map(toItem);
      if (items.length > 0) isFallback = true;
    }

    // Fallback level 2: no added_at info at all — sort by stream ID desc
    // (Xtream assigns ascending IDs so higher ID = more recently added)
    if (items.length === 0 && allowFallback) {
      items = [...data]
        .filter((i: any) => i.poster)
        .sort((a: any, b: any) => Number(b.id) - Number(a.id))
        .slice(0, limit)
        .map(toItem);
      if (items.length > 0) isFallback = true;
    }

    result[type] = items;
    total += items.length;
  }

  // ── Include Drive / R2 registry items ────────────────────────────────────────
  // Registry items are stored independently and would otherwise never appear in
  // the "Recém Adicionados" and type-specific carousels on the Novidades tab.
  try {
    const regItems = await getRegistryCached();
    // Deduplicate by tmdbId — one entry per title
    const seenReg = new Set<string>();
    // Process in reverse-chronological order (most recent addedAt first)
    const sorted = [...regItems].sort((a, b) =>
      new Date(b.addedAt ?? 0).getTime() - new Date(a.addedAt ?? 0).getTime()
    );
    for (const ri of sorted) {
      if (!ri.tmdbId || !ri.title) continue;
      const dedupKey = `${ri.tmdbType}_${ri.tmdbId}`;
      if (seenReg.has(dedupKey)) continue;
      seenReg.add(dedupKey);

      const addedMs = ri.addedAt ? new Date(ri.addedAt).getTime() : 0;
      const addedUnix = Math.floor(addedMs / 1000);
      const addedDate = ri.addedAt ? ri.addedAt.slice(0, 10) : null;

      const poster = await getRegistryItemPoster(ri.tmdbId, ri.tmdbType);

      const regEntry: any = {
        id:         `reg_${ri.id}`,
        title:      ri.title,
        tmdb_id:    ri.tmdbId,
        type:       ri.tmdbType === "movie" ? "filme" : "serie",
        year:       0,
        poster,
        backdrop:   "",
        overview:   "",
        added_at:   addedUnix,
        added_date: addedDate,
        exclusive:  ri.exclusive ?? false,
      };

      // Push into the matching type bucket so it appears in the right carousel
      const targetType = ri.tmdbType === "movie" ? "movies" : "series";
      if (activeTypes.includes(targetType) || activeTypes.includes("animes")) {
        const bucket = activeTypes.includes(targetType) ? targetType : activeTypes[0];
        if (!result[bucket]) result[bucket] = [];
        // Only add if the tmdbId is not already present from Flix2
        const alreadyIn = result[bucket].some((x: any) => Number(x.tmdb_id) === ri.tmdbId);
        if (!alreadyIn) {
          result[bucket].unshift(regEntry); // prepend so drive items show first
          total += 1;
        }
      }
    }
  } catch {
    // Registry read failed — continue without drive items
  }

  res.json({
    ok:       true,
    warming,
    fallback: isFallback,
    since:    new Date(since).toISOString(),
    days,
    total,
    cached: Object.fromEntries(
      activeTypes.map((t) => {
        const c = FULL_CATALOG_CACHE.get(t);
        return [t, c ? { warm: true, items: c.data.length, cachedAt: c.cachedAt } : { warm: false }];
      })
    ),
    ...result,
  });
});

// ── GET /flix2/cinema-2026 ────────────────────────────────────────────────────
// Returns only genuine 2026-release movies using TMDB title matching.
// Falls back to added_at>=Jan2026 if TMDB map is still warming.
// Response: { ok, warming?, total, topRated:[...], months:[{key,label,items:[...]}] }
router.get("/flix2/cinema-2026", async (req, res) => {
  const MONTH_PT: Record<number, string> = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
  };

  // ── 1. Ensure Xtream catalog is warm ──────────────────────────────────────
  const cached = FULL_CATALOG_CACHE.get("movies");
  // Fall back to XTREAM_RAW_CACHE when FULL_CATALOG_CACHE hasn't populated yet
  // (e.g. production startup where warmCatalogType("movies") failed initially)
  const rawMovies = !cached ? XTREAM_RAW_CACHE.get("movies") : null;
  const moviesData = cached?.data ?? rawMovies?.items ?? null;

  // ── 1b. TMDB fallback: if Xtream movies unavailable, build from TMDB ──────
  // get_vod_streams may be blocked from Replit production IPs — use TMDB
  // now_playing + upcoming (3 pages each) as reliable fallback source.
  if (!moviesData) {
    warmCatalogType("movies").catch(() => {}); // trigger background warm for next time
    try {
      const TMDB_KEY = process.env.TMDB_API_KEY ?? "8f0beb08cf016ec8de49e454e09879ec";
      const MONTH_PT_LOCAL: Record<number, string> = {
        1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
        5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
        9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
      };
      const fetchTmdbPage = async (type: "now_playing" | "upcoming", page: number) => {
        const url = `https://api.themoviedb.org/3/movie/${type}?api_key=${TMDB_KEY}&language=pt-BR&page=${page}&region=BR`;
        const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
        const d: any = await r.json();
        return (d.results ?? []) as any[];
      };
      // Fetch 3 pages of now_playing + 3 pages of upcoming in parallel
      const pages = await Promise.allSettled([
        fetchTmdbPage("now_playing", 1), fetchTmdbPage("now_playing", 2), fetchTmdbPage("now_playing", 3),
        fetchTmdbPage("upcoming", 1),   fetchTmdbPage("upcoming", 2),   fetchTmdbPage("upcoming", 3),
      ]);
      const seen = new Set<number>();
      const tmdbItems: any[] = [];
      for (const p of pages) {
        if (p.status !== "fulfilled") continue;
        for (const m of p.value) {
          if (!m.id || seen.has(m.id)) continue;
          seen.add(m.id);
          const rdate: string = m.release_date ?? "";
          // Only include movies from current year or later
          if (rdate && !rdate.startsWith("2025") && !rdate.startsWith("2026") && !rdate.startsWith("2027")) continue;
          tmdbItems.push(m);
        }
      }
      if (tmdbItems.length > 0) {
        const currentYearStr2 = String(new Date().getFullYear());
        const monthMap2: Record<string, any[]> = {};
        for (const m of tmdbItems) {
          const rdate: string = m.release_date ?? "";
          const key2 = rdate.length >= 7 ? rdate.slice(0, 7) : `${currentYearStr2}-01`;
          if (!monthMap2[key2]) monthMap2[key2] = [];
          monthMap2[key2].push({
            id:           m.id,
            title:        m.title ?? m.original_title ?? "",
            tmdb_id:      m.id,
            year:         rdate ? parseInt(rdate.slice(0, 4), 10) : new Date().getFullYear(),
            poster:       m.poster_path  ? TMDB_IMG_SRV(m.poster_path,  "w342")! : "",
            backdrop:     m.backdrop_path ? TMDB_IMG_SRV(m.backdrop_path,"w780")! : "",
            rating:       m.vote_average > 0 ? String((m.vote_average as number).toFixed(1)) : "0",
            synopsis:     m.overview ?? "",
            release_date: rdate,
            added_at:     rdate ? Math.floor(new Date(rdate).getTime() / 1000) : 0,
          });
        }
        const months2 = Object.entries(monthMap2)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([key2, its]) => {
            const [yearStr2, monthStr2] = key2.split("-");
            const monthNum2 = parseInt(monthStr2, 10);
            const label2 = `${MONTH_PT_LOCAL[monthNum2] ?? monthStr2} ${yearStr2}`;
            return { key: key2, label: label2, items: its };
          });
        const topRated2 = [...tmdbItems]
          .filter((m) => m.vote_average >= 6)
          .sort((a, b) => b.vote_average - a.vote_average)
          .slice(0, 20)
          .map((m) => ({
            id: m.id, title: m.title ?? "", tmdb_id: m.id,
            year: m.release_date ? parseInt(m.release_date.slice(0, 4), 10) : new Date().getFullYear(),
            release_date: m.release_date ?? "",
            poster:   m.poster_path  ? TMDB_IMG_SRV(m.poster_path,  "w342")! : "",
            backdrop: m.backdrop_path ? TMDB_IMG_SRV(m.backdrop_path,"w780")! : "",
            rating:   m.vote_average > 0 ? String((m.vote_average as number).toFixed(1)) : "0",
            synopsis: m.overview ?? "",
          }));
        res.json({ ok: true, total: tmdbItems.length, topRated: topRated2, months: months2 });
        return;
      }
    } catch {
      // TMDB also failed — fall through to warming response
    }
    res.json({ ok: false, warming: true, total: 0, topRated: [], months: [] });
    return;
  }

  // ── 2. Ensure TMDB 2026 map is warm ───────────────────────────────────────
  if (TMDB_2026_MAP.size === 0) {
    // Trigger async warm and ask client to retry — warmTmdb2026 always has a key now
    warmTmdb2026().catch(() => {});
    res.json({ ok: false, warming: true, total: 0, topRated: [], months: [] });
    return;
  }

  // ── 3. Filter Xtream catalog by TMDB 2026 title match ────────────────────
  const JAN_2026 = 1767225600; // fallback: added_at >= Jan 1 2026

  // seenTmdbIds prevents duplicate entries when multiple Xtream items share the same TMDB film
  const seenTmdbIds = new Set<number>();
  const items2026: Array<any & { _tmdbDate: string; _tmdbVote: number }> = [];
  for (const item of moviesData) {
    if (!item.title) continue;
    const key = normTitle(item.title);
    const tmdbEntry = TMDB_2026_MAP.get(key);
    if (tmdbEntry) {
      // Require TMDB to have a poster — filters out false title matches (e.g. old films with same name)
      if (!tmdbEntry.posterPath) continue;
      if (seenTmdbIds.has(tmdbEntry.tmdbId)) continue;
      seenTmdbIds.add(tmdbEntry.tmdbId);
      items2026.push({ ...item, _tmdbDate: tmdbEntry.date, _tmdbVote: tmdbEntry.vote, _tmdbEntry: tmdbEntry });
    }
  }

  // ── 3b. Fallback when TMDB title matching found nothing ───────────────────
  // Level 1: Use added_at >= Jan 1 2026 OR year >= 2026 OR release_date starts with "2026"
  if (items2026.length === 0) {
    const fallback = moviesData
      .filter((i: any) => i.title && i.poster && (
        (i.added_at && i.added_at >= JAN_2026) ||
        Number(i.year) >= 2026 ||
        (i.release_date && String(i.release_date).startsWith("2026"))
      ))
      .sort((a: any, b: any) => (b.added_at ?? 0) - (a.added_at ?? 0))
      .slice(0, 300);
    for (const item of fallback) {
      const dateStr = item.added_at
        ? new Date(item.added_at * 1000).toISOString().slice(0, 10)
        : (item.release_date || "2026-01-01");
      items2026.push({
        ...item,
        _tmdbDate:  dateStr,
        _tmdbVote:  Number(item.rating ?? 0),
        _tmdbEntry: null,
      });
    }
  }

  // Level 2: absolute fallback — if still nothing, show the newest 200 movies
  // by stream ID (higher ID = more recently added on Xtream) so Cinema is never blank.
  if (items2026.length === 0) {
    const fallback2 = [...moviesData]
      .filter((i: any) => i.title && i.poster)
      .sort((a: any, b: any) => Number(b.id) - Number(a.id))
      .slice(0, 200);
    const currentYear = new Date().getFullYear();
    for (const item of fallback2) {
      const releaseYear = item.year || item.release_date?.slice(0, 4) || currentYear;
      const dateStr = item.release_date || `${releaseYear}-01-01`;
      items2026.push({
        ...item,
        _tmdbDate:  dateStr,
        _tmdbVote:  Number(item.rating ?? 0),
        _tmdbEntry: null,
      });
    }
  }

  // ── 4. Group by TMDB release month ────────────────────────────────────────
  const currentYearStr = String(new Date().getFullYear());
  const monthMap: Record<string, any[]> = {};
  for (const item of items2026) {
    // Use TMDB release_date for grouping; fall back to added_at month
    let key: string;
    if (item._tmdbDate && item._tmdbDate.length >= 7) {
      key = item._tmdbDate.slice(0, 7); // "2026-04"
    } else {
      const d = new Date((item.added_at ?? 0) * 1000);
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    // Keep 2026 keys; for absolute fallback items use currentYear key
    if (!key.startsWith("2026") && !key.startsWith(currentYearStr)) continue;
    if (!monthMap[key]) monthMap[key] = [];
    const synopsis2026 = item._tmdbEntry?.overview || item._tmdbEntry?.overviewEn || item.synopsis || "";
    monthMap[key].push({
      id:       item.id,
      title:    item._tmdbEntry?.ptTitle || item.title,
      tmdb_id:  item._tmdbEntry?.tmdbId || item.tmdb_id,
      year:     2026,
      poster:   TMDB_IMG_SRV(item._tmdbEntry?.posterPath, "w342") ?? item.poster,
      backdrop: TMDB_IMG_SRV(item._tmdbEntry?.backdropPath, "w780") ?? item.backdrop ?? "",
      rating:   item._tmdbVote > 0 ? String(item._tmdbVote.toFixed(1)) : (item.rating ?? "0"),
      synopsis: synopsis2026,
      added_at: item.added_at ?? 0,
      release_date: item._tmdbDate ?? "",
    });
  }

  const months = Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => {
      const [yearStr, monthStr] = key.split("-");
      const monthNum = parseInt(monthStr, 10);
      const label = `${MONTH_PT[monthNum] ?? monthStr} ${yearStr}`;
      return { key, label, items };
    });

  // ── 5. Top rated: best-rated 2026 items only ─────────────────────────────
  const topRated = [...items2026]
    .filter((i) => (i._tmdbVote ?? 0) >= 5)
    .sort((a, b) => (b._tmdbVote ?? 0) - (a._tmdbVote ?? 0))
    .slice(0, 20)
    .map((i) => ({
      id: i.id,
      title: i._tmdbEntry?.ptTitle || i.title,
      tmdb_id: i._tmdbEntry?.tmdbId || i.tmdb_id,
      year: 2026, release_date: i._tmdbDate ?? "",
      poster: TMDB_IMG_SRV(i._tmdbEntry?.posterPath, "w342") ?? i.poster,
      backdrop: TMDB_IMG_SRV(i._tmdbEntry?.backdropPath, "w780") ?? i.backdrop ?? "",
      rating: i._tmdbVote > 0 ? String(i._tmdbVote.toFixed(1)) : (i.rating ?? "0"),
      synopsis: i._tmdbEntry?.overview || i._tmdbEntry?.overviewEn || i.synopsis || "",
    }));

  res.json({ ok: true, total: items2026.length, topRated, months });
});

// ── GET /flix2/catalog-diff ───────────────────────────────────────────────────
// Returns the diff computed between the last two catalog snapshots.
// "added"   = titles that appeared since the previous snapshot.
// "updated" = titles that existed but had their last_modified timestamp change
//             (new episode added, metadata refresh, etc.)
// Query params:
//   types=series,movies,animes  (default all)
router.get("/flix2/catalog-diff", (req, res) => {
  const { types: typesStr = "movies,series,animes" } = req.query as Record<string, string>;
  const types = typesStr.split(",").map((t) => t.trim()).filter((t) => FLIX2_TYPES.includes(t));

  const diffs: Record<string, any> = {};
  let totalAdded = 0;
  let totalUpdated = 0;

  for (const type of (types.length ? types : FLIX2_TYPES)) {
    const diff = CATALOG_DIFF_CACHE.get(type);
    if (!diff) {
      diffs[type] = { ready: false, message: "Snapshot not yet computed — wait for warm-up to complete." };
      continue;
    }
    diffs[type] = {
      ready:        true,
      computedAt:   new Date(diff.computedAt).toISOString(),
      addedCount:   diff.added.length,
      updatedCount: diff.updated.length,
      added:        diff.added,
      updated:      diff.updated,
    };
    totalAdded   += diff.added.length;
    totalUpdated += diff.updated.length;
  }

  res.json({
    ok:           true,
    totalAdded,
    totalUpdated,
    note:         "Diff is computed on each catalog warm-up (every 30 min). " +
                  "First run after server start shows no diff — needs two snapshots.",
    types:        diffs,
  });
});

// ── GET /flix2/suppress ────────────────────────────────────────────────────────
// Lists all admin-suppressed stream URLs.
router.get("/flix2/suppress", (_req, res) => {
  const entries = [...FLIX2_SUPPRESSION_MAP.entries()].map(([url, v]) => ({ url, ...v }));
  res.json({ ok: true, count: entries.length, suppressions: entries });
});

// ── POST /flix2/suppress ───────────────────────────────────────────────────────
// Adds a stream URL to the suppression list.
// Body: { url: string; reason?: string }
router.post("/flix2/suppress", (req, res) => {
  const { url, reason = "" } = req.body ?? {};
  if (!url || typeof url !== "string") {
    res.status(400).json({ ok: false, error: "url is required" });
    return;
  }
  const entry = { reason: String(reason), suppressedAt: new Date().toISOString() };
  FLIX2_SUPPRESSION_MAP.set(url, entry);
  saveSuppressions();
  res.json({ ok: true, url, ...entry });
});

// ── DELETE /flix2/suppress ─────────────────────────────────────────────────────
// Removes a stream URL from the suppression list.
// Body: { url: string }
router.delete("/flix2/suppress", (req, res) => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") {
    res.status(400).json({ ok: false, error: "url is required" });
    return;
  }
  const existed = FLIX2_SUPPRESSION_MAP.delete(url);
  if (existed) saveSuppressions();
  res.json({ ok: true, removed: existed, url });
});

// ── GET /flix2/diagnose ────────────────────────────────────────────────────────
// Analyzes the Flix 2.0 catalog for data quality issues:
//   • Duplicate stream URLs (same .mp4 assigned to multiple titles/tmdb_ids)
//   • tmdb_id coverage stats (how many items have a valid TMDB mapping)
//   • tmdb_id conflicts (same stream URL under different TMDB IDs — wrong year labeling)
// Only reads from in-memory caches — no R2 or Xtream API calls.
router.get("/flix2/diagnose", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const types = ["movies", "series", "animes"];

  const stats: Record<string, { total: number; withTmdb: number; withoutTmdb: number }> = {};
  // url → list of { type, id, title, year, tmdb_id }
  const urlMap = new Map<string, Array<{ type: string; id: string; title: string; year: number; tmdb_id: number }>>();

  for (const t of types) {
    const raw = XTREAM_RAW_CACHE.get(t);
    if (!raw) { stats[t] = { total: 0, withTmdb: 0, withoutTmdb: 0 }; continue; }

    let withTmdb = 0;
    let withoutTmdb = 0;

    for (const item of raw.items) {
      const hasTmdb = Number(item.tmdb_id) > 0;
      if (hasTmdb) withTmdb++; else withoutTmdb++;

      const url = item.stream_url ?? "";
      if (!url) continue;
      if (!urlMap.has(url)) urlMap.set(url, []);
      urlMap.get(url)!.push({
        type:    t,
        id:      String(item.id ?? item.series_id ?? ""),
        title:   item.title ?? item.name ?? "",
        year:    Number(item.year ?? 0),
        tmdb_id: Number(item.tmdb_id ?? 0),
      });
    }

    stats[t] = { total: raw.items.length, withTmdb, withoutTmdb };
  }

  // Collect duplicates: url groups with more than 1 item
  const duplicateGroups: Array<{ url: string; items: typeof urlMap extends Map<string, infer V> ? V : never }> = [];
  for (const [url, items] of urlMap.entries()) {
    if (items.length > 1) duplicateGroups.push({ url, items });
  }

  // Sort by item count desc (most conflicts first)
  duplicateGroups.sort((a, b) => b.items.length - a.items.length);

  // tmdb_id conflicts: groups where same url has items with different tmdb_ids (both > 0)
  const tmdbConflicts = duplicateGroups.filter((g) => {
    const ids = g.items.map((i) => i.tmdb_id).filter((id) => id > 0);
    return new Set(ids).size > 1;
  });

  res.json({
    ok: true,
    cacheWarm: types.filter((t) => XTREAM_RAW_CACHE.has(t)),
    stats,
    totalDuplicateGroups: duplicateGroups.length,
    totalTmdbConflicts:   tmdbConflicts.length,
    duplicateGroups:      duplicateGroups.slice(0, limit),
    tmdbConflicts:        tmdbConflicts.slice(0, 50),
  });
});

export default router;
