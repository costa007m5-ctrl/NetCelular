import { createSign } from "crypto";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_KEY =
  process.env["SUPABASE_SERVICE_KEY"] ??
  process.env["SUPABASE_ANON_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemZzYmRjanloY29wdGJybGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTA4MjUsImV4cCI6MjA5NTY2NjgyNX0.SB-NiDEKp4RtVr9MSv255IPWoU2rp7td7b5ejccBG8Q";

// ─── FCM V1 via service account ────────────────────────────────────────────

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const DEFAULT_SERVICE_ACCOUNT: ServiceAccount = {
  project_id: "grupo-streaming-brasil-aa209",
  client_email: "firebase-adminsdk-fbsvc@grupo-streaming-brasil-aa209.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDqU7DnUtleaVmb\n5CmzM2O2Gxhx7yKupoVQO8T79IuKwJUP+W0DPHBxcfIcuXaC/a8k0yTZS0xG4dvK\noQOQI8BrLojfaBaFElfvTXyvqJk1/KcQ4bNQJlwwvsZDyXZTqHt8atlVDmbjjPI8\nP7t8Fu+BOIDOUMQow1Y9E3CRALZm7HexDaRP+vMiOw6wkLRTUz239sikc25KqfgE\nqD3rpIkiSly3E0UDYloZpIFkdAl8agnDGKqCpgOLXQLTTNmXJ7wVNQ1Z3YDH0DJl\ngVk3qYxreU7jf9HbXbh89lLu/jLQ0jPBU32GyG9QhytEUNZnc45y+q2MV+ps2bDq\nmqEuJbcXAgMBAAECggEAOXeR7IFQhstuawFvSqABRbFqctKzXkK/chhebG4iZMJr\nLDI/DmqdpuzLdEj1rBVcBTt1D4dcawvME+seDRT/hSmx7pw/3Z3MjAckW44NGQTf\n0g+QIsltlZTL2ecICmdI9Y/cwfPYvtibtbPpnnqffUDmsfJz0Q1q0mq4kg8rLJ08\nbhmfS1h82OUubRPVqvEe1bBaIhPMpj6m5DpXXa7o4Sc94zv6iCVweVkran0F+rSc\n9o8YBOJm2qsLYlmkjf/QxtIraPCqcjf4CQegrGhm4B1NjnCzoFFUpaF84g0EFTDC\nTgSBbUhc0fBowPWTxm/l2S/GMYmrkKhICAV9vfxpqQKBgQD4ahvNuS1SYuV+JcXa\ns0xxLrCQ1An0xvXxhGSuP20ttf2KdvMGtX39wZiocx8qwbnn82COZymd43hrGiXZ\nn2MVpRqnUCSso/dtKVd1eWgF2Nm7BgKarxw6I3yoaoyquw1eKepx2K2MCCCjPGtL\n3lL+/Cjq9PMF2advKG/+A2RZGQKBgQDxe3U4eVss6gU2Kd4OHmrQN/WynmhdM7mM\n2KC2sAK4/XTW3KqxGBikUz3jcdB2aANeQ0I8Eyo2sxFji50/5FSPx0Td0EDQdmj2\nBZ/IvrVtjs5IgbuWfBQt8ED+obBG8eTbeO1wSJu59Aj9/Ijqx4F6CCqz+P55rZlg\n6ptg2AonrwKBgQDPpfLDzmyiF2T6Q5zVqVbWrU6OYZBI+h8P2blHJmGe+ieLnM6c\n5w0AFtoCxOhilzlNOFWX84gIIOLBtEO7W845g596CDX/0be7mfkvi2J2sMOf3/BB\nWOrhdlR3e0lGVcFg2uzMaXD4Qrr1eEXAT4FU/3c8n7CdTUj2U/j5feBd0QKBgDzM\nDHMvepkQQkekutdrKRFLRXy3DSeKAklHsQ7NuaHBjk0aOY9kta+JladR3F4zScXN\nwTtGx/YFl3csi2auoeuhC+GcsPTLGxn1yIjOGvd+YMk4gHYevyXhuztgkfUKqcfn\n5j/CyBJFMo5fqkkR+bMzoyy0n70ay+buqjfzrHrZAoGBAJqUnTuIphswC0rFy4wh\nOYWJna5wbs4D4ENBHUYdHliXvh8zssLNA7iBTT2aG8Foy8SCU7J8xaOaH++QVrp7\njGh7PwlWy753y3EObqsBwaDONuB3axvEIu8ukt/jp+AolEDs9zJyKHGliXwDqnjk\ny5iFGXvhBAS8XEzRhZ6/zzjH\n-----END PRIVATE KEY-----\n",
};

let _serviceAccount: ServiceAccount | null | undefined = undefined;
function getServiceAccount(): ServiceAccount | null {
  if (_serviceAccount !== undefined) return _serviceAccount;
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (raw) {
    try {
      _serviceAccount = JSON.parse(raw) as ServiceAccount;
      return _serviceAccount;
    } catch {
      console.error("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON inválido, usando padrão embutido");
    }
  }
  _serviceAccount = DEFAULT_SERVICE_ACCOUNT;
  return _serviceAccount;
}

let _fcmAccessToken: string | null = null;
let _fcmTokenExpiry = 0;

async function getFcmAccessToken(): Promise<string | null> {
  const sa = getServiceAccount();
  if (!sa) return null;

  if (_fcmAccessToken && Date.now() < _fcmTokenExpiry) return _fcmAccessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const json = await res.json() as { access_token?: string };
    if (!json.access_token) { console.error("[FCM] Falha ao obter access token:", json); return null; }
    _fcmAccessToken = json.access_token;
    _fcmTokenExpiry = Date.now() + 55 * 60 * 1000;
    console.log("[FCM] Access token obtido com sucesso");
    return _fcmAccessToken;
  } catch (e) {
    console.error("[FCM] Erro ao obter access token:", e);
    return null;
  }
}

async function sendViaFcmV1(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  imageUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const sa = getServiceAccount();
  if (!sa) return { ok: false, error: "Sem service account configurado" };
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return { ok: false, error: "Falha ao obter access token FCM" };

  const message: Record<string, unknown> = {
    token,
    notification: { title, body, ...(imageUrl ? { image: imageUrl } : {}) },
    android: { notification: { sound: "default", channel_id: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  };

  if (data && Object.keys(data).length > 0) {
    message["data"] = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
    );
  }

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      }
    );
    if (res.ok) return { ok: true };
    const errJson = await res.json().catch(() => ({})) as { error?: { message?: string } };
    const errMsg = errJson?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, error: errMsg };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro de rede FCM" };
  }
}

// ─── Token classification ──────────────────────────────────────────────────

function isExpoToken(t: string) {
  return t.startsWith("ExponentPushToken") || t.startsWith("ExpoToken");
}

// ─── Supabase helpers ──────────────────────────────────────────────────────

export async function getAllPushTokens(): Promise<string[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/push_tokens?select=token`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { token: string }[];
    return rows.map((r) => r.token).filter(Boolean);
  } catch {
    return [];
  }
}

export async function getPushTokensForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  try {
    const ids = userIds.map((id) => `"${id}"`).join(",");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/push_tokens?select=token&user_id=in.(${ids})`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { token: string }[];
    return rows.map((r) => r.token).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Send interfaces ───────────────────────────────────────────────────────

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: string;
  data?: Record<string, unknown>;
  attachments?: { url: string }[];
}

export interface TokenSendResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: { token: string; error: string; message?: string }[];
}

// ─── Send to tokens ────────────────────────────────────────────────────────

export async function sendToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  imageUrl?: string
): Promise<TokenSendResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, skipped: 0, errors: [] };

  const hasFcmV1 = !!getServiceAccount();
  const errors: { token: string; error: string; message?: string }[] = [];
  let sent = 0;
  let failed = 0;

  // ── FCM V1 path (native FCM tokens & optionally all tokens when service account available) ──
  const fcmTokens = tokens.filter((t) => !isExpoToken(t));
  const expoTokens = tokens.filter(isExpoToken);

  // Send native FCM tokens via FCM V1 directly
  if (fcmTokens.length > 0) {
    if (hasFcmV1) {
      const results = await Promise.all(
        fcmTokens.map((t) => sendViaFcmV1(t, title, body, data, imageUrl))
      );
      results.forEach((r, i) => {
        if (r.ok) {
          sent++;
        } else {
          failed++;
          errors.push({ token: fcmTokens[i].slice(0, 30) + "...", error: r.error ?? "unknown", message: "FCM V1 direct send" });
        }
      });
    } else {
      // No service account: skip native tokens
      fcmTokens.forEach((t) => {
        failed++;
        errors.push({ token: t.slice(0, 20) + "...", error: "InvalidTokenFormat", message: "Token FCM nativo requer FIREBASE_SERVICE_ACCOUNT_JSON no servidor." });
      });
    }
  }

  // ── Expo Push API path for ExponentPushTokens ──
  if (expoTokens.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < expoTokens.length; i += CHUNK) {
      const chunk = expoTokens.slice(i, i + CHUNK);
      const messages: ExpoPushMessage[] = chunk.map((to) => {
        const msg: ExpoPushMessage = { to, title, body, sound: "default", data: data ?? {} };
        if (imageUrl) msg.attachments = [{ url: imageUrl }];
        return msg;
      });
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(messages),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          failed += chunk.length;
          chunk.forEach((t) => errors.push({ token: t.slice(0, 30) + "...", error: `HTTP ${res.status}`, message: errText.slice(0, 200) }));
          continue;
        }
        const json = (await res.json()) as { data?: { status: string; details?: { error?: string }; message?: string }[] };
        const results = Array.isArray(json?.data) ? json.data : [json?.data].filter(Boolean);
        results.forEach((d: any, idx) => {
          if (d?.status === "ok") {
            sent++;
          } else {
            failed++;
            const token = chunk[idx] ?? "unknown";
            errors.push({
              token: token.slice(0, 30) + "...",
              error: d?.details?.error ?? d?.status ?? "unknown",
              message: d?.message ?? undefined,
            });
          }
        });
      } catch (e: any) {
        failed += chunk.length;
        chunk.forEach((t) => errors.push({ token: t.slice(0, 30) + "...", error: "NetworkError", message: e?.message ?? "Falha de rede ao chamar Expo Push API" }));
      }
    }
  }

  return { sent, failed, skipped: 0, errors };
}

export async function sendToAll(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  imageUrl?: string
): Promise<{ sent: number; failed: number; skipped: number; total: number; errors: { token: string; error: string; message?: string }[] }> {
  const tokens = await getAllPushTokens();
  const result = await sendToTokens(tokens, title, body, data, imageUrl);
  return { ...result, total: tokens.length };
}

// ─── In-memory push log ────────────────────────────────────────────────────

export interface PushLogEntry {
  id: string;
  sentAt: string;
  title: string;
  body: string;
  source: string;
  sent: number;
  failed: number;
  total: number;
}

const MAX_LOG = 100;
const pushLog: PushLogEntry[] = [];

export function addPushLog(entry: Omit<PushLogEntry, "id" | "sentAt">): void {
  pushLog.unshift({
    id: Math.random().toString(36).slice(2),
    sentAt: new Date().toISOString(),
    ...entry,
  });
  if (pushLog.length > MAX_LOG) pushLog.length = MAX_LOG;
}

export function getPushLog(): PushLogEntry[] {
  return [...pushLog];
}

// ─── Episode / content helpers ─────────────────────────────────────────────

async function storeNewEpisode(ep: {
  tmdb_id: number; season: number; episode: number;
  episode_title?: string; air_date?: string; poster_path?: string; expires_at: string;
}): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/new_episodes`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ ...ep, notified_at: new Date().toISOString() }),
    });
  } catch {}
}

export async function notifyNewEpisode(
  tmdbId: number,
  showTitle: string,
  season: number,
  episode: number,
  episodeTitle: string,
  posterPath?: string | null,
  source = "auto"
): Promise<void> {
  const posterUrl = posterPath
    ? (posterPath.startsWith("http") ? posterPath : `https://image.tmdb.org/t/p/w780${posterPath}`)
    : undefined;

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await storeNewEpisode({ tmdb_id: tmdbId, season, episode, episode_title: episodeTitle, expires_at: expiresAt, poster_path: posterUrl });

  const title = "📺 Novo episódio disponível!";
  const body = `${showTitle} — T${season}:E${episode}${episodeTitle ? `: ${episodeTitle}` : ""}`;
  const data = { type: "new_episode", tmdbId, contentType: "tv", season, episode, deepLinkTo: "episodes", title: showTitle };
  const result = await sendToAll(title, body, data, posterUrl);
  addPushLog({ title, body, source, sent: result.sent, failed: result.failed, total: result.total });
  console.log(`[push] new-episode "${showTitle}" S${season}E${episode} → sent:${result.sent} total:${result.total}`);
}

export async function notifyNewContent(
  newCount: number,
  sampleTitle: string | null,
  source = "auto"
): Promise<void> {
  const title = "🔥 Novidades no NETPLAY";
  const body =
    sampleTitle && newCount === 1
      ? `"${sampleTitle}" acabou de chegar ao catálogo!`
      : sampleTitle
      ? `"${sampleTitle}" e mais ${newCount - 1} título${newCount - 1 > 1 ? "s" : ""} novo${newCount - 1 > 1 ? "s" : ""} adicionado${newCount - 1 > 1 ? "s" : ""}!`
      : `${newCount} novo${newCount > 1 ? "s títulos" : " título"} adicionado${newCount > 1 ? "s" : ""} ao catálogo!`;

  const result = await sendToAll(title, body, { type: "new_content", count: newCount });
  addPushLog({ title, body, source, sent: result.sent, failed: result.failed, total: result.total });
  console.log(
    `[push] new-content → sent:${result.sent} failed:${result.failed} skipped:${result.skipped} total:${result.total}`
  );
}
