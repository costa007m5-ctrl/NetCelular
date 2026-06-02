import { Router } from "express";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
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

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: {} });

// ── S3 client ─────────────────────────────────────────────────────────────────

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

function getBucket(query?: any): string {
  const name = process.env["R2_BUCKET_NAME"] ?? query?.bucket;
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
  tmdbId: number;
  tmdbType: "movie" | "tv";
  title: string;
  label: string;
  season: number | null;
  episode: number | null;
  addedAt: string;
}

interface Registry { version: number; items: RegistryItem[] }

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

async function buildCatalog(client: S3Client, bucket: string): Promise<CatalogEntry[]> {
  const topPrefixes = await listPrefixes(client, bucket, "");
  const entries: CatalogEntry[] = [];

  for (const titlePrefix of topPrefixes) {
    const name = titlePrefix.replace(/\/$/, "");
    if (name === "__registry") continue; // skip internal

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
    const hasVideos = !isSeries && await hasVideoFiles(client, bucket, titlePrefix);
    // Search TMDB without a hint first to get accurate media_type
    const tmdbMatch = await searchTmdb(name, isSeries ? "tv" : hasVideos ? "movie" : undefined);
    // Use TMDB media_type to correct series detection (flat episode structure)
    const type: CatalogEntry["type"] = isSeries ? "tv"
      : tmdbMatch?.media_type === "tv" ? "tv"
      : (tmdbMatch?.media_type === "movie" || hasVideos) ? "movie"
      : "unknown";
    entries.push({ key: titlePrefix, name, type, seasons, tmdb: tmdbMatch });
    await new Promise((r) => setTimeout(r, 150));
  }

  return entries;
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

    const entries = await buildCatalog(client, bucket);
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
    const delimiter = (req.query["delimiter"] as string) ?? "/";
    const continuationToken = (req.query["token"] as string) ?? undefined;

    const cmd = new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: delimiter, MaxKeys: 500, ContinuationToken: continuationToken });
    const data = await client.send(cmd);

    const folders = (data.CommonPrefixes ?? []).map((p) => ({
      type: "folder" as const,
      key: p.Prefix!,
      name: p.Prefix!.replace(prefix, "").replace(/\/$/, "") || p.Prefix!,
    }));

    const files = (data.Contents ?? [])
      .filter((o) => o.Key !== prefix && !o.Key?.endsWith("__registry.json"))
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

// GET /signed-url
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
        const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!response.ok) throw new Error(`HTTP ${response.status} from source URL`);

        const contentLength = Number(response.headers.get("content-length") ?? 0);
        job.total = contentLength;
        job.status = "uploading";

        const contentType = response.headers.get("content-type") ?? "application/octet-stream";

        // Auto-append video extension if the destination key has none
        let finalKey = key;
        if (!isVideo(key) && contentType.startsWith("video/")) {
          const rawExt = contentType.split("/")[1]?.split(";")[0]?.trim() ?? "mp4";
          const ext = rawExt === "quicktime" ? "mov" : rawExt === "x-matroska" ? "mkv" : rawExt;
          finalKey = `${key}.${ext}`;
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
    if (!item?.r2Key || !item?.tmdbId) { res.status(400).json({ error: "item with r2Key and tmdbId required" }); return; }

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

// ── NEW: TMDB search proxy ─────────────────────────────────────────────────────
// GET /tmdb-search?q=...&type=multi|movie|tv
router.get("/tmdb-search", async (req, res) => {
  try {
    const q = (req.query["q"] as string ?? "").trim();
    const type = (req.query["type"] as string) ?? "multi";
    if (!q) { res.status(400).json({ error: "q required" }); return; }

    let results: any[] = [];
    if (type === "movie") {
      const r = await tmdb.search.movies(q, 1);
      results = ((r as any).results?.slice(0, 10) ?? []).map((x: any) => ({ ...x, media_type: "movie" }));
    } else if (type === "tv") {
      const r = await tmdb.search.tv(q, 1);
      results = ((r as any).results?.slice(0, 10) ?? []).map((x: any) => ({ ...x, title: x.name, media_type: "tv" }));
    } else {
      const r = await tmdb.search.multi(q, 1);
      results = ((r as any).results ?? [])
        .filter((x: any) => x.media_type === "movie" || x.media_type === "tv")
        .slice(0, 10)
        .map((x: any) => ({ ...x, title: x.title ?? x.name }));
    }
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "error" });
  }
});

export default router;
