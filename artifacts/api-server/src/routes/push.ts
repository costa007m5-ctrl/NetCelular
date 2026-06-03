import { Router } from "express";
import {
  getAllPushTokens,
  sendToTokens,
  sendToAll,
} from "../lib/push-notifications.js";

const router = Router();

router.post("/send", async (req, res) => {
  const { title, body, data, imageUrl, tokens } = req.body ?? {};

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

export default router;
