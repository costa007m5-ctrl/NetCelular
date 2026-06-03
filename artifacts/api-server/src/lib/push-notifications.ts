const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_KEY =
  process.env["SUPABASE_SERVICE_KEY"] ??
  process.env["SUPABASE_ANON_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemZzYmRjanloY29wdGJybGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwOTA4MjUsImV4cCI6MjA5NTY2NjgyNX0.SB-NiDEKp4RtVr9MSv255IPWoU2rp7td7b5ejccBG8Q";

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

export async function sendToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  imageUrl?: string
): Promise<TokenSendResult> {
  if (tokens.length === 0) return { sent: 0, failed: 0, skipped: 0, errors: [] };

  const expoTokens = tokens.filter(
    (t) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoToken")
  );
  const skipped = tokens.length - expoTokens.length;
  const skippedErrors = tokens
    .filter((t) => !t.startsWith("ExponentPushToken") && !t.startsWith("ExpoToken"))
    .map((t) => ({ token: t.slice(0, 20) + "...", error: "InvalidTokenFormat", message: "Token não é Expo (ExponentPushToken). APK pode ter gerado token FCM nativo." }));

  if (expoTokens.length === 0) return { sent: 0, failed: 0, skipped, errors: skippedErrors };

  const CHUNK = 100;
  let sent = 0;
  let failed = 0;
  const errors: { token: string; error: string; message?: string }[] = [...skippedErrors];

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
  return { sent, failed, skipped, errors };
}

export async function sendToAll(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  imageUrl?: string
): Promise<{ sent: number; failed: number; skipped: number; total: number }> {
  const tokens = await getAllPushTokens();
  const result = await sendToTokens(tokens, title, body, data, imageUrl);
  return { ...result, total: tokens.length };
}

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
  posterPath?: string | null
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
  console.log(`[push] new-episode "${showTitle}" S${season}E${episode} → sent:${result.sent} total:${result.total}`);
}

export async function notifyNewContent(
  newCount: number,
  sampleTitle: string | null
): Promise<void> {
  const title = "🔥 Novidades no NETPLAY";
  const body =
    sampleTitle && newCount === 1
      ? `"${sampleTitle}" acabou de chegar ao catálogo!`
      : sampleTitle
      ? `"${sampleTitle}" e mais ${newCount - 1} título${newCount - 1 > 1 ? "s" : ""} novo${newCount - 1 > 1 ? "s" : ""} adicionado${newCount - 1 > 1 ? "s" : ""}!`
      : `${newCount} novo${newCount > 1 ? "s títulos" : " título"} adicionado${newCount > 1 ? "s" : ""} ao catálogo!`;

  const result = await sendToAll(title, body, { type: "new_content", count: newCount });
  console.log(
    `[push] new-content → sent:${result.sent} failed:${result.failed} skipped:${result.skipped} total:${result.total}`
  );
}
