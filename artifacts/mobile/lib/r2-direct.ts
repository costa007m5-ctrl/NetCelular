/**
 * lib/r2-direct.ts
 * Cloudflare R2 client direto - sem API server.
 * Credenciais embutidas no APK via EXPO_PUBLIC_ vars (baked at Codemagic build time).
 */

// ─── Credenciais ─────────────────────────────────────────────────────────────
const ACCOUNT_ID = process.env.EXPO_PUBLIC_R2_ACCOUNT_ID    ?? "9827b92a6b3a621e8c6f50274e68f37b";
const ACCESS_KEY  = process.env.EXPO_PUBLIC_R2_ACCESS_KEY_ID  ?? "9e96806804e8815dfd9580ec062fa0c5";
const SECRET_KEY  = process.env.EXPO_PUBLIC_R2_SECRET_ACCESS_KEY ?? "854a8ee198112f783b99b870ac9f3299340a88176d5a8c198e35269e8cd3cd3a";
const BUCKET      = process.env.EXPO_PUBLIC_R2_BUCKET_NAME   ?? "netplay-media-storage";
const ENDPOINT    = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const REGION      = "auto";
const SERVICE     = "s3";

// ─── TMDB ─────────────────────────────────────────────────────────────────────
const TMDB_KEY  = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "pt-BR";

// ─── AWS Sig V4 ───────────────────────────────────────────────────────────────

const _enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256str(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", _enc.encode(s)));
}

async function hmacSha256(key: ArrayBuffer | Uint8Array<ArrayBuffer>, msg: string): Promise<ArrayBuffer> {
  const ck = await crypto.subtle.importKey(
    "raw", key instanceof Uint8Array ? key.buffer as ArrayBuffer : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return crypto.subtle.sign("HMAC", ck, _enc.encode(msg));
}

async function getDerivedKey(dateStamp: string): Promise<ArrayBuffer> {
  const k0 = _enc.encode(`AWS4${SECRET_KEY}`);
  const k1 = await hmacSha256(k0, dateStamp);
  const k2 = await hmacSha256(k1, REGION);
  const k3 = await hmacSha256(k2, SERVICE);
  return hmacSha256(k3, "aws4_request");
}

function nowDt(): { dt: string; d: string } {
  const iso = new Date().toISOString().replace(/[:-]/g, "");
  return { dt: iso.split(".")[0] + "Z", d: iso.slice(0, 8) };
}

function encodePathKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

// ─── Core fetch (signed) ──────────────────────────────────────────────────────

async function s3Fetch(
  method: string,
  objectKey: string,
  qp: Record<string, string> = {},
  body = "",
  extra: Record<string, string> = {},
): Promise<Response> {
  const { dt, d } = nowDt();
  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const rawPath = objectKey
    ? `/${BUCKET}/${encodePathKey(objectKey)}`
    : `/${BUCKET}/`;

  const payloadHash = await sha256str(body);

  const hdrs: Record<string, string> = {
    host,
    "x-amz-date": dt,
    "x-amz-content-sha256": payloadHash,
    ...extra,
  };
  if (body) {
    hdrs["content-length"] = String(_enc.encode(body).byteLength);
    if (!hdrs["content-type"]) hdrs["content-type"] = "application/octet-stream";
  }

  const sortedHdrNames = Object.keys(hdrs).sort();
  const canonHdrs = sortedHdrNames.map((k) => `${k}:${hdrs[k]}\n`).join("");
  const signedHdrs = sortedHdrNames.join(";");

  const sortedQS = Object.entries(qp)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonical = [method, rawPath, sortedQS, canonHdrs, signedHdrs, payloadHash].join("\n");
  const credScope = `${d}/${REGION}/${SERVICE}/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", dt, credScope, await sha256str(canonical)].join("\n");

  const dk = await getDerivedKey(d);
  const sig = toHex(await hmacSha256(dk, sts));
  const auth = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credScope}, SignedHeaders=${signedHdrs}, Signature=${sig}`;

  const url = sortedQS ? `${ENDPOINT}${rawPath}?${sortedQS}` : `${ENDPOINT}${rawPath}`;

  const fetchHdrs: Record<string, string> = { ...hdrs, Authorization: auth };
  delete fetchHdrs.host;

  return fetch(url, { method, headers: fetchHdrs, body: body || undefined });
}

// ─── XML parser for ListObjectsV2 ─────────────────────────────────────────────

interface S3Obj { key: string; size: number; lastModified: string }
interface S3ListResult { objects: S3Obj[]; prefixes: string[]; isTruncated: boolean; nextToken?: string }

function parseListXml(xml: string): S3ListResult {
  const objects: S3Obj[] = [];
  const prefixes: string[] = [];

  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const b = m[1];
    const key = b.match(/<Key>([^<]*)<\/Key>/)?.[1] ?? "";
    const size = parseInt(b.match(/<Size>([^<]*)<\/Size>/)?.[1] ?? "0", 10);
    const lm = b.match(/<LastModified>([^<]*)<\/LastModified>/)?.[1] ?? "";
    if (key) objects.push({ key, size, lastModified: lm });
  }

  for (const m of xml.matchAll(/<CommonPrefixes>[\s\S]*?<Prefix>([^<]+)<\/Prefix>[\s\S]*?<\/CommonPrefixes>/g)) {
    if (m[1]) prefixes.push(m[1]);
  }

  return {
    objects,
    prefixes,
    isTruncated: /<IsTruncated>true<\/IsTruncated>/i.test(xml),
    nextToken: xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1],
  };
}

// ─── Core S3 ops ─────────────────────────────────────────────────────────────

async function listObjectsRaw(
  prefix = "",
  delimiter?: string,
  continuationToken?: string,
  maxKeys = 1000,
): Promise<S3ListResult> {
  const qp: Record<string, string> = { "list-type": "2", "max-keys": String(maxKeys) };
  if (prefix) qp.prefix = prefix;
  if (delimiter !== undefined) qp.delimiter = delimiter;
  if (continuationToken) qp["continuation-token"] = continuationToken;
  const res = await s3Fetch("GET", "", qp);
  if (!res.ok) throw new Error(`R2 list: ${res.status}`);
  return parseListXml(await res.text());
}

async function getRaw(key: string): Promise<string> {
  const res = await s3Fetch("GET", key);
  if (!res.ok) throw new Error(`R2 get: ${res.status}`);
  return res.text();
}

async function putRaw(key: string, body: string, ct = "application/json"): Promise<void> {
  const res = await s3Fetch("PUT", key, {}, body, { "content-type": ct });
  if (!res.ok) throw new Error(`R2 put: ${res.status}`);
}

async function delRaw(key: string): Promise<void> {
  const res = await s3Fetch("DELETE", key);
  if (!res.ok) throw new Error(`R2 delete: ${res.status}`);
}

async function copyRaw(src: string, dst: string): Promise<void> {
  const res = await s3Fetch("PUT", dst, {}, "", { "x-amz-copy-source": `/${BUCKET}/${src}` });
  if (!res.ok) throw new Error(`R2 copy: ${res.status}`);
}

// ─── Presigned URL ────────────────────────────────────────────────────────────

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const { dt, d } = nowDt();
  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const rawPath = `/${BUCKET}/${encodePathKey(key)}`;
  const credScope = `${d}/${REGION}/${SERVICE}/aws4_request`;

  const qp: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ACCESS_KEY}/${credScope}`,
    "X-Amz-Date": dt,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  };

  const sortedQS = Object.entries(qp)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonical = ["GET", rawPath, sortedQS, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const credScope2 = `${d}/${REGION}/${SERVICE}/aws4_request`;
  const sts = ["AWS4-HMAC-SHA256", dt, credScope2, await sha256str(canonical)].join("\n");
  const dk = await getDerivedKey(d);
  const sig = toHex(await hmacSha256(dk, sts));

  return `${ENDPOINT}${rawPath}?${sortedQS}&X-Amz-Signature=${sig}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVideo(key: string): boolean {
  return /\.(mp4|mkv|mov|avi|webm|m4v|ts|m3u8)$/i.test(key);
}

function isLikelyVideo(key: string, size: number): boolean {
  if (isVideo(key)) return true;
  const name = (key.split("/").pop() ?? key).toLowerCase();
  return !/\.(jpg|jpeg|png|gif|webp|txt|json|pdf|zip|rar|keep)$/i.test(name) && size > 5_000_000;
}

function fType(key: string): "video" | "image" | "other" {
  if (isVideo(key)) return "video";
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(key)) return "image";
  return "other";
}

function parseEpNum(name: string): number | null {
  const m =
    name.match(/[Ee]p?0*(\d+)/) ??
    name.match(/[Ss]\d+[Ee]0*(\d+)/) ??
    name.match(/[-_ ]0*(\d+)[-_ .]/) ??
    name.match(/\b(\d+)\b/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── API-level operations (match API server endpoints) ────────────────────────

export async function apiEpisodes(prefix: string) {
  const r = await listObjectsRaw(prefix, undefined, undefined, 500);
  const episodes = r.objects
    .filter((o) => o.key !== prefix && isLikelyVideo(o.key, o.size))
    .map((o) => {
      const name = o.key.split("/").pop() ?? o.key;
      return { key: o.key, name, size: o.size, lastModified: o.lastModified, episode: parseEpNum(name) };
    })
    .sort((a, b) => (a.episode ?? 999) - (b.episode ?? 999));
  return { episodes };
}

export async function apiList(prefix: string, delimiter?: string, noFallback = false, token?: string) {
  const r = await listObjectsRaw(prefix, delimiter, token);

  const folders = r.prefixes.map((p) => ({
    type: "folder" as const,
    key: p,
    name: p.replace(prefix, "").replace(/\/$/, "") || p,
  }));

  let files = r.objects
    .filter((o) => o.key !== prefix && !o.key.endsWith("__registry.json") && !o.key.endsWith("__catalog-meta.json"))
    .map((o) => ({
      type: "file" as const,
      key: o.key,
      name: o.key.split("/").pop() ?? o.key,
      size: o.size,
      lastModified: o.lastModified,
      fileType: fType(o.key),
      isVideo: isLikelyVideo(o.key, o.size),
    }));

  if (!noFallback && delimiter && !files.some((f) => f.isVideo) && folders.length > 0) {
    const rec = await listObjectsRaw(prefix, undefined, undefined);
    const rf = rec.objects
      .filter((o) => o.key !== prefix && !o.key.endsWith("__registry.json") && !o.key.endsWith("__catalog-meta.json"))
      .map((o) => ({
        type: "file" as const,
        key: o.key,
        name: o.key.split("/").pop() ?? o.key,
        size: o.size,
        lastModified: o.lastModified,
        fileType: fType(o.key),
        isVideo: isLikelyVideo(o.key, o.size),
      }));
    if (rf.some((f) => f.isVideo)) files = rf;
  }

  return { bucket: BUCKET, prefix, folders, files, isTruncated: r.isTruncated, nextToken: r.nextToken ?? null };
}

export async function apiSignedUrl(key: string, expires = 3600) {
  if (key.endsWith("/")) {
    const r = await listObjectsRaw(key, undefined, undefined);
    const vid = r.objects.find((o) => isLikelyVideo(o.key, o.size));
    if (!vid) throw new Error("Nenhum vídeo encontrado na pasta");
    key = vid.key;
  }
  const url = await getPresignedUrl(key, expires);
  return { url, key, bucket: BUCKET, expiresIn: expires };
}

export async function apiGetRegistry() {
  try {
    return JSON.parse(await getRaw("__registry.json"));
  } catch {
    return { version: 1, items: [] };
  }
}

export async function apiAddRegistry(item: Record<string, unknown>) {
  const reg = await apiGetRegistry();
  const idx = reg.items.findIndex((i: any) => i.id === item.id);
  if (idx >= 0) reg.items[idx] = item; else reg.items.push(item);
  await putRaw("__registry.json", JSON.stringify(reg, null, 2));
  return { ok: true };
}

export async function apiDelete(key: string) {
  await delRaw(key);
  return { ok: true };
}

export async function apiMove(src: string, dst: string) {
  await copyRaw(src, dst);
  await delRaw(src);
  return { ok: true };
}

export async function apiMkdir(prefix: string) {
  const k = prefix.endsWith("/") ? prefix : `${prefix}/`;
  await putRaw(k, "", "application/x-directory");
  return { ok: true };
}

export async function apiTmdbSearch(q: string, type: string) {
  const ep = type === "movie" ? "movie" : type === "tv" ? "tv" : "multi";
  const res = await fetch(
    `${TMDB_BASE}/search/${ep}?api_key=${TMDB_KEY}&language=${TMDB_LANG}&query=${encodeURIComponent(q)}&page=1`,
  );
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  const results = (data.results ?? []).slice(0, 10).map((r: any) => ({
    id: r.id,
    title: r.title ?? r.name,
    poster_path: r.poster_path,
    media_type: r.media_type ?? ep,
  }));
  return { results };
}

export async function apiRenameFolder(oldPrefix: string, newPrefix: string) {
  const r = await listObjectsRaw(oldPrefix, undefined, undefined);
  for (const obj of r.objects) {
    const nk = newPrefix + obj.key.slice(oldPrefix.length);
    await copyRaw(obj.key, nk);
    await delRaw(obj.key);
  }
  return { ok: true };
}

export async function apiCatalogMeta(key: string, tmdbId?: number, tmdbType?: string, displayName?: string) {
  let meta: any;
  try { meta = JSON.parse(await getRaw("__catalog-meta.json")); }
  catch { meta = { version: 1, overrides: {} }; }
  meta.overrides[key] = { tmdbId, tmdbType, displayName };
  await putRaw("__catalog-meta.json", JSON.stringify(meta, null, 2));
  return { ok: true };
}

export async function apiCatalog() {
  const r = await listObjectsRaw("", "/");
  const entries = r.prefixes
    .filter((p) => !p.replace(/\/$/, "").startsWith("__"))
    .map((p) => ({ key: p, name: p.replace(/\/$/, ""), type: "unknown" as const, seasons: [], tmdb: null }));
  return { catalog: entries, cached: false, builtAt: new Date().toISOString() };
}

// ─── Universal router (drop-in replacement for apiFetch / apiPost) ────────────

export async function r2Route<T>(path: string, options?: RequestInit): Promise<T> {
  const u = new URL(`http://r2${path}`);
  const route = u.pathname;
  const q = (k: string) => u.searchParams.get(k) ?? "";
  const body = options?.body ? JSON.parse(options.body as string) : null;

  let result: unknown;

  if (route === "/catalog") {
    result = await apiCatalog();
  } else if (route === "/episodes") {
    result = await apiEpisodes(q("prefix"));
  } else if (route === "/list") {
    const delim = u.searchParams.has("delimiter") ? q("delimiter") : "/";
    result = await apiList(q("prefix"), delim || undefined, q("noFallback") === "true", q("token") || undefined);
  } else if (route === "/signed-url") {
    result = await apiSignedUrl(q("key"));
  } else if (route === "/registry") {
    result = await apiGetRegistry();
  } else if (route === "/registry/add") {
    result = await apiAddRegistry(body);
  } else if (route === "/delete") {
    result = await apiDelete(q("key"));
  } else if (route === "/move") {
    result = await apiMove(body.src, body.dst);
  } else if (route === "/mkdir") {
    result = await apiMkdir(body.prefix);
  } else if (route === "/tmdb-search") {
    result = await apiTmdbSearch(q("q"), q("type"));
  } else if (route === "/rename-folder") {
    result = await apiRenameFolder(body.oldPrefix, body.newPrefix);
  } else if (route === "/catalog-meta") {
    result = await apiCatalogMeta(body.key, body.tmdbId, body.tmdbType, body.displayName);
  } else if (route.startsWith("/job/")) {
    result = { status: "done", progress: 100, downloaded: 0, total: 0 };
  } else if (route === "/download-url") {
    throw new Error("Download via servidor não disponível em modo direto. Use o app web.");
  } else {
    throw new Error(`Endpoint desconhecido: ${route}`);
  }

  return result as T;
}
