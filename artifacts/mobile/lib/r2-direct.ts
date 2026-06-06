/**
 * lib/r2-direct.ts
 * Cloudflare R2 client direto - sem API server, sem crypto.subtle.
 * Usa SHA-256 / HMAC-SHA256 puro em JS (compatível com Hermes/Android).
 */
import { Platform } from "react-native";
import { getApiBase } from "@/lib/api";

// ─── Credenciais ─────────────────────────────────────────────────────────────
const ACCOUNT_ID = process.env.EXPO_PUBLIC_R2_ACCOUNT_ID      ?? "9827b92a6b3a621e8c6f50274e68f37b";
const ACCESS_KEY  = process.env.EXPO_PUBLIC_R2_ACCESS_KEY_ID   ?? "9e96806804e8815dfd9580ec062fa0c5";
const SECRET_KEY  = process.env.EXPO_PUBLIC_R2_SECRET_ACCESS_KEY ?? "854a8ee198112f783b99b870ac9f3299340a88176d5a8c198e35269e8cd3cd3a";
const BUCKET      = process.env.EXPO_PUBLIC_R2_BUCKET_NAME     ?? "netplay-media-storage";
const ENDPOINT    = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const REGION      = "auto";
const SERVICE     = "s3";

// ─── TMDB ─────────────────────────────────────────────────────────────────────
const TMDB_KEY  = "8f0beb08cf016ec8de49e454e09879ec";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "pt-BR";

// ─── Pure JS SHA-256 (FIPS 180-4) ────────────────────────────────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

const SHA256_H0 = new Uint32Array([
  0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
  0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256Block(w: Uint32Array, h: Uint32Array): void {
  for (let i = 16; i < 64; i++) {
    const s0 = rotr32(w[i-15],7) ^ rotr32(w[i-15],18) ^ (w[i-15] >>> 3);
    const s1 = rotr32(w[i-2],17) ^ rotr32(w[i-2],19)  ^ (w[i-2]  >>> 10);
    w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
  }
  let [a,b,c,d,e,f,g,hh] = [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7]];
  for (let i = 0; i < 64; i++) {
    const S1  = rotr32(e,6) ^ rotr32(e,11) ^ rotr32(e,25);
    const ch  = (e & f) ^ (~e & g);
    const t1  = (hh + S1 + ch + SHA256_K[i] + w[i]) | 0;
    const S0  = rotr32(a,2) ^ rotr32(a,13) ^ rotr32(a,22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2  = (S0 + maj) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0;
    d  = c; c = b; b = a; a  = (t1 + t2) | 0;
  }
  h[0] = (h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
  h[4] = (h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
}

function sha256Bytes(data: Uint8Array): Uint8Array {
  const len = data.length;
  const bitLen = len * 8;
  const padLen = ((len + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(data);
  padded[len] = 0x80;
  // Write 64-bit big-endian bit length at end
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);

  const h = new Uint32Array(SHA256_H0);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(off + i * 4, false);
    }
    sha256Block(w, h);
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i], false);
  return out;
}

const _enc = new TextEncoder();

function sha256(s: string): Uint8Array {
  return sha256Bytes(_enc.encode(s));
}

function sha256Hex(s: string): string {
  return toHex(sha256(s));
}

function hmacSha256(key: Uint8Array, msg: string): Uint8Array {
  const BLOCK = 64;
  let k = key.length > BLOCK ? sha256Bytes(key) : key;
  const keyPad = new Uint8Array(BLOCK);
  keyPad.set(k);
  const ipad = new Uint8Array(BLOCK); const opad = new Uint8Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) { ipad[i] = keyPad[i] ^ 0x36; opad[i] = keyPad[i] ^ 0x5c; }
  const msgBytes = _enc.encode(msg);
  const inner = new Uint8Array(BLOCK + msgBytes.length);
  inner.set(ipad); inner.set(msgBytes, BLOCK);
  const innerHash = sha256Bytes(inner);
  const outer = new Uint8Array(BLOCK + 32);
  outer.set(opad); outer.set(innerHash, BLOCK);
  return sha256Bytes(outer);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── AWS Sig V4 ───────────────────────────────────────────────────────────────

function nowDt(): { dt: string; d: string } {
  const iso = new Date().toISOString().replace(/[:-]/g, "");
  return { dt: iso.split(".")[0] + "Z", d: iso.slice(0, 8) };
}

function getDerivedKey(dateStamp: string): Uint8Array {
  const k0 = _enc.encode(`AWS4${SECRET_KEY}`);
  const k1 = hmacSha256(k0, dateStamp);
  const k2 = hmacSha256(k1, REGION);
  const k3 = hmacSha256(k2, SERVICE);
  return hmacSha256(k3, "aws4_request");
}

function encodePathKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

// ─── Core S3 fetch (signed) ───────────────────────────────────────────────────

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

  const payloadHash = sha256Hex(body);

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
  const sts = ["AWS4-HMAC-SHA256", dt, credScope, sha256Hex(canonical)].join("\n");
  const dk = getDerivedKey(d);
  const sig = toHex(hmacSha256(dk, sts));
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
    objects, prefixes,
    isTruncated: /<IsTruncated>true<\/IsTruncated>/i.test(xml),
    nextToken: xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1],
  };
}

// ─── Core S3 ops ─────────────────────────────────────────────────────────────

async function listObjectsRaw(
  prefix = "", delimiter?: string, continuationToken?: string, maxKeys = 1000,
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
  const sts = ["AWS4-HMAC-SHA256", dt, credScope, sha256Hex(canonical)].join("\n");
  const dk = getDerivedKey(d);
  const sig = toHex(hmacSha256(dk, sts));
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

// ─── API-level operations ─────────────────────────────────────────────────────

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

export async function apiDeleteCatalogEntry(prefix: string, tmdbId?: number) {
  // TeraBox virtual entry: remove all registry items with matching tmdbId
  if (prefix.startsWith("__tb__/") && tmdbId != null) {
    const reg = await apiGetRegistry();
    const before: number = reg.items.length;
    reg.items = reg.items.filter((i: any) => i.tmdbId !== tmdbId);
    await putRaw("__registry.json", JSON.stringify(reg, null, 2));
    return { ok: true, deleted: before - reg.items.length, type: "registry" };
  }
  // R2 folder entry: list all objects under prefix and delete each
  let deleted = 0;
  let token: string | undefined;
  do {
    const r = await listObjectsRaw(prefix, undefined, token, 1000);
    for (const obj of r.objects) { await delRaw(obj.key); deleted++; }
    token = r.isTruncated ? r.nextToken : undefined;
  } while (token);
  // Remove catalog-meta override
  try {
    const meta = JSON.parse(await getRaw("__catalog-meta.json")) as any;
    if (meta?.overrides?.[prefix]) {
      delete meta.overrides[prefix];
      await putRaw("__catalog-meta.json", JSON.stringify(meta, null, 2));
    }
  } catch {}
  // Invalidate in-memory catalog cache
  _catalogCache = null;
  return { ok: true, deleted, type: "r2" };
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
  const { title: cleanQ } = extractTitleAndYear(q);
  const searchQ = cleanQ || q;
  const res = await fetch(
    `${TMDB_BASE}/search/${ep}?api_key=${TMDB_KEY}&language=${TMDB_LANG}&query=${encodeURIComponent(searchQ)}&page=1`,
  );
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  const results = (data.results ?? []).slice(0, 10).map((r: any) => ({
    id: r.id, title: r.title ?? r.name, poster_path: r.poster_path, media_type: r.media_type ?? ep,
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

// ─── Catalog builder (mirrors API server logic) ───────────────────────────────

interface TmdbMatch {
  id: number; title: string; poster_path: string | null; backdrop_path: string | null;
  overview: string; vote_average: number; release_date?: string; first_air_date?: string;
  media_type: "movie" | "tv";
}
interface SeasonInfo { number: number; prefix: string; label: string }
interface CatalogEntry {
  key: string; name: string; type: "movie" | "tv" | "unknown";
  seasons: SeasonInfo[]; tmdb: TmdbMatch | null;
}

// In-memory catalog cache (reset on app restart)
let _catalogCache: { entries: CatalogEntry[]; builtAt: number } | null = null;
const CATALOG_TTL_MS = 30 * 60 * 1000;

function parseSeasonNumber(folderName: string): number | null {
  const m =
    folderName.match(/^(?:season|temporada|temp)\s*(\d+)$/i) ??
    folderName.match(/^(\d+)\s*(?:season|temporada)$/i) ??
    folderName.match(/^s(\d+)$/i) ??
    folderName.match(/^t(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Extrai título limpo + ano de lançamento de qualquer nome de arquivo/pasta.
 *
 * Suporta formatos como:
 *   "A Era Do Gelo 3 (2009) [1080p][Dublado]"  → { title: "A Era Do Gelo 3", year: 2009 }
 *   "era.do.gelo.4"                             → { title: "era do gelo 4" }
 *   "The.Dark.Knight.2008.BluRay.1080p"         → { title: "The Dark Knight", year: 2008 }
 *   "S01E01 - Episodio Piloto [720p]"           → { title: "Episodio Piloto" }
 */
export function extractTitleAndYear(raw: string): { title: string; year?: number } {
  // 1. Remove extensão de arquivo se presente
  let s = raw.replace(/\.[a-zA-Z0-9]{2,4}$/, "");

  // 2. Se usa ponto como separador de palavra (ex: era.do.gelo.4), troca por espaço.
  //    Critério: mais de 2 pontos no nome sem espaços → separador de palavra
  const hasDotSeparators = !s.includes(" ") && (s.match(/\./g) ?? []).length >= 2;
  if (hasDotSeparators) {
    s = s.replace(/\./g, " ");
  }

  // 3. Extrai o ano (antes de remover parênteses) — 4 dígitos entre 1900-2099
  let year: number | undefined;
  const yearMatch = s.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // 4. Remove tags de qualidade e técnicas (case-insensitive)
  const QUALITY_TAGS = [
    /\b(?:4K|UHD|2160p?|1080p?|1080i|720p?|480p?|360p?|240p?)\b/gi,
    /\b(?:BluRay|BDRip|BDRemux|BRRip|DVDRip|DVDScr|DVDSCR|WEBRip|WEB[-.]?DL|WEBiP|HDTV|HDTS|HDRIP|HDRip|CAM|TS|TC|SCR|R5|DVDR)\b/gi,
    /\b(?:x\.?264|x\.?265|H\.?264|H\.?265|HEVC|AVC|xvid|XviD|divx|DivX|MPEG[-.]?2|MPEG[-.]?4|VP9|AV1)\b/gi,
    /\b(?:AAC|AAC2|AC3|DTS[-.]?HD|DTS|TrueHD|Atmos|EAC3|MP3|FLAC|OPUS|DD[25]\.1|5\.1|7\.1|2\.0|PCM)\b/gi,
    /\b(?:HDR|HDR10\+?|SDR|Dolby|Vision|DoVi|10bit|10-bit|8bit|8-bit|REMUX|REPACK|PROPER|EXTENDED|THEATRICAL|DIRECTORS?[-. ]CUT|UNRATED|IMAX|3D|HFR)\b/gi,
    /\b(?:Dual|Dublado|Dub|Legendado|Sub(?:titled)?|PT[-.]?BR|PTBR|ENG|POR|ESP|FRE|ITA|GER|BRS?)\b/gi,
    /\b(?:Nacional|Nac|National|Dub\.?Nac|Dublagem)\b/gi,
    /\b(?:720|1080|2160|480|360)\b/g,
  ];
  for (const tag of QUALITY_TAGS) s = s.replace(tag, " ");

  // 5. Remove qualquer coisa entre colchetes [ ], parênteses ( ) e chaves { }
  s = s.replace(/\[.*?\]/g, " ").replace(/\(.*?\)/g, " ").replace(/\{.*?\}/g, " ");

  // 6. Remove marcadores de episódio para séries (SxxExx, 1x01, etc.) — deixa apenas o título
  s = s.replace(/[Ss]\d{1,2}[Ee]\d{1,3}.*/g, " ");
  s = s.replace(/\d{1,2}x\d{1,3}.*/gi, " ");

  // 7. Remove o ano do meio do título (já foi extraído acima)
  if (year) s = s.replace(new RegExp(`\\b${year}\\b`, "g"), " ");

  // 8. Remove traços/underscores restantes usados como separadores
  s = s.replace(/[_]/g, " ").replace(/\s*[-–]\s*/g, " ");

  // 9. Remove pontuação solta e múltiplos espaços
  s = s.replace(/[!@#$%^&*+=|\\<>:;,?]/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();

  // 10. Remove palavras de 1 caractere isoladas (artefatos)
  s = s.replace(/\b[a-zA-Z]\b/g, " ").replace(/\s{2,}/g, " ").trim();

  return { title: s, year };
}

function cleanTitle(name: string): string {
  return extractTitleAndYear(name).title;
}

async function listPrefixesOnly(prefix: string): Promise<string[]> {
  const r = await listObjectsRaw(prefix, "/", undefined, 200);
  return r.prefixes;
}

async function hasVideoFilesInFolder(prefix: string): Promise<boolean> {
  const r = await listObjectsRaw(prefix, "/", undefined, 50);
  return r.objects.some((o) => isVideo(o.key));
}

async function searchTmdbByName(name: string, hint?: "movie" | "tv"): Promise<TmdbMatch | null> {
  try {
    const cleaned = cleanTitle(name);
    if (!cleaned) return null;
    const lang = TMDB_LANG;

    if (hint === "tv") {
      const res = await fetch(`${TMDB_BASE}/search/tv?api_key=${TMDB_KEY}&language=${lang}&query=${encodeURIComponent(cleaned)}&page=1`);
      if (res.ok) {
        const d = await res.json();
        const hit = d.results?.[0];
        if (hit) return { id: hit.id, title: hit.name, poster_path: hit.poster_path, backdrop_path: hit.backdrop_path, overview: hit.overview ?? "", vote_average: hit.vote_average ?? 0, first_air_date: hit.first_air_date, media_type: "tv" };
      }
    }
    if (hint === "movie") {
      const res = await fetch(`${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&language=${lang}&query=${encodeURIComponent(cleaned)}&page=1`);
      if (res.ok) {
        const d = await res.json();
        const hit = d.results?.[0];
        if (hit) return { id: hit.id, title: hit.title, poster_path: hit.poster_path, backdrop_path: hit.backdrop_path, overview: hit.overview ?? "", vote_average: hit.vote_average ?? 0, release_date: hit.release_date, media_type: "movie" };
      }
    }
    const res = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&language=${lang}&query=${encodeURIComponent(cleaned)}&page=1`);
    if (!res.ok) return null;
    const d = await res.json();
    const hit = d.results?.find((x: any) => x.media_type === "tv" || x.media_type === "movie");
    if (!hit) return null;
    const isMovie = hit.media_type === "movie";
    return { id: hit.id, title: isMovie ? hit.title : hit.name, poster_path: hit.poster_path, backdrop_path: hit.backdrop_path, overview: hit.overview ?? "", vote_average: hit.vote_average ?? 0, release_date: hit.release_date, first_air_date: hit.first_air_date, media_type: hit.media_type };
  } catch {
    return null;
  }
}

async function buildEntriesFromPrefixes(
  prefixes: string[],
  catalogMeta: { version: number; overrides: Record<string, { tmdbId?: number; tmdbType?: "movie" | "tv"; displayName?: string }> },
  depth = 0,
): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  const MAX_DEPTH = 4;

  for (const titlePrefix of prefixes) {
    const segments = titlePrefix.replace(/\/$/, "").split("/");
    const name = segments[segments.length - 1] ?? titlePrefix.replace(/\/$/, "");
    if (name.startsWith("__")) continue;

    const subPrefixes = await listPrefixesOnly(titlePrefix);
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

    const hasVideos = seasons.length === 0 && (await hasVideoFilesInFolder(titlePrefix));

    // Container: no seasons, no direct videos, has subfolders → recurse
    if (seasons.length === 0 && !hasVideos && nonSeasonSubs.length > 0 && depth < MAX_DEPTH) {
      const childEntries = await buildEntriesFromPrefixes(nonSeasonSubs, catalogMeta, depth + 1);
      entries.push(...childEntries);
      continue;
    }

    const isSeries = seasons.length > 0;
    const override = catalogMeta.overrides[titlePrefix];
    let tmdbMatch: TmdbMatch | null = null;

    if (override?.tmdbId) {
      try {
        const type = override.tmdbType ?? (isSeries ? "tv" : "movie");
        const endpoint = type === "tv"
          ? `${TMDB_BASE}/tv/${override.tmdbId}?api_key=${TMDB_KEY}&language=${TMDB_LANG}`
          : `${TMDB_BASE}/movie/${override.tmdbId}?api_key=${TMDB_KEY}&language=${TMDB_LANG}`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const r = await res.json();
          tmdbMatch = type === "tv"
            ? { id: r.id, title: r.name, poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview ?? "", vote_average: r.vote_average ?? 0, first_air_date: r.first_air_date, media_type: "tv" }
            : { id: r.id, title: r.title, poster_path: r.poster_path, backdrop_path: r.backdrop_path, overview: r.overview ?? "", vote_average: r.vote_average ?? 0, release_date: r.release_date, media_type: "movie" };
        }
      } catch {}
      if (!tmdbMatch) {
        tmdbMatch = await searchTmdbByName(override.displayName ?? name, override.tmdbType ?? (isSeries ? "tv" : undefined));
      }
    } else {
      tmdbMatch = await searchTmdbByName(override?.displayName ?? name, isSeries ? "tv" : hasVideos ? "movie" : undefined);
    }

    const type: CatalogEntry["type"] = isSeries ? "tv"
      : (override?.tmdbType === "tv" || tmdbMatch?.media_type === "tv") ? "tv"
      : (override?.tmdbType === "movie" || tmdbMatch?.media_type === "movie" || hasVideos) ? "movie"
      : "unknown";

    entries.push({ key: titlePrefix, name: override?.displayName ?? name, type, seasons, tmdb: tmdbMatch });

    // Small delay to avoid rate-limiting TMDB
    await new Promise((res) => setTimeout(res, 120));
  }

  return entries;
}

export async function apiCatalog(forceRefresh = false) {
  if (!forceRefresh && _catalogCache && Date.now() - _catalogCache.builtAt < CATALOG_TTL_MS) {
    return { catalog: _catalogCache.entries, cached: true, builtAt: new Date(_catalogCache.builtAt).toISOString() };
  }

  let catalogMeta: { version: number; overrides: Record<string, any> };
  try { catalogMeta = JSON.parse(await getRaw("__catalog-meta.json")); }
  catch { catalogMeta = { version: 1, overrides: {} }; }

  // Build entries from actual R2 bucket prefixes
  const topPrefixes = await listPrefixesOnly("");
  const entries = await buildEntriesFromPrefixes(topPrefixes, catalogMeta, 0);

  // Also add TeraBox-only registry items (teraboxUrl set, not already in catalog)
  try {
    const regRaw = await getRaw("__registry.json");
    const registry = JSON.parse(regRaw);
    const regItems: any[] = registry.items ?? [];

    // Track which tmdbIds are already in the catalog (from R2 bucket entries)
    const seenTmdbIds = new Set<number>(
      entries.map((e) => e.tmdb?.id).filter((id): id is number => typeof id === "number")
    );

    // Group TeraBox-only items by tmdbId
    const tbGroups = new Map<number, { tmdbType: "movie" | "tv"; title: string }>();
    for (const item of regItems) {
      if (item.teraboxUrl && item.tmdbId && !seenTmdbIds.has(item.tmdbId)) {
        tbGroups.set(item.tmdbId, { tmdbType: item.tmdbType ?? "movie", title: item.title ?? "" });
      }
    }

    // For each unique tmdbId, fetch TMDB data and add a catalog entry
    for (const [tmdbId, info] of tbGroups) {
      try {
        const endpoint = info.tmdbType === "tv"
          ? `${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}&language=${TMDB_LANG}`
          : `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&language=${TMDB_LANG}`;
        const res = await fetch(endpoint);
        if (!res.ok) continue;
        const r = await res.json();
        const tmdbMatch: TmdbMatch = info.tmdbType === "tv"
          ? { id: r.id, title: r.name ?? info.title, poster_path: r.poster_path ?? null, backdrop_path: r.backdrop_path ?? null, overview: r.overview ?? "", vote_average: r.vote_average ?? 0, first_air_date: r.first_air_date, media_type: "tv" }
          : { id: r.id, title: r.title ?? info.title, poster_path: r.poster_path ?? null, backdrop_path: r.backdrop_path ?? null, overview: r.overview ?? "", vote_average: r.vote_average ?? 0, release_date: r.release_date, media_type: "movie" };

        // For TV: build seasons list from registry items
        const seasons: SeasonInfo[] = [];
        if (info.tmdbType === "tv") {
          const seasonNums = [
            ...new Set(
              regItems
                .filter((i: any) => i.tmdbId === tmdbId && i.season != null)
                .map((i: any) => i.season as number)
            ),
          ].sort((a, b) => a - b);
          for (const sn of seasonNums) {
            seasons.push({ number: sn, prefix: `__tb__/${tmdbId}/s${sn}/`, label: `Temporada ${sn}` });
          }
        }

        entries.push({
          key: `__tb__/${tmdbId}/`,
          name: tmdbMatch.title || info.title,
          type: info.tmdbType,
          seasons,
          tmdb: tmdbMatch,
        });
        seenTmdbIds.add(tmdbId);
        await new Promise((res) => setTimeout(res, 80));
      } catch { /* skip failed TMDB fetches */ }
    }
  } catch { /* registry not found or malformed — skip */ }

  _catalogCache = { entries, builtAt: Date.now() };
  return { catalog: entries, cached: false, builtAt: new Date(_catalogCache.builtAt).toISOString() };
}

// ─── API server base URL ──────────────────────────────────────────────────────

export function r2Base(): string | null {
  if (Platform.OS === "web") return "/api/r2";
  const base = getApiBase();
  if (!base) return null;
  return `${base}/r2`;
}

// Routes that must be forwarded to the API server (can't run client-side)
const SERVER_ONLY_ROUTES = new Set([
  "/download-url",
  "/terabox-resolve",
  "/terabox/register",
  "/terabox/play",
  "/gdrive-resolve",
  "/upload",
  "/drive/register",
  "/drive/play",
  "/drive/extract-all",
  "/drive/scan-folder",
  "/flix2/catalog",
  "/flix2/register",
  "/flix2/search",
  "/flix2/lookup",
  "/flix2/build-index",
  "/flix2/build-progress",
  "/flix2/index-status",
  "/flix2/stream-url",
  "/source-settings",
]);

async function forwardToServer<T>(path: string, options?: RequestInit): Promise<T> {
  const base = r2Base();
  if (!base) throw new Error("Servidor de API não configurado. Defina EXPO_PUBLIC_DOMAIN.");
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}${path}`, { ...options, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Erro ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ─── Universal router (drop-in para apiFetch / apiPost) ───────────────────────

export async function r2Route<T>(path: string, options?: RequestInit): Promise<T> {
  const u = new URL(`http://r2${path}`);
  const route = u.pathname;
  const q = (k: string) => u.searchParams.get(k) ?? "";
  const body = options?.body ? JSON.parse(options.body as string) : null;

  // No web (Chrome/browser): sempre usa o API server — S3 direto falha por CORS
  if (Platform.OS === "web") {
    return forwardToServer<T>(path, options);
  }

  // Server-only routes: forward to API server
  if (SERVER_ONLY_ROUTES.has(route) || route.startsWith("/job/")) {
    return forwardToServer<T>(path, options);
  }

  let result: unknown;

  if (route === "/catalog") {
    result = await apiCatalog(q("refresh") === "true");
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
  } else if (route === "/catalog-entry") {
    result = await apiDeleteCatalogEntry(q("prefix"), q("tmdbId") ? Number(q("tmdbId")) : undefined);
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
  } else {
    throw new Error(`Endpoint desconhecido: ${route}`);
  }

  return result as T;
}

// ─── TeraBox direct client (chamado direto do app, sem passar pelo servidor) ──
// O servidor Replit tem latência/bloqueio ao chamar xapiverse.com.
// Chamar direto do telefone é mais rápido e confiável.

const XAPIVERSE_KEY = "sk_6d7363a619840df0a07afe194613bf9a";
const XAPIVERSE_URL = "https://xapiverse.com/api/terabox-pro";
const TB_ALIASES = ["1024terabox.com","1024tera.com","teraboxapp.com","terasharelink.com","4funbox.com","momerybox.com","terabox.app"];

function normalizeTbUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (TB_ALIASES.includes(u.hostname)) u.hostname = "www.terabox.com";
    return u.toString();
  } catch { return url.trim(); }
}

export interface TeraBoxFileEntry {
  name: string;
  size?: number;
  size_formatted?: string;
  type?: string;
  quality?: string;
  duration?: string;
  fast_dlink?: string;
  stream_url?: string;
  fast_stream_url?: Record<string, string>;
  thumbnail?: string;
  fs_id?: number;
  file_path?: string;
}

export async function teraboxResolve(
  url: string,
  timeoutMs = 0,
): Promise<{ list: TeraBoxFileEntry[]; total_files: number }> {
  const normalized = normalizeTbUrl(url);
  // timeoutMs = 0 means no timeout (wait indefinitely)
  const ctrl = new AbortController();
  const tid = timeoutMs > 0 ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(XAPIVERSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xAPIverse-Key": XAPIVERSE_KEY },
      body: JSON.stringify({ url: normalized }),
      signal: timeoutMs > 0 ? ctrl.signal : undefined,
    });
    if (tid) clearTimeout(tid);
    const data = await res.json() as any;
    if (data.status !== "success") {
      throw new Error(data.message ?? data.error ?? "TeraBox API error");
    }
    const list: TeraBoxFileEntry[] = data.list ?? [];
    return { list, total_files: list.length };
  } catch (e: any) {
    if (tid) clearTimeout(tid);
    if (e?.name === "AbortError") throw new Error(`Tempo esgotado ao resolver TeraBox (${Math.round(timeoutMs / 1000)}s)`);
    throw e;
  }
}

export async function teraboxPlay(
  url: string,
  fileIndex?: number,
  fileName?: string,
): Promise<{ url: string; name: string }> {
  const { list } = await teraboxResolve(url);
  if (list.length === 0) throw new Error("Nenhum arquivo encontrado no link TeraBox");
  let file: TeraBoxFileEntry | undefined;
  if (fileName) file = list.find((f) => f.name === fileName);
  if (!file) {
    const idx = typeof fileIndex === "number" && fileIndex < list.length ? fileIndex : 0;
    file = list[idx];
  }

  // Priority order:
  // 1. stream_url — direct stream URL, works without auth (single-file shares)
  // 2. fast_stream_url best quality — quality-keyed stream map, often available for album files
  // 3. fast_dlink — CDN download redirect, may require TeraBox auth (last resort)
  let streamUrl: string | undefined = file.stream_url ?? undefined;

  if (!streamUrl && file.fast_stream_url) {
    // Pick highest available quality from the map
    const qualityOrder = ["1080p", "720p", "480p", "360p", "240p"];
    for (const q of qualityOrder) {
      if (file.fast_stream_url[q]) { streamUrl = file.fast_stream_url[q]; break; }
    }
    // Fallback: any first value in the map
    if (!streamUrl) {
      const vals = Object.values(file.fast_stream_url);
      if (vals.length > 0) streamUrl = vals[0];
    }
  }

  if (!streamUrl) streamUrl = file.fast_dlink ?? undefined;
  if (!streamUrl) throw new Error("URL de stream não disponível para este arquivo");
  return { url: streamUrl, name: file.name ?? "" };
}
