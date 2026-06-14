import { Router } from "express";
import {
  getAllPushTokens,
  sendToTokens,
  sendToAll,
  addPushLog,
  getPushLog,
} from "../lib/push-notifications.js";
import { requireAdminKey } from "../middleware/auth.js";

const router = Router();

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? "https://pjzfsbdcjyhcoptbrlhh.supabase.co";
const SUPABASE_KEY =
  process.env["SUPABASE_SERVICE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";

/** Verifies a Supabase JWT and returns user_id + is_admin flag. */
async function verifySupabaseToken(
  token: string
): Promise<{ userId: string; isAdmin: boolean } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    if (!user?.id) return null;

    // Check is_admin flag in the public.users table
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}&select=is_admin`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    let isAdmin = false;
    if (profileRes.ok) {
      const rows = (await profileRes.json()) as { is_admin?: boolean }[];
      isAdmin = rows[0]?.is_admin === true;
    }
    return { userId: user.id, isAdmin };
  } catch {
    return null;
  }
}

/** Admin route — requires x-admin-key header or ?admin_key query param */
router.post("/send", requireAdminKey, async (req, res) => {
  const { title, body, data, imageUrl, tokens, source } = req.body ?? {};

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title é obrigatório" });
    return;
  }
  if (!body || typeof body !== "string") {
    res.status(400).json({ error: "body é obrigatório" });
    return;
  }

  try {
    let result: { sent: number; failed: number; skipped: number; total?: number };

    if (Array.isArray(tokens) && tokens.length > 0) {
      const r = await sendToTokens(tokens, title, body, data ?? {}, imageUrl);
      result = { ...r, total: tokens.length };
    } else {
      result = await sendToAll(title, body, data ?? {}, imageUrl);
    }

    addPushLog({
      title,
      body,
      source: typeof source === "string" ? source : "admin",
      sent: result.sent,
      failed: result.failed,
      total: result.total ?? (result.sent + result.failed),
    });

    res.json({ ok: true, ...result, errors: (result as any).errors ?? [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Erro interno ao enviar push" });
  }
});

/**
 * User-authenticated push route — requires a valid Supabase JWT.
 * The user must have is_admin = true in the public.users table.
 * This is used by the in-app admin panel so no static admin key
 * needs to be bundled in the APK.
 */
router.post("/send-user", async (req, res) => {
  const supabaseToken =
    (req.headers["x-supabase-token"] as string | undefined) ?? "";

  if (!supabaseToken) {
    res.status(401).json({ error: "Token de autenticação ausente" });
    return;
  }

  const user = await verifySupabaseToken(supabaseToken);
  if (!user) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: "Acesso negado — usuário não é administrador" });
    return;
  }

  const { title, body, data, imageUrl, tokens, source } = req.body ?? {};

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title é obrigatório" });
    return;
  }
  if (!body || typeof body !== "string") {
    res.status(400).json({ error: "body é obrigatório" });
    return;
  }

  try {
    let result: { sent: number; failed: number; skipped: number; total?: number };

    if (Array.isArray(tokens) && tokens.length > 0) {
      const r = await sendToTokens(tokens, title, body, data ?? {}, imageUrl);
      result = { ...r, total: tokens.length };
    } else {
      result = await sendToAll(title, body, data ?? {}, imageUrl);
    }

    addPushLog({
      title,
      body,
      source: typeof source === "string" ? source : `user:${user.userId.slice(0, 8)}`,
      sent: result.sent,
      failed: result.failed,
      total: result.total ?? (result.sent + result.failed),
    });

    res.json({ ok: true, ...result, errors: (result as any).errors ?? [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Erro interno ao enviar push" });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const tokens = await getAllPushTokens();
    const expoCount = tokens.filter(
      (t) => t.startsWith("ExponentPushToken") || t.startsWith("ExpoToken")
    ).length;
    const nativeCount = tokens.length - expoCount;
    const fcmV1Active = !!process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
    res.json({ total: tokens.length, expo: expoCount, native: nativeCount, fcmV1Active });
  } catch {
    res.json({ total: 0, expo: 0, native: 0, fcmV1Active: false });
  }
});

router.get("/log", (_req, res) => {
  res.json({ entries: getPushLog() });
});

export default router;
