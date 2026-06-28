import { getApiBase } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const _recorded = new Set<string>();

/**
 * Record a content play event on the server.
 * Rate-limited per session: same content won't be recorded twice while the app is open.
 * Fire-and-forget — never throws, never blocks playback.
 */
export async function recordContentView(
  tmdbId: number | null | undefined,
  type: "movie" | "tv",
  title: string
): Promise<void> {
  try {
    const id = Number(tmdbId ?? 0);
    const key = `${type}_${id}_${title.slice(0, 20)}`;
    if (_recorded.has(key)) return;
    _recorded.add(key);

    const base = getApiBase();
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (session?.access_token) headers["x-supabase-token"] = session.access_token;
    } catch {}

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    await fetch(`${base}/content/view`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tmdbId: id, type, title }),
      signal: ctrl.signal,
    });
  } catch {}
}
