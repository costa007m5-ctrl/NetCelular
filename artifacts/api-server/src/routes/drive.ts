import { Router } from "express";

const router = Router();

const DRIVE_WORKER = "https://1.animezey23112022.workers.dev";

router.post("/folder", async (req, res) => {
  const { drive, path: folderPath = "", pageToken = "" } = req.body ?? {};

  if (drive !== 0 && drive !== 1) {
    res.status(400).json({ error: "drive must be 0 or 1" });
    return;
  }

  const encoded = String(folderPath)
    .split("/")
    .map((seg: string) => encodeURIComponent(seg))
    .join("/");

  const url = `${DRIVE_WORKER}/${drive}:/${encoded}/`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageToken }),
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: "upstream error" });
      return;
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? "proxy error" });
  }
});

export default router;
